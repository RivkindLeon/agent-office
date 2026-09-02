// The company's single state reducer.
//
// Everything derived - what a role must do, what the founder owes an answer to,
// what the org chart says - comes from here. Before this file, gate, inbox and
// the validators each rebuilt state with their own regexes and drifted apart
// within a day.
//
// Machine facts are read from front matter and role manifests only. Prose is
// never parsed: documents must stay translatable without breaking the runtime.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontMatter } from "./frontmatter.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const abs = (p) => join(ROOT, p);
const list = (p) => { try { return readdirSync(abs(p)); } catch { return []; } };
const readJson = (p) => { try { return JSON.parse(readFileSync(abs(p), "utf8")); } catch { return null; } };

/** Hiring states. This is a state machine, not a bag of flags. */
export const STATES = [
  "requisition_pending",   // requisition exists, founder has not decided
  "requisition_approved",  // approved, package not written yet
  "review_pending",        // package exists, no verdict for its current version
  "changes_requested",     // verdict "changes_requested" for the current version
  "escalated",             // verdict "escalated"
  "accepted",              // accepted but not recorded as hired
  "hired",                 // founder logged a "hired" event
];

const cmpVersion = (a, b) => {
  const pa = String(a || "0.0").split(".").map(Number);
  const pb = String(b || "0.0").split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1];
};

export function readJournal() {
  const events = [];
  for (const f of list("journal").filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(abs(`journal/${f}`), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* validator reports broken lines */ }
    }
  }
  return events;
}

export function readState() {
  const roles = {};
  const journal = readJournal();

  for (const f of list("org/requisitions").filter((f) => f.endsWith(".md"))) {
    const fm = readFrontMatter(abs(`org/requisitions/${f}`)) || {};
    const id = fm.role || f.replace(/\.md$/, "");
    roles[id] = {
      id,
      requisition: `org/requisitions/${f}`,
      decision: fm.decision || "pending",
      reportsTo: fm.reports_to || null,
      manifest: null, version: null, reviews: [], questions: null,
      hired: false, state: null, round: 0, lastReview: null,
    };
  }

  for (const id of list("roles").filter((d) => existsSync(abs(`roles/${d}/manifest.json`)))) {
    const manifest = readJson(`roles/${id}/manifest.json`);
    roles[id] ??= { id, requisition: null, decision: "approved", reviews: [] };
    roles[id].manifest = manifest;
    roles[id].version = manifest?.version || null;
    roles[id].reportsTo ??= manifest?.reports_to || null;
  }

  for (const f of list("org/reviews").filter((f) => f.endsWith(".md")).sort()) {
    const fm = readFrontMatter(abs(`org/reviews/${f}`));
    if (!fm) continue;
    const r = roles[fm.role];
    if (!r) continue;
    if (fm.kind === "questions") { r.questions = `org/reviews/${f}`; continue; }
    r.reviews.push({
      file: `org/reviews/${f}`,
      verdict: fm.verdict || null,
      version: fm.package_version || null,
      round: Number(fm.round || r.reviews.length + 1),
    });
  }

  // "Hired" is a founder decision, and founder events are token-protected.
  // Reading it from the journal rather than from prose removes a whole class
  // of drift: the org chart becomes a rendering, not a source.
  for (const e of journal)
    if (e.type === "hired" && roles[e.subject]) roles[e.subject].hired = true;

  for (const r of Object.values(roles)) {
    r.reviews.sort((a, b) => a.round - b.round);
    const last = r.reviews[r.reviews.length - 1] || null;
    r.lastReview = last;
    r.round = last?.round || 0;
    // A verdict only counts for the version it was issued against: an old
    // "accepted" can never authorise a newer package.
    const current = last && r.version && cmpVersion(r.version, last.version) === 0 ? last : null;
    if (r.hired) r.state = "hired";
    else if (current?.verdict === "accepted") r.state = "accepted";
    else if (current?.verdict === "escalated") r.state = "escalated";
    else if (current?.verdict === "changes_requested") r.state = "changes_requested";
    else if (r.version) r.state = "review_pending";
    else if (r.decision === "declined") r.state = null;
    else if (r.decision === "approved") r.state = "requisition_approved";
    else r.state = "requisition_pending";
  }
  return roles;
}

/** Closed, deterministic trigger language. No eval, no shell, no model judgement. */
const OPS = {
  role_state(cond, self, state) {
    const hits = [];
    for (const r of Object.values(state)) {
      if ((cond.scope === "self") !== (r.id === self.id)) continue;
      if (r.state !== cond.state) continue;
      if (cond.max_round && r.round > Number(cond.max_round)) continue;
      hits.push(r);
    }
    return hits;
  },
  front_matter_equals(cond, self, state) {
    const fm = readFrontMatter(abs(cond.path));
    return fm && fm[cond.key] === cond.value ? [self] : [];
  },
  file_exists(cond, self) {
    return existsSync(abs(cond.path)) ? [self] : [];
  },
};

const fill = (template, r) => template
  .replace(/\{role\}/g, r.id)
  .replace(/\{requisition\}/g, r.requisition || "")
  .replace(/\{review\}/g, r.lastReview?.file || "")
  .replace(/\{version\}/g, r.version || "");

/** What the role must do on its own, without the founder. */
export function tasksFor(roleId, state = readState()) {
  const self = state[roleId];
  // A role that has not been hired does not work, whatever its triggers say.
  if (self?.state !== "hired") return [];
  const triggers = self?.manifest?.triggers || [];
  const tasks = [];
  for (const t of triggers) {
    const op = OPS[t.when?.op];
    if (!op) { tasks.push(`НЕИЗВЕСТНЫЙ триггер ${t.id}: op=${t.when?.op}`); continue; }
    for (const hit of op(t.when, self, state)) tasks.push(fill(t.task, hit));
  }
  return tasks;
}

/** What is waiting on the founder. */
export function pendingForFounder(state = readState()) {
  const items = [];
  for (const r of Object.values(state)) {
    if (r.state === "requisition_pending")
      items.push({ what: `заявка **${r.id}** ждёт решения`,
        how: "поставить `decision: approved` или `declined` в front matter", where: r.requisition });
    if (r.questions)
      items.push({ what: `вопросы по **${r.id}**`, how: "ответить и закоммитить", where: r.questions });
    if (r.state === "review_pending")
      items.push({ what: `пакет **${r.id} ${r.version}** ждёт ревью`,
        how: "пройти org/PACKAGE-ACCEPTANCE.md и положить вердикт", where: `roles/${r.id}/` });
    if (r.state === "escalated")
      items.push({ what: `эскалация по **${r.id}**`, how: "решить и закоммитить", where: r.lastReview.file });
    if (r.state === "accepted")
      items.push({ what: `**${r.id} ${r.version}** принят, но не нанят`,
        how: "записать событие hired", where: "journal/" });
    if (r.state === "changes_requested" && r.round >= 3)
      items.push({ what: `третий круг по **${r.id}**`, how: "решить спор или признать брак",
        where: r.lastReview.file });
  }
  return items;
}

const STATE_RU = {
  requisition_pending: "заявка ждёт решения",
  requisition_approved: "заявка одобрена, пакета нет",
  review_pending: "пакет ждёт ревью",
  changes_requested: "вернули на правки",
  escalated: "эскалация",
  accepted: "принят, не нанят",
  hired: "нанят",
};

/** org/ORG.md is rendered from state, never hand-edited: drift becomes impossible. */
export function renderOrg(state = readState()) {
  const hired = Object.values(state).filter((r) => r.state === "hired");
  const open = Object.values(state).filter((r) => r.state && r.state !== "hired");
  const notes = (() => { try { return readFileSync(abs("org/ORG-NOTES.md"), "utf8").trim(); } catch { return ""; } })();
  return `# Оргструктура

Файл собирается \`org/tools/org.mjs\` из состояния компании. Руками не править:
правка исчезнет при следующей сборке. Найм фиксируется событием \`hired\` в
журнале, а событие от основателя требует его секрета — поэтому строку здесь
нельзя получить, минуя решение.

| Должность | Кому подчиняется | Пакет | Версия | Статус |
|---|---|---|---|---|
| Основатель | — | — | — | Leon, человек; вне оргструктуры |
| CEO | — | — | — | исполняет основатель |
${hired.map((r) => `| ${r.id} | ${r.reportsTo || "—"} | \`roles/${r.id}/\` | ${r.version} | нанят |`).join("\n") || "| — | | | | пока никого |"}

## В работе

${open.length
    ? "| Должность | Состояние | Версия | Круг |\n|---|---|---|---|\n" +
      open.map((r) => `| ${r.id} | ${STATE_RU[r.state] || r.state} | ${r.version || "—"} | ${r.round || "—"} |`).join("\n")
    : "Ничего."}

${notes}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = readState();
  for (const r of Object.values(st))
    console.log(`${r.id.padEnd(18)} ${String(r.state).padEnd(22)} version ${r.version || "-"}  round ${r.round}`);
}
