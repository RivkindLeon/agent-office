// Renders org/ORG.md from company state. The org chart is a view, not a source:
// hiring is recorded by a token-protected `hired` event in the journal.
//
//   node org/tools/org.mjs          # write org/ORG.md
//   node org/tools/org.mjs --check  # fail if the file is out of date

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readState, renderOrg } from "./state.mjs";

const path = join(ROOT, "org", "ORG.md");
const rendered = renderOrg(readState());

if (process.argv.includes("--check")) {
  const current = (() => { try { return readFileSync(path, "utf8"); } catch { return ""; } })();
  if (current.trim() !== rendered.trim()) {
    console.error("org/ORG.md is stale: run node org/tools/org.mjs");
    process.exit(1);
  }
  console.log("org/ORG.md is up to date");
} else {
  writeFileSync(path, rendered);
  console.log("org/ORG.md rendered");
}
