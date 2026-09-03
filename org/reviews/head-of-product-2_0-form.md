---
kind: review
role: head-of-product
package_version: "2.0"
round: 1
dimension: form
verdict: accepted
analysis_by: assistant
read_by: founder
decided_by: founder
---

# Ревью: head-of-product 2.0, форма

Вердикт: **принято**

Изменение однострочное: триггер `office-needs-product` заменён на
`brief-needs-product` с операцией `project_status`.

## Чем подтверждено

- триггер больше не содержит пути к конкретному проекту:
  `roles/head-of-product/manifest.json`
- операция входит в закрытый список движка: `org/tools/state.mjs`
- прозы в машинный слой не добавлено, тексты задач остались в
  `org/tools/render.ru.mjs`
- автоматическая приёмка зелёная: `org/tools/check-package.mjs`
