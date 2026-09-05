---
kind: engineering-delivery
project: calculator
version: 1.0.0
owner: head-of-engineering
status: ready-for-acceptance
---

# Сдача: Калькулятор

## Что построено

Статическое браузерное приложение принимает два числа и выбранную операцию,
выполняет сложение, вычитание, умножение или деление и показывает результат на
странице. Вычисления отделены от связывания формы с интерфейсом.

## Покрытие требований

| Требование | Проверяющий тест |
| --- | --- |
| `REQ-001` | `tests/calculator.spec.js` — `adds two finite numbers`; `subtracts two finite numbers`; `multiplies two finite numbers`; `divides two finite numbers with a non-zero divisor` |
| `REQ-002` | `tests/result.spec.js` — `shows the result after a successful calculation` |

## Последний прогон

Команда: `npm test`

```text
> calculator@1.0.0 test
> playwright test

Running 5 tests using 1 worker

  ✓  1 tests/calculator.spec.js:3:1 › adds two finite numbers (380ms)
  ✓  2 tests/calculator.spec.js:16:1 › subtracts two finite numbers (42ms)
  ✓  3 tests/calculator.spec.js:29:1 › multiplies two finite numbers (24ms)
  ✓  4 tests/calculator.spec.js:42:1 › divides two finite numbers with a non-zero divisor (10ms)
  ✓  5 tests/result.spec.js:3:1 › shows the result after a successful calculation (1.6s)

  5 passed (6.4s)
```

## Незакрытое

Незакрытых требований нет. Деление на ноль и обработка нечислового ввода не
входят во входные требования и не реализованы.

## Запрос владельцу брифа

Head of Product: принять инженерный результат и передать основателю запрос на
перевод статуса брифа по результатам приёмки.
