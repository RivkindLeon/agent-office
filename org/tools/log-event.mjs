// Appends an event to the journal (docs/EVENT_SCHEMA.md).
//
//   node org/tools/log-event.mjs head-of-people idle "Работы нет" --outcome idle
//   node org/tools/log-event.mjs head-of-people handoff "Передал" --to head-of-product
//   node org/tools/log-event.mjs founder sanction "Правлю хартию" --subject COMPANY.md
//
// Identity is not taken on trust. Events from `founder` and events of type
// `sanction` require FOUNDER_TOKEN, whose sha256 lives in
// org/founder-key.sha256. The secret is outside the repository and outside the
// employee's environment, so an agent with a shell still cannot grant itself a
// sanction.
//
// The summary is written in Russian because a human reads it in the report;
// everything the machine consumes - keys, types, ids - is English.

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT } from "./state.mjs";

const [id, type, summary] = process.argv.slice(2);
if (!id || !type || !summary) {
  console.error('usage: log-event.mjs <agent> <type> "<summary>" [--subject X] [--outcome ok]');
  console.error('       [--ref path] [--to role] [--in N] [--out N] [--model id] [--ms N]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : process.argv[i + 1];
};
const num = (name) => { const v = opt(name); return v === undefined ? undefined : Number(v); };

const privileged = id === "founder" || type === "sanction";
if (privileged) {
  let expected = "";
  try { expected = readFileSync(join(ROOT, "org", "founder-key.sha256"), "utf8").trim(); } catch {}
  const got = createHash("sha256").update(process.env.FOUNDER_TOKEN || "").digest("hex");
  if (!expected || got !== expected) {
    console.error("denied: founder events and sanctions require FOUNDER_TOKEN");
    process.exit(4);
  }
}

let version;
if (id !== "founder") {
  try { version = JSON.parse(readFileSync(join(ROOT, "roles", id, "manifest.json"), "utf8")).version; } catch {}
  if (!version) { console.error(`no version in roles/${id}/manifest.json`); process.exit(2); }
}
if (summary.length > 80) { console.error(`summary longer than 80 chars (${summary.length})`); process.exit(2); }
if (type === "handoff" && !opt("to")) { console.error("handoff without --to <role>"); process.exit(2); }

const usage = {};
if (num("in") !== undefined) usage.input_tokens = num("in");
if (num("out") !== undefined) usage.output_tokens = num("out");
if (opt("model")) usage.model = opt("model");

const event = {
  schema_version: 1,
  event_id: randomUUID(),
  run_id: process.env.RUN_ID || null,
  ts: new Date().toISOString(),            // always UTC; the reader converts
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
const dirName = process.env.JOURNAL_DIR || "journal";
const dir = resolve(ROOT, dirName);
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify(event) + "\n");
console.log(`${dirName}/${day}.jsonl <- ${type} (${id}${version ? " " + version : ""})`);
