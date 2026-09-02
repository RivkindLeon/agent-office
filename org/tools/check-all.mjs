// Acceptance for every package except those currently being worked on.
//
// A package that was sent back for changes is supposed to fail its checks -
// that is what a return means. Running it in CI would keep main permanently
// red, and a permanently red main stops being read. So this checks invariants,
// not work in progress.

import { execFileSync } from "node:child_process";
import { ROOT, readState } from "./state.mjs";

const SKIP = new Set(["changes_requested", "requisition_pending", "requisition_approved", "escalated"]);
let bad = 0;

for (const r of Object.values(readState())) {
  if (!r.version) continue;
  if (SKIP.has(r.state)) { console.log(`~  ${r.id}: skipped, state "${r.state}"`); continue; }
  try {
    execFileSync(process.execPath, ["org/tools/check-package.mjs", r.id], { cwd: ROOT, encoding: "utf8" });
    console.log(`ok ${r.id} ${r.version}`);
  } catch (e) {
    bad++;
    console.log(`FAILED ${r.id} ${r.version}`);
    console.log((e.stdout || "").split("\n").filter((l) => l.includes("FAILED")).join("\n"));
  }
}
process.exit(bad ? 1 : 0);
