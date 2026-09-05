// The only place where the machine speaks Russian.
//
// Everything the company publishes for its founder - the inbox, the org chart -
// is rendered here. Keeping these strings in one file means the code stays
// language-free and a future translation touches exactly one module.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./state.mjs";

// Task wording for triggers, keyed by trigger id. The manifest declares WHEN a
// role wakes up; what it is told is prose, and prose lives here.
const TASKS_RU = {
  "write-package": (t) => `написать пакет должности ${t.role} — заявка одобрена, ${t.requisition}`,
  "revise-package": (t) => `круг правок по пакету ${t.role} — вердикт в ${t.review}, читать целиком`,
  "record-hire": (t) => `внести ${t.role} в org/ORG.md — вердикт «принято» на версию ${t.version}`,
  "brief-needs-product": (t) => `наполнить продуктовый бриф projects/${t.target}/BRIEF.md`,
};

// A shift gets one step, so the wording names the step, not the whole job.
const STEPS_RU = {
  boundaries: "границы должности",
  charter: "устав: зачем должность существует",
  io: "вход и выход: триггеры, артефакты, когда «сделано»",
  manifest: "машинный манифест: версия, квалификация, триггеры, шаги работы",
  comms: "связи: подчинение, эскалация, что решает сам",
  acceptance: "критерии приёмки работы должности",
  profile: "квалификация и обоснование грейда",
  instructions: "рабочая инструкция",
  submit: "сдать работу: прогнать проверки и отдать на ревью",
  "submit-delivery": "сдать работу: собрать DELIVERY.md — что построено, какое требование каким тестом закрыто, вывод последнего прогона — и поставить `status: ready-for-acceptance`",
  "submit-brief": "сдать бриф: проверить его по своему ACCEPTANCE.md и поставить в front matter `status: ready-for-review`",
  users: "кто пользователь",
  problem: "какую проблему решаем",
  scope: "границы продукта",
  requirements: "требования с критериями приёмки",
  priorities: "приоритеты с основанием",
  design: "технический дизайн: как строим, кода нет",
  tasks: "разбивка на задачи: одна задача = одно поведение = один цикл красный-зелёный",
  draft: "черновик",
  "self-review": "перечитать как проверяющий",
};

export const renderTask = (t) => {
  const base = (TASKS_RU[t.trigger] || ((x) => `${x.trigger} по ${x.role}`))(t);
  if (!t.step) return base;
  if (t.item) {
    const phase = t.item.status === "red"
      ? "тест уже красный — напиши минимальный код, чтобы он позеленел"
      : "напиши тест на это поведение и покажи, что он падает; кода не писать";
    return `${base}\n  задача ${t.item.id} (${t.item.requirement}): ${t.item.behaviour}\n  ${phase}\n  одна задача за смену, следующая — только после зелёного`;
  }
  const what = STEPS_RU[t.step] || t.step;
  return `${base}\n  шаг этой смены — ${what}${t.artifact ? ` (${t.artifact})` : ""}\n  один шаг за смену: остальное подождёт следующей`;
};

export const STATE_RU = {
  requisition_pending: "заявка ждёт решения",
  requisition_approved: "заявка одобрена, пакета нет",
  package_draft: "пакет собирается",
  review_pending: "пакет ждёт ревью",
  changes_requested: "вернули на правки",
  escalated: "эскалация",
  accepted: "принят, не нанят",
  hired: "нанят",
};

const ITEM_RU = {
  decide_requisition: (i) => [`заявка **${i.role}** ждёт решения`,
    "поставить `decision: approved` или `declined` в front matter"],
  answer_questions: (i) => [`вопросы по **${i.role}**`, "ответить и закоммитить"],
  review_package: (i) => i.dimension === "substance"
    ? [`пакет **${i.role} ${i.version}** ждёт ревью **по существу** (заказчик: ${i.who})`,
       "проверить, та ли это работа, и положить вердикт с `dimension: substance`"]
    : [`пакет **${i.role} ${i.version}** ждёт ревью **по форме**`,
       "пройти org/PACKAGE-ACCEPTANCE.md и положить вердикт с `dimension: form`"],
  review_hired_package: (i) => [
    `**${i.role}** работает по непроверенной версии ${i.version} — нет вердикта «${i.dimension === "substance" ? "по существу" : "по форме"}»`,
    "прочитать пакет целиком и положить вердикт: сотрудник уже работает по этой инструкции"],
  answer_question: (i) => [
    `проект **${i.role}**: сотрудник ждёт ответа — ${i.question || "вопрос в брифе"}`,
    "ответить правкой брифа и вернуть `status: needs-product`"],
  accept_delivery: (i) => [
    `работа по проекту **${i.role}** сдана и ждёт приёмки`,
    "прочитать сдачу и следы прогонов; принять — поставить в брифе `status: done`, вернуть — написать в сдаче, чего не хватает"],
  review_brief: (i) => [`бриф проекта **${i.role}** сдан и ждёт приёмки`,
    "принять — поставить `status: ready-for-engineering`; вернуть — `needs-product` и написать в брифе, чего не хватает"],
  no_doer: (i) => [`бриф **${i.role}** принят, но строить его некому`,
    "нанять инженерную функцию: без неё принятый бриф лежит мёртвым"],
  package_draft: (i) => [
    `пакет **${i.role}** собирается: готово ${i.done} из ${i.total}, следующий — ${i.next}`,
    "работа сотрудника, не твоя; строка исчезнет сама. Не исчезает — сборка встала"],
  escalation: (i) => [`эскалация по **${i.role}**`, "решить и закоммитить"],
  record_hire: (i) => [`**${i.role} ${i.version}** принят, но не нанят`, "записать событие hired"],
  third_round: (i) => [`третий круг по **${i.role}**`, "решить спор или признать брак"],
};

export const renderItem = (i) => (ITEM_RU[i.kind] || (() => [i.kind, ""]))(i);

export function renderInboxBody(items) {
  if (!items.length) return "Ничего не ждёт. Компания работает сама.";
  return items.map((i, n) => {
    const [what, how] = (ITEM_RU[i.kind] || (() => [i.kind, ""]))(i);
    return `${n + 1}. ${what}\n   — ${how}\n   — \`${i.where}\``;
  }).join("\n\n");
}

export function renderOrg(state) {
  const hired = Object.values(state).filter((r) => r.state === "hired");
  const open = Object.values(state).filter((r) => r.state && r.state !== "hired");
  const notes = (() => {
    try { return readFileSync(join(ROOT, "org/ORG-NOTES.md"), "utf8").trim(); } catch { return ""; }
  })();
  return `# Оргструктура

Файл собирается \`org/tools/org.mjs\` из состояния компании. Руками не править:
правка исчезнет при следующей сборке. Найм фиксируется событием \`hired\` в
журнале, а событие от основателя требует его секрета — поэтому строку здесь
нельзя получить, минуя решение.

| Должность | Кому подчиняется | Пакет | Версия | Статус |
|---|---|---|---|---|
| Основатель | — | — | — | Leon, человек; вне оргструктуры |
| CEO | — | — | — | исполняет основатель |
${hired.map((r) => `| ${r.id} | ${r.reportsTo || "—"} | \`roles/${r.id}/\` | ${r.version} | нанят |`).join("\n")
  || "| — | | | | пока никого |"}

## В работе

${open.length
    ? "| Должность | Состояние | Версия | Круг |\n|---|---|---|---|\n" +
      open.map((r) => `| ${r.id} | ${STATE_RU[r.state] || r.state} | ${r.version || "—"} | ${r.round || "—"} |`).join("\n")
    : "Ничего."}

${notes}
`;
}
