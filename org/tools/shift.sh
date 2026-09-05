#!/usr/bin/env bash
# One shift of the company. Scheduled or manual.
#
#   org/tools/shift.sh head-of-people
#
# Strict order: pull the founder's decisions, evaluate triggers, and wake the
# employee only when there is work. No input, no shift (COMPANY.md, law 2).
#
# After the employee, machine acceptance runs: write policy, journal validator,
# package acceptance, org chart. Anything red means nothing is committed.
#
# Code and diagnostics are English; the Telegram report is Russian because the
# founder reads it.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ROLE="${1:-head-of-people}"
# Куда слать отчёт. Идентификатор чата - операционные данные развёртывания, а
# не документ компании: в публичном репозитории ему не место. Живёт в
# ~/.agent-office/telegram-chat или в переменной окружения cron-джоба.
CHAT="${FOUNDER_CHAT:-$(cat "$HOME/.agent-office/telegram-chat" 2>/dev/null)}"
if [[ -z "$CHAT" ]]; then echo "! не задан чат для отчёта: ~/.agent-office/telegram-chat"; fi
AGENT_TIMEOUT="${AGENT_TIMEOUT:-600}"
export RUN_ID="run-$(date -u +%Y%m%dT%H%M%SZ)-$ROLE"
# The founder's secret must never reach the employee's environment: a shift
# neither issues sanctions nor writes founder events.
unset FOUNDER_TOKEN
# Full path is mandatory: in a non-interactive shell PATH points at the dead
# root-level openclaw install.
OPENCLAW="$HOME/npm-global/bin/openclaw"
OUT=""
say() { OUT="${OUT}$1"$'\n'; echo "$1"; }

git pull --rebase --quiet origin main 2>/dev/null || say "! git pull не прошёл"

WORK=0
if TASKS=$(node org/tools/gate.mjs "$ROLE"); then
  say "$TASKS"
  WORK=1
else
  node org/tools/log-event.mjs "$ROLE" idle "Работы нет, модель не вызывалась" --outcome idle >/dev/null
  say "$ROLE: работы нет, смена не начиналась"
fi

if [[ "$WORK" == "1" ]]; then
  PROMPT="Ты $ROLE. Прочитай roles/$ROLE/INSTRUCTIONS.md и выполни смену по ней.

Что тебя ждёт:
$TASKS

Делай ТОЛЬКО шаг этой смены, названный выше. Ответ шага кладётся в артефакт,
и по нему движок понимает, что шаг закрыт: для шага брифа - плоское поле
front matter с именем шага, для шага-файла - сам файл. Не забегай вперёд: остальные шаги
будут в следующих сменах. Большой кусок за один раз — это то, из-за чего в пакет
попадают куски, скопированные у соседней должности.

Не хватает сведений - реши сам и пометь строкой \"Допущение: ..., проверить при
приёмке\". Останавливайся вопросом только на решении основателя (бюджет,
направление, приоритет проектов, отказ от проекта): тогда status: question и
question: \"...\" в front matter, событие blocked, остановка. Проверь себя:
может ли ответить кто-то, кроме основателя? Может - это допущение.
Ключи front matter плоские, вложенных блоков парсер не читает.

Работай только файлами своей рабочей папки и только в путях, разрешённых тебе в
org/write-policy.json: смена не закоммитит правки вне них. Машинные факты живут
в front matter документов и в roles/<роль>/manifest.json - проза их не дублирует.
Коммитить и пушить не нужно. Закончив, запиши событие:
node org/tools/log-event.mjs $ROLE <тип> \"<что сделал>\" --subject <кого/что> --ref <путь>"

  AGENT_OUT="$(timeout "$AGENT_TIMEOUT" "$OPENCLAW" agent --agent "$ROLE" --message "$PROMPT" 2>&1 | grep -v '^\[plugins\]' | tail -20)"
  RC=$?
  [[ $RC -eq 124 ]] && say "! сотрудник не уложился в ${AGENT_TIMEOUT}с, смена оборвана"
  if [[ $RC -ne 0 && $RC -ne 124 ]]; then
    say "! вызов сотрудника завершился с кодом $RC"
    say "$AGENT_OUT"
    # Не пытаться дальше: второй проход и приёмка на неработающем сотруднике
    # бессмысленны, а цикл смен будет биться об одно и то же по кругу.
    node org/tools/log-event.mjs "$ROLE" blocked "Смена не состоялась: сотрудник не запустился" \
      --outcome blocked >/dev/null 2>&1
    "$OPENCLAW" message send --channel telegram --target "$CHAT" \
      --message "Смена $ROLE не состоялась: сотрудник не запустился.
$AGENT_OUT" >/dev/null 2>&1
    exit 4
  fi
  say "--- сотрудник сказал:"
  say "$AGENT_OUT"

  # Second pass. The first pass produces something plausible, the second makes
  # it correct: asking an agent to re-read its own work reliably surfaces
  # blockers. One extra call a day is the cheapest quality we can buy.
  CRITIQUE="Ты только что закончил работу в этой смене:
$AGENT_OUT

Теперь прочитай её как проверяющий, а не как автор. Пройди по
org/PACKAGE-ACCEPTANCE.md, а если это работа должности - по её ACCEPTANCE.md.
Ищи то, за что работу вернули бы: границы, повторяющие общие запреты; критерии,
описывающие пакет вместо работы; триггеры на несуществующие пути; проза,
дублирующая машинные факты; непроставленная версия.

Отвечай таблицей: пункт | что именно проверил | где это видно (файл и место).
Пустая клетка «где видно» означает «не проверял», а не «в порядке»: утверждение
без ссылки на артефакт не считается выполнением.

Найденное исправь сам, здесь же. Последней строкой напиши ровно: НАЙДЕНО: N"

  CRITIQUE_OUT="$(timeout "$AGENT_TIMEOUT" "$OPENCLAW" agent --agent "$ROLE" --message "$CRITIQUE" 2>&1 | grep -v '^\[plugins\]' | tail -15)"
  [[ $? -eq 124 ]] && say "! второй проход не уложился в ${AGENT_TIMEOUT}с"
  say "--- второй проход:"
  say "$CRITIQUE_OUT"
  FINDINGS="$(printf '%s' "$CRITIQUE_OUT" | grep -oE 'НАЙДЕНО:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+')"
  node org/tools/log-event.mjs "$ROLE" self_review "Второй проход: перечитал и поправил свою работу" \
    --findings "${FINDINGS:-0}" >/dev/null 2>&1
fi

# --- machine acceptance: nothing red reaches the repository
GREEN=1
fail() { GREEN=0; say "! $1"; }
if [[ "$WORK" == "1" ]]; then
  GUARD="$(node org/tools/diff-guard.mjs "$ROLE" 2>&1)" || fail "правки вне политики записи:
$GUARD"
  node org/tools/validate-journal.mjs >/dev/null 2>&1 || fail "журнал не проходит проверку"
  CHECK="$(node org/tools/check-all.mjs 2>&1)" || fail "пакет не принят:
$(echo "$CHECK" | grep FAILED)"
fi

node org/tools/org.mjs >/dev/null || say "! оргструктура не собралась"
node org/tools/inbox.mjs >/dev/null || say "! INBOX не собрался"

if [[ "$GREEN" == "0" ]]; then
  say "Изменения НЕ закоммичены: работа осталась в рабочей копии на сервере."
elif [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -qm "Смена $ROLE $(date +%F)" >/dev/null 2>&1
  git push --quiet origin main 2>/dev/null || say "! push не прошёл"
fi

INBOX="$(node org/tools/inbox.mjs --print)"
PENDING=0
[[ "$INBOX" == *"Ничего не ждёт"* ]] || PENDING=1

if [[ "$WORK" == "1" || "$PENDING" == "1" || "$OUT" == *"!"* ]]; then
  COMMIT="$(git rev-parse --short HEAD 2>/dev/null)"
  MSG="$(node org/tools/report.mjs --role "$ROLE" \
    --did "$AGENT_OUT" \
    ${FINDINGS:+--findings "$FINDINGS"} \
    --checks "$([[ "$GREEN" == "1" ]] && echo ok || echo failed)" \
    ${GREEN:+--commit "$COMMIT"} \
    --problems "$(printf '%s' "$OUT" | grep '^!' || true)")"
  "$OPENCLAW" message send --channel telegram --target "$CHAT" --message "$MSG" >/dev/null 2>&1 \
    || echo "! отчёт в Telegram не ушёл"
fi
