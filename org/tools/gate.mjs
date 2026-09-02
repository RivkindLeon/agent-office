// Checks a role's triggers BEFORE any model is called (COMPANY.md, law 2:
// no input, no shift). Writes nothing and decides nothing - it only answers
// whether there is work. Triggers come from the role manifest, so adding a
// role never means editing this file.
//
//   node org/tools/gate.mjs head-of-people
//
// Exit code: 0 - there is work, 3 - there is none.

import { readState, tasksFor } from "./state.mjs";

const role = process.argv[2];
if (!role) { console.error("usage: gate.mjs <role>"); process.exit(2); }

const tasks = tasksFor(role, readState());
if (!tasks.length) { console.log(`${role}: no work`); process.exit(3); }
console.log(`${role}: work found\n` + tasks.map((t) => `- ${t}`).join("\n"));
