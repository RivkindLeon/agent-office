// Единственный редьюсер состояния компании. Раньше gate, inbox и проверки
// восстанавливали состояние каждый по-своему регулярками — и разошлись за один
// день: ORG.md утверждал версию 4.0, когда пакет был 6.0.
//
// Здесь состояние выводится из файлов и журнала ровно один раз, и все
// производные представления берут его отсюда.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const list = (p) => { try { return readdirSync(join(ROOT, p)); } catch { return []; } };

/** Состояния найма. Порядок важен: это конечный автомат, а не набор флагов. */
export const STATES = [
  "requisition_pending",   // заявка есть, решения основателя нет
  "requisition_approved",  // решение «да», пакета ещё нет
  "review_pending",        // пакет есть, вердикта на текущую версию нет
  "changes_requested",     // вердикт «вернуть» на текущую версию
  "escalated",             // вердикт «эскалация»
  "accepted",              // принято, но в ORG.md не внесено
  "hired",                 // строка в ORG.md есть
];

const verdictOf = (text) =>
  /Вердикт:\s*\**\s*(принято|вернуть|эскалация)/i.exec(text)?.[1]?.toLowerCase() || null;
const versionOf = (text) => /Версия пакета:\s*(\d+\.\d+)/i.exec(text)?.[1] || null;
const cmp = (a, b) => {
  const pa = (a || "0.0").split(".").map(Number), pb = (b || "0.0").split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1];
};

export function readState() {
  const roles = {};
  const org = read("org/ORG.md");

  for (const f of list("org/requisitions").filter((f) => f.endsWith(".md"))) {
    const id = f.replace(/\.md$/, "");
    const text = read(`org/requisitions/${f}`);
    roles[id] = {
      id,
      requisition: `org/requisitions/${f}`,
      approved: /Решение основателя:\s*\**\s*да/i.test(text),
      declined: /Решение основателя:\s*\**\s*нет/i.test(text),
      packageVersion: null, reviews: [], questions: null,
      hired: false, state: null, round: 0,
    };
  }

  for (const id of list("roles").filter((d) => existsSync(join(ROOT, "roles", d, "PROFILE.md")))) {
    roles[id] ??= { id, requisition: null, approved: true, declined: false, reviews: [] };
    roles[id].packageVersion = versionOf(read(`roles/${id}/PROFILE.md`));
    roles[id].hired = new RegExp(`roles/${id}/`).test(org);
  }

  for (const f of list("org/reviews").filter((f) => f.endsWith(".md")).sort()) {
    const id = f.replace(/-вопросы\.md$/, "").replace(/-\d+\.md$/, "").replace(/\.md$/, "");
    if (!roles[id]) continue;
    if (/-вопросы\.md$/.test(f)) { roles[id].questions = `org/reviews/${f}`; continue; }
    const text = read(`org/reviews/${f}`);
    roles[id].reviews.push({
      file: `org/reviews/${f}`,
      verdict: verdictOf(text),
      version: /версия\s*([\d.]+)/i.exec(text)?.[1] || null,
      round: Number(/круг\s*(\d+)/i.exec(f + text)?.[1] || roles[id].reviews.length + 1),
    });
  }

  for (const r of Object.values(roles)) {
    const last = r.reviews[r.reviews.length - 1] || null;
    r.round = last?.round || 0;
    r.lastReview = last;
    // Вердикт засчитывается только на ту версию, на которую он выдан: старое
    // «принято» не может авторизовать новую редакцию пакета.
    const current = last && r.packageVersion && cmp(r.packageVersion, last.version) === 0 ? last : null;
    if (r.hired) r.state = "hired";
    else if (current?.verdict === "принято") r.state = "accepted";
    else if (current?.verdict === "эскалация") r.state = "escalated";
    else if (current?.verdict === "вернуть") r.state = "changes_requested";
    else if (r.packageVersion) r.state = "review_pending";
    else if (r.declined) r.state = null;
    else if (r.approved) r.state = "requisition_approved";
    else r.state = "requisition_pending";
  }
  return roles;
}

/** Что должность обязана сделать сама, без основателя. */
export function tasksFor(roleId, state = readState()) {
  const tasks = [];
  if (roleId === "head-of-people") {
    for (const r of Object.values(state)) {
      if (r.id === roleId && r.state !== "hired") continue;
      if (r.state === "requisition_approved")
        tasks.push(`написать пакет должности ${r.id} — заявка одобрена, ${r.requisition}`);
      if (r.state === "changes_requested" && r.round <= 2)
        tasks.push(`круг правок по пакету ${r.id} — вердикт в ${r.lastReview.file}, читать целиком`);
      if (r.state === "accepted")
        tasks.push(`внести ${r.id} в org/ORG.md — вердикт «принято» на версию ${r.packageVersion}`);
    }
  }
  return tasks;
}

/** Что ждёт основателя. */
export function pendingForFounder(state = readState()) {
  const items = [];
  for (const r of Object.values(state)) {
    if (r.state === "requisition_pending")
      items.push({ what: `заявка **${r.id}** ждёт решения`,
        how: "поставить `Решение основателя: да` или `нет`", where: r.requisition });
    if (r.questions)
      items.push({ what: `вопросы по **${r.id}**`, how: "ответить и закоммитить", where: r.questions });
    if (r.state === "review_pending")
      items.push({ what: `пакет **${r.id} ${r.packageVersion}** ждёт ревью`,
        how: "пройти org/PACKAGE-ACCEPTANCE.md и положить вердикт", where: `roles/${r.id}/` });
    if (r.state === "escalated")
      items.push({ what: `эскалация по **${r.id}**`, how: "решить и закоммитить", where: r.lastReview.file });
    if (r.state === "changes_requested" && r.round >= 3)
      items.push({ what: `третий круг по **${r.id}**`, how: "решить спор или признать брак",
        where: r.lastReview.file });
  }
  return items;
}

/** Расхождения между выведенным состоянием и тем, что написано в документах. */
export function drift(state = readState()) {
  const out = [];
  const org = read("org/ORG.md");
  for (const r of Object.values(state)) {
    if (!r.hired || !r.packageVersion) continue;
    const row = org.split("\n").find((l) => l.includes(`roles/${r.id}/`)) || "";
    const shown = /\|\s*(\d+\.\d+)\s*\|/.exec(row)?.[1];
    if (shown && shown !== r.packageVersion)
      out.push(`org/ORG.md: у ${r.id} указана версия ${shown}, пакет — ${r.packageVersion}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = readState();
  for (const r of Object.values(st))
    console.log(`${r.id.padEnd(18)} ${String(r.state).padEnd(22)} версия ${r.packageVersion || "—"}  круг ${r.round}`);
  const d = drift(st);
  if (d.length) { console.log("\nРасхождения:"); d.forEach((x) => console.log("  ⚠ " + x)); process.exitCode = 1; }
}
