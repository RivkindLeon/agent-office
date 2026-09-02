// Renders org/INBOX.md - everything that is waiting on the founder. The list is
// derived, never hand-written: a hand-kept list always lies.
//
//   node org/tools/inbox.mjs            # write org/INBOX.md
//   node org/tools/inbox.mjs --print    # print only (used in the Telegram report)
//
// The rendered text is Russian because the founder reads it; the code and the
// state it reads are English.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readState, pendingForFounder } from "./state.mjs";
import { renderInboxBody } from "./render.ru.mjs";

const items = pendingForFounder(readState());

const body = renderInboxBody(items);

if (process.argv.includes("--print")) { console.log(body); process.exit(0); }

const now = new Date().toISOString().slice(0, 16).replace("T", " ");
writeFileSync(join(ROOT, "org", "INBOX.md"),
`# Что ждёт основателя

Файл собирается \`org/tools/inbox.mjs\` из состояния компании. Руками не
править: правка исчезнет при следующей сборке.

Собрано: ${now} UTC

${body}
`);
console.log(`org/INBOX.md: ${items.length} item(s)`);
