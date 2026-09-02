// Golden company scenarios: fixed situations the company must handle the same
// way after any change to the rules or the engine.
//
//   node org/tools/scenarios.mjs
//
// Each scenario builds a synthetic repository in a temp directory and runs the
// REAL reducer and trigger engine against it (AGENT_OFFICE_ROOT). That makes
// instructions and process rules regression-testable: the question stops being
// "does this feel better" and becomes "does the company still behave correctly".

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "org", "scenarios");

const frontMatter = (obj) =>
  "---\n" + Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n";

function build(given) {
  const root = mkdtempSync(join(tmpdir(), "scenario-"));
  for (const d of ["org/requisitions", "org/reviews", "roles", "journal"])
    mkdirSync(join(root, d), { recursive: true });

  for (const r of given.requisitions || [])
    writeFileSync(join(root, "org/requisitions", `${r.role}.md`),
      frontMatter({ kind: "requisition", ...r }) + "\n# Заявка\n");

  for (const role of given.roles || []) {
    mkdirSync(join(root, "roles", role.role), { recursive: true });
    if (role.from) {
      cpSync(join(ROOT, "roles", role.from, "manifest.json"),
        join(root, "roles", role.role, "manifest.json"));
    } else {
      writeFileSync(join(root, "roles", role.role, "manifest.json"), JSON.stringify({
        schema_version: 1, role: role.role, version: role.version || "1.0",
        reports_to: "ceo", grade: "middle", mode: "strict",
        model: { primary: "openai/gpt-5.5" }, tools_profile: "coding",
        budget_tokens: 100000, boundaries: ["a", "b", "c"], triggers: [],
      }, null, 2));
    }
  }

  // Roles listed in assume_reviewed get accepted verdicts at whatever version
  // their manifest carries. Without this every scenario would also assert the
  // "hired on an unreviewed package" reminder, and the fixtures would rot on
  // every version bump.
  for (const id of given.assume_reviewed || []) {
    const version = JSON.parse(readFileSync(join(root, "roles", id, "manifest.json"), "utf8")).version;
    for (const dimension of ["form", "substance"])
      writeFileSync(join(root, "org/reviews", `${id}-0-${dimension}.md`),
        frontMatter({ kind: "review", role: id, package_version: version, round: 0,
          dimension, verdict: "accepted", analysis_by: "founder",
          read_by: "founder", decided_by: "founder" }) + "\n# Ревью\n");
  }

  (given.reviews || []).forEach((v, i) =>
    writeFileSync(join(root, "org/reviews", `${v.role}-${v.round || i + 1}-${v.dimension}.md`),
      frontMatter({ kind: "review", ...v }) + "\n# Ревью\n"));

  if ((given.journal || []).length) {
    const lines = given.journal.map((e, i) => JSON.stringify({
      schema_version: 1, event_id: `00000000-0000-4000-8000-00000000000${i}`,
      ts: new Date().toISOString(), agent: { id: e.agent || "founder" },
      type: e.type, subject: e.subject, summary: "scenario", outcome: "ok",
    }));
    writeFileSync(join(root, "journal", `${new Date().toISOString().slice(0, 10)}.jsonl`),
      lines.join("\n") + "\n");
  }
  return root;
}

function dump(root) {
  const out = execFileSync(process.execPath, [join(ROOT, "org/tools/dump-state.mjs")],
    { encoding: "utf8", env: { ...process.env, AGENT_OFFICE_ROOT: root } });
  return JSON.parse(out);
}

let failed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const sc = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const root = build(sc.given);
  const problems = [];
  try {
    const got = dump(root);
    for (const [role, want] of Object.entries(sc.expect.states || {}))
      if (got.states[role] !== want)
        problems.push(`state ${role}: expected ${want}, got ${got.states[role]}`);
    for (const [role, needles] of Object.entries(sc.expect.tasks_contain || {}))
      for (const needle of needles)
        if (!(got.tasks[role] || []).some((t) => t.trigger === needle))
          problems.push(`task for ${role} missing: ${needle}`);
    for (const role of sc.expect.tasks_empty || [])
      if ((got.tasks[role] || []).length)
        problems.push(`${role} should have no work, got: ${got.tasks[role].map((t) => t.trigger).join("; ")}`);
    if (sc.expect.pending_kinds) {
      const kinds = got.pending.map((p) => p.kind).sort();
      const want = [...sc.expect.pending_kinds].sort();
      if (JSON.stringify([...new Set(kinds)]) !== JSON.stringify([...new Set(want)]))
        problems.push(`pending kinds: expected ${want.join(",") || "none"}, got ${kinds.join(",") || "none"}`);
    }
    if (sc.expect.pending_dimensions) {
      const dims = got.pending.map((p) => p.dimension).filter(Boolean).sort();
      const want = [...sc.expect.pending_dimensions].sort();
      if (JSON.stringify(dims) !== JSON.stringify(want))
        problems.push(`pending dimensions: expected ${want.join(",")}, got ${dims.join(",") || "none"}`);
    }
  } catch (e) {
    problems.push(`engine crashed: ${e.message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (problems.length) {
    failed++;
    console.log(`FAILED  ${sc.name}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    console.log(`ok      ${sc.name}`);
  }
}
console.log(failed ? `\n${failed} scenario(s) failed` : "\nAll scenarios hold");
process.exit(failed ? 1 : 0);
