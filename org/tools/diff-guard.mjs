// Verifies that a shift touched only what the role is allowed to write
// (org/write-policy.json). Runs AFTER the employee and BEFORE the commit, so a
// stray edit never reaches the repository.
//
//   node org/tools/diff-guard.mjs head-of-people
//
// This is not a sandbox - the sandbox lives in OpenClaw. This is a machine
// boundary on top of the package rules: "do not edit other people's files"
// stops being a wish.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./state.mjs";

const STAR = "@@GLOBSTAR@@";

// ** - any number of segments, * - within one segment.
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
  if (!policy) return changed.map((p) => ({ path: p, why: "no write policy for this role" }));
  return changed
    .filter((p) => match(policy.deny, p) || !match(policy.allow, p))
    .map((p) => ({ path: p, why: match(policy.deny, p) ? "explicitly denied" : "outside allowed paths" }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const role = process.argv[2];
  if (!role) { console.error("usage: diff-guard.mjs <role>"); process.exit(2); }
  const changed = changedPaths();
  if (!changed.length) { console.log(`${role}: no changes`); process.exit(0); }
  const bad = violations(role, changed);
  if (bad.length) {
    console.error(`${role}: disallowed changes (${bad.length}):`);
    for (const b of bad) console.error(`  [x] ${b.path} - ${b.why}`);
    process.exit(1);
  }
  console.log(`${role}: ${changed.length} change(s), all within allowed paths`);
}
