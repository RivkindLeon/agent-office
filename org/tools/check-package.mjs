// Автоматическая часть приёмки пакета должности (org/PACKAGE-ACCEPTANCE.md).
// Гоняет её АВТОР до сдачи. Красная проверка означает, что работа не сдана и
// ревью не начинается.
//
//   node org/tools/check-package.mjs head-of-people

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const role = process.argv[2];
if (!role) { console.error("укажи должность: node org/tools/check-package.mjs <должность>"); process.exit(2); }

const dir = join(ROOT, "roles", role);
const JOURNAL_DIR = process.env.JOURNAL_DIR || "journal";
const FILES = ["CHARTER.md", "INSTRUCTIONS.md", "IO.md", "COMMS.md", "ACCEPTANCE.md", "PROFILE.md"];
const read = (f) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return null; } };
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }); } catch { return ""; } };

// События журнала за сегодня — по ним засчитываются санкции основателя.
const today = new Date().toISOString().slice(0, 10);
const todayEvents = (() => {
  const f = resolve(ROOT, JOURNAL_DIR, `${today}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
})();
// Санкция: основатель разрешил себе правку конкретного файла сегодня.
const sanctioned = (path) =>
  todayEvents.some((e) => e.type === "sanction" && e.agent?.id === "founder" && e.subject === path);

const results = [], warnings = [];
const check = (n, title, ok, hint = "") => results.push({ n, title, ok, hint });
const warn = (text) => warnings.push(text);

// 1. шесть файлов на месте и не пусты
const missing = FILES.filter((f) => { const t = read(f); return !t || !t.trim(); });
check(1, "шесть файлов пакета на месте и не пусты", missing.length === 0, missing.join(", "));

const charter = read("CHARTER.md") || "", io = read("IO.md") || "";
const instr = read("INSTRUCTIONS.md") || "", profile = read("PROFILE.md") || "";
const accept = read("ACCEPTANCE.md") || "";

// 2. границы: раздел "НЕ делает" и в нём не меньше трёх пунктов
const notSection = charter.split(/^##\s+/m).find((s) => /НЕ\s+делает/i.test(s.split("\n")[0] || ""));
const notItems = notSection ? (notSection.match(/^\s*[-*]\s+/gm) || []).length : 0;
check(2, "в CHARTER.md раздел «чего НЕ делает», не меньше трёх пунктов", notItems >= 3,
  notSection ? `пунктов ${notItems}` : "раздел не найден");

// 3. триггеры и случай «входа нет»
check(3, "в IO.md есть триггеры и среди них случай «входа нет»",
  /##\s*Триггер/i.test(io) && /(входа нет|смены нет|не выполнено)/i.test(io));

// 4. режим действий указан явно
check(4, "в INSTRUCTIONS.md явно указан режим действий", /режим действий\s*[—:-]?\s*\*{0,2}(жёсткий|свободный)/i.test(instr));

// 5. версия, история и лимит расхода
check(5, "в PROFILE.md есть версия X.Y, история версий и лимит расхода",
  /Версия пакета:\s*\d+\.\d+/i.test(profile) && /##\s*История/i.test(profile)
  && /лимит/i.test(profile) && /\d[\d  ]{2,}\s*токен/i.test(profile));

// 6. критерии приёмки РАБОТЫ должности: не меньше трёх пунктов.
// Приёмка самого пакета сюда не переписывается — она общая.
const acceptItems = (accept.match(/^\s*(?:\d+\.|[-*])\s+\S/gm) || []).length;
check(6, "в ACCEPTANCE.md не меньше трёх пунктов", acceptItems >= 3, `пунктов ${acceptItems}`);

// 7. объём: возвращает работу только превышение суммы — платит за неё контекст
const lines = (f) => (read(f) || "").split("\n").length;
const total = FILES.reduce((a, f) => a + lines(f), 0);
check(7, "суммарный объём пакета не больше 1200 строк", total <= 1200, `сейчас ${total}`);
for (const f of FILES)
  if (f !== "INSTRUCTIONS.md" && lines(f) > 120) warn(`${f}: ${lines(f)} строк — длиннее 120`);

// 8. хартия не тронута — либо тронута основателем по санкции
const charterTouched = git("status", "--porcelain", "COMPANY.md").trim() !== "";
check(8, "COMPANY.md не изменён без санкции основателя", !charterTouched || sanctioned("COMPANY.md"),
  charterTouched ? (sanctioned("COMPANY.md") ? "изменён по санкции основателя" : "изменён, санкции за сегодня нет") : "");

// 9. в ORG.md не добавлено строк без принятого вердикта
const orgTouched = git("status", "--porcelain", "org/ORG.md").trim() !== "";
const reviews = existsSync(join(ROOT, "org/reviews"))
  ? readdirSync(join(ROOT, "org/reviews")).filter((f) => f.startsWith(role))
  : [];
// Вердикт бывает выделен разметкой: «Вердикт: **принято**».
const accepted = reviews.some((f) => /Вердикт:\s*\**\s*принято/i.test(readFileSync(join(ROOT, "org/reviews", f), "utf8")));
check(9, "org/ORG.md не изменён без вердикта «принято» или санкции",
  !orgTouched || accepted || sanctioned("org/ORG.md"),
  orgTouched && !accepted && !sanctioned("org/ORG.md") ? "ORG.md изменён, нет ни вердикта, ни санкции" : "");

// 10. событие в журнале за сегодня, с версией пакета
// Событие об этой работе: либо её автор — сама должность, либо она предмет
// события (так засчитывается пакет, написанный кем-то другим).
const logged = todayEvents.some((e) => e.agent?.id === role || e.subject === role);
check(10, "в журнале за сегодня есть событие об этой работе", logged);

// 11. после возврата версия обязана вырасти
const ver = (t) => { const m = /(\d+)\.(\d+)/.exec(t || ""); return m ? [+m[1], +m[2]] : null; };
const cur = ver(/Версия пакета:\s*([\d.]+)/i.exec(profile)?.[1]);
let returnedAt = null;
for (const f of reviews.sort()) {
  const t = readFileSync(join(ROOT, "org/reviews", f), "utf8");
  if (/Вердикт:\s*\**\s*вернуть/i.test(t)) returnedAt = ver(/версия\s*([\d.]+)/i.exec(t)?.[1]);
}
if (!returnedAt) check(11, "версия после возврата (возвратов не было)", true);
else check(11, "после возврата версия пакета выше, чем в вердикте",
  !!cur && (cur[0] > returnedAt[0] || (cur[0] === returnedAt[0] && cur[1] > returnedAt[1])),
  cur ? `сейчас ${cur.join(".")}, в вердикте ${returnedAt.join(".")}` : "версия не найдена");

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "  ок" : "ПРОВАЛ"}  ${r.n}. ${r.title}${r.hint ? `  — ${r.hint}` : ""}`);
}
for (const w of warnings) console.log(`  ⚠   ${w}`);
console.log(bad ? `\n${bad} пункт(ов) не пройдено: работа не сдана, ревью не начинается.` : "\nАвтоматическая часть пройдена.");
process.exit(bad ? 1 : 0);
