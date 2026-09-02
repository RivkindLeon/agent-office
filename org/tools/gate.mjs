// Проверка триггеров должности ДО вызова модели (COMPANY.md, закон «нет входа —
// нет смены»). Ничего не пишет и не решает: только отвечает, есть ли работа.
// Состояние берётся из общего редьюсера, а не восстанавливается заново.
//
//   node org/tools/gate.mjs head-of-people
//
// Код возврата: 0 — работа есть, 3 — работы нет.

import { readState, tasksFor } from "./state.mjs";

const role = process.argv[2];
if (!role) { console.error("укажи должность"); process.exit(2); }

const tasks = tasksFor(role, readState());
if (!tasks.length) { console.log(`${role}: работы нет`); process.exit(3); }
console.log(`${role}: работа есть\n` + tasks.map((t) => `- ${t}`).join("\n"));
