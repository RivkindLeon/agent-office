---
kind: review
role: head-of-engineering
package_version: "2.0"
round: 2
dimension: substance
verdict: accepted
analysis_by: founder
read_by: founder
decided_by: founder
---

# Ревью: head-of-engineering 2.0, существо

Вердикт: **принято**

Проверял основатель как `hiring_manager` заявки
`org/requisitions/head-of-engineering.md`.

Оба блокера первого круга закрыты: должность реагирует на любой принятый бриф,
модель соответствует работе — `openai/gpt-5.6-sol`, тот же Codex-вариант, на
котором работают ночные кодинг-джобы этой машины.

## Чем подтверждено

- паттерн компании закреплён в критериях приёмки работы, включая требование
  разных смен для красной и зелёной фаз: `roles/head-of-engineering/ACCEPTANCE.md`
- доказательство важнее заявления: приёмка требует вывода прогона и зелёного
  CI, слов исполнителя недостаточно — там же, пункт 5
- декомпозиция соответствует заявке: `design → tasks → task → submit`
- границы отделяют инженерную зону от продуктовой:
  `roles/head-of-engineering/BOUNDARIES.md` против `roles/head-of-product/BOUNDARIES.md`

## Утверждено этим вердиктом

Грейд `senior`, лимит 150 000 токенов на смену, модель `openai/gpt-5.6-sol` с
фолбэком `openai/gpt-5.6-luna`. Лимит временный: пересмотреть по фактическому
расходу после первого проекта.
