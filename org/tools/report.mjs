// Builds the shift report for Telegram. A report nobody reads is the same as
// no report: the first version dumped the agent's raw answer, the check output
// and the whole INBOX into one wall of text.
//
//   node org/tools/report.mjs --role head-of-people --did "..." --findings 1 \
//     --checks ok --commit abc1234
//
// What the worker said and what the machine verified are different things and
// are printed as such.

import { execFileSync } from "node:child_process";
import { ROOT, readState, pendingForFounder } from "./state.mjs";
import { renderItem } from "./render.ru.mjs";

const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : process.argv[i + 1];
};

const role = opt("role", "?");
const did = (opt("did", "") || "").split("\n").map((l) => l.trim())
  .filter((l) => l && !l.startsWith("|") && !l.startsWith("---"))[0] || "";
const findings = opt("findings");
const checks = opt("checks", "ok");
const commit = opt("commit", "");
const problems = (opt("problems", "") || "").split("\n").filter(Boolean);

const day = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
const state = readState();
const me = state[role];
const pending = pendingForFounder(state);

const lines = [];
lines.push(`🏢 ${day} · ${role}${me?.version ? ` ${me.version}` : ""}`);
lines.push("");

if (checks === "idle") {
  lines.push("Работы не было — модель не вызывалась.");
} else {
  lines.push(`Сделал: ${did || "см. журнал"}`);
  if (findings !== undefined) lines.push(`Второй проход нашёл: ${findings}`);
  lines.push("");
  lines.push(checks === "ok"
    ? `Проверки машины: пройдены${commit ? `, коммит ${commit}` : ""}`
    : "Проверки машины: НЕ пройдены — ничего не закоммичено");
  for (const p of problems.slice(0, 4)) lines.push(`  · ${p}`);
}

lines.push("");
if (!pending.length) {
  lines.push("От тебя ничего не ждут.");
} else {
  lines.push(`Ждёт тебя (${pending.length}):`);
  for (const item of pending.slice(0, 5)) {
    const [what] = renderItem(item);
    lines.push(`  · ${what.replace(/\*\*/g, "")}`);
  }
  if (pending.length > 5) lines.push(`  · …и ещё ${pending.length - 5}`);
}
lines.push("");
lines.push("github.com/RivkindLeon/agent-office");

console.log(lines.join("\n"));
