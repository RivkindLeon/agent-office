// Собирает org/INBOX.md — всё, что упирается в основателя. Список ведётся
// машиной: список, который ведут вручную, всегда врёт.
//
//   node org/tools/inbox.mjs            # записать org/INBOX.md
//   node org/tools/inbox.mjs --print    # только напечатать (для Telegram)

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readState, pendingForFounder, drift } from "./state.mjs";

const state = readState();
const items = pendingForFounder(state);
const problems = drift(state);

const body = items.length
  ? items.map((i, n) => `${n + 1}. ${i.what}\n   — ${i.how}\n   — \`${i.where}\``).join("\n\n")
  : "Ничего не ждёт. Компания работает сама.";

const tail = problems.length
  ? "\n\n## Расхождения в документах\n\n" + problems.map((p) => `- ⚠ ${p}`).join("\n")
  : "";

if (process.argv.includes("--print")) { console.log(body + tail); process.exit(0); }

const now = new Date().toISOString().slice(0, 16).replace("T", " ");
writeFileSync(join(ROOT, "org", "INBOX.md"),
`# Что ждёт основателя

Файл генерируется \`org/tools/inbox.mjs\` из состояния репозитория. Руками не
править: правка исчезнет при следующей сборке.

Собрано: ${now} UTC

${body}${tail}
`);
console.log(`org/INBOX.md: пунктов ${items.length}${problems.length ? `, расхождений ${problems.length}` : ""}`);
