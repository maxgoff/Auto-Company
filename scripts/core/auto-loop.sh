#!/bin/bash
# ============================================================
# Auto Company — 24/7 Autonomous Loop
# ============================================================
# Keeps selected CLI engine (Claude/Codex) running continuously.
# Uses fresh sessions with consensus.md as the relay baton.
#
# Usage:
#   ./auto-loop.sh              # Run in foreground
#   ./auto-loop.sh --daemon     # Run via launchd (macOS only)
#
# Stop:
#   ./stop-loop.sh              # Graceful stop
#   kill $(cat .auto-loop.pid)  # Force stop
#
# Config (env vars):
#   ENGINE=claude               # Engine selection: claude|codex (default: claude)
#   MODEL=...                   # Optional model override (empty = engine default)
#   CLAUDE_BIN=...              # Optional Claude executable override
#   CLAUDE_PERMISSION_MODE=bypassPermissions
#                               # Claude permission mode (default: bypassPermissions)
#   CODEX_BIN=...               # Optional Codex executable override
#   CODEX_SANDBOX_MODE=danger-full-access
#                               # Codex sandbox mode (only for ENGINE=codex)
#   LOOP_INTERVAL=30            # Seconds between cycles (default: 30)
#   CYCLE_TIMEOUT_SECONDS=1800  # Max seconds per cycle before force-kill
#   MAX_CONSECUTIVE_ERRORS=5    # Circuit breaker threshold
#   COOLDOWN_SECONDS=300        # Cooldown after circuit break
#   LIMIT_WAIT_SECONDS=3600     # Wait on usage limit
#   MAX_LOGS=200                # Max cycle logs to keep
#   AUTO_LOOP_PROTECT_GITIGNORE=1
#                               # Restore .gitignore if a cycle mutates it
# ============================================================

set -euo pipefail

# === Resolve project root (always relative to this script) ===
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

LOG_DIR="$PROJECT_DIR/logs"
CONSENSUS_FILE="$PROJECT_DIR/memories/consensus.md"
PROMPT_FILE="$PROJECT_DIR/PROMPT.md"
PID_FILE="$PROJECT_DIR/.auto-loop.pid"
STATE_FILE="$PROJECT_DIR/.auto-loop-state"

# Loop settings (all overridable via env vars)
ENGINE="${ENGINE:-claude}"
ENGINE="$(echo "$ENGINE" | tr '[:upper:]' '[:lower:]')"
MODEL="${MODEL:-}"
MODEL_LABEL="${MODEL:-config-default}"
CLAUDE_BIN="${CLAUDE_BIN:-}"
CLAUDE_PERMISSION_MODE="${CLAUDE_PERMISSION_MODE:-bypassPermissions}"
CODEX_BIN="${CODEX_BIN:-}"
CODEX_SANDBOX_MODE="${CODEX_SANDBOX_MODE:-danger-full-access}"
LOOP_INTERVAL="${LOOP_INTERVAL:-30}"
CYCLE_TIMEOUT_SECONDS="${CYCLE_TIMEOUT_SECONDS:-1800}"
MAX_CONSECUTIVE_ERRORS="${MAX_CONSECUTIVE_ERRORS:-5}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-300}"
LIMIT_WAIT_SECONDS="${LIMIT_WAIT_SECONDS:-3600}"
MAX_LOGS="${MAX_LOGS:-200}"
AUTO_LOOP_PROTECT_GITIGNORE="${AUTO_LOOP_PROTECT_GITIGNORE:-1}"
RESOLVED_ENGINE_BIN=""

if [ "$ENGINE" != "claude" ] && [ "$ENGINE" != "codex" ]; then
    echo "Error: ENGINE must be 'claude' or 'codex' (received: '$ENGINE')."
    exit 1
fi

# Keep Agent Teams compatibility for legacy prompts/config.
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# === Functions ===

log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local msg="[$timestamp] $1"
    echo "$msg" >> "$LOG_DIR/auto-loop.log"
    if [ -t 1 ]; then
        echo "$msg"
    fi
}

log_cycle() {
    local cycle_num=$1
    local status=$2
    local msg=$3
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] Cycle #$cycle_num [$status] $msg" >> "$LOG_DIR/auto-loop.log"
    if [ -t 1 ]; then
        echo "[$timestamp] Cycle #$cycle_num [$status] $msg"
    fi
}

check_usage_limit() {
    local output="$1"
    if echo "$output" | grep -qi "usage limit\|rate limit\|too many requests\|resource_exhausted\|overloaded\|quota\|429\|billing\|insufficient credits"; then
        return 0
    fi
    return 1
}

check_stop_requested() {
    if [ -f "$PROJECT_DIR/.auto-loop-stop" ]; then
        rm -f "$PROJECT_DIR/.auto-loop-stop"
        return 0
    fi
    return 1
}

save_state() {
    cat > "$STATE_FILE" << EOF
LOOP_COUNT=$loop_count
ERROR_COUNT=$error_count
LAST_RUN=$(date '+%Y-%m-%d %H:%M:%S')
STATUS=$1
MODEL=$MODEL_LABEL
ENGINE=$ENGINE
EOF
}

cleanup() {
    log "=== Auto Loop Shutting Down (PID $$) ==="
    rm -f "$PID_FILE"
    kill_engine_stragglers "shutdown"
    save_state "stopped"
    exit 0
}

# ------------------------------------------------------------------
# Process-tree teardown
# ------------------------------------------------------------------
# The engine is launched inside a `( ... ) &` subshell, so $! is the SUBSHELL,
# not the engine. Signalling only that pid leaves the engine (and the MCP
# servers, sidecar models and subagents it spawned) running.
#
# This actually happened on 2026-07-25: Cycle #1 hit CYCLE_TIMEOUT_SECONDS, the
# loop logged the timeout and started Cycle #2, but the Cycle-1 `claude -p`
# survived and kept editing projects/snapog while Cycle #2 edited the same
# files. Two autonomous agents in one working tree silently clobber each other's
# writes — this is a correctness bug, not just a resource leak.
#
# So: walk the whole descendant tree and signal children before parents, so a
# parent can't re-parent or respawn a child we already killed.
collect_descendants() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        collect_descendants "$child"
    done
    echo "$pid"
}

# kill_process_tree <pid> — TERM the tree, give it grace, then KILL what's left.
kill_process_tree() {
    local root="$1" grace="${2:-5}" pids pid
    [ -n "$root" ] || return 0

    pids=$(collect_descendants "$root")
    for pid in $pids; do
        kill -TERM "$pid" 2>/dev/null || true
    done

    # Poll instead of a flat sleep so a clean exit doesn't cost the full grace.
    local waited=0
    while [ "$waited" -lt "$grace" ]; do
        kill -0 "$root" 2>/dev/null || break
        sleep 1
        waited=$((waited + 1))
    done

    # Re-collect: the tree may have changed shape while it was shutting down.
    for pid in $(collect_descendants "$root"); do
        kill -KILL "$pid" 2>/dev/null || true
    done
}

# Belt-and-braces sweep for engine processes that outlived their subshell and
# got re-parented to init. kill_process_tree above handles the tree that exists
# at timeout; this catches anything already orphaned by an earlier cycle.
#
# Three filters, ALL required, because a false positive here would kill a
# human's session:
#   1. argv matches the engine binary  — it's an engine process
#   2. PPID == 1                       — it's an ORPHAN. A live cycle's engine is
#                                        parented to its subshell, and a human's
#                                        interactive session is parented to a
#                                        shell, so neither can ever match.
#   3. cwd == PROJECT_DIR              — it belongs to this company, not another
#                                        repo the human is working in.
kill_engine_stragglers() {
    local reason="$1" pid ppid cwd
    [ -n "$RESOLVED_ENGINE_BIN" ] || return 0
    command -v pgrep >/dev/null 2>&1 || return 0

    for pid in $(pgrep -f "$RESOLVED_ENGINE_BIN" 2>/dev/null); do
        [ "$pid" = "$$" ] && continue

        ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
        [ "$ppid" = "1" ] || continue

        cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
        [ "$cwd" = "$PROJECT_DIR" ] || continue

        log "Reaping orphaned engine process $pid ($reason) — it would otherwise edit the working tree underneath the next cycle"
        kill_process_tree "$pid" 5
    done
    return 0
}

snapshot_gitignore() {
    if [ "$AUTO_LOOP_PROTECT_GITIGNORE" = "0" ]; then
        echo ""
        return
    fi

    local gitignore_file="$PROJECT_DIR/.gitignore"
    local snapshot_file=""
    if [ -f "$gitignore_file" ]; then
        snapshot_file=$(mktemp)
        cp "$gitignore_file" "$snapshot_file"
    fi
    echo "$snapshot_file"
}

restore_gitignore_if_changed() {
    local snapshot_file="$1"
    if [ "$AUTO_LOOP_PROTECT_GITIGNORE" = "0" ]; then
        [ -n "$snapshot_file" ] && rm -f "$snapshot_file"
        return
    fi

    local gitignore_file="$PROJECT_DIR/.gitignore"
    local changed=0

    if [ -f "$gitignore_file" ]; then
        if [ -z "$snapshot_file" ] || [ ! -f "$snapshot_file" ]; then
            changed=1
        elif ! cmp -s "$gitignore_file" "$snapshot_file"; then
            changed=1
        fi
    else
        if [ -n "$snapshot_file" ] && [ -f "$snapshot_file" ]; then
            changed=1
        fi
    fi

    if [ "$changed" -eq 1 ]; then
        if [ -n "$snapshot_file" ] && [ -f "$snapshot_file" ]; then
            cp "$snapshot_file" "$gitignore_file"
            log_cycle "$loop_count" "GUARD" "Blocked cycle mutation of .gitignore and restored baseline"
        else
            rm -f "$gitignore_file"
            log_cycle "$loop_count" "GUARD" "Blocked cycle-created .gitignore and removed it"
        fi
    fi

    [ -n "$snapshot_file" ] && rm -f "$snapshot_file"
}

get_file_size_bytes() {
    local target_file="$1"
    if [ ! -f "$target_file" ]; then
        echo 0
        return
    fi

    if stat -c%s "$target_file" >/dev/null 2>&1; then
        stat -c%s "$target_file"
        return
    fi

    if stat -f%z "$target_file" >/dev/null 2>&1; then
        stat -f%z "$target_file"
        return
    fi

    wc -c < "$target_file" | tr -d ' '
}

rotate_logs() {
    # Keep only the latest N cycle logs
    local count
    count=$(find "$LOG_DIR" -name "cycle-*.log" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -gt "$MAX_LOGS" ]; then
        local to_delete=$((count - MAX_LOGS))
        find "$LOG_DIR" -name "cycle-*.log" -type f | sort | head -n "$to_delete" | xargs rm -f 2>/dev/null || true
        log "Log rotation: removed $to_delete old cycle logs"
    fi

    # Rotate main log if over 10MB
    local log_size
    log_size=$(get_file_size_bytes "$LOG_DIR/auto-loop.log")
    if [ "$log_size" -gt 10485760 ]; then
        mv "$LOG_DIR/auto-loop.log" "$LOG_DIR/auto-loop.log.old"
        log "Main log rotated (was ${log_size} bytes)"
    fi
}

cleanup_accidental_root_artifacts() {
    local removed=0
    local removed_names=""
    local f base

    # Known accidental artifacts caused by malformed shell redirections in generated commands.
    for f in "$PROJECT_DIR"/=* "$PROJECT_DIR"/口径说明*; do
        [ -f "$f" ] || continue
        if [ ! -s "$f" ]; then
            rm -f "$f"
            removed=$((removed + 1))
            base=$(basename "$f")
            if [ -z "$removed_names" ]; then
                removed_names="$base"
            else
                removed_names="$removed_names, $base"
            fi
        fi
    done

    if [ "$removed" -gt 0 ]; then
        log_cycle "$loop_count" "GUARD" "Removed accidental root zero-byte artifact(s): $removed_names"
    fi
}

backup_consensus() {
    if [ -f "$CONSENSUS_FILE" ]; then
        cp "$CONSENSUS_FILE" "$CONSENSUS_FILE.bak"
    fi
}

restore_consensus() {
    if [ -f "$CONSENSUS_FILE.bak" ]; then
        cp "$CONSENSUS_FILE.bak" "$CONSENSUS_FILE"
        log "Consensus restored from backup after failed cycle"
    fi
}

validate_consensus() {
    if [ ! -s "$CONSENSUS_FILE" ]; then
        return 1
    fi
    if ! grep -q "^# Auto Company Consensus" "$CONSENSUS_FILE"; then
        return 1
    fi
    if ! grep -q "^## Next Action" "$CONSENSUS_FILE"; then
        return 1
    fi
    if ! grep -q "^## Company State" "$CONSENSUS_FILE"; then
        return 1
    fi
    return 0
}

consensus_changed_since_backup() {
    if [ ! -f "$CONSENSUS_FILE" ]; then
        return 1
    fi

    if [ ! -f "$CONSENSUS_FILE.bak" ]; then
        return 0
    fi

    if cmp -s "$CONSENSUS_FILE" "$CONSENSUS_FILE.bak"; then
        return 1
    fi

    return 0
}

# ------------------------------------------------------------------
# The Ledger — CEO ruling 2026-07-25 §7, rule 2: "No exit without a row."
# ------------------------------------------------------------------
# ledger.sh probes four EXTERNAL sources, appends one row to
# memories/ledger.jsonl, and stamps memories/consensus.md. It refuses to exit 0
# unless it appended a row, so a non-zero status here means the cycle is
# unrecorded — which is itself the signal.
#
# Invoked at the very END of the cycle, AFTER the restore_consensus branch, so
# the stamp lands on the file the next cycle will actually read rather than on
# one that is about to be rolled back.
#
# Deliberately NOT wired into the circuit breaker. The breaker exists for engine
# and API failures; cooling the whole company down for COOLDOWN_SECONDS because
# of a bug in the bookkeeping would be a worse failure than the missing row.
# A ledger failure is loud in auto-loop.log and in the state file instead.
run_ledger() {
    local ledger_script="$SCRIPT_DIR/ledger.sh"

    if [ ! -x "$ledger_script" ]; then
        log_cycle "$loop_count" "LEDGER-FAIL" "$ledger_script is missing or not executable — this cycle is UNRECORDED"
        return 1
    fi

    local out rc=0
    out=$("$ledger_script" 2>&1) || rc=$?

    if [ "$rc" -eq 0 ]; then
        local verdict
        verdict=$(echo "$out" | grep -m1 '^VERDICT:' || echo "VERDICT: (unparsed)")
        log_cycle "$loop_count" "LEDGER" "$verdict"
    else
        log_cycle "$loop_count" "LEDGER-FAIL" "ledger.sh exited $rc — no row appended, consensus NOT stamped: $(echo "$out" | tail -3 | tr '\n' ' ')"
        save_state "ledger_failed"
    fi

    return "$rc"
}

resolve_codex_bin() {
    if [ -n "$CODEX_BIN" ]; then
        if [ -x "$CODEX_BIN" ]; then
            echo "$CODEX_BIN"
            return 0
        fi
        if command -v "$CODEX_BIN" >/dev/null 2>&1; then
            command -v "$CODEX_BIN"
            return 0
        fi
    fi

    # Prefer WSL-local Codex installed via nvm.
    local nvm_candidate=""
    for candidate in "$HOME"/.nvm/versions/node/*/bin/codex; do
        if [ -x "$candidate" ]; then
            nvm_candidate="$candidate"
        fi
    done
    if [ -n "$nvm_candidate" ]; then
        echo "$nvm_candidate"
        return 0
    fi

    # Fallback: ask an interactive bash shell (loads user profile).
    local interactive_candidate
    interactive_candidate=$(bash -ic 'command -v codex' 2>/dev/null | tail -n1 | tr -d '\r' || true)
    if [ -n "$interactive_candidate" ] && [ -x "$interactive_candidate" ]; then
        echo "$interactive_candidate"
        return 0
    fi

    # Last fallback: current shell PATH.
    if command -v codex >/dev/null 2>&1; then
        command -v codex
        return 0
    fi

    return 1
}

resolve_claude_bin() {
    if [ -n "$CLAUDE_BIN" ]; then
        if [ -x "$CLAUDE_BIN" ]; then
            echo "$CLAUDE_BIN"
            return 0
        fi
        if command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
            command -v "$CLAUDE_BIN"
            return 0
        fi
    fi

    # Prefer WSL-local Claude CLI installed via nvm.
    local nvm_candidate=""
    for candidate in "$HOME"/.nvm/versions/node/*/bin/claude; do
        if [ -x "$candidate" ]; then
            nvm_candidate="$candidate"
        fi
    done
    if [ -n "$nvm_candidate" ]; then
        echo "$nvm_candidate"
        return 0
    fi

    # Fallback: ask an interactive bash shell (loads user profile).
    local interactive_candidate
    interactive_candidate=$(bash -ic 'command -v claude' 2>/dev/null | tail -n1 | tr -d '\r' || true)
    if [ -n "$interactive_candidate" ] && [ -x "$interactive_candidate" ]; then
        echo "$interactive_candidate"
        return 0
    fi

    # Last fallback: current shell PATH.
    if command -v claude >/dev/null 2>&1; then
        command -v claude
        return 0
    fi

    return 1
}

resolve_engine_bin() {
    case "$ENGINE" in
        claude)
            resolve_claude_bin
            ;;
        codex)
            resolve_codex_bin
            ;;
        *)
            return 1
            ;;
    esac
}

run_codex_cycle() {
    local prompt="$1"
    local output_file timeout_flag message_file

    output_file=$(mktemp)
    timeout_flag=$(mktemp)
    message_file=$(mktemp)

    set +e
    (
        cd "$PROJECT_DIR" || exit 1
        local codex_cmd=("$RESOLVED_ENGINE_BIN" "exec" "-c" "sandbox_mode=\"${CODEX_SANDBOX_MODE}\"" "-o" "$message_file")
        if [ -n "$MODEL" ]; then
            codex_cmd+=("-m" "$MODEL")
        fi
        codex_cmd+=("$prompt")
        "${codex_cmd[@]}"
    ) > "$output_file" 2>&1 &
    local codex_pid=$!

    (
        sleep "$CYCLE_TIMEOUT_SECONDS"
        if kill -0 "$codex_pid" 2>/dev/null; then
            echo "1" > "$timeout_flag"
            kill_process_tree "$codex_pid" 5
        fi
    ) &
    local watchdog_pid=$!

    wait "$codex_pid"
    EXIT_CODE=$?

    kill "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
    # `wait` returns when the SUBSHELL exits; the engine and its MCP servers can
    # outlive it. Sweep before the next cycle starts, never after.
    kill_engine_stragglers "post-cycle"
    set -e

    OUTPUT=$(cat "$output_file")
    RESULT_MESSAGE=$(cat "$message_file" 2>/dev/null || true)
    rm -f "$output_file" "$message_file"

    if [ -s "$timeout_flag" ]; then
        CYCLE_TIMED_OUT=1
        EXIT_CODE=124
    else
        CYCLE_TIMED_OUT=0
    fi
    rm -f "$timeout_flag"
}

run_claude_cycle() {
    local prompt="$1"
    local output_file timeout_flag

    output_file=$(mktemp)
    timeout_flag=$(mktemp)

    set +e
    (
        cd "$PROJECT_DIR" || exit 1
        local claude_cmd=("$RESOLVED_ENGINE_BIN" "-p" "$prompt" "--output-format" "json")
        if [ -n "$MODEL" ]; then
            claude_cmd+=("--model" "$MODEL")
        fi
        if [ -n "$CLAUDE_PERMISSION_MODE" ]; then
            claude_cmd+=("--permission-mode" "$CLAUDE_PERMISSION_MODE")
        fi
        "${claude_cmd[@]}"
    ) > "$output_file" 2>&1 &
    local claude_pid=$!

    (
        sleep "$CYCLE_TIMEOUT_SECONDS"
        if kill -0 "$claude_pid" 2>/dev/null; then
            echo "1" > "$timeout_flag"
            kill_process_tree "$claude_pid" 5
        fi
    ) &
    local watchdog_pid=$!

    wait "$claude_pid"
    EXIT_CODE=$?

    kill "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
    # `wait` returns when the SUBSHELL exits; `claude -p` and its MCP servers can
    # outlive it. Sweep before the next cycle starts, never after.
    kill_engine_stragglers "post-cycle"
    set -e

    OUTPUT=$(cat "$output_file")
    RESULT_MESSAGE="$OUTPUT"
    rm -f "$output_file"

    if [ -s "$timeout_flag" ]; then
        CYCLE_TIMED_OUT=1
        EXIT_CODE=124
    else
        CYCLE_TIMED_OUT=0
    fi
    rm -f "$timeout_flag"
}

run_engine_cycle() {
    local prompt="$1"
    case "$ENGINE" in
        claude)
            run_claude_cycle "$prompt"
            ;;
        codex)
            run_codex_cycle "$prompt"
            ;;
        *)
            echo "Error: Unsupported ENGINE '$ENGINE'" >&2
            return 1
            ;;
    esac
}

extract_cycle_metadata() {
    RESULT_TEXT=""
    CYCLE_COST="N/A"
    CYCLE_SUBTYPE="unknown"
    CYCLE_TYPE="${ENGINE}_exec"

    if [ "$ENGINE" = "claude" ]; then
        if command -v jq >/dev/null 2>&1; then
            RESULT_TEXT=$(echo "$RESULT_MESSAGE" | jq -r '.result // .message // .output_text // empty' 2>/dev/null | head -c 2000 || true)
            if [ -z "$RESULT_TEXT" ]; then
                RESULT_TEXT=$(echo "$RESULT_MESSAGE" | jq -r '.. | .text? // empty' 2>/dev/null | head -c 2000 || true)
            fi

            parsed_cost=$(echo "$RESULT_MESSAGE" | jq -r '.total_cost_usd // .cost_usd // empty' 2>/dev/null || true)
            if [ -n "$parsed_cost" ]; then
                CYCLE_COST="$parsed_cost"
            fi

            parsed_subtype=$(echo "$RESULT_MESSAGE" | jq -r '.subtype // empty' 2>/dev/null || true)
            if [ -n "$parsed_subtype" ]; then
                CYCLE_SUBTYPE="$parsed_subtype"
            fi

            parsed_type=$(echo "$RESULT_MESSAGE" | jq -r '.type // empty' 2>/dev/null || true)
            if [ -n "$parsed_type" ]; then
                CYCLE_TYPE="$parsed_type"
            fi
        fi

        if [ -z "$RESULT_TEXT" ]; then
            RESULT_TEXT=$(echo "$OUTPUT" | head -c 2000 || true)
        fi

        if [ "$CYCLE_SUBTYPE" = "unknown" ]; then
            if [ "$EXIT_CODE" -eq 0 ]; then
                CYCLE_SUBTYPE="success"
            else
                CYCLE_SUBTYPE="error"
            fi
        fi
        return
    fi

    RESULT_TEXT=$(echo "$RESULT_MESSAGE" | head -c 2000 || true)
    if [ -z "$RESULT_TEXT" ]; then
        RESULT_TEXT=$(echo "$OUTPUT" | head -c 2000 || true)
    fi

    if [ "$EXIT_CODE" -eq 0 ]; then
        CYCLE_SUBTYPE="success"
    else
        CYCLE_SUBTYPE="error"
    fi
}

# === Setup ===

mkdir -p "$LOG_DIR" "$PROJECT_DIR/memories"

# Clean up stale stop file from previous run
rm -f "$PROJECT_DIR/.auto-loop-stop"

# Check for existing instance
if [ -f "$PID_FILE" ]; then
    existing_pid=$(cat "$PID_FILE")
    if kill -0 "$existing_pid" 2>/dev/null; then
        echo "Auto loop already running (PID $existing_pid). Stop it first with ./stop-loop.sh"
        exit 1
    fi
fi

# Check dependencies
if ! RESOLVED_ENGINE_BIN="$(resolve_engine_bin)"; then
    if [ "$ENGINE" = "claude" ]; then
        echo "Error: Claude CLI not found. Install Claude Code in WSL and verify with 'claude --version'."
    else
        echo "Error: Codex CLI not found. Install Codex in WSL and verify with 'codex --version'."
    fi
    exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: PROMPT.md not found at $PROMPT_FILE"
    exit 1
fi

# Write PID file
echo $$ > "$PID_FILE"

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT SIGHUP

# ------------------------------------------------------------------
# Source-drift guard — the defect that made every other Ledger fix inert
# ------------------------------------------------------------------
# Found 2026-07-25 (Cycle 7) by grepping the loop's own log instead of trusting
# the loop's own story:
#
#     $ grep -c "LEDGER" logs/auto-loop.log
#     0
#
# `run_ledger` logs a LEDGER line on success and a LEDGER-FAIL line on failure,
# so it has exactly two possible outcomes and neither had ever been written.
# The "No exit without a row" invariant — the one two binding rulings and every
# NO-PROGRESS streak in this company's history rest on — HAD NEVER RUN, NOT ONCE.
#
# Why: this daemon started at 09:58:12. `run_ledger` was added to this file at
# 11:09 (commit 6240aa0) and patched again at 12:06 (commit 6f4626f). Bash reads
# a script incrementally from an open file descriptor and never re-parses what it
# has already consumed, so a long-running daemon executes the bytes that were on
# disk when it started, forever. Every Ledger row in `memories/ledger.jsonl` was
# hand-invoked by an agent inside a cycle. The loop contributed nothing.
#
# The consequence is worse than the missing rows. Cycle 5 diagnosed "a cycle that
# ends without invoking ledger.sh leaves no stamp" and shipped a fix to the
# usage-limit branch — a fix that, being in this file, was also dead on arrival.
# The company spent a cycle repairing a mechanism it could not observe, and then
# wrote binding rulings that assumed the repair had taken.
#
# So: fingerprint this file at startup, and re-exec when it changes. Any future
# fix to this loop now takes effect within one cycle instead of at the next
# reboot. A self-modifying daemon that cannot notice it was modified is not a
# control; it is a script that happens to still be running.
SELF_PATH="$SCRIPT_DIR/$(basename "$0")"
[ -f "$SELF_PATH" ] || SELF_PATH="$0"
readonly SELF_ARGS=("$@")

fingerprint_self() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$SELF_PATH" 2>/dev/null | awk '{print $1}'
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$SELF_PATH" 2>/dev/null | awk '{print $1}'
    else
        # No hasher anywhere is survivable — size+mtime still catches real edits.
        wc -c < "$SELF_PATH" 2>/dev/null | tr -d ' '
    fi
}

SELF_FINGERPRINT="$(fingerprint_self)"

# Re-exec if this file changed on disk since we started reading it.
#
# Called at the TOP of the loop, never mid-cycle: re-execing while an engine is
# running would orphan it, and an orphaned engine writing to this working tree is
# the failure `kill_engine_stragglers` exists to clean up. At the top of the loop
# there is no child to orphan.
reexec_if_source_changed() {
    local now
    now="$(fingerprint_self)"
    [ -n "$now" ] || return 0
    [ "$now" != "$SELF_FINGERPRINT" ] || return 0

    log "Source changed on disk (${SELF_FINGERPRINT:0:12} -> ${now:0:12}). Re-executing so the fix actually runs."
    save_state "reexec"
    rm -f "$PID_FILE"
    exec /bin/bash "$SELF_PATH" ${SELF_ARGS+"${SELF_ARGS[@]}"}
}

# Initialize counters
loop_count=0
error_count=0

log "=== Auto Company Loop Started (PID $$) ==="
log "Project: $PROJECT_DIR"
if [ "$ENGINE" = "codex" ]; then
    log "Engine: codex | Model: $MODEL_LABEL | Sandbox: $CODEX_SANDBOX_MODE"
else
    log "Engine: claude | Model: $MODEL_LABEL | PermissionMode: $CLAUDE_PERMISSION_MODE"
fi
log "Engine bin: $RESOLVED_ENGINE_BIN"

# A previous loop may have been SIGKILLed (or crashed) leaving its engine
# orphaned. Reap before Cycle #1 so we never start with two agents writing to
# one working tree.
kill_engine_stragglers "startup"

engine_version=$("$RESOLVED_ENGINE_BIN" --version 2>/dev/null | head -n1 || true)
case "$RESOLVED_ENGINE_BIN" in
    /mnt/c/*)
        if [ "$ENGINE" = "codex" ]; then
            log "Warning: Codex binary resolves to Windows-mounted path. Prefer WSL-local install for stability."
        else
            log "Warning: Claude binary resolves to Windows-mounted path. Prefer WSL-local install for stability."
        fi
        ;;
esac
if [ -n "$engine_version" ]; then
    if [ "$ENGINE" = "codex" ]; then
        log "Codex version: $engine_version"
    else
        log "Claude version: $engine_version"
    fi
fi
log "Interval: ${LOOP_INTERVAL}s | Timeout: ${CYCLE_TIMEOUT_SECONDS}s | Breaker: ${MAX_CONSECUTIVE_ERRORS} errors"

# === Main Loop ===

while true; do
    # Check for stop request
    if check_stop_requested; then
        log "Stop requested. Shutting down gracefully."
        cleanup
    fi

    # Pick up edits to this file before starting a cycle. See the long comment on
    # `reexec_if_source_changed` — without this, a fix to the loop takes effect
    # only when the machine reboots, and the loop keeps reporting that it is
    # enforcing invariants whose code it is not running.
    reexec_if_source_changed

    loop_count=$((loop_count + 1))
    cycle_log="$LOG_DIR/cycle-$(printf '%04d' "$loop_count")-$(date '+%Y%m%d-%H%M%S').log"

    log_cycle "$loop_count" "START" "Beginning work cycle"

    # Ledger preflight — INTO THIS LOG, not into a hook.
    #
    # Munger, Cycle 7 integrity ruling §3.1, granted as the single exception to
    # his freeze on instrument work: "A control must not depend on a file the
    # runtime says it is ignoring."
    #
    # The preflight was first wired to `SessionStart` in `.claude/settings.json`.
    # That file is untrusted in this workspace — `hasTrustDialogAccepted: false`,
    # and every cycle since 09:58 has logged "Ignoring 7 permissions.allow
    # entries from .claude/settings.json: this workspace has not been trusted"
    # (6 occurrences). So the control built to detect unexecuted controls was
    # itself installed somewhere its execution could not be observed — the eighth
    # instance of the method lesson, committed twenty minutes after writing down
    # the seventh.
    #
    # Here it leaves a line in auto-loop.log, which is an artifact that outlives
    # the cycle and can be grepped. The settings.json hook is kept as a redundant
    # path for interactive sessions started outside this loop; it is a bonus, not
    # the control.
    if [ -x "$SCRIPT_DIR/ledger-preflight.sh" ]; then
        while IFS= read -r preflight_line; do
            [ -n "$preflight_line" ] || continue
            log_cycle "$loop_count" "PREFLIGHT" "$preflight_line"
        done < <("$SCRIPT_DIR/ledger-preflight.sh" 2>&1 | grep -E '^(🔴|- |✅)' || true)
    else
        log_cycle "$loop_count" "PREFLIGHT-FAIL" "ledger-preflight.sh missing or not executable"
    fi
    save_state "running"

    # Log rotation
    rotate_logs

    # Backup consensus before cycle
    backup_consensus
    gitignore_snapshot=$(snapshot_gitignore)

    # Build prompt with consensus pre-injected
    PROMPT=$(cat "$PROMPT_FILE")
    CONSENSUS=$(cat "$CONSENSUS_FILE" 2>/dev/null || echo "No consensus file found. This is the very first cycle.")
    FULL_PROMPT="$PROMPT

---

## Runtime Guardrails (must follow)

1. Early in the cycle, create or update \`memories/consensus.md\` with the required section skeleton.
2. If work scope is large, persist partial decisions to \`memories/consensus.md\` before deep dives.
3. Prefer shipping one completed milestone over broad parallel exploration.
4. Never write files via shell heredoc (\`cat <<EOF\`). Use \`apply_patch\` for file creates/edits.
5. Never execute shell lines that begin with \`>\` or \`>=\`; treat them as text and keep them inside markdown/files.

---

## Current Consensus (pre-loaded, do NOT re-read this file)

$CONSENSUS

---

This is Cycle #$loop_count. Act decisively."

    # Run selected engine in headless mode with per-cycle timeout
    run_engine_cycle "$FULL_PROMPT"

    # Save full output to cycle log
    echo "$OUTPUT" > "$cycle_log"

    # Clean up known malformed-redirection artifacts created by bad generated shell commands.
    cleanup_accidental_root_artifacts
    restore_gitignore_if_changed "$gitignore_snapshot"

    # Extract result fields for status classification
    extract_cycle_metadata

    cycle_failed_reason=""
    cycle_soft_timeout=0
    if [ "$CYCLE_TIMED_OUT" -eq 1 ]; then
        if validate_consensus && consensus_changed_since_backup; then
            cycle_soft_timeout=1
        else
            cycle_failed_reason="Timed out after ${CYCLE_TIMEOUT_SECONDS}s"
        fi
    elif [ "$EXIT_CODE" -ne 0 ]; then
        cycle_failed_reason="Exit code $EXIT_CODE"
    elif ! validate_consensus; then
        cycle_failed_reason="consensus.md validation failed after cycle"
    fi

    if [ "$cycle_soft_timeout" -eq 1 ]; then
        log_cycle "$loop_count" "OK" "Timed out after ${CYCLE_TIMEOUT_SECONDS}s but consensus was updated; keeping progress (cost: ${CYCLE_COST}, subtype: ${CYCLE_SUBTYPE})"
        if [ -n "$RESULT_TEXT" ]; then
            log_cycle "$loop_count" "SUMMARY" "$(echo "$RESULT_TEXT" | head -c 300)"
        fi
        error_count=0
    elif [ -z "$cycle_failed_reason" ]; then
        log_cycle "$loop_count" "OK" "Completed (cost: ${CYCLE_COST}, subtype: ${CYCLE_SUBTYPE})"
        if [ -n "$RESULT_TEXT" ]; then
            log_cycle "$loop_count" "SUMMARY" "$(echo "$RESULT_TEXT" | head -c 300)"
        fi
        error_count=0
    else
        error_count=$((error_count + 1))
        log_cycle "$loop_count" "FAIL" "$cycle_failed_reason (cost: ${CYCLE_COST}, subtype: ${CYCLE_SUBTYPE}, errors: $error_count/$MAX_CONSECUTIVE_ERRORS)"

        # Restore consensus on hard failure
        restore_consensus

        # Check for usage limit
        if check_usage_limit "$OUTPUT"; then
            log_cycle "$loop_count" "LIMIT" "API usage limit detected. Waiting ${LIMIT_WAIT_SECONDS}s..."
            # STAMP BEFORE THE `continue` — this branch used to skip the Ledger
            # entirely and it is the only path in the loop that could.
            #
            # The comment on the `run_ledger` call at the bottom of this loop
            # states the invariant: "Every cycle gets a Ledger row — including a
            # failed one, because a cycle that crashed also moved no
            # externally-generated number and the streak must reflect that
            # honestly." This `continue` broke exactly that invariant, silently.
            #
            # Found 2026-07-25 (Cycle 5) by an off-by-one nobody had noticed:
            # `memories/ledger.jsonl` held two rows where there should have been
            # three. Cycle 4 ended without ever stamping, so the "streak: 2" that
            # its consensus asserted — and that a STREAK WARNING and two binding
            # rulings then repeated — was an agent's narrative that no script had
            # ever produced. The company's own rule says a hand-written row is a
            # governance violation; a hand-asserted streak is the same thing in
            # prose.
            #
            # A missing stamp is worse than a NO-PROGRESS stamp. NO-PROGRESS is a
            # measurement; silence is an absence that later reads as whatever the
            # next cycle needs it to mean, and it permanently offsets every Ledger
            # cycle number after it.
            run_ledger || true
            save_state "waiting_limit"
            sleep "$LIMIT_WAIT_SECONDS"
            error_count=0
            continue
        fi

        # Circuit breaker
        if [ "$error_count" -ge "$MAX_CONSECUTIVE_ERRORS" ]; then
            log_cycle "$loop_count" "BREAKER" "Circuit breaker tripped! Cooling down ${COOLDOWN_SECONDS}s..."
            save_state "circuit_break"
            sleep "$COOLDOWN_SECONDS"
            error_count=0
            log "Circuit breaker reset. Resuming..."
        fi
    fi

    # Cycle end. Every cycle gets a Ledger row — including a failed one, because
    # a cycle that crashed also moved no externally-generated number and the
    # streak must reflect that honestly.
    run_ledger || true

    save_state "idle"
    log_cycle "$loop_count" "WAIT" "Sleeping ${LOOP_INTERVAL}s before next cycle..."
    sleep "$LOOP_INTERVAL"
done
