// Запись события в журнал по docs/EVENT_SCHEMA.md.
//
//   node org/tools/log-event.mjs head-of-people idle "Работы нет" --outcome idle
//   node org/tools/log-event.mjs head-of-people handoff "Передал требования" --to head-of-product
//   node org/tools/log-event.mjs founder sanction "Правлю хартию" --subject COMPANY.md
//
// Личность НЕ берётся на веру. События от `founder` и события типа `sanction`
// требуют секрета в FOUNDER_TOKEN, чья sha256 лежит в org/founder-key.sha256.
// Секрет не хранится в репозитории и не попадает в окружение сотрудника,
// поэтому агент не может выдать себе санкцию, даже имея shell.

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT } from "./state.mjs";

const [id, type, summary] = process.argv.slice(2);
if (!id || !type || !summary) {
  console.error('node org/tools/log-event.mjs <кто> <тип> "<строка>" [--subject X] [--outcome ok]');
  console.error('  [--ref путь] [--to роль] [--in N] [--out N] [--model id] [--ms N]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : process.argv[i + 1];
};
const num = (name) => { const v = opt(name); return v === undefined ? undefined : Number(v); };

// --- личность
const privileged = id === "founder" || type === "sanction";
if (privileged) {
  let expected = "";
  try { expected = readFileSync(join(ROOT, "org", "founder-key.sha256"), "utf8").trim(); } catch {}
  const got = createHash("sha256").update(process.env.FOUNDER_TOKEN || "").digest("hex");
  if (!expected || got !== expected) {
    console.error("отказано: события от founder и санкции требуют FOUNDER_TOKEN");
    process.exit(4);
  }
}

let version;
if (id !== "founder") {
  try {
    version = /Версия пакета:\s*(\d+\.\d+)/i
      .exec(readFileSync(join(ROOT, "roles", id, "PROFILE.md"), "utf8"))?.[1];
  } catch { /* ниже */ }
  if (!version) { console.error(`нет версии пакета в roles/${id}/PROFILE.md`); process.exit(2); }
}
if (summary.length > 80) { console.error(`summary длиннее 80 символов (${summary.length})`); process.exit(2); }
if (type === "handoff" && !opt("to")) { console.error("handoff без --to <роль>"); process.exit(2); }

const usage = {};
if (num("in") !== undefined) usage.input_tokens = num("in");
if (num("out") !== undefined) usage.output_tokens = num("out");
if (opt("model")) usage.model = opt("model");

const event = {
  schema_version: 1,
  event_id: randomUUID(),
  run_id: process.env.RUN_ID || null,
  ts: new Date().toISOString(),            // всегда UTC; в Иерусалим переводит читатель
  agent: version ? { id, version } : { id },
  type,
  ...(opt("subject") ? { subject: opt("subject") } : {}),
  summary,
  ...(opt("ref") ? { detail_ref: opt("ref") } : {}),
  outcome: opt("outcome", "ok"),
  ...(num("ms") !== undefined ? { duration_ms: num("ms") } : {}),
  ...(Object.keys(usage).length ? { usage } : {}),
  ...(opt("to") ? { handoff_to: opt("to") } : {}),
};

const day = event.ts.slice(0, 10);
const dir = resolve(ROOT, process.env.JOURNAL_DIR || "journal");
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify(event) + "\n");
console.log(`${process.env.JOURNAL_DIR || "journal"}/${day}.jsonl <- ${type} (${id}${version ? " " + version : ""})`);
