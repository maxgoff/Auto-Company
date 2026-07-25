#!/bin/bash
# ============================================================================
# ledger.sh self-test — runs the REAL script against a disposable sandbox.
#
# Exists because the two things ledger.sh must never do are (a) exit 0 without
# a row and (b) destroy memories/consensus.md, and both are claims about
# behaviour under failure. Reading the code does not verify either one.
#
# Nothing here touches the real memories/ directory.
#   scripts/core/ledger-selftest.sh
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LEDGER="$SCRIPT_DIR/ledger.sh"
SANDBOX=$(mktemp -d /tmp/ledger-selftest.XXXXXX)
PASS=0
FAIL=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

ok()   { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
check() { if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi }

fresh_consensus() {
    cat > "$SANDBOX/consensus.md" <<'MD'
# Auto Company Consensus

## Last Updated
2026-07-25 sandbox

## Key Decisions Made
- A decision that must survive every single mutation.
- Another one, with a `code span` and | a pipe | and #hash and $dollar.

## Next Action
Do the thing.

## Company State
- Revenue: $0
MD
    cp "$SANDBOX/consensus.md" "$SANDBOX/consensus.original.md"
}

run_ledger() { # extra env passed as VAR=VAL args
    env LEDGER_OFFLINE=1 \
        LEDGER_FILE="$SANDBOX/ledger.jsonl" \
        LEDGER_CONSENSUS="$SANDBOX/consensus.md" \
        LEDGER_STATE_DIR="$SANDBOX/state" \
        "$@" "$LEDGER" > "$SANDBOX/out.txt" 2>&1
}

echo "=== ledger.sh self-test (sandbox: $SANDBOX) ==="

# ---------------------------------------------------------------------------
echo ""
echo "[1] a normal offline run appends exactly one row and stamps NO-PROGRESS"
fresh_consensus
run_ledger; rc=$?
check "$([ "$rc" -eq 0 ] && echo 0 || echo 1)" "exit 0"
check "$([ "$(grep -c '' "$SANDBOX/ledger.jsonl")" = "1" ] && echo 0 || echo 1)" "exactly 1 row"
check "$(tail -1 "$SANDBOX/ledger.jsonl" | jq -e '.verdict=="NO-PROGRESS" and .streak==1' >/dev/null 2>&1 && echo 0 || echo 1)" "verdict NO-PROGRESS, streak 1"
check "$(tail -1 "$SANDBOX/ledger.jsonl" | jq -e '.collected_cents==null and .embed_domains==null and .live_artifacts_verified==null and .npm_published==null' >/dev/null 2>&1 && echo 0 || echo 1)" "unreachable sources are null, never 0"

# RULE 3
echo ""
echo "[2] RULE 3 — the stamp is the LITERAL first line"
head -1 "$SANDBOX/consensus.md" > "$SANDBOX/line1"
check "$([ "$(cat "$SANDBOX/line1")" = '## STOP — LAST CYCLE: NO-PROGRESS (streak: 1)' ] && echo 0 || echo 1)" "line 1 == '## STOP — LAST CYCLE: NO-PROGRESS (streak: 1)'"
check "$(grep -q '^Cycles: 1 | Collected: \$0\.00 (unverified)' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "permanent header present"

# body preservation
echo ""
echo "[3] the body survived byte-for-byte"
python3 - "$SANDBOX/consensus.md" "$SANDBOX/consensus.original.md" > "$SANDBOX/bodycmp" 2>&1 <<'PY'
import sys, re
new = open(sys.argv[1], encoding='utf-8').read()
orig = open(sys.argv[2], encoding='utf-8').read()
end = new.index('<!-- LEDGER:END -->')
body = new[end:].split('\n', 1)[1].lstrip('\n')
print("SAME" if body == orig.lstrip('\n') else "DIFF")
PY
check "$([ "$(cat "$SANDBOX/bodycmp")" = "SAME" ] && echo 0 || echo 1)" "body identical to the original"

# idempotency
echo ""
echo "[4] running again is idempotent — no header stacking, body still intact"
run_ledger LEDGER_CYCLE=2 >/dev/null 2>&1
check "$([ "$(grep -c 'LEDGER:BEGIN' "$SANDBOX/consensus.md")" = "1" ] && echo 0 || echo 1)" "exactly one managed block"
check "$([ "$(grep -c '^## STOP —' "$SANDBOX/consensus.md")" = "1" ] && echo 0 || echo 1)" "exactly one STOP line"
check "$([ "$(grep -c '^# Auto Company Consensus' "$SANDBOX/consensus.md")" = "1" ] && echo 0 || echo 1)" "exactly one H1"
check "$(grep -q 'streak: 2' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "streak incremented to 2"

# ---------------------------------------------------------------------------
echo ""
echo "[5] RULE 4 — the third consecutive NO-PROGRESS writes the reallocation mandate"
run_ledger LEDGER_CYCLE=3 >/dev/null 2>&1
check "$(grep -q 'MANDATORY REALLOCATION — 3 CONSECUTIVE NO-PROGRESS CYCLES' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "mandate block written at streak 3"
check "$(grep -q 'Opportunity Discovery under the' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "mandate names Opportunity Discovery"
check "$(grep -q 'FORBIDDEN until a Ledger number moves' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "mandate forbids product work"
check "$([ "$(head -1 "$SANDBOX/consensus.md")" = '## STOP — LAST CYCLE: NO-PROGRESS (streak: 3)' ] && echo 0 || echo 1)" "STOP still line 1 with the mandate present"

# ---------------------------------------------------------------------------
echo ""
echo "[6] a PROGRESS cycle clears the STOP stamp and resets the streak"
# Forge a previous row by hand ONLY inside the sandbox, to give the next real
# run something to beat. (Doing this to the real ledger is a governance
# violation; doing it to a temp file is a test fixture.)
echo '{"cycle":4,"ts":"2026-07-25T00:00:00Z","collected_cents":null,"collected_src":"t","embed_domains":null,"embed_domains_src":"t","live_artifacts_verified":0,"live_src":"t","npm_published":false,"npm_src":"t","verdict":"NO-PROGRESS","streak":3}' >> "$SANDBOX/ledger.jsonl"
# A stub `gh` that reports one successful `verify` job — i.e. GitHub says a live
# artifact exists. This is the ONLY way live_artifacts_verified can move.
mkdir -p "$SANDBOX/bin"
cat > "$SANDBOX/bin/gh" <<'STUB'
#!/bin/bash
case "$*" in
  *"repo view"*)  echo "acme/demo" ;;
  *"api repos/"*) echo "acme/demo" ;;
  *"run list"*)   echo '[{"databaseId":99,"status":"completed","conclusion":"success","url":"https://github.com/acme/demo/actions/runs/99","createdAt":"2026-07-25T10:00:00Z"}]' ;;
  *"run view"*)   echo '{"jobs":[{"name":"verify (https://x/og)","conclusion":"success"}]}' ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$SANDBOX/bin/gh"
env LEDGER_FILE="$SANDBOX/ledger.jsonl" LEDGER_CONSENSUS="$SANDBOX/consensus.md" \
    LEDGER_STATE_DIR="$SANDBOX/state" LEDGER_CYCLE=5 \
    LEDGER_NPM_PACKAGE="definitely-not-a-real-package-xyzzy-0000" \
    PATH="$SANDBOX/bin:$PATH" \
    "$LEDGER" > "$SANDBOX/out.txt" 2>&1
rc=$?
check "$([ "$rc" -eq 0 ] && echo 0 || echo 1)" "exit 0"
check "$(tail -1 "$SANDBOX/ledger.jsonl" | jq -e '.verdict=="PROGRESS" and .streak==0 and .live_artifacts_verified==1' >/dev/null 2>&1 && echo 0 || echo 1)" "PROGRESS, streak reset to 0, live=1"
check "$(head -1 "$SANDBOX/consensus.md" | grep -q '^## STOP' && echo 1 || echo 0)" "STOP stamp removed"
check "$(grep -q 'MANDATORY REALLOCATION' "$SANDBOX/consensus.md" && echo 1 || echo 0)" "reallocation mandate removed"
check "$(grep -q '^# Auto Company Consensus' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "body still intact after PROGRESS"
check "$(tail -1 "$SANDBOX/ledger.jsonl" | jq -e '.live_src=="https://github.com/acme/demo/actions/runs/99"' >/dev/null 2>&1 && echo 0 || echo 1)" "live_src is the public GH run URL"

# ---------------------------------------------------------------------------
echo ""
echo "[7] RULE 2 — refuses to exit 0 when the row cannot be appended"
fresh_consensus
# A genuinely unwritable directory, so the append fails at the OS level rather
# than via a test hook. No mocking: this is the real code path.
mkdir -p "$SANDBOX/readonly"
chmod 500 "$SANDBOX/readonly"
env LEDGER_OFFLINE=1 \
    LEDGER_FILE="$SANDBOX/readonly/ledger.jsonl" \
    LEDGER_CONSENSUS="$SANDBOX/consensus.md" \
    LEDGER_STATE_DIR="$SANDBOX/state" \
    "$LEDGER" > "$SANDBOX/blocked.txt" 2>&1
rc=$?
chmod 700 "$SANDBOX/readonly"
check "$([ "$rc" -ne 0 ] && echo 0 || echo 1)" "non-zero exit when the append fails (got $rc)"
check "$(grep -q 'LEDGER REFUSES TO EXIT 0' "$SANDBOX/blocked.txt" && echo 0 || echo 1)" "prints the refusal"
check "$(cmp -s "$SANDBOX/consensus.md" "$SANDBOX/consensus.original.md" && echo 0 || echo 1)" "did NOT stamp consensus.md without a row"

echo ""
echo "[8] --dry-run appends nothing and exits 2 (never 0)"
fresh_consensus
before=$(wc -l < "$SANDBOX/ledger.jsonl" | tr -d ' ')
env LEDGER_OFFLINE=1 LEDGER_FILE="$SANDBOX/ledger.jsonl" LEDGER_CONSENSUS="$SANDBOX/consensus.md" \
    LEDGER_STATE_DIR="$SANDBOX/state" "$LEDGER" --dry-run > "$SANDBOX/dry.txt" 2>&1
rc=$?
after=$(wc -l < "$SANDBOX/ledger.jsonl" | tr -d ' ')
check "$([ "$rc" -eq 2 ] && echo 0 || echo 1)" "exits 2 (got $rc)"
check "$([ "$before" = "$after" ] && echo 0 || echo 1)" "no row appended"
check "$(cmp -s "$SANDBOX/consensus.md" "$SANDBOX/consensus.original.md" && echo 0 || echo 1)" "consensus.md untouched"

# ---------------------------------------------------------------------------
echo ""
echo "[9] THE FAILURE MODE THAT LOSES EVERYTHING — a stray LEDGER:END deep in the body"
fresh_consensus
{
  cat "$SANDBOX/consensus.original.md"
  echo ""
  for i in $(seq 1 100); do echo "filler line $i — irreplaceable company memory"; done
  echo '<!-- LEDGER:BEGIN this is prose ABOUT the markers, not a real block -->'
  echo '<!-- LEDGER:END -->'
  echo "trailing memory that must survive"
} > "$SANDBOX/consensus.md"
cp "$SANDBOX/consensus.md" "$SANDBOX/consensus.original.md"
lines_before=$(grep -c '' "$SANDBOX/consensus.md")
run_ledger LEDGER_CYCLE=9 >/dev/null 2>&1
lines_after=$(grep -c '' "$SANDBOX/consensus.md")
check "$([ "$lines_after" -gt "$lines_before" ] && echo 0 || echo 1)" "file GREW ($lines_before -> $lines_after), nothing was eaten"
check "$(grep -q 'filler line 1 —' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "line above the stray marker survived"
check "$(grep -q 'trailing memory that must survive' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "line below the stray marker survived"
check "$(grep -q '^# Auto Company Consensus' "$SANDBOX/consensus.md" && echo 0 || echo 1)" "H1 survived"

echo ""
echo "[10] a backup is taken before every mutation"
check "$([ "$(ls -1 "$SANDBOX/state/backups"/consensus-*.md 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ] && echo 0 || echo 1)" "backups exist in state/backups/"

echo ""
echo "[11] a corrupt ledger is never appended to"
fresh_consensus
echo 'this is not json' >> "$SANDBOX/ledger.jsonl"
run_ledger; rc=$?
check "$([ "$rc" -ne 0 ] && echo 0 || echo 1)" "non-zero exit on a corrupt last row (got $rc)"
check "$(grep -q 'not valid JSON' "$SANDBOX/out.txt" && echo 0 || echo 1)" "says why"

echo ""
echo "============================================"
printf 'PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
echo "============================================"
[ "$FAIL" -eq 0 ] || exit 1
