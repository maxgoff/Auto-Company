#!/bin/bash
# ============================================================
# SnapOG — end-to-end smoke test
# ============================================================
# Exercises the paths where a bug costs us money or leaks a paid tier:
#   * registration can never self-issue a paid tier
#   * a publishable (pk_) key can render but can NEVER reach the control surface
#   * only a cache MISS is metered; hits and refusals are free
#   * over-quota degrades to a 200 image/png placeholder, never a broken card
#   * an unsigned/forged Stripe webhook is rejected before it can grant a tier
#
# Usage:
#   ./scripts/smoke-test.sh                  # assumes a server on :8799
#   BASE_URL=http://127.0.0.1:8787 ./scripts/smoke-test.sh
#   START_SERVER=1 ./scripts/smoke-test.sh   # boot `wrangler dev` itself
#
# Exit code is the number of failed checks, so CI can gate on it.
# ============================================================

set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8799}"
START_SERVER="${START_SERVER:-0}"
PORT="${PORT:-8799}"
DB_NAME="${DB_NAME:-snapog-db}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

TMP="$(mktemp -d)"
DEV_PID=""
PASS=0
FAIL=0

cleanup() {
    if [ -n "$DEV_PID" ]; then
        # Kill the tree: wrangler spawns workerd as a child.
        for child in $(pgrep -P "$DEV_PID" 2>/dev/null); do
            kill -TERM "$child" 2>/dev/null || true
        done
        kill -TERM "$DEV_PID" 2>/dev/null || true
    fi
    rm -rf "$TMP"
}
trap cleanup EXIT

ok()   { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# expect_eq <label> <expected> <actual>
expect_eq() {
    if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected '$2', got '$3'"; fi
}

# expect_contains <label> <needle> <haystack>
expect_contains() {
    case "$3" in
        *"$2"*) ok "$1" ;;
        *)      bad "$1 — '$2' not found in: $(echo "$3" | head -c 200)" ;;
    esac
}

# status <url> [curl args...] — HTTP status only
status() {
    local url="$1"; shift
    curl -s -o /dev/null -w '%{http_code}' "$@" "$url"
}

# hdr <file> <header-name> — read one response header, case-insensitive
hdr() {
    grep -i "^$2:" "$1" | tail -1 | cut -d: -f2- | tr -d ' \r'
}

# hstatus <file> — the HTTP status code from a saved response-header dump, so a
# check can assert on the SAME response it read headers from instead of firing a
# second request that may take a different code path (e.g. cache HIT vs MISS).
hstatus() {
    awk '/^HTTP\//{code=$2} END{print code}' "$1" | tr -d '\r'
}

d1() {
    npx wrangler d1 execute "$DB_NAME" --local --command "$1" --json 2>/dev/null
}

# ── Boot ──────────────────────────────────────────────────────────────────────
if [ "$START_SERVER" = "1" ]; then
    head_ "Starting wrangler dev on :$PORT"
    npx wrangler dev --port "$PORT" --local > "$TMP/dev.log" 2>&1 &
    DEV_PID=$!
    for _ in $(seq 1 45); do
        sleep 2
        if curl -s -o /dev/null -m 2 "$BASE_URL/health" 2>/dev/null; then break; fi
    done
fi

if ! curl -s -o /dev/null -m 5 "$BASE_URL/health"; then
    echo "ERROR: no server at $BASE_URL — start one with 'npx wrangler dev --port $PORT' or pass START_SERVER=1"
    exit 1
fi

# ── 1. Health ─────────────────────────────────────────────────────────────────
head_ "1. Health / ops"
HEALTH=$(curl -s "$BASE_URL/health")
expect_contains "/health reports ok" '"ok":true' "$HEALTH"
expect_contains "/health reports billing wiring" '"billing"' "$HEALTH"

# ── 2. Registration must never sell itself a paid tier ────────────────────────
head_ "2. Registration (the revenue hole)"
EMAIL="smoke-$$-$(date +%s)@example.com"
REG=$(curl -s -X POST "$BASE_URL/register" \
        -d "email=$EMAIL" -d "keyname=smoke" -d "tier=business")

SK=$(echo "$REG" | grep -oE 'sk_[a-f0-9]{64}' | head -1)
PK=$(echo "$REG" | grep -oE 'pk_[a-f0-9]{32}' | head -1)

if [ -n "$SK" ]; then ok "secret key issued"; else bad "no sk_ key in /register response"; fi
if [ -n "$PK" ]; then ok "publishable key issued"; else bad "no pk_ key in /register response"; fi

if [ -z "$SK" ]; then
    echo "FATAL: cannot continue without a key"
    exit $((FAIL + 1))
fi

# The whole point: we ASKED for business and must be given free.
TIER_ROW=$(d1 "SELECT tier, monthly_limit FROM api_keys WHERE key_prefix = '${SK:0:12}';")
expect_contains "tier=business at signup still yields FREE tier" '"tier": "free"' "$TIER_ROW"
expect_contains "free tier limit is 100 images" '"monthly_limit": 100' "$TIER_ROW"

NOSUB=$(d1 "SELECT COUNT(*) AS c FROM api_keys WHERE subscription_status IS NOT NULL AND stripe_subscription_id IS NULL;")
expect_contains "no key has a subscription status without a subscription id" '"c": 0' "$NOSUB"

# ── 3. Rendering ──────────────────────────────────────────────────────────────
head_ "3. /og rendering"
T="smoke-$$-$(date +%s)"

curl -s -D "$TMP/miss.h" -o "$TMP/miss.png" \
    "$BASE_URL/og?title=$T&description=smoke+test&domain=example.com&key=$SK"
expect_eq "first render is a cache MISS" "MISS" "$(hdr "$TMP/miss.h" x-cache)"
expect_eq "MISS is metered" "true" "$(hdr "$TMP/miss.h" x-snapog-metered)"
expect_eq "MISS returns image/png" "image/png" "$(hdr "$TMP/miss.h" content-type)"
expect_contains "MISS is a real 1200x630 PNG" "1200 x 630" "$(file -b "$TMP/miss.png")"

curl -s -D "$TMP/hit.h" -o "$TMP/hit.png" \
    "$BASE_URL/og?title=$T&description=smoke+test&domain=example.com&key=$SK"
expect_eq "identical params hit the R2 cache" "HIT" "$(hdr "$TMP/hit.h" x-cache)"
expect_eq "cache HIT is NOT metered" "false" "$(hdr "$TMP/hit.h" x-snapog-metered)"

# Metering arithmetic: two requests, one render, so usage must be exactly 1.
sleep 1
USAGE=$(d1 "SELECT usage_count FROM api_keys WHERE key_prefix = '${SK:0:12}';")
expect_contains "2 requests + 1 render == usage_count 1" '"usage_count": 1' "$USAGE"

# Publishable key renders too — that is its entire job.
curl -s -D "$TMP/pk.h" -o "$TMP/pk.png" \
    "$BASE_URL/og?title=$T-pk&domain=example.com&key=$PK"
expect_eq "publishable key can render" "200" "$(hstatus "$TMP/pk.h")"
expect_contains "publishable render is a PNG" "PNG image" "$(file -b "$TMP/pk.png")"

head_ "4. /og input validation"
expect_eq "missing title is 400"     "400" "$(status "$BASE_URL/og?key=$SK")"
expect_eq "missing key is 401"       "401" "$(status "$BASE_URL/og?title=x")"
expect_eq "unknown key is 401"       "401" "$(status "$BASE_URL/og?title=x&key=sk_deadbeef")"

# ── 5. pk_ must never reach the control surface ───────────────────────────────
head_ "5. Credential separation (pk_ is not a bearer token)"
expect_eq "pk_ cannot open the dashboard"      "404" "$(status "$BASE_URL/dashboard?key=$PK")"
expect_eq "pk_ cannot start a checkout"        "401" "$(status "$BASE_URL/checkout?tier=pro&key=$PK")"
expect_eq "pk_ cannot reach the billing portal" "401" "$(status "$BASE_URL/billing/portal?key=$PK")"
expect_eq "sk_ CAN open the dashboard"         "200" "$(status "$BASE_URL/dashboard?key=$SK")"

# ── 6. Stripe webhook is the only door to a paid tier ─────────────────────────
head_ "6. Stripe webhook trust boundary"
FORGED='{"id":"evt_smoke_forged","type":"checkout.session.completed","data":{"object":{"metadata":{"api_key_id":"'"${SK:0:12}"'","tier":"business"},"subscription":"sub_forged","customer":"cus_forged"}}}'

expect_eq "webhook with NO signature is rejected" "400" \
    "$(status "$BASE_URL/webhooks/stripe" -X POST -H 'content-type: application/json' -d "$FORGED")"
expect_eq "webhook with a garbage signature is rejected" "400" \
    "$(status "$BASE_URL/webhooks/stripe" -X POST -H 'content-type: application/json' \
        -H 'stripe-signature: t=1,v1=deadbeef' -d "$FORGED")"

# The forged event must not have moved anyone onto a paid plan.
STILL_FREE=$(d1 "SELECT tier FROM api_keys WHERE key_prefix = '${SK:0:12}';")
expect_contains "forged webhook did NOT grant a paid tier" '"tier": "free"' "$STILL_FREE"

NO_FORGED=$(d1 "SELECT COUNT(*) AS c FROM webhook_events WHERE id = 'evt_smoke_forged';")
expect_contains "forged event was never recorded as applied" '"c": 0' "$NO_FORGED"

# ── 7. Over-quota degrades, never breaks the customer's card ──────────────────
head_ "7. Quota exhaustion behaviour"
d1 "UPDATE api_keys SET usage_count = monthly_limit WHERE key_prefix = '${SK:0:12}';" > /dev/null

curl -s -D "$TMP/quota.h" -o "$TMP/quota.png" \
    "$BASE_URL/og?title=$T-over-quota-$(date +%s)&key=$SK"
expect_eq "over-quota still answers 200"          "200"       "$(hstatus "$TMP/quota.h")"
expect_eq "over-quota serves image/png"           "image/png" "$(hdr "$TMP/quota.h" content-type)"
expect_eq "over-quota is flagged in headers"      "exceeded"  "$(hdr "$TMP/quota.h" x-snapog-quota)"
expect_eq "over-quota is NOT metered"             "false"     "$(hdr "$TMP/quota.h" x-snapog-metered)"
expect_contains "over-quota placeholder is a PNG" "PNG image" "$(file -b "$TMP/quota.png")"

# An already-cached image must keep working even while over quota — this is what
# stops an over-limit customer's existing social cards from going blank.
curl -s -D "$TMP/oqhit.h" -o /dev/null \
    "$BASE_URL/og?title=$T&description=smoke+test&domain=example.com&key=$SK"
expect_eq "cached image still served while over quota" "HIT" "$(hdr "$TMP/oqhit.h" x-cache)"

# ── 8. Billing degrades gracefully when Stripe is absent ──────────────────────
head_ "8. Checkout"
CO=$(status "$BASE_URL/checkout?tier=pro&key=$SK")
case "$CO" in
    303|502|503) ok "/checkout reached Stripe path or degraded cleanly ($CO)" ;;
    *)           bad "/checkout returned an unexpected $CO" ;;
esac
expect_eq "/checkout rejects an unknown tier" "400" "$(status "$BASE_URL/checkout?tier=enterprise&key=$SK")"

# ── Summary ───────────────────────────────────────────────────────────────────
printf '\n\033[1m── Summary ──\033[0m\n'
printf '  passed: %s\n  failed: %s\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && printf '\033[32mALL CHECKS PASSED\033[0m\n' || printf '\033[31m%s CHECK(S) FAILED\033[0m\n' "$FAIL"
exit "$FAIL"
