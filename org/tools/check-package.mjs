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
const DOCS = ["CHARTER.md", "INSTRUCTIONS.md", "IO.md", "COMMS.md", "ACCEPTANCE.md", "PROFILE.md"];
const read = (f) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return null; } };
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }); } catch { return ""; } };

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

// 3. boundaries: at least three, and they live in the manifest as data
check(3, "manifest lists at least three boundaries", (m.boundaries || []).length >= 3,
  `${(m.boundaries || []).length}`);

// 4. triggers are declarative and use known operations
const OPS = ["role_state", "front_matter_equals", "file_exists"];
const badTriggers = (m.triggers || []).filter((t) => !t.id || !t.task || !OPS.includes(t.when?.op));
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
const charterTouched = git("status", "--porcelain", "COMPANY.md").trim() !== "";
check(7, "COMPANY.md untouched or sanctioned", !charterTouched || sanctioned("COMPANY.md"),
  charterTouched ? (sanctioned("COMPANY.md") ? "changed under sanction" : "changed, no sanction today") : "");

// 8. front matter of every review of this role parses
const reviews = existsSync(join(ROOT, "org/reviews"))
  ? readdirSync(join(ROOT, "org/reviews")).filter((f) => f.startsWith(role) && f.endsWith(".md")) : [];
const badReviews = reviews.filter((f) => {
  const fm = readFrontMatter(join(ROOT, "org/reviews", f));
  return !fm || !fm.verdict || !fm.package_version;
});
check(8, "every review of this role has machine-readable front matter",
  badReviews.length === 0, badReviews.join(", "));

// 9. the shift left a trace
check(9, "journal has an event about this work today",
  todayEvents.some((e) => e.agent?.id === role || e.subject === role));

// 10. a returned package must come back with a higher version
const state = readState()[role];
const returned = (state?.reviews || []).filter((r) => r.verdict === "changes_requested").pop();
if (!returned) check(10, "version after a return (no returns yet)", true);
else {
  const cmp = (a, b) => {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  };
  check(10, "version is higher than the one that was returned",
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
