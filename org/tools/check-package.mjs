// Automated half of package acceptance (org/PACKAGE-ACCEPTANCE.md).
// The AUTHOR runs it before handing work over: a red check means the work was
// never submitted and review does not start.
//
//   node org/tools/check-package.mjs head-of-people
//
// Machine facts come from roles/<role>/manifest.json, never from prose: the
// documents must stay translatable without breaking this script.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, readState } from "./state.mjs";
import { readFrontMatter } from "./frontmatter.mjs";

const role = process.argv[2];
if (!role) { console.error("usage: check-package.mjs <role>"); process.exit(2); }

const JOURNAL_DIR = process.env.JOURNAL_DIR || "journal";
const dir = join(ROOT, "roles", role);
const DOCS = ["CHARTER.md", "BOUNDARIES.md", "INSTRUCTIONS.md", "IO.md",
  "COMMS.md", "ACCEPTANCE.md", "PROFILE.md"];
const read = (f) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return null; } };
// null means "git did not answer", which is not the same as "nothing changed".
// The old version swallowed the error and returned "", so the charter guard
// reported ok without having checked anything.
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }); } catch { return null; } };

const results = [], warnings = [];
const check = (n, title, ok, hint = "") => results.push({ n, title, ok, hint });
const warn = (t) => warnings.push(t);

let manifest = null;
try { manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch {}

// today's events, used for the journal check and for founder sanctions
const today = new Date().toISOString().slice(0, 10);
const todayEvents = (() => {
  const f = resolve(ROOT, JOURNAL_DIR, `${today}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
})();
const sanctioned = (path) =>
  todayEvents.some((e) => e.type === "sanction" && e.agent?.id === "founder" && e.subject === path);

// 1. every file of the package is present and non-empty
const missing = [...DOCS.filter((f) => !(read(f) || "").trim()), ...(manifest ? [] : ["manifest.json"])];
check(1, "package files present and non-empty", missing.length === 0, missing.join(", "));

// 2. manifest carries the machine contract of the role
const m = manifest || {};
const manifestErrors = [];
if (m.schema_version !== 1) manifestErrors.push("schema_version");
if (m.role !== role) manifestErrors.push("role mismatch");
if (!/^\d+\.\d+$/.test(String(m.version || ""))) manifestErrors.push("version");
if (!m.reports_to) manifestErrors.push("reports_to");
if (!m.grade) manifestErrors.push("grade");
if (!["strict", "free"].includes(m.mode)) manifestErrors.push("mode");
if (!m.model?.primary) manifestErrors.push("model.primary");
if (!m.tools_profile) manifestErrors.push("tools_profile");
if (!(Number(m.budget_tokens) > 0)) manifestErrors.push("budget_tokens");
check(2, "manifest declares role, version, mode, model, tools and budget",
  manifestErrors.length === 0, manifestErrors.join(", "));

// 3. boundaries: prose in its own file, counted by structure, not by wording
const boundaries = ((read("BOUNDARIES.md") || "").match(/^\s*[-*]\s+\S/gm) || []).length;
check(3, "BOUNDARIES.md lists at least three boundaries", boundaries >= 3, `${boundaries}`);

// 4. triggers are declarative and use known operations
// Keep in step with the OPS table in state.mjs: a trigger the engine knows but
// the check does not is a package that can never be accepted.
const OPS = ["role_state", "front_matter_equals", "file_exists", "project_status"];
const badTriggers = (m.triggers || []).filter((t) => !t.id || !OPS.includes(t.when?.op));
check(4, "triggers are declarative and use known operations",
  Array.isArray(m.triggers) && m.triggers.length > 0 && badTriggers.length === 0,
  badTriggers.map((t) => t.id || "?").join(", "));

// 5. acceptance criteria describe the ROLE'S WORK; package acceptance is shared
const acceptItems = ((read("ACCEPTANCE.md") || "").match(/^\s*(?:\d+\.|[-*])\s+\S/gm) || []).length;
check(5, "ACCEPTANCE.md lists at least three criteria", acceptItems >= 3, `${acceptItems} items`);

// 6. size: the whole package is read into the prompt every shift
const lines = (f) => (read(f) || "").split("\n").length;
const total = DOCS.reduce((a, f) => a + lines(f), 0) + lines("manifest.json");
check(6, "package is at most 1200 lines in total", total <= 1200, `${total} now`);
for (const f of DOCS) if (f !== "INSTRUCTIONS.md" && lines(f) > 120) warn(`${f}: ${lines(f)} lines, over 120`);

// 7. the charter is not touched without an explicit founder sanction
const charterStatus = git("status", "--porcelain", "COMPANY.md");
const charterTouched = charterStatus === null || charterStatus.trim() !== "";
check(7, "COMPANY.md untouched or sanctioned",
  charterStatus !== null && (!charterTouched || sanctioned("COMPANY.md")),
  charterTouched ? (sanctioned("COMPANY.md") ? "changed under sanction" : "changed, no sanction today") : "");

// 8. front matter of every review of this role parses
const reviews = existsSync(join(ROOT, "org/reviews"))
  ? readdirSync(join(ROOT, "org/reviews")).filter((f) => f.startsWith(role) && f.endsWith(".md")) : [];
const badReviews = reviews.filter((f) => {
  const fm = readFrontMatter(join(ROOT, "org/reviews", f));
  return !fm || !fm.verdict || !fm.package_version || !fm.dimension
    || !fm.analysis_by || !fm.decided_by;
});
check(8, "reviews declare verdict, dimension and who analysed vs who decided",
  badReviews.length === 0, badReviews.join(", "));

// 9. the shift left a trace. Only meaningful for the role that is working right
// now: as a package invariant it declared every idle employee unacceptable.
// Enabled by --shift, which only shift.sh passes.
if (process.argv.includes("--shift"))
  check(9, "journal has an event about this work today",
  todayEvents.some((e) => e.agent?.id === role || e.subject === role));

// 10. copied text: a package assembled by lifting sections from a neighbour
// looks complete and says nothing about this role. Structural, language-free.
const significant = (text) => (text || "").split("\n")
  .map((l) => l.replace(/^\s*[-*>#\d.]+\s*/, "").trim())
  .filter((l) => l.length >= 40);
const mine = new Set(DOCS.flatMap((f) => significant(read(f))));
let copied = [];
for (const other of readdirSync(join(ROOT, "roles")).filter((d) => d !== role)) {
  const theirs = new Set(DOCS.flatMap((f) => {
    try { return significant(readFileSync(join(ROOT, "roles", other, f), "utf8")); }
    catch { return []; }
  }));
  const shared = [...mine].filter((l) => theirs.has(l));
  if (shared.length > copied.length) copied = shared.map((l) => `${other}: ${l.slice(0, 55)}`);
}
check(10, "no long passages copied from another package", copied.length <= 3,
  copied.length ? `${copied.length} shared lines, e.g. ${copied[0]}` : "");

// 11. a verdict must cite the repository, not just assert
const uncited = reviews.filter((f) => {
  const text = readFileSync(join(ROOT, "org/reviews", f), "utf8");
  if (readFrontMatter(join(ROOT, "org/reviews", f))?.legacy === "true") return false;
  return (text.match(/(roles|org|projects|journal|docs)\/[\w./-]+/g) || []).length < 3;
});
check(11, "reviews cite artefacts instead of only asserting", uncited.length === 0, uncited.join(", "));

// 12. a returned package must come back with a higher version
const state = readState()[role];
const returned = (state?.reviews || []).filter((r) => r.verdict === "changes_requested").pop();
if (!returned) check(13, "version after a return (no returns yet)", true);
else {
  const cmp = (a, b) => {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  };
  // A return means obligations or criteria changed: that is a major bump.
  check(13, "major version is higher than the one that was returned",
    cmp(m.version || "0.0", returned.version || "0.0") > 0,
    `now ${m.version}, returned ${returned.version}`);
}

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "  ok  " : "FAILED"} ${r.n}. ${r.title}${r.hint ? `  - ${r.hint}` : ""}`);
}
for (const w of warnings) console.log(`  warn  ${w}`);
console.log(bad ? `\n${bad} check(s) failed: work is not submitted, review does not start.` : "\nAutomated checks passed.");
process.exit(bad ? 1 : 0);
