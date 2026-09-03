---
kind: review
role: head-of-product
package_version: "2.0"
round: 1
dimension: substance
verdict: accepted
analysis_by: founder
read_by: founder
decided_by: founder
---

# Ревью: head-of-product 2.0, существо

Вердикт: **принято**

Проверял основатель как заказчик функции.

Должность отвечает за продуктовые решения по проектам компании, а не по одному
проекту. Привязка триггера к `projects/office/BRIEF.md` была ошибкой того же
рода, что и прежние жёстко зашитые пути.

## Чем подтверждено

- `roles/head-of-product/CHARTER.md` говорит о проектах компании, не об одном
- `projects/calculator/BRIEF.md` и `projects/office/BRIEF.md` — два проекта,
  второй на паузе
- `roles/head-of-product/manifest.json` реагирует на статус, а не на путь
