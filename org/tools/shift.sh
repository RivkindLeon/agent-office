#!/usr/bin/env bash
# Смена компании. Один запуск в день по расписанию.
#
#   org/tools/shift.sh head-of-people
#
# Порядок жёсткий: забрать решения основателя, проверить триггеры и только при
# наличии работы будить сотрудника. Нет входа — смены нет (COMPANY.md, закон 2).
#
# Отчёт в Telegram уходит, только когда есть что сказать: работа, ожидание
# решения или поломка. В тихий день молчим, но коммит всё равно уходит на
# GitHub — отсутствие коммитов и есть сигнал, что смена перестала запускаться.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ROLE="${1:-head-of-people}"
CHAT="${FOUNDER_CHAT:-482381149}"
# Полный путь обязателен: в non-interactive shell PATH ведёт в мёртвую
# root-овую установку openclaw.
OPENCLAW="$HOME/npm-global/bin/openclaw"
OUT=""
say() { OUT="${OUT}$1"$'\n'; echo "$1"; }

git pull --rebase --quiet origin main 2>/dev/null || say "⚠ git pull не прошёл"

if TASKS=$(node org/tools/gate.mjs "$ROLE"); then
  say "$TASKS"
  WORK=1
else
  node org/tools/log-event.mjs "$ROLE" idle "Работы нет, модель не вызывалась" --outcome idle >/dev/null
  say "$ROLE: работы нет, смена не начиналась"
  WORK=0
fi

node org/tools/inbox.mjs >/dev/null || say "⚠ INBOX не собрался"
node org/tools/validate-journal.mjs >/dev/null || say "⚠ журнал не проходит проверку"

if [[ -n "$(git status --porcelain)" ]]; then
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
