#!/usr/bin/env bash
# Смена компании. Один запуск в день по расписанию.
#
#   org/tools/shift.sh head-of-people
#
# Порядок жёсткий: забрать решения основателя, проверить триггеры, и только при
# наличии работы будить сотрудника. Нет входа — смены нет (COMPANY.md, закон 2).
#
# Отчёт в Telegram уходит, только когда есть что сказать: работа, ожидание
# решения или поломка. В тихий день молчим, но коммит всё равно уходит на
# GitHub — отсутствие коммитов и есть сигнал, что смена перестала запускаться.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ROLE="${1:-head-of-people}"
CHAT="${FOUNDER_CHAT:-482381149}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-600}"
# Полный путь обязателен: в non-interactive shell PATH ведёт в мёртвую
# root-овую установку openclaw.
OPENCLAW="$HOME/npm-global/bin/openclaw"
OUT=""
say() { OUT="${OUT}$1"$'\n'; echo "$1"; }

git pull --rebase --quiet origin main 2>/dev/null || say "⚠ git pull не прошёл"

WORK=0
if TASKS=$(node org/tools/gate.mjs "$ROLE"); then
  say "$TASKS"
  WORK=1
else
  node org/tools/log-event.mjs "$ROLE" idle "Работы нет, модель не вызывалась" --outcome idle >/dev/null
  say "$ROLE: работы нет, смена не начиналась"
fi

# --- смена сотрудника
if [[ "$WORK" == "1" ]]; then
  PROMPT="Ты $ROLE. Прочитай roles/$ROLE/INSTRUCTIONS.md и выполни смену по ней.

Что тебя ждёт:
$TASKS

Работай только файлами своей рабочей папки. Коммитить и пушить не нужно — это
делает смена после тебя. Закончив, запиши событие в журнал:
node org/tools/log-event.mjs $ROLE <тип> \"<что сделал>\" --subject <кого/что> --ref <путь>"

  AGENT_OUT="$(timeout "$AGENT_TIMEOUT" "$OPENCLAW" agent --agent "$ROLE" --message "$PROMPT" 2>&1 | tail -20)"
  RC=$?
  if [[ $RC -eq 124 ]]; then
    say "⚠ сотрудник не уложился в ${AGENT_TIMEOUT}с, смена оборвана"
  elif [[ $RC -ne 0 ]]; then
    say "⚠ вызов сотрудника завершился с кодом $RC"
  fi
  say "--- сотрудник сказал:"
  say "$AGENT_OUT"
fi

# --- приёмка машиной: красное не попадает в репозиторий
GREEN=1
if [[ "$WORK" == "1" ]]; then
  node org/tools/validate-journal.mjs >/dev/null 2>&1 || { GREEN=0; say "⚠ журнал не проходит проверку"; }
  for d in roles/*/; do
    r="$(basename "$d")"
    if ! CHECK="$(node org/tools/check-package.mjs "$r" 2>&1)"; then
      GREEN=0
      say "⚠ пакет $r не прошёл автоматическую приёмку:"
      say "$(echo "$CHECK" | grep ПРОВАЛ)"
    fi
  done
fi

node org/tools/inbox.mjs >/dev/null || say "⚠ INBOX не собрался"

if [[ "$GREEN" == "0" ]]; then
  say "Изменения НЕ закоммичены: работа осталась в рабочей копии на сервере."
elif [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -qm "Смена $ROLE $(date +%F)" >/dev/null 2>&1
  git push --quiet origin main 2>/dev/null || say "⚠ push не прошёл"
fi

INBOX="$(node org/tools/inbox.mjs --print)"
PENDING=0
[[ "$INBOX" == *"Ничего не ждёт"* ]] || PENDING=1

if [[ "$WORK" == "1" || "$PENDING" == "1" || "$OUT" == *"⚠"* ]]; then
  MSG="🏢 Смена $(date +%F), $ROLE

$OUT
Ждёт тебя:
$INBOX

github.com/RivkindLeon/agent-office"
  "$OPENCLAW" message send --channel telegram --target "$CHAT" --message "$MSG" >/dev/null 2>&1 \
    || echo "⚠ отчёт в Telegram не ушёл"
fi
