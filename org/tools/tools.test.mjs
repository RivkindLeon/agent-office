// Тесты governance-скриптов. Они стали продакшн-кодом: от них зависит, что
// попадёт в репозиторий и кто чем считается. Гонять: node --test org/tools/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { violations } from "./diff-guard.mjs";
import { validateEvent } from "./validate-journal.mjs";
import { readState, tasksFor, pendingForFounder, drift, ROOT } from "./state.mjs";

const node = process.execPath;
const run = (args, env = {}) => {
  try {
    return { code: 0, out: execFileSync(node, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) { return { code: e.status, out: (e.stdout || "") + (e.stderr || "") }; }
};

test("политика записи: прямой запрет сильнее разрешения", () => {
  assert.equal(violations("head-of-people", ["roles/head-of-product/IO.md"]).length, 0);
  assert.equal(violations("head-of-people", ["roles/head-of-people/PROFILE.md"]).length, 1);
  assert.equal(violations("head-of-people", ["COMPANY.md"])[0].why, "прямой запрет");
  assert.equal(violations("head-of-people", ["org/tools/gate.mjs"])[0].why, "прямой запрет");
});

test("политика записи: путь вне разрешённых отклоняется", () => {
  assert.equal(violations("head-of-product", ["roles/head-of-people/IO.md"])[0].why, "вне разрешённых путей");
  assert.equal(violations("head-of-product", ["projects/office/BRIEF.md"]).length, 0);
});

test("роль без политики не может писать ничего", () => {
  assert.equal(violations("head-of-engineering", ["projects/office/BRIEF.md"]).length, 1);
});

test("валидатор журнала ловит битые события", () => {
  const ok = { ts: new Date().toISOString(), agent: { id: "head-of-people", version: "6.0" },
    type: "idle", summary: "ок", outcome: "idle" };
  assert.deepEqual(validateEvent(ok), []);
  assert.ok(validateEvent({ ...ok, agent: { id: "head-of-people" } }).length, "нет версии пакета");
  assert.ok(validateEvent({ ...ok, type: "handoff" }).length, "handoff без получателя");
  assert.ok(validateEvent({ ...ok, usage: { input_tokens: -1 } }).length, "отрицательный расход");
  assert.ok(validateEvent({ ...ok, summary: "x".repeat(81) }).length, "слишком длинный summary");
});

test("агент не может представиться основателем", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const bad = run(["org/tools/log-event.mjs", "founder", "sanction", "правлю хартию",
      "--subject", "COMPANY.md"], { JOURNAL_DIR: tmp, FOUNDER_TOKEN: "угадал" });
    assert.equal(bad.code, 4, "санкция без токена должна отклоняться");
    assert.match(bad.out, /FOUNDER_TOKEN/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("событие сотрудника получает контракт журнала", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const r = run(["org/tools/log-event.mjs", "head-of-people", "handoff", "передал",
      "--to", "head-of-product"], { JOURNAL_DIR: tmp, RUN_ID: "run-42" });
    assert.equal(r.code, 0, r.out);
    const day = new Date().toISOString().slice(0, 10);
    const e = JSON.parse(readFileSync(join(tmp, `${day}.jsonl`), "utf8").trim());
    assert.equal(e.schema_version, 1);
    assert.equal(e.run_id, "run-42");
    assert.equal(e.handoff_to, "head-of-product");
    assert.match(e.event_id, /^[0-9a-f-]{36}$/);
    assert.ok(e.ts.endsWith("Z"), "время в UTC");
    assert.deepEqual(validateEvent(e), []);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("handoff без получателя не создаётся", () => {
  const tmp = mkdtempSync(join(tmpdir(), "journal-"));
  try {
    const r = run(["org/tools/log-event.mjs", "head-of-people", "handoff", "передал"], { JOURNAL_DIR: tmp });
    assert.equal(r.code, 2);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("состояние компании выводится однозначно и без расхождений", () => {
  const st = readState();
  assert.equal(st["head-of-people"].state, "hired");
  assert.ok(["review_pending", "changes_requested", "accepted", "hired"].includes(st["head-of-product"].state));
  assert.deepEqual(drift(st), [], "документы разошлись с выведенным состоянием");
});

test("возврат порождает работу, принятое на старой версии не считается", () => {
  const st = readState();
  const hop = st["head-of-product"];
  if (hop.state === "changes_requested") {
    assert.ok(tasksFor("head-of-people", st).some((t) => t.includes("круг правок")));
    assert.equal(pendingForFounder(st).some((i) => i.what.includes("ждёт ревью")), hop.round >= 3);
  }
});
