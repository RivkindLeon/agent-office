// Tests for the governance scripts. They are production code now: they decide
// what reaches the repository and who counts as whom.
//
//   node --test org/tools/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontMatter } from "./frontmatter.mjs";
import { violations } from "./diff-guard.mjs";
import { validateEvent } from "./validate-journal.mjs";
import { ROOT, readState, tasksFor, pendingForFounder } from "./state.mjs";
import { renderOrg, renderTask } from "./render.ru.mjs";

const run = (args, env = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, args,
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) { return { code: e.status, out: (e.stdout || "") + (e.stderr || "") }; }
};

test("front matter separates machine facts from prose", () => {
  const fm = parseFrontMatter('---\nkind: review\nverdict: accepted\nround: 2\n---\n\n# Ревью\n\nтекст');
  assert.deepEqual(fm, { kind: "review", verdict: "accepted", round: "2" });
  assert.equal(parseFrontMatter("# Ревью без заголовка"), null);
});

test("write policy: an explicit deny beats an allow", () => {
  assert.equal(violations("head-of-people", ["roles/head-of-product/IO.md"]).length, 0);
  assert.equal(violations("head-of-people", ["roles/head-of-people/PROFILE.md"])[0].why, "explicitly denied");
  assert.equal(violations("head-of-people", ["COMPANY.md"])[0].why, "explicitly denied");
  assert.equal(violations("head-of-people", ["org/tools/gate.mjs"])[0].why, "explicitly denied");
  assert.equal(violations("head-of-people", ["org/ORG.md"])[0].why, "explicitly denied");
});

test("write policy: paths outside the allow list are rejected", () => {
  assert.equal(violations("head-of-product", ["roles/head-of-people/IO.md"])[0].why, "outside allowed paths");
  assert.equal(violations("head-of-product", ["projects/office/BRIEF.md"]).length, 0);
});

test("a role without a policy may write nothing", () => {
  assert.equal(violations("head-of-engineering", ["projects/office/BRIEF.md"]).length, 1);
});

test("journal validator rejects broken events", () => {
  const ok = { ts: new Date().toISOString(), agent: { id: "head-of-people", version: "7.0" },
    type: "idle", summary: "ок", outcome: "idle" };
  assert.deepEqual(validateEvent(ok), []);
  assert.ok(validateEvent({ ...ok, agent: { id: "head-of-people" } }).length, "missing package version");
  assert.ok(validateEvent({ ...ok, type: "handoff" }).length, "handoff without recipient");
  assert.ok(validateEvent({ ...ok, usage: { input_tokens: -1 } }).length, "negative usage");
  assert.ok(validateEvent({ ...ok, summary: "x".repeat(81) }).length, "summary too long");
  assert.ok(validateEvent({ ...ok, type: "sanction", subject: "COMPANY.md" }).length, "sanction not from founder");
});

test("an agent cannot claim to be the founder", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const r = run(["org/tools/log-event.mjs", "founder", "sanction", "правлю хартию",
      "--subject", "COMPANY.md"], { JOURNAL_DIR: tmp, FOUNDER_TOKEN: "guessed" });
    assert.equal(r.code, 4);
    assert.match(r.out, /FOUNDER_TOKEN/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("an employee event carries the journal contract", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const r = run(["org/tools/log-event.mjs", "head-of-people", "handoff", "передал",
      "--to", "head-of-product", "--in", "100", "--out", "50"], { JOURNAL_DIR: tmp, RUN_ID: "run-42" });
    assert.equal(r.code, 0, r.out);
    const day = new Date().toISOString().slice(0, 10);
    const e = JSON.parse(readFileSync(join(tmp, `${day}.jsonl`), "utf8").trim());
    assert.equal(e.schema_version, 1);
    assert.equal(e.run_id, "run-42");
    assert.equal(e.handoff_to, "head-of-product");
    assert.equal(e.usage.input_tokens, 100);
    assert.match(e.event_id, /^[0-9a-f-]{36}$/);
    assert.ok(e.ts.endsWith("Z"), "timestamps are UTC");
    assert.equal(e.agent.version, readState()["head-of-people"].version, "version comes from the manifest");
    assert.deepEqual(validateEvent(e), []);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("handoff without a recipient is never written", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const r = run(["org/tools/log-event.mjs", "head-of-people", "handoff", "передал"], { JOURNAL_DIR: tmp });
    assert.equal(r.code, 2);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("state is derived from manifests, front matter and the journal", () => {
  const st = readState();
  assert.equal(st["head-of-people"].state, "hired");
  assert.equal(st["head-of-people"].version, JSON.parse(
    readFileSync(join(ROOT, "roles/head-of-people/manifest.json"), "utf8")).version);
  assert.ok(st["head-of-product"].state);
});

test("triggers are declarative and only fire for hired roles", () => {
  const st = readState();
  const hop = tasksFor("head-of-people", st);
  if (st["head-of-product"].state === "changes_requested")
    assert.ok(hop.some((t) => t.trigger === "revise-package"), "a return creates work for the hiring role");
  assert.deepEqual(tasksFor("head-of-product", st), [], "a role that is not hired does not work");
});

test("no prose lives in the machine layer", () => {
  const cyrillic = /[\u0400-\u04FF]/;
  for (const role of ["head-of-people", "head-of-product"]) {
    const raw = readFileSync(join(ROOT, `roles/${role}/manifest.json`), "utf8");
    assert.equal(cyrillic.test(raw), false, `${role}/manifest.json contains prose`);
  }
  const policy = readFileSync(join(ROOT, "org/write-policy.json"), "utf8");
  assert.equal(cyrillic.test(policy), false, "write-policy.json contains prose");
});

test("task wording comes from the renderer, not from the manifest", () => {
  const text = renderTask({ trigger: "write-package", role: "x", requisition: "r.md" });
  assert.match(text, /написать пакет/);
});

test("the org chart is a rendering, so it cannot drift", () => {
  const rendered = renderOrg(readState());
  const onDisk = readFileSync(join(ROOT, "org/ORG.md"), "utf8");
  assert.equal(onDisk.trim(), rendered.trim(), "run node org/tools/org.mjs");
});

test("nothing is waiting on the founder while a round is open", () => {
  const st = readState();
  const pending = pendingForFounder(st);
  if (st["head-of-product"].state === "changes_requested" && st["head-of-product"].round < 3)
    assert.equal(pending.some((i) => i.role === "head-of-product"), false);
});
