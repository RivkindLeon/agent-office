// Prints the engine's view of a repository as JSON. Used by the scenario
// runner: the same reducer and the same trigger engine are pointed at a
// synthetic repository via AGENT_OFFICE_ROOT.
//
//   AGENT_OFFICE_ROOT=/tmp/x node org/tools/dump-state.mjs

import { readState, tasksFor, pendingForFounder } from "./state.mjs";

const state = readState();
const out = { states: {}, tasks: {}, pending: [] };
for (const r of Object.values(state)) {
  out.states[r.id] = r.state;
  out.tasks[r.id] = tasksFor(r.id, state);
}
out.pending = pendingForFounder(state).map((i) => ({ kind: i.kind, role: i.role, dimension: i.dimension || null }));
console.log(JSON.stringify(out, null, 2));
