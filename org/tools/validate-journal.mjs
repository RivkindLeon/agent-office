// Проверка журнала по docs/EVENT_SCHEMA.md. Битая строка не роняет день —
// она пропускается и попадает в отчёт. Пишет битые строки роль, значит баг
// у роли, а не у дашборда.
//
//   node org/tools/validate-journal.mjs            # все дни
//   node org/tools/validate-journal.mjs 2026-09-02 # один день

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const JOURNAL_DIR = process.env.JOURNAL_DIR || "journal";
const JOURNAL = resolve(ROOT, JOURNAL_DIR);

// Идентификаторы должностей не перечисляются: они появляются по мере найма.
// Проверяется форма, а не список.
const ID = /^[a-z][a-z0-9-]{1,40}$/;
export const OUTCOMES = ["ok", "idle", "blocked", "failed"];
export const TYPES = [
  "shift_start", "shift_end", "idle", "blocked",
  "requisition_filed", "package_created", "review", "returned", "approved",
  "hired", "role_review", "sanction",
  "decision", "ticket_created", "design_ready", "commit", "pr_opened",
  "ci_failed", "merge", "deploy", "handoff",
];

export function validateEvent(e) {
  const errs = [];
  if (!e || typeof e !== "object") return ["не объект"];
  if (!e.ts || Number.isNaN(Date.parse(e.ts))) errs.push("ts не разбирается");
  if (!e.agent || !ID.test(e.agent.id || "")) errs.push(`agent.id: ${e.agent?.id}`);
  else if (e.agent.id !== "founder" && !/^\d+\.\d+$/.test(e.agent.version || ""))
    errs.push("нет agent.version");
  if (!TYPES.includes(e.type)) errs.push(`type: ${e.type}`);
  if (!OUTCOMES.includes(e.outcome)) errs.push(`outcome: ${e.outcome}`);
  if (typeof e.summary !== "string" || !e.summary) errs.push("нет summary");
  else if (e.summary.length > 80) errs.push(`summary длиннее 80 (${e.summary.length})`);
  if (e.type === "handoff" && !ID.test(e.handoff_to || "")) errs.push("handoff без handoff_to");
  // Санкцию выдаёт только основатель и всегда на конкретный файл.
  if (e.type === "sanction") {
    if (e.agent?.id !== "founder") errs.push("sanction не от founder");
    if (!e.subject) errs.push("sanction без subject: не указан файл");
  }
  if (e.usage && ["input_tokens", "output_tokens"].some((k) => k in e.usage && (typeof e.usage[k] !== "number" || e.usage[k] < 0)))
    errs.push("usage.*_tokens не неотрицательное число");
  if ("schema_version" in e && e.schema_version !== 1) errs.push(`неизвестная schema_version: ${e.schema_version}`);
  if ("duration_ms" in e && (typeof e.duration_ms !== "number" || e.duration_ms < 0)) errs.push("duration_ms не число");
  if ("event_id" in e && !/^[0-9a-f-]{36}$/.test(e.event_id || "")) errs.push("event_id не uuid");
  return errs;
}

export function readDay(date) {
  const lines = readFileSync(join(JOURNAL, `${date}.jsonl`), "utf8").split("\n").filter(Boolean);
  const events = [], problems = [];
  lines.forEach((line, i) => {
    let e;
    try { e = JSON.parse(line); } catch { problems.push({ line: i + 1, errs: ["не JSON"] }); return; }
    const errs = validateEvent(e);
    if (errs.length) problems.push({ line: i + 1, errs });
    else events.push(e);
  });
  return { events, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2];
  const days = (existsSync(JOURNAL) ? readdirSync(JOURNAL) : []).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6)).sort();
  if (!days.length) { console.log(`${JOURNAL_DIR}/ пуст — событий ещё не было`); process.exit(0); }
  let bad = 0;
  for (const day of days) {
    if (only && day !== only) continue;
    const { events, problems } = readDay(day);
    bad += problems.length;
    const tail = problems.length ? `, битых ${problems.length}` : "";
    console.log(`${day}  ок ${events.length}${tail}`);
    for (const p of problems) console.log(`    строка ${p.line}: ${p.errs.join("; ")}`);
  }
  process.exit(bad ? 1 : 0);
}
