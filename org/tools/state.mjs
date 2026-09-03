// The company's single state reducer.
//
// Everything derived - what a role must do, what the founder owes an answer to,
// what the org chart says - comes from here. Before this file, gate, inbox and
// the validators each rebuilt state with their own regexes and drifted apart
// within a day.
//
// Machine facts are read from front matter and role manifests only. Prose is
// never parsed: documents must stay translatable without breaking the runtime.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontMatter } from "./frontmatter.mjs";

// AGENT_OFFICE_ROOT lets scenario fixtures run the real engine against a
// synthetic repository, which is how instructions get regression-tested.
export const ROOT = process.env.AGENT_OFFICE_ROOT
  || join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const abs = (p) => join(ROOT, p);
const list = (p) => { try { return readdirSync(abs(p)); } catch { return []; } };
const readJson = (p) => { try { return JSON.parse(readFileSync(abs(p), "utf8")); } catch { return null; } };

/** Hiring states. This is a state machine, not a bag of flags. */
// The canonical package. "Does a package exist" and "is it finished" are two
// different questions: answering both with "is there a manifest" halted a run
// half-way, because the manifest is itself one of the steps.
export const PACKAGE_FILES = [
  "CHARTER.md", "BOUNDARIES.md", "INSTRUCTIONS.md", "IO.md",
  "COMMS.md", "ACCEPTANCE.md", "PROFILE.md", "manifest.json",
];

export const STATES = [
  "requisition_pending",   // requisition exists, founder has not decided
  "requisition_approved",  // approved, package not written yet
  "package_draft",         // package under construction, steps still missing
  "review_pending",        // package exists, a verdict is missing for this version
  "changes_requested",     // some dimension returned the current version
  "escalated",             // some dimension escalated
  "accepted",              // both dimensions accepted this version
  "hired",                 // founder logged a "hired" event
];

// A package is judged along two independent dimensions, by two different
// people. Form is the shape of the package - the hiring function can check it
// without knowing the trade. Substance is whether the described work is the
// right work - only the function that ordered the role can say that. Merging
// them was the reason a recruiter was implicitly asked to grade engineering.
export const DIMENSIONS = ["form", "substance"];

const cmpVersion = (a, b) => {
  const pa = String(a || "0.0").split(".").map(Number);
  const pb = String(b || "0.0").split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1];
};

export function readJournal() {
  const events = [];
  for (const f of list("journal").filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(abs(`journal/${f}`), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* validator reports broken lines */ }
    }
  }
  return events;
}

/** Projects and the status of their brief: work has a lifecycle too. */
export function readProjects() {
  const out = [];
  for (const dir of (() => { try { return readdirSync(abs("projects")); } catch { return []; } })()) {
    const fm = readFrontMatter(abs(`projects/${dir}/BRIEF.md`));
    if (fm) out.push({ id: dir, status: fm.status || "unknown",
      question: fm.question || null, brief: `projects/${dir}/BRIEF.md` });
  }
  return out;
}

export function readState() {
  const roles = {};
  const journal = readJournal();

  for (const f of list("org/requisitions").filter((f) => f.endsWith(".md"))) {
    const fm = readFrontMatter(abs(`org/requisitions/${f}`)) || {};
    const id = fm.role || f.replace(/\.md$/, "");
    roles[id] = {
      id,
      requisition: `org/requisitions/${f}`,
      decision: fm.decision || "pending",
      reportsTo: fm.reports_to || null,
      hiringManager: fm.hiring_manager || null,
      manifest: null, version: null, reviews: [], questions: null,
      hired: false, state: null, round: 0, lastReview: null,
    };
  }

  for (const id of list("roles").filter((d) => existsSync(abs(`roles/${d}/manifest.json`)))) {
    const manifest = readJson(`roles/${id}/manifest.json`);
    roles[id] ??= { id, requisition: null, decision: "approved", reviews: [] };
    roles[id].manifest = manifest;
    roles[id].version = manifest?.version || null;
    roles[id].missingFiles = PACKAGE_FILES.filter((f) => !existsSync(abs(`roles/${id}/${f}`)));
    roles[id].reportsTo ??= manifest?.reports_to || null;
  }

  for (const f of list("org/reviews").filter((f) => f.endsWith(".md")).sort()) {
    const fm = readFrontMatter(abs(`org/reviews/${f}`));
    if (!fm) continue;
    // A verdict for a package that was scrapped is history, not state.
    if (fm.void === "true") continue;
    const r = roles[fm.role];
    if (!r) continue;
    if (fm.kind === "questions") { r.questions = `org/reviews/${f}`; continue; }
    r.reviews.push({
      file: `org/reviews/${f}`,
      verdict: fm.verdict || null,
      dimension: fm.dimension || "form",
      version: fm.package_version || null,
      round: Number(fm.round || r.reviews.length + 1),
      analysisBy: fm.analysis_by || null,
      decidedBy: fm.decided_by || null,
    });
  }

  // "Hired" is a founder decision, and founder events are token-protected.
  // Reading it from the journal rather than from prose removes a whole class
  // of drift: the org chart becomes a rendering, not a source.
  for (const e of journal)
    if (e.type === "hired" && roles[e.subject]) roles[e.subject].hired = true;

  for (const r of Object.values(roles)) {
    r.reviews.sort((a, b) => a.round - b.round);
    const last = r.reviews[r.reviews.length - 1] || null;
    r.lastReview = last;
    r.round = last?.round || 0;
    // A verdict only counts for the version it was issued against: an old
    // "accepted" can never authorise a newer package.
    const forVersion = r.version
      ? r.reviews.filter((v) => cmpVersion(r.version, v.version) === 0) : [];
    const byDimension = {};
    for (const v of forVersion) byDimension[v.dimension] = v;  // later rounds win
    r.verdicts = byDimension;
    r.missing = DIMENSIONS.filter((d) => !byDimension[d]);
    const verdicts = DIMENSIONS.map((d) => byDimension[d]?.verdict);
    // A hired role can still be running on an unreviewed instruction: the
    // package keeps being edited after the hire. Being hired hides that, so it
    // is surfaced separately - the working instruction of a live employee is
    // exactly the document nobody should be running blind.
    r.unreviewed = DIMENSIONS.filter((d) => byDimension[d]?.verdict !== "accepted");
    if (r.hired) r.state = "hired";
    else if (verdicts.includes("escalated")) r.state = "escalated";
    else if (verdicts.includes("changes_requested")) r.state = "changes_requested";
    else if (r.version && (r.missingFiles || []).length) r.state = "package_draft";
    else if (r.version && verdicts.every((v) => v === "accepted")) r.state = "accepted";
    else if (r.version) r.state = "review_pending";
    else if (r.decision === "declined") r.state = null;
    else if (r.decision === "approved") r.state = "requisition_approved";
    else r.state = "requisition_pending";
  }
  return roles;
}

/** Closed, deterministic trigger language. No eval, no shell, no model judgement. */
const OPS = {
  role_state(cond, self, state) {
    const hits = [];
    for (const r of Object.values(state)) {
      if ((cond.scope === "self") !== (r.id === self.id)) continue;
      const wanted = Array.isArray(cond.state) ? cond.state : [cond.state];
      if (!wanted.includes(r.state)) continue;
      if (cond.max_round && r.round > Number(cond.max_round)) continue;
      hits.push(r);
    }
    return hits;
  },
  front_matter_equals(cond, self, state) {
    const fm = readFrontMatter(abs(cond.path));
    return fm && fm[cond.key] === cond.value ? [self] : [];
  },
  // Any project whose brief carries the given status. Replaces a hardcoded
  // path: a role must not need a new trigger for every new project.
  project_status(cond, self) {
    const hits = [];
    for (const dir of (() => { try { return readdirSync(abs("projects")); } catch { return []; } })()) {
      const fm = readFrontMatter(abs(`projects/${dir}/BRIEF.md`));
      if (fm && fm.status === cond.status) hits.push({ ...self, project: dir });
    }
    return hits;
  },
  file_exists(cond, self) {
    return existsSync(abs(cond.path)) ? [self] : [];
  },
};

// One shift produces one artifact, not a whole package. A big deliverable made
// in a single pass is where an agent starts copying sections from a neighbour:
// it is cheaper than holding eight documents in attention at once. The step is
// derived, not tracked: the first declared step that is not done yet.
const DEFAULT_STEPS = [
  { id: "draft", check: "manual" },
  { id: "self-review", check: "manual" },
  { id: "submit", check: "manual" },
];

const stepDone = (step, target) => {
  if (step.artifact) return existsSync(abs(step.artifact.replace("{target}", target)));
  if (step.front_matter_step) {
    const fm = readFrontMatter(abs(`projects/${target}/BRIEF.md`)) || {};
    return String(fm.steps_done || "").split(/[,\s]+/).includes(step.front_matter_step);
  }
  return false;  // "submit" and manual checks are never auto-satisfied
};

/** The next unfinished step of a declared work type. */
export function nextStep(self, workId, target) {
  const work = (self?.manifest?.work || []).find((w) => w.id === workId);
  const steps = work?.steps || DEFAULT_STEPS;
  return steps.find((s) => !stepDone(s, target)) || null;
}

/** What the role must do on its own, without the founder. Structured: the
 * wording of a task is prose and lives in render.ru.mjs. */
export function tasksFor(roleId, state = readState()) {
  const self = state[roleId];
  // A role that has not been hired does not work, whatever its triggers say.
  if (self?.state !== "hired") return [];
  const triggers = self?.manifest?.triggers || [];
  const tasks = [];
  for (const t of triggers) {
    const op = OPS[t.when?.op];
    if (!op) { tasks.push({ trigger: t.id, role: roleId, unknown: t.when?.op }); continue; }
    for (const hit of op(t.when, self, state)) {
      const target = hit.project || t.target || hit.id;
      const step = t.work ? nextStep(self, t.work, target) : null;
      tasks.push({ trigger: t.id, role: hit.id, target, requisition: hit.requisition,
        review: hit.lastReview?.file, version: hit.version, path: t.when.path,
        work: t.work || null, step: step?.id || null,
        artifact: step?.artifact?.replace("{target}", target) || null });
    }
  }
  return tasks;
}

/** What is waiting on the founder. Structured, not rendered: the Russian
 * wording lives in render.ru.mjs so this file stays language-free. */
export function pendingForFounder(state = readState()) {
  const items = [];
  for (const p of readProjects()) {
    if (p.status === "question")
      items.push({ kind: "answer_question", role: p.id, where: p.brief, question: p.question });
    if (p.status === "ready-for-review")
      items.push({ kind: "review_brief", role: p.id, where: p.brief });
    if (p.status === "ready-for-engineering"
        && !Object.values(state).some((r) => r.state === "hired" && r.id.includes("engineering")))
      items.push({ kind: "no_doer", role: p.id, where: p.brief });
  }
  for (const r of Object.values(state)) {
    const base = { role: r.id, version: r.version, round: r.round };
    if (r.state === "requisition_pending") items.push({ ...base, kind: "decide_requisition", where: r.requisition });
    if (r.questions) items.push({ ...base, kind: "answer_questions", where: r.questions });
    if (r.state === "review_pending")
      for (const d of r.missing)
        items.push({ ...base, kind: "review_package", dimension: d,
          who: d === "substance" ? (r.hiringManager || "заказчик") : "форма",
          where: `roles/${r.id}/` });
    if (r.state === "package_draft")
      items.push({ ...base, kind: "package_draft",
        done: PACKAGE_FILES.length - r.missingFiles.length, total: PACKAGE_FILES.length,
        next: r.missingFiles[0], where: `roles/${r.id}/` });
    if (r.state === "escalated") items.push({ ...base, kind: "escalation", where: r.lastReview.file });
    if (r.state === "accepted") items.push({ ...base, kind: "record_hire", where: "journal/" });
    if (r.state === "hired" && r.version && r.unreviewed.length)
      for (const d of r.unreviewed)
        items.push({ ...base, kind: "review_hired_package", dimension: d,
          who: d === "substance" ? (r.hiringManager || "заказчик") : "форма",
          where: `roles/${r.id}/` });
    if (r.state === "changes_requested" && r.round >= 3)
      items.push({ ...base, kind: "third_round", where: r.lastReview.file });
  }
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = readState();
  for (const r of Object.values(st))
    console.log(`${r.id.padEnd(18)} ${String(r.state).padEnd(22)} version ${r.version || "-"}  round ${r.round}`);
}
