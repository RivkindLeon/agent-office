// Запись события в журнал. Версию пакета подставляет сам — из PROFILE.md
// должности, чтобы её нельзя было забыть или соврать.
//
//   node org/tools/log-event.mjs head-of-people idle "Работы не было" [--outcome idle]
//   node org/tools/log-event.mjs founder sanction "Правлю хартию" --subject COMPANY.md

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [id, type, summary] = process.argv.slice(2);
if (!id || !type || !summary) {
  console.error('node org/tools/log-event.mjs <кто> <тип> "<строка>" [--subject X] [--outcome ok] [--ref path]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : process.argv[i + 1];
};

let version;
if (id !== "founder") {
  try {
    version = /Версия пакета:\s*(\d+\.\d+)/i
      .exec(readFileSync(join(ROOT, "roles", id, "PROFILE.md"), "utf8"))?.[1];
  } catch { /* пакета нет — упадём ниже */ }
  if (!version) { console.error(`нет версии пакета в roles/${id}/PROFILE.md`); process.exit(2); }
}

if (summary.length > 80) { console.error(`summary длиннее 80 символов (${summary.length})`); process.exit(2); }

const event = {
  ts: new Date().toISOString(),
  agent: version ? { id, version } : { id },
  type,
  ...(opt("subject") ? { subject: opt("subject") } : {}),
  summary,
  ...(opt("ref") ? { detail_ref: opt("ref") } : {}),
  outcome: opt("outcome", "ok"),
};

const day = new Date().toISOString().slice(0, 10);
mkdirSync(join(ROOT, "journal"), { recursive: true });
appendFileSync(join(ROOT, "journal", `${day}.jsonl`), JSON.stringify(event) + "\n");
console.log(`journal/${day}.jsonl <- ${type} (${id}${version ? " " + version : ""})`);
