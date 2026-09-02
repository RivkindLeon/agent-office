// Собирает org/INBOX.md — всё, что упирается в основателя. Список ведётся
// машиной, а не руками: список, который ведут вручную, всегда врёт.
//
//   node org/tools/inbox.mjs            # записать org/INBOX.md
//   node org/tools/inbox.mjs --print    # только напечатать (для Telegram)

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const list = (p) => { try { return readdirSync(join(ROOT, p)); } catch { return []; } };

const items = [];

// заявки без решения
for (const f of list("org/requisitions")) {
  const text = read(`org/requisitions/${f}`);
  if (!/Решение основателя:\s*\**\s*(да|нет)/i.test(text))
    items.push({ what: `заявка **${f.replace(/\.md$/, "")}** ждёт решения`,
      how: "поставить `Решение основателя: да` или `нет`", where: `org/requisitions/${f}` });
}

// пакеты без вердикта и вердикты, требующие основателя
const verdicts = {};
for (const f of list("org/reviews").filter((f) => f.endsWith(".md"))) {
  const slug = f.replace(/-\d+\.md$/, "").replace(/\.md$/, "");
  const text = read(`org/reviews/${f}`);
  const v = /Вердикт:\s*\**\s*(принято|вернуть|эскалация)/i.exec(text)?.[1]?.toLowerCase();
  const round = Number(/круг\s*(\d+)/i.exec(f + text)?.[1] || 1);
  if (v) verdicts[slug] = { v, round, file: `org/reviews/${f}` };
  if (/-вопросы\.md$/.test(f))
    items.push({ what: `вопросы по **${slug}**`, how: "ответить и закоммитить", where: `org/reviews/${f}` });
}

for (const slug of list("roles").filter((d) => existsSync(join(ROOT, "roles", d, "PROFILE.md")))) {
  const version = /Версия пакета:\s*(\d+\.\d+)/i.exec(read(`roles/${slug}/PROFILE.md`))?.[1] || "?";
  const v = verdicts[slug];
  if (!v) items.push({ what: `пакет **${slug} ${version}** ждёт ревью`,
    how: "пройти оценочные пункты его ACCEPTANCE.md и положить вердикт", where: `roles/${slug}/` });
  else if (v.v === "эскалация") items.push({ what: `эскалация по **${slug}**`,
    how: "решить и закоммитить", where: v.file });
  else if (v.v === "вернуть" && v.round >= 3) items.push({ what: `третий круг по **${slug}**`,
    how: "решить спор или признать брак", where: v.file });
}

const now = new Date().toISOString().slice(0, 16).replace("T", " ");
const body = items.length
  ? items.map((i, n) => `${n + 1}. ${i.what}\n   — ${i.how}\n   — \`${i.where}\``).join("\n\n")
  : "Ничего не ждёт. Компания работает сама.";

if (process.argv.includes("--print")) { console.log(body); process.exit(0); }

writeFileSync(join(ROOT, "org", "INBOX.md"),
`# Что ждёт основателя

Файл генерируется \`org/tools/inbox.mjs\` из состояния репозитория. Руками не
править: правка исчезнет при следующей сборке.

Собрано: ${now} UTC

${body}
`);
console.log(`org/INBOX.md: пунктов ${items.length}`);
