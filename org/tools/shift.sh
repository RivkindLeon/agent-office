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
CHAT="${FOUNDER_CHAT:-482381149}"
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

Работай только файлами своей рабочей папки и только в путях, разрешённых тебе в
org/write-policy.json: смена не закоммитит правки вне них. Машинные факты живут
в front matter документов и в roles/<роль>/manifest.json - проза их не дублирует.
Коммитить и пушить не нужно. Закончив, запиши событие:
node org/tools/log-event.mjs $ROLE <тип> \"<что сделал>\" --subject <кого/что> --ref <путь>"

  AGENT_OUT="$(timeout "$AGENT_TIMEOUT" "$OPENCLAW" agent --agent "$ROLE" --message "$PROMPT" 2>&1 | grep -v '^\[plugins\]' | tail -20)"
  RC=$?
  [[ $RC -eq 124 ]] && say "! сотрудник не уложился в ${AGENT_TIMEOUT}с, смена оборвана"
  [[ $RC -ne 0 && $RC -ne 124 ]] && say "! вызов сотрудника завершился с кодом $RC"
  say "--- сотрудник сказал:"
  say "$AGENT_OUT"
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
  MSG="Смена $(date +%F), $ROLE

$OUT
Ждёт тебя:
$INBOX

github.com/RivkindLeon/agent-office"
  "$OPENCLAW" message send --channel telegram --target "$CHAT" --message "$MSG" >/dev/null 2>&1 \
    || echo "! Telegram report was not delivered"
fi
