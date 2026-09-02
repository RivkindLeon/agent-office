// The only place where the machine speaks Russian.
//
// Everything the company publishes for its founder - the inbox, the org chart -
// is rendered here. Keeping these strings in one file means the code stays
// language-free and a future translation touches exactly one module.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./state.mjs";

export const STATE_RU = {
  requisition_pending: "заявка ждёт решения",
  requisition_approved: "заявка одобрена, пакета нет",
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
  escalation: (i) => [`эскалация по **${i.role}**`, "решить и закоммитить"],
  record_hire: (i) => [`**${i.role} ${i.version}** принят, но не нанят`, "записать событие hired"],
  third_round: (i) => [`третий круг по **${i.role}**`, "решить спор или признать брак"],
};

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
