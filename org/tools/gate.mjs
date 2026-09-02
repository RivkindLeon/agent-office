// Проверка триггеров должности ДО вызова модели (COMPANY.md, закон «нет входа —
// нет смены»). Ничего не пишет и не решает: только отвечает, есть ли работа.
//
//   node org/tools/gate.mjs head-of-people
//
// Код возврата: 0 — работа есть, 3 — работы нет.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const role = process.argv[2];
if (!role) { console.error("укажи должность"); process.exit(2); }

const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const list = (p) => { try { return readdirSync(join(ROOT, p)); } catch { return []; } };

const tasks = [];

if (role === "head-of-people") {
  // 1. одобренная заявка, для которой нет пакета
  for (const f of list("org/requisitions")) {
    const slug = f.replace(/\.md$/, "");
    const text = read(`org/requisitions/${f}`);
    if (/Решение основателя:\s*\**\s*да/i.test(text) && !existsSync(join(ROOT, "roles", slug)))
      tasks.push(`написать пакет должности ${slug} (заявка одобрена)`);
  }
  // 2. вердикт «вернуть», после которого нет принятого
  const verdicts = list("org/reviews").filter((f) => f.endsWith(".md")).sort();
  const bySlug = {}, bySlugFile = {};
  for (const f of verdicts) {
    const slug = f.replace(/-\d+\.md$/, "").replace(/\.md$/, "");
    const v = /Вердикт:\s*\**\s*(принято|вернуть|эскалация)/i.exec(read(`org/reviews/${f}`))?.[1];
    if (v) { bySlug[slug] = v.toLowerCase(); bySlugFile[slug] = f; }
  }
  for (const [slug, f] of Object.entries(bySlugFile))
    if (bySlug[slug] === "вернуть")
      tasks.push(`круг правок по пакету ${slug} — вердикт в org/reviews/${f}, читать его целиком`);
  // 3. принято, но в оргструктуре не записано
  const org = read("org/ORG.md");
  for (const [slug, v] of Object.entries(bySlug))
    if (v === "принято" && !org.includes(`roles/${slug}/`)) tasks.push(`внести ${slug} в org/ORG.md`);
}

if (!tasks.length) { console.log(`${role}: работы нет`); process.exit(3); }
console.log(`${role}: работа есть\n` + tasks.map((t) => `- ${t}`).join("\n"));
