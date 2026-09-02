// Проверяет, что смена тронула только то, что должности разрешено
// (org/write-policy.json). Запускается ПОСЛЕ сотрудника и ДО коммита: чужая
// правка не попадает в репозиторий.
//
//   node org/tools/diff-guard.mjs head-of-people
//
// Это не песочница - песочница на стороне OpenClaw. Это машинная граница
// поверх правил пакета: "не редактируй чужое" перестаёт быть пожеланием.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./state.mjs";

const STAR = "@@GLOBSTAR@@";

// ** - любые сегменты, * - внутри одного сегмента.
export const toRe = (glob) => {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, STAR)
    .replace(/\*/g, "[^/]*")
    .split(STAR).join(".*");
  return new RegExp("^" + body + "$");
};

export const match = (list, p) => (list || []).some((g) => toRe(g).test(p));

export const policyFor = (role) =>
  JSON.parse(readFileSync(join(ROOT, "org", "write-policy.json"), "utf8"))[role];

export const changedPaths = () =>
  execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^.* -> /, "").replace(/^"|"$/g, ""));

export function violations(role, changed = changedPaths()) {
  const policy = policyFor(role);
  if (!policy) return changed.map((p) => ({ path: p, why: "нет политики записи для роли" }));
  return changed
    .filter((p) => match(policy.deny, p) || !match(policy.allow, p))
    .map((p) => ({ path: p, why: match(policy.deny, p) ? "прямой запрет" : "вне разрешённых путей" }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const role = process.argv[2];
  if (!role) { console.error("укажи должность"); process.exit(2); }
  const changed = changedPaths();
  if (!changed.length) { console.log(`${role}: изменений нет`); process.exit(0); }
  const bad = violations(role, changed);
  if (bad.length) {
    console.error(`${role}: запрещённые правки (${bad.length}):`);
    for (const b of bad) console.error(`  [x] ${b.path} - ${b.why}`);
    process.exit(1);
  }
  console.log(`${role}: изменений ${changed.length}, все в разрешённых путях`);
}
