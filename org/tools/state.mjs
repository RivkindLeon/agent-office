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

// A verdict covers the whole major line. Mechanics of the engine - a predicate,
// a renamed key, a fixed path - do not change what the role owes anyone, and
// asking the founder to re-read a package for them buys nothing but ceremony.
// Obligations, boundaries, acceptance criteria, grade and budget are major, and
// those always come back for a verdict.
export const majorOf = (v) => Number(String(v || "0").split(".")[0]);
export const sameMajor = (a, b) => majorOf(a) === majorOf(b);

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
    if (!fm) continue;
    const delivery = readFrontMatter(abs(`projects/${dir}/DELIVERY.md`));
    out.push({ id: dir, status: fm.status || "unknown", question: fm.question || null,
      brief: `projects/${dir}/BRIEF.md`,
      delivery: delivery ? `projects/${dir}/DELIVERY.md` : null,
      deliveryStatus: delivery?.status || null });
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
    // Nobody accepts their own work. The two dimensions exist precisely so that
    // two different people look; a self-signed verdict is neither.
    if (fm.decided_by && fm.decided_by === fm.role) continue;
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
    if (e.type === "hired" && e.agent?.id === "founder" && roles[e.subject])
      roles[e.subject].hired = true;

  for (const r of Object.values(roles)) {
    r.reviews.sort((a, b) => a.round - b.round);
    const last = r.reviews[r.reviews.length - 1] || null;
    r.lastReview = last;
    r.round = last?.round || 0;
    // A verdict only counts for the version it was issued against: an old
    // "accepted" can never authorise a newer package.
    const forVersion = r.version
      ? r.reviews.filter((v) => sameMajor(r.version, v.version)) : [];
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
      if (!fm || fm.status !== cond.status) continue;
      // Работа, уже сданная, не выдаётся снова: без этого исполнитель крутится
      // на проекте вечно, потому что статус брифа меняет не он.
      if (cond.without_file && existsSync(abs(cond.without_file.replace("{target}", dir)))) continue;
      hits.push({ ...self, project: dir });
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
  // Done means the artefact carries the answer, not that the worker said so.
  // The previous predicate looked for a `steps_done` key nobody had ever told
  // the agent about: it did the work correctly seven shifts in a row and the
  // step never closed.
  if (step.front_matter_key) {
    const fm = readFrontMatter(abs(`projects/${target}/BRIEF.md`)) || {};
    return Boolean((fm[step.front_matter_key] || "").trim());
  }
  return false;  // "submit" and manual checks are never auto-satisfied
};

// A step can be a list rather than a single artefact: "one task per shift"
// cannot be written out in advance, because the tasks are produced by an
// earlier step. The manifest declares where to read them, the engine hands out
// the first unfinished one.
function pendingTask(step, target) {
  const file = step.steps_from.file.replace("{target}", target);
  let data;
  try { data = JSON.parse(readFileSync(abs(file), "utf8")); } catch { return { missing: file }; }
  const done = step.steps_from.done_status || "green";
  const task = (data.tasks || []).find((t) => t.status !== done);
  return task ? { task } : null;
}

/** The next unfinished step of a declared work type. */
export function nextStep(self, workId, target) {
  const work = (self?.manifest?.work || []).find((w) => w.id === workId);
  const steps = work?.steps || DEFAULT_STEPS;
  for (const step of steps) {
    if (step.steps_from) {
      const p = pendingTask(step, target);
      if (p === null) continue;                       // every task is done
      if (p.missing) return { ...step, missing: p.missing };
      return { ...step, task: p.task };
    }
    if (!stepDone(step, target)) return step;
  }
  return null;
}

/** What the role must do on its own, without the founder. Structured: the
 * wording of a task is prose and lives in render.ru.mjs. */
export function tasksFor(roleId, state = readState()) {
  const self = state[roleId];
  // A package that is written, or even accepted, is not an employee. Only a
  // hire - which only the founder can record - starts work. The invariant was
  // asserted in tests and documented, but never enforced here.
  if (self?.state !== "hired") return [];
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
        work: t.work || null, step: step?.id || null, item: step?.task || null,
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
    if (p.deliveryStatus === "ready-for-acceptance")
      items.push({ kind: "accept_delivery", role: p.id, where: p.delivery });
    if (p.status === "ready-for-engineering" && !p.delivery
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
