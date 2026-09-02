// Приёмка всех пакетов, кроме тех, что сейчас в работе.
//
// Пакет в состоянии "вернули на правки" обязан не проходить проверку — это
// смысл возврата, а не поломка. Если гонять его в CI, main будет постоянно
// красным, и красный перестанут читать. Поэтому проверяем инварианты, а не
// незавершённую работу.

import { execFileSync } from "node:child_process";
import { ROOT, readState } from "./state.mjs";

const SKIP = new Set(["changes_requested", "requisition_pending", "requisition_approved", "escalated"]);
let bad = 0;

for (const r of Object.values(readState())) {
  if (!r.packageVersion) continue;
  if (SKIP.has(r.state)) { console.log(`~ ${r.id}: пропущен, состояние «${r.state}»`); continue; }
  try {
    execFileSync(process.execPath, ["org/tools/check-package.mjs", r.id], { cwd: ROOT, encoding: "utf8" });
    console.log(`ок ${r.id} ${r.packageVersion}`);
  } catch (e) {
    bad++;
    console.log(`ПРОВАЛ ${r.id} ${r.packageVersion}`);
    console.log((e.stdout || "").split("\n").filter((l) => l.includes("ПРОВАЛ")).join("\n"));
  }
}
process.exit(bad ? 1 : 0);
