#!/bin/bash
# ============================================================================
# Auto Company — Ledger Preflight
# ============================================================================
# Detects the one failure this company could not see: a cycle that ended
# WITHOUT a Ledger row.
#
# WHY THIS EXISTS
# ---------------
# Cycle 5 wrote, correctly: "a cycle that ends without invoking ledger.sh leaves
# no stamp, and nothing detects the silence." It then fixed one branch of
# `auto-loop.sh` and believed the hole was closed.
#
# Cycle 7 grepped the loop's own log instead of trusting the story:
#
#     $ grep -c "LEDGER" logs/auto-loop.log
#     0
#
# `run_ledger` emits a LEDGER line on success and a LEDGER-FAIL line on failure.
# Zero of either means it had NEVER RUN. The daemon started at 09:58:12 and
# `run_ledger` was added to the file at 11:09; bash never re-reads a script it is
# already executing, so the running loop was — and had always been — the
# pre-Ledger version. Every row in `memories/ledger.jsonl` was hand-invoked by an
# agent who happened to remember. The invariant that two binding rulings and
# every NO-PROGRESS streak rest on was decoration.
#
# `auto-loop.sh` now re-execs itself when its source changes, which fixes the
# cause. THIS script exists because that fix lives in the same file that was
# unobservable, and a control you cannot observe failing is not a control.
# Preflight runs OUTSIDE the loop, reads only committed evidence, and is wired
# into the SessionStart hook so it fires before the cycle's agent forms its first
# opinion — including when the loop is stale, dead, or was never started.
#
# WHAT IT WILL NOT DO
# -------------------
# It never writes a row. `scripts/core/ledger.sh` is still the only thing
# permitted to write `memories/ledger.jsonl`, and backfilling a stamp for a cycle
# that has already ended would be exactly the hand-written row the governance
# rule forbids — the timestamp would be a lie about when the measurement was
# taken. Preflight reports the silence. It does not paper over it.
#
# Exit status is ALWAYS 0. This is a hook: a non-zero exit would block the cycle,
# and refusing to let the company work because its bookkeeping is behind would be
# a worse failure than the missing row.
# ============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

LEDGER_FILE="$PROJECT_DIR/memories/ledger.jsonl"
STATE_FILE="$PROJECT_DIR/.auto-loop-state"
LOOP_LOG="$PROJECT_DIR/logs/auto-loop.log"
PID_FILE="$PROJECT_DIR/.auto-loop.pid"
SELF_SOURCE="$SCRIPT_DIR/auto-loop.sh"

emit() { printf '%s\n' "$*"; }

# `grep -c` PRINTS 0 and EXITS 1 when it matches nothing, so the idiomatic
# `grep -c ... || echo 0` emits "0\n0" and every downstream `[ "$n" -gt 0 ]`
# dies with "integer expression expected". Count through a function that always
# yields exactly one integer.
count_matching() {
    local pattern="$1" file="$2" n
    [ -f "$file" ] || { printf '0'; return; }
    n=$(grep -c "$pattern" "$file" 2>/dev/null | head -1 | tr -dc '0-9')
    printf '%s' "${n:-0}"
}

# --- the Ledger's own view -------------------------------------------------
rows=0
last_cycle=""
last_ts=""
last_verdict=""
last_streak=""
if [ -f "$LEDGER_FILE" ]; then
    rows=$(count_matching '[^[:space:]]' "$LEDGER_FILE")
    if [ "$rows" -gt 0 ]; then
        last_row=$(grep '[^[:space:]]' "$LEDGER_FILE" | tail -1)
        read -r last_cycle last_ts last_verdict last_streak <<<"$(
            printf '%s' "$last_row" | python3 -c '
import json,sys
try:
    r = json.loads(sys.stdin.read())
except Exception:
    print("? ? ? ?"); raise SystemExit
print(r.get("cycle","?"), r.get("ts","?"), r.get("verdict","?"), r.get("streak","?"))
' 2>/dev/null
        )"
    fi
fi

# --- the loop's own view ---------------------------------------------------
loop_count=""
[ -f "$STATE_FILE" ] && loop_count=$(grep -m1 '^LOOP_COUNT=' "$STATE_FILE" 2>/dev/null | cut -d= -f2)

ledger_lines=$(count_matching 'LEDGER' "$LOOP_LOG")

# --- is the running daemon executing the code that is on disk? -------------
daemon_pid=""
daemon_started=""
stale_daemon="unknown"
if [ -f "$PID_FILE" ]; then
    daemon_pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$daemon_pid" ] && kill -0 "$daemon_pid" 2>/dev/null; then
        # `ps -o lstart=` pads its column; strptime chokes on the trailing
        # blanks and the staleness check silently degrades to "unknown".
        daemon_started=$(ps -p "$daemon_pid" -o lstart= 2>/dev/null | sed -e 's/^ *//' -e 's/ *$//' -e 's/  */ /g')
        if [ -n "$daemon_started" ] && [ -f "$SELF_SOURCE" ]; then
            # Compare daemon start time against the loop script's mtime. A script
            # newer than the process running it is a process running dead code.
            started_epoch=$(python3 - "$daemon_started" <<'PY' 2>/dev/null
import sys, time
try:
    print(int(time.mktime(time.strptime(sys.argv[1]))))
except Exception:
    print("")
PY
)
            src_epoch=$(python3 -c 'import os,sys;print(int(os.path.getmtime(sys.argv[1])))' "$SELF_SOURCE" 2>/dev/null)
            if [ -n "$started_epoch" ] && [ -n "$src_epoch" ]; then
                if [ "$src_epoch" -gt "$started_epoch" ]; then
                    stale_daemon="yes"
                else
                    stale_daemon="no"
                fi
            fi
        fi
    else
        stale_daemon="daemon-not-running"
    fi
else
    stale_daemon="no-pid-file"
fi

# --- report ----------------------------------------------------------------
emit "## Ledger Preflight"
emit ""
emit "- ledger rows: **$rows**${last_cycle:+ | last row \`cycle $last_cycle\` @ $last_ts — **$last_verdict**, streak $last_streak}"
emit "- loop LOOP_COUNT: **${loop_count:-unknown}**"
emit "- \`LEDGER\` lines ever written by auto-loop.sh: **$ledger_lines**"
emit "- running daemon is executing stale code: **$stale_daemon**${daemon_started:+ (started $daemon_started)}"

problems=0

if [ "$ledger_lines" -eq 0 ] && [ "${loop_count:-0}" != "" ] && [ "${loop_count:-0}" -gt 1 ] 2>/dev/null; then
    problems=$((problems + 1))
    emit ""
    emit "🔴 **auto-loop.sh has never once stamped the Ledger.** \`run_ledger\` logs a"
    emit "   LEDGER line on success and a LEDGER-FAIL line on failure; the log has"
    emit "   neither. Every row in the Ledger was hand-invoked by an agent. Do not"
    emit "   assume the loop will stamp for you — **run \`scripts/core/ledger.sh\` for"
    emit "   real before this cycle ends.** \`--dry-run\` is not a stamp."
fi

if [ "$stale_daemon" = "yes" ]; then
    problems=$((problems + 1))
    emit ""
    emit "🔴 **The running loop daemon predates the loop script on disk.** Bash does"
    emit "   not re-read a script it is already executing, so any fix committed to"
    emit "   \`scripts/core/auto-loop.sh\` since the daemon started is NOT running."
    emit "   The daemon re-execs itself on source change as of Cycle 7 — but that"
    emit "   fix is itself in the file it cannot see, so it takes effect only after"
    emit "   one restart. launchd \`KeepAlive\` will relaunch it: \`kill $daemon_pid\`."
fi

if [ -n "$loop_count" ] && [ "$rows" -gt 0 ] 2>/dev/null; then
    expected=$((loop_count - 1))
    if [ "$expected" -gt "$rows" ]; then
        problems=$((problems + 1))
        missing=$((expected - rows))
        emit ""
        emit "🔴 **$missing completed cycle(s) left no Ledger row.** $expected cycles have"
        emit "   finished; the Ledger holds $rows. A missing stamp is worse than a"
        emit "   NO-PROGRESS stamp: NO-PROGRESS is a measurement, silence is an absence"
        emit "   that later reads as whatever the next cycle needs it to mean."
        emit ""
        emit "   **Do not backfill.** A row's timestamp is written when the script"
        emit "   runs; hand-placing one for a cycle that already ended is the"
        emit "   hand-written row the governance rule forbids. Record the loss in"
        emit "   \`memories/consensus.md\` and stamp THIS cycle honestly."
        emit ""
        emit "   *Corollary already in force:* \`ledger.sh\` numbers rows by count, so"
        emit "   every skipped stamp permanently offsets Ledger cycle numbers from"
        emit "   company cycle numbers. Never hand-edit the ledger to \"fix\" this."
    fi
fi

if [ "$problems" -eq 0 ]; then
    emit ""
    emit "✅ Ledger bookkeeping is consistent with the loop's own log."
fi

exit 0
