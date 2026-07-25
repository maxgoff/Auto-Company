#!/bin/bash
# ============================================================================
# Auto Company — The Ledger
# ============================================================================
# CEO ruling 2026-07-25 §7 (docs/ceo/2026-07-25-snapog-ruling.md). BINDING.
#
#   "Our reward signal is task completion and task completion is uncorrelated
#    with revenue. Absent an external check, this company will drift toward
#    productive-feeling work indefinitely."
#
# This script is the ONLY thing permitted to write memories/ledger.jsonl.
# An agent hand-writing a row is a governance violation. The numbers are the
# only thing in this company an agent is forbidden to author.
#
# EVERY NUMBER MUST ORIGINATE OUTSIDE THIS MACHINE. That is the whole design.
#
#   collected_cents         <- Polar API, sum of paid orders
#   embed_domains           <- D1 COUNT(DISTINCT apex) WHERE is_foreign = 1
#   live_artifacts_verified <- a GitHub Actions run that curled the public URL
#   npm_published           <- GET registry.npmjs.org/<pkg>
#
# `null` and `0` MEAN DIFFERENT THINGS AND THIS SCRIPT NEVER CONFLATES THEM.
#   0     = we queried the external source and it answered zero.
#   null  = we could not query the external source. `*_src` records why.
# Writing 0 where the truth is "unknown" is the quiet fudge this script exists
# to prevent. There is no code path below that invents a number.
#
# The four gate rules from §7, all implemented here:
#   1. Pre-commitment — every cycle opens by naming, in one line in
#      consensus.md, which Ledger number it intends to move. This script only
#      reminds; the cycle writes it. (Enforced socially, checked visually.)
#   2. No exit without a row — this script REFUSES to exit 0 unless it appended
#      a row. See the EXIT trap. `--dry-run` deliberately exits 2, so that no
#      invocation of this script can ever exit 0 without a row.
#   3. The stamp — all four numbers unchanged => verdict NO-PROGRESS, and the
#      literal first line of memories/consensus.md becomes
#      `## STOP — LAST CYCLE: NO-PROGRESS (streak: N)`.
#   4. Automatic reallocation — three consecutive NO-PROGRESS cycles and the
#      next cycle's only permitted work is Opportunity Discovery under the
#      Autonomous Distribution Test. This script writes that mandate into
#      consensus.md itself.
#
# Usage:
#   scripts/core/ledger.sh                 # normal: probe, append a row, stamp
#   scripts/core/ledger.sh --dry-run       # probe and print; appends NOTHING;
#                                          # ALWAYS exits 2, never 0
#   scripts/core/ledger.sh --show          # print the last row; exits 2
#
# Env overrides (all optional):
#   LEDGER_FILE            default <root>/memories/ledger.jsonl
#   LEDGER_CONSENSUS       default <root>/memories/consensus.md
#   LEDGER_STATE_DIR       default <root>/memories/.ledger
#   LEDGER_CYCLE           force the cycle number (else last row + 1, else 1)
#   LEDGER_NPM_PACKAGE     default EMPTY — SnapOG archived 2026-07-25; the next
#                          product sets it. Empty => npm_published false with
#                          reason `no-package-named-yet`, not a bare 404.
#   LEDGER_NPM_PKG_JSON    default EMPTY (was projects/snapog/package.json)
#   LEDGER_GH_REPO         default `gh repo view` on the cwd
#   LEDGER_GH_WORKFLOW     default ledger-verify-live.yml
#   LEDGER_D1_DB           default snapog-db
#   LEDGER_D1_DIR          default <root>/projects/snapog
#   LEDGER_POLAR_API       default https://api.polar.sh
#   LEDGER_OFFLINE=1       skip all network probes; every value becomes null
#                          with `_src: offline-mode`. For testing this script,
#                          NOT for producing a real cycle row.
#   LEDGER_NET_TIMEOUT     default 20 (seconds per network probe)
#
# bash 3.2 compatible (macOS system bash): no `declare -A`, no `mapfile`,
# no `${var^^}`, no `&>>`.
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

LEDGER_FILE="${LEDGER_FILE:-$PROJECT_DIR/memories/ledger.jsonl}"
CONSENSUS_FILE="${LEDGER_CONSENSUS:-$PROJECT_DIR/memories/consensus.md}"
STATE_DIR="${LEDGER_STATE_DIR:-$PROJECT_DIR/memories/.ledger}"
BACKUP_DIR="$STATE_DIR/backups"
EVIDENCE_DIR="$STATE_DIR/evidence"

# Empty by default since 2026-07-25: SnapOG is archived and `og-worker` was its
# unpublished name. A probe aimed at a retired name reports `404`, which reads
# as "we tried to ship and have not yet" when the truth is "there is nothing to
# ship." Whichever product comes next sets these two, and until one does the row
# says so in plain words.
LEDGER_NPM_PACKAGE="${LEDGER_NPM_PACKAGE:-}"
LEDGER_NPM_PKG_JSON="${LEDGER_NPM_PKG_JSON:-}"
LEDGER_GH_WORKFLOW="${LEDGER_GH_WORKFLOW:-ledger-verify-live.yml}"
# The account whose published artifacts strangers would reference. Also the
# account whose OWN repos must be excluded from the demand count — see
# probe_demand(). Ours is the only one we can publish under.
LEDGER_GH_OWNER="${LEDGER_GH_OWNER:-maxgoff}"
LEDGER_D1_DB="${LEDGER_D1_DB:-snapog-db}"
LEDGER_D1_DIR="${LEDGER_D1_DIR:-$PROJECT_DIR/projects/snapog}"
LEDGER_POLAR_API="${LEDGER_POLAR_API:-https://api.polar.sh}"
LEDGER_OFFLINE="${LEDGER_OFFLINE:-0}"
LEDGER_NET_TIMEOUT="${LEDGER_NET_TIMEOUT:-20}"

# Managed-block markers. Everything between them (plus an optional STOP line
# above BEGIN) is owned by this script and is rewritten every run.
MARK_BEGIN_PREFIX='<!-- LEDGER:BEGIN'
MARK_BEGIN="$MARK_BEGIN_PREFIX — written by scripts/core/ledger.sh at cycle end. Do not edit by hand; it is regenerated every cycle. -->"
MARK_END='<!-- LEDGER:END -->'
# Refuse to strip a "managed block" that ends further down than this. A marker
# found deep in the file is a marker in prose, not our block, and deleting
# everything above it would destroy the company's only cross-cycle memory.
MAX_BLOCK_LINES=80

ROW_APPENDED=0
MODE="run"

# ---------------------------------------------------------------------------
# RULE 2 — no exit without a row.
# This trap is the mechanism. It fires on every exit path, including `set -e`
# aborts and signals, and forces a non-zero status when no row was appended.
# ---------------------------------------------------------------------------
on_exit() {
    local status=$?
    if [ "$MODE" = "run" ] && [ "$ROW_APPENDED" -eq 0 ]; then
        echo "" >&2
        echo "LEDGER REFUSES TO EXIT 0: no row was appended to $LEDGER_FILE." >&2
        echo "  CEO ruling 2026-07-25 §7 rule 2 — 'No exit without a row.'" >&2
        echo "  A cycle may not write 'What We Did This Cycle' before the row exists." >&2
        if [ "$status" -eq 0 ]; then status=1; fi
    fi
    exit "$status"
}
trap on_exit EXIT

say() { printf '%s\n' "$*"; }
die() { printf 'ledger.sh: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) MODE="dry-run" ;;
        --show)    MODE="show" ;;
        -h|--help) sed -n '2,70p' "$0"; MODE="show"; exit 2 ;;
        *) die "unknown argument '$1'" ;;
    esac
    shift
done

command -v jq >/dev/null 2>&1 || die "jq is required (the row is JSON and must be built, not string-concatenated)"

mkdir -p "$(dirname "$LEDGER_FILE")" "$STATE_DIR" "$BACKUP_DIR" "$EVIDENCE_DIR"

if [ "$MODE" = "show" ]; then
    if [ -s "$LEDGER_FILE" ]; then tail -1 "$LEDGER_FILE" | jq .; else say "(ledger is empty)"; fi
    exit 2
fi

# ---------------------------------------------------------------------------
# Previous row
# ---------------------------------------------------------------------------
PREV_ROW=""
if [ -s "$LEDGER_FILE" ]; then
    PREV_ROW=$(grep -v '^[[:space:]]*$' "$LEDGER_FILE" | tail -1 || true)
    if [ -n "$PREV_ROW" ] && ! printf '%s' "$PREV_ROW" | jq -e . >/dev/null 2>&1; then
        die "last line of $LEDGER_FILE is not valid JSON — refusing to append on top of a corrupt ledger"
    fi
fi

prev_field() { # prev_field <key> <fallback>
    local key="$1" fallback="$2" v
    [ -n "$PREV_ROW" ] || { printf '%s' "$fallback"; return 0; }
    v=$(printf '%s' "$PREV_ROW" | jq -r --arg k "$key" 'if has($k) then (.[$k] | tostring) else "__missing__" end' 2>/dev/null || echo "__missing__")
    if [ "$v" = "__missing__" ]; then v="$fallback"; fi
    printf '%s' "$v"
}

PREV_CYCLE=$(prev_field cycle 0)
PREV_COLLECTED=$(prev_field collected_cents null)
PREV_EMBED=$(prev_field embed_domains null)
PREV_LIVE=$(prev_field live_artifacts_verified null)
PREV_DEPS=$(prev_field dependent_repos null)
PREV_NPM=$(prev_field npm_published false)
PREV_STREAK=$(prev_field streak 0)

case "$PREV_CYCLE" in ''|*[!0-9]*) PREV_CYCLE=0 ;; esac
case "$PREV_STREAK" in ''|*[!0-9]*) PREV_STREAK=0 ;; esac

if [ -n "${LEDGER_CYCLE:-}" ]; then
    CYCLE="$LEDGER_CYCLE"
    case "$CYCLE" in ''|*[!0-9]*) die "LEDGER_CYCLE must be a non-negative integer" ;; esac
else
    CYCLE=$((PREV_CYCLE + 1))
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CYCLE_EVIDENCE="$EVIDENCE_DIR/cycle-$(printf '%04d' "$CYCLE")"
mkdir -p "$CYCLE_EVIDENCE"

# ---------------------------------------------------------------------------
# PROBE 1 — collected_cents  <-  Polar API (Merchant of Record)
# ---------------------------------------------------------------------------
# Third party holds the money. We cannot generate this number; we can only ask.
# Per ruling §7: if no MoR exists the value is `null` and this axis is
# automatically NO-PROGRESS.
#
# RECONCILIATION REQUIRED ON FIRST SUCCESS. The response shape below is written
# against Polar's documented orders endpoint but has NEVER been observed against
# a live token (none has ever existed). The raw response is saved to the cycle
# evidence dir precisely so the first real number can be checked by hand before
# it is trusted. Amount semantics: the gate is "cumulative cash actually
# received", so `net_amount` (after MoR fees) is preferred over `total_amount`
# (what the customer paid); the field actually used is recorded in the src.
probe_polar() {
    COLLECTED="null"; COLLECTED_SRC="none"

    if [ "$LEDGER_OFFLINE" = "1" ]; then COLLECTED_SRC="offline-mode"; return 0; fi
    if [ -z "${POLAR_ACCESS_TOKEN:-}" ]; then
        COLLECTED_SRC="none:POLAR_ACCESS_TOKEN-unset"
        return 0
    fi
    command -v curl >/dev/null 2>&1 || { COLLECTED_SRC="none:curl-missing"; return 0; }

    local out="$CYCLE_EVIDENCE/polar-orders.json" page=1 total=0 got field="" body code
    local pages_file="$CYCLE_EVIDENCE/polar-raw.ndjson"
    : > "$pages_file"

    while [ "$page" -le 20 ]; do
        body=$(mktemp)
        code=$(curl -sS --max-time "$LEDGER_NET_TIMEOUT" -o "$body" -w '%{http_code}' \
                 -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
                 -H "Accept: application/json" \
                 "$LEDGER_POLAR_API/v1/orders/?limit=100&page=$page" 2>/dev/null || echo "000")

        if [ "$code" != "200" ]; then
            rm -f "$body"
            COLLECTED="null"; COLLECTED_SRC="polar-api:http-$code"
            return 0
        fi
        cat "$body" >> "$pages_file"

        got=$(jq -r '(.items // []) | length' "$body" 2>/dev/null || echo "0")
        case "$got" in ''|*[!0-9]*) rm -f "$body"; COLLECTED="null"; COLLECTED_SRC="polar-api:unparseable-response"; return 0 ;; esac

        if [ -z "$field" ] && [ "$got" -gt 0 ]; then
            field=$(jq -r '.items[0] | if has("net_amount") then "net_amount" elif has("total_amount") then "total_amount" elif has("amount") then "amount" else "" end' "$body" 2>/dev/null || echo "")
        fi

        local sum
        sum=$(jq -r '[(.items // [])[] | select((.status // "") == "paid") | (.net_amount // .total_amount // .amount // 0)] | add // 0' "$body" 2>/dev/null || echo "")
        case "$sum" in ''|*[!0-9]*) rm -f "$body"; COLLECTED="null"; COLLECTED_SRC="polar-api:non-integer-amount"; return 0 ;; esac
        total=$((total + sum))
        rm -f "$body"

        if [ "$got" -lt 100 ]; then break; fi
        page=$((page + 1))
    done

    cp "$pages_file" "$out" 2>/dev/null || true
    COLLECTED="$total"
    COLLECTED_SRC="polar-api:paid-orders:${field:-none}:UNRECONCILED-SHAPE"
    return 0
}

# ---------------------------------------------------------------------------
# PROBE 2 — embed_domains  <-  D1
# ---------------------------------------------------------------------------
# The values are typed into other people's HTML by other people. We cannot
# generate them.
#
# Schema owned by fullstack-dhh, migrations/0004_embed_domains.sql:
#
#   CREATE TABLE embed_domains (
#     apex        TEXT PRIMARY KEY,  -- apex, or a bucket sentinel: (none) (invalid) (ip) (local)
#     source      TEXT NOT NULL,     -- 'referer' | 'origin' | 'none' | 'invalid'
#     is_foreign  INTEGER NOT NULL,  -- 1 = counts toward the probe
#     hits        INTEGER NOT NULL DEFAULT 0,
#     first_seen  TEXT NOT NULL,
#     last_seen   TEXT NOT NULL
#   );
#
# THE EXACT QUERY, verbatim from dhh, kept here so it can be reconciled:
#
#   SELECT COUNT(DISTINCT apex) AS embed_domains FROM embed_domains WHERE is_foreign = 1;
#
# The exclusion of our own domains and our own tooling UAs happens at WRITE
# time in the Worker, not here: the Worker knows its own Host and the request
# UA, this script does not, and duplicating that logic in SQL means two places
# to keep in sync and one of them rots silently. A request from our tooling, or
# from our own hosts, never produces an `is_foreign = 1` row at all.
#
# `(none)` — social crawlers send og:image requests with no Referer and no
# Origin — is recorded with is_foreign = 0 and can never count toward the gate.
D1_QUERY='SELECT COUNT(DISTINCT apex) AS embed_domains FROM embed_domains WHERE is_foreign = 1;'

probe_d1() {
    EMBED="null"; EMBED_SRC="none"

    if [ "$LEDGER_OFFLINE" = "1" ]; then EMBED_SRC="offline-mode"; return 0; fi

    # Retired with the product it measured. SnapOG was ARCHIVED by CEO ruling
    # 2026-07-25, so the Worker that would write this table will never deploy.
    #
    # Left reporting `none:CLOUDFLARE_API_TOKEN-unset`, this probe would have
    # told every future cycle that one human token unblocks a demand number —
    # which is false, and is precisely the sort of confident-sounding breadcrumb
    # that has already cost this company whole cycles. `null` is unchanged and
    # still correct; only the reason is now true.
    #
    # This stays until a NEW product defines what "distinct third parties using
    # our thing" means for it. Set LEDGER_EMBED_RETIRED=0 to re-enable the D1
    # query as-is.
    if [ "${LEDGER_EMBED_RETIRED:-1}" = "1" ]; then
        EMBED_SRC="retired:snapog-archived-2026-07-25:superseded-by-dependent_repos"
        return 0
    fi

    if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
        EMBED_SRC="none:CLOUDFLARE_API_TOKEN-unset"
        return 0
    fi
    if [ ! -d "$LEDGER_D1_DIR" ]; then EMBED_SRC="none:worker-dir-absent"; return 0; fi

    local out="$CYCLE_EVIDENCE/d1-embed-domains.json" rc=0
    ( cd "$LEDGER_D1_DIR" && npx --yes wrangler d1 execute "$LEDGER_D1_DB" \
        --remote --json --command "$D1_QUERY" ) > "$out" 2>"$out.err" || rc=$?

    if [ "$rc" -ne 0 ]; then
        if grep -qi 'no such table' "$out.err" "$out" 2>/dev/null; then
            # A hard zero here would be a claim that we measured and found
            # nothing. We measured nothing. Those are different facts.
            EMBED_SRC="d1-table-absent"
        elif grep -qi "couldn't find db\|not found\|does not exist" "$out.err" "$out" 2>/dev/null; then
            EMBED_SRC="d1-database-absent"
        else
            EMBED_SRC="d1-query-failed:rc-$rc"
        fi
        return 0
    fi

    local n
    n=$(jq -r 'if type=="array" then .[0].results[0].embed_domains else .results[0].embed_domains end // empty' "$out" 2>/dev/null || echo "")
    case "$n" in
        ''|*[!0-9]*) EMBED_SRC="d1-unparseable-result"; return 0 ;;
    esac
    EMBED="$n"
    EMBED_SRC="d1-distinct-foreign-apex"
    return 0
}

# ---------------------------------------------------------------------------
# PROBE 2b — dependent_repos  <-  GitHub code search
# ---------------------------------------------------------------------------
# THE SUCCESSOR DEMAND METRIC. Installed 2026-07-25 (Cycle 5), answering the
# standing Open Question left when `embed_domains` was retired with SnapOG:
# *what does "distinct third parties using our thing" mean for this company now?*
#
# It means: **how many public repositories that are not ours reference something
# we published, in a workflow file they chose to commit.**
#
#   GET /search/code?q=uses:<owner>/ path:.github/workflows
#
# Why this metric and not another:
#
#   - It is EXTERNALLY SOURCED in the strict sense the Ledger requires. GitHub
#     indexes strangers' repositories; we cannot write to that index. The number
#     is produced by other people's commits, not by our deploys.
#   - It runs on the ONLY rail this company has. `embed_domains` needed a
#     Cloudflare token; `npm_published` needs an npm token; `collected_cents`
#     needs a payment token. This needs `gh`, which we already hold.
#   - It is UNGAMEABLE BY SELF-USE. Repos owned by `$LEDGER_GH_OWNER` are
#     filtered out below. Adding `uses:` to our own workflows moves nothing —
#     which is exactly the failure mode Cycle 4 flagged: *"do not let a metric be
#     satisfied by an artifact with no strangers in front of it."*
#   - It is a DEMAND number, not an output number. `live_artifacts_verified`
#     says we shipped. This says somebody picked it up. Only the second one is
#     evidence of a market.
#
# Calibration run by hand before this was written, so the metric is known to
# discriminate rather than assumed to:
#
#     reviewdog/action-actionlint   ->  1,416 files, 100+ distinct repos
#     pullguard-dev/pullguard-action ->     4 files,   2 distinct repos,
#                                            and BOTH are pullguard's own.
#
# That second line is the whole argument for this probe. Round-1 discovery cited
# pullguard as proof that the license-key business model works — "not a
# hypothesis, a fetched artifact." The mechanism is real and **its third-party
# adoption is exactly zero.** A metric that can tell those two repos apart is
# worth having; a star count could not.
#
# HONESTY RULES, same as every other probe here:
#   - Cannot reach the search API  -> null (`we could not ask`)
#   - Reached it and nobody uses us -> 0    (`we asked, the answer was zero`)
# Those are different facts and the Ledger never collapses them.
probe_demand() {
    DEPS="null"; DEPS_SRC="none"

    if [ "$LEDGER_OFFLINE" = "1" ]; then DEPS_SRC="offline-mode"; return 0; fi
    command -v gh >/dev/null 2>&1 || { DEPS_SRC="none:gh-absent"; return 0; }
    gh auth status >/dev/null 2>&1 || { DEPS_SRC="none:gh-unauthenticated"; return 0; }

    local q page=1 out rc=0 got total="" repos="$CYCLE_EVIDENCE/dependent-repos.txt"
    q="uses:${LEDGER_GH_OWNER}/ path:.github/workflows"
    : > "$repos"

    # The search API pages at 100 and hard-caps at 1000 results. Walk until a
    # short page, then stop. Code search is rate-limited to ~10 req/min, so this
    # deliberately stops at 5 pages and SAYS SO in the source string rather than
    # silently reporting a truncated count as if it were complete.
    while [ "$page" -le 5 ]; do
        out="$CYCLE_EVIDENCE/code-search-p${page}.json"
        rc=0
        gh api -X GET /search/code \
            -f q="$q" -F per_page=100 -F page="$page" > "$out" 2>"$out.err" || rc=$?

        if [ "$rc" -ne 0 ]; then
            # A rate-limited or forbidden search must NEVER become a 0. Code
            # search 403s under load, and a 0 here would read as "we shipped and
            # nobody came" when the truth is "we never got to ask."
            if grep -qi 'rate limit' "$out.err" "$out" 2>/dev/null; then
                DEPS_SRC="gh-code-search:rate-limited"
            else
                DEPS_SRC="gh-code-search:request-failed:rc-$rc"
            fi
            return 0
        fi

        [ -z "$total" ] && total=$(jq -r '.total_count // empty' "$out" 2>/dev/null || echo "")
        got=$(jq -r '.items | length' "$out" 2>/dev/null || echo "")
        case "$got" in ''|*[!0-9]*) DEPS_SRC="gh-code-search:unparseable-result"; return 0 ;; esac

        # Exclude our own repositories. Self-use is not demand.
        jq -r --arg me "$LEDGER_GH_OWNER" \
            '.items[].repository.full_name | select(ascii_downcase | startswith(($me|ascii_downcase) + "/") | not)' \
            "$out" >> "$repos" 2>/dev/null || true

        [ "$got" -lt 100 ] && break
        page=$((page + 1))
    done

    local n
    n=$(sort -u "$repos" | grep -c . || true)
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    DEPS="$n"

    case "$total" in ''|*[!0-9]*) total="?" ;; esac
    if [ "$page" -gt 5 ]; then
        DEPS_SRC="gh-code-search:distinct-foreign-repos:page-cap-5:files-$total"
    else
        DEPS_SRC="gh-code-search:distinct-foreign-repos:files-$total"
    fi
    return 0
}

# ---------------------------------------------------------------------------
# PROBE 3 — live_artifacts_verified  <-  GitHub Actions
# ---------------------------------------------------------------------------
# Verified from a network path we do not control, by a log a stranger can audit.
# `curl` from our own laptop does not count and never did — so this probe does
# not curl anything. It asks the GitHub API what GitHub observed.
#
# Reachability is probed separately from the workflow query so that "GitHub says
# nothing has ever been verified" (an honest 0) is never confused with "we could
# not ask GitHub" (null).
probe_gha() {
    LIVE="null"; LIVE_SRC="none"

    if [ "$LEDGER_OFFLINE" = "1" ]; then LIVE_SRC="offline-mode"; return 0; fi
    command -v gh >/dev/null 2>&1 || { LIVE_SRC="none:gh-cli-missing"; return 0; }

    # Which repo's Actions runs answer this question.
    #
    # It must be a repo we can PUSH to, which is not the same as the repo `git
    # remote` happens to name. Found the hard way 2026-07-25: `origin` is
    # `MaxMiksa/Auto-Company`, on which this company holds `viewerPermission:
    # READ`. `git push` → 403. The verify workflow could never land there, so
    # this probe would have reported `workflow-not-on-remote` forever while
    # looking like a correctly-wired external source.
    #
    # So: walk every git remote and take the first one GitHub says we can push
    # to. An explicit LEDGER_GH_REPO still wins, and a repo we cannot push to is
    # still usable as a read-only fallback — better a stale external source than
    # none — but it is recorded as `:ro` so the row says which kind it was.
    local repo="${LEDGER_GH_REPO:-}" ro_repo="" cand slug rotag=""
    if [ -z "$repo" ]; then
        for cand in $( (cd "$PROJECT_DIR" && git remote) 2>/dev/null); do
            slug=$( (cd "$PROJECT_DIR" && git remote get-url "$cand") 2>/dev/null \
                    | sed -E 's#^git@github\.com:#https://github.com/#; s#^https://[^/]*github\.com/##; s#\.git$##')
            case "$slug" in */*) ;; *) continue ;; esac
            if (cd "$PROJECT_DIR" && gh api "repos/$slug" -q .permissions.push) 2>/dev/null | grep -qx true; then
                repo="$slug"; break
            fi
            [ -n "$ro_repo" ] || ro_repo="$slug"
        done
    fi
    if [ -z "$repo" ] && [ -n "$ro_repo" ]; then
        repo="$ro_repo"
        rotag="(read-only)"
    fi
    [ -n "$repo" ] || { LIVE_SRC="none:no-pushable-github-remote"; return 0; }

    # Reachability + auth confirmed before any 0 may be written.
    (cd "$PROJECT_DIR" && gh api "repos/$repo" -q .full_name) >/dev/null 2>&1 \
        || { LIVE_SRC="none:gh-api-unreachable"; return 0; }

    local runs="$CYCLE_EVIDENCE/gh-runs.json"
    if ! (cd "$PROJECT_DIR" && gh run list --repo "$repo" --workflow "$LEDGER_GH_WORKFLOW" \
            --limit 20 --json databaseId,status,conclusion,url,createdAt) > "$runs" 2>"$runs.err"; then
        # API is reachable; the workflow simply is not there. GitHub has never
        # verified anything, which is an externally-sourced zero, not unknown.
        LIVE=0
        LIVE_SRC="gh-actions:$repo$rotag:workflow-not-on-remote:$LEDGER_GH_WORKFLOW"
        return 0
    fi

    # Pick the most recent completed run that is NOT an ad-hoc test run.
    #
    # THE HAZARD THIS CLOSES (found 2026-07-25, Cycle 5, while ad-hoc runs were
    # in flight). Cycle 4 stopped a test run from INFLATING the count, by naming
    # override jobs `adhoc <url>` so `startswith("verify")` cannot match them.
    # But this probe took the latest completed run unconditionally, so a test
    # dispatched AFTER a real verification would have contributed zero
    # `verify*` jobs and silently ERASED a legitimately earned number.
    #
    # Under-counting cannot fabricate progress, so this was never a route to a
    # false PROGRESS stamp — but it made the company's headline metric depend on
    # who happened to be testing the verifier at cycle end, and a number that
    # moves for reasons unrelated to shipping is not a measurement. It would
    # also have punished exactly the behaviour we want: testing the verifier.
    #
    # An ad-hoc run is identifiable with certainty — its jobs are named `adhoc*`,
    # a prefix no list-driven run can ever produce. Skip those runs entirely and
    # keep walking back. A real run with an empty URL list has no `verify*` jobs
    # either, but it is NOT skipped: that is an honest 0 and must still count.
    local candidates run_id="" conclusion url jobs="$CYCLE_EVIDENCE/gh-run-jobs.json"
    local n="" tried=0 skipped=0 cand_id cand_concl cand_url
    candidates=$(jq -r '[.[] | select(.status=="completed")] | sort_by(.createdAt) | reverse | .[].databaseId' "$runs" 2>/dev/null || echo "")

    if [ -z "$candidates" ]; then
        LIVE=0
        LIVE_SRC="gh-actions:$repo$rotag:no-completed-run"
        return 0
    fi

    for cand_id in $candidates; do
        [ "$tried" -lt 10 ] || break
        tried=$((tried + 1))

        cand_concl=$(jq -r --argjson id "$cand_id" '[.[] | select(.databaseId==$id)] | first | .conclusion // "unknown"' "$runs")
        cand_url=$(jq -r --argjson id "$cand_id" '[.[] | select(.databaseId==$id)] | first | .url // ""' "$runs")

        if ! (cd "$PROJECT_DIR" && gh run view "$cand_id" --repo "$repo" --json jobs) > "$jobs" 2>/dev/null; then
            LIVE_SRC="none:gh-run-jobs-unreadable"
            return 0
        fi

        if jq -e '[.jobs[] | select(.name | startswith("adhoc"))] | length > 0' "$jobs" >/dev/null 2>&1; then
            skipped=$((skipped + 1))
            continue
        fi

        run_id="$cand_id"; conclusion="$cand_concl"; url="$cand_url"
        break
    done

    if [ -z "$run_id" ]; then
        # Every recent run was a test of the verifier. We have not asked the
        # real question, so this is `null` — not a zero.
        LIVE_SRC="gh-actions:$repo$rotag:only-adhoc-runs-found:skipped-$skipped"
        return 0
    fi

    local skiptag=""
    [ "$skipped" -gt 0 ] && skiptag="#skipped-adhoc=$skipped"

    if [ "$conclusion" != "success" ]; then
        LIVE=0
        LIVE_SRC="$url#conclusion=$conclusion$skiptag"
        return 0
    fi

    # Count successful matrix jobs named `verify (<url>)`. The count comes from
    # GitHub's job list, not from our repo.
    n=$(jq -r '[.jobs[] | select(.conclusion=="success") | select(.name | startswith("verify"))] | length' "$jobs" 2>/dev/null || echo "")
    case "$n" in ''|*[!0-9]*) LIVE_SRC="none:gh-job-count-unparseable"; return 0 ;; esac

    LIVE="$n"
    LIVE_SRC="$url$skiptag"
    return 0
}

# ---------------------------------------------------------------------------
# PROBE 4 — npm_published  <-  registry.npmjs.org
# ---------------------------------------------------------------------------
# The registry is the source of truth, not our package.json. Our package.json
# only names WHICH version to look for; the registry decides whether it exists.
#
# `snapog` is owned by a third party (published 2026-03-19 by `earonesty`,
# v0.2.0, 18 downloads/30d — verified 2026-07-25 and again by this script's
# author). Hence the package name is a variable, never a hardcode. Free as of
# 2026-07-25: og-worker, create-snapog, snap-og, ogsnap.
probe_npm() {
    NPM="null"; NPM_SRC="none"; NPM_WANT_VERSION=""

    if [ "$LEDGER_OFFLINE" = "1" ]; then NPM_SRC="offline-mode"; return 0; fi
    command -v curl >/dev/null 2>&1 || { NPM_SRC="none:curl-missing"; return 0; }

    # No package name means there is no package to look for. `false` is still
    # the correct value — nothing is published — but the reason must not read
    # like a failed publish of something real.
    if [ -z "$LEDGER_NPM_PACKAGE" ]; then
        NPM="false"
        NPM_SRC="none:no-package-named-yet:set-LEDGER_NPM_PACKAGE"
        return 0
    fi

    if [ -f "$LEDGER_NPM_PKG_JSON" ]; then
        NPM_WANT_VERSION=$(jq -r '.version // empty' "$LEDGER_NPM_PKG_JSON" 2>/dev/null || echo "")
    fi

    local body code
    body="$CYCLE_EVIDENCE/npm-registry.json"
    code=$(curl -sS --max-time "$LEDGER_NET_TIMEOUT" -o "$body" -w '%{http_code}' \
             -H "Accept: application/vnd.npm.install-v1+json" \
             "https://registry.npmjs.org/$LEDGER_NPM_PACKAGE" 2>/dev/null || echo "000")

    case "$code" in
        404)
            NPM="false"
            NPM_SRC="registry.npmjs.org:404:$LEDGER_NPM_PACKAGE"
            return 0 ;;
        200) ;;
        *)
            NPM_SRC="registry.npmjs.org:http-$code"
            return 0 ;;
    esac

    if [ -z "$NPM_WANT_VERSION" ]; then
        # The registry answered 200, but we have no version to look for, so we
        # cannot tell OUR package from a stranger's package of the same name —
        # which is exactly how `snapog` would have fooled us.
        NPM="false"
        NPM_SRC="registry.npmjs.org:200-but-no-local-version-to-match"
        return 0
    fi

    if jq -e --arg v "$NPM_WANT_VERSION" '.versions | has($v)' "$body" >/dev/null 2>&1; then
        NPM="true"
        NPM_SRC="registry.npmjs.org:200:$LEDGER_NPM_PACKAGE@$NPM_WANT_VERSION"
    else
        NPM="false"
        NPM_SRC="registry.npmjs.org:200:$LEDGER_NPM_PACKAGE-exists-but-not-v$NPM_WANT_VERSION"
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
# Progress means a number MOVED UP, verifiably. Deliberately stricter than the
# ruling's literal "unchanged", and stricter in the only direction that matters:
#
#   - null -> 0 is NOT progress. It is gaining the ability to measure, which
#     feels like movement and is not. This is the fudge the script exists to
#     block.
#   - 5 -> null is NOT progress and NOT "changed". Losing a measurement must
#     never be able to look like moving a number.
#   - Any decrease is NOT progress.
num_progressed() { # <prev> <cur> ; 0 = progressed
    local prev="$1" cur="$2"
    [ "$cur" = "null" ] && return 1
    case "$cur" in ''|*[!0-9]*) return 1 ;; esac
    case "$prev" in ''|null|*[!0-9]*) prev=0 ;; esac
    [ "$cur" -gt "$prev" ]
}

bool_progressed() { # <prev> <cur>
    [ "$2" = "true" ] && [ "$1" != "true" ]
}

# ---------------------------------------------------------------------------
# consensus.md rewriting — the dangerous part
# ---------------------------------------------------------------------------
# memories/ is gitignored. This file is the company's ONLY cross-cycle memory
# and there is no git recovery for it. Every mutation is: back up, build a
# candidate in the same directory, prove the candidate preserves the body
# byte-for-byte, then rename atomically. If any check fails we touch nothing.

# Body = the file with our managed block removed and leading blanks trimmed.
extract_body() { # <file> -> stdout
    local f="$1" end_line begin_line
    end_line=$(grep -n -F -m1 "$MARK_END" "$f" 2>/dev/null | cut -d: -f1 || true)
    if [ -z "$end_line" ]; then
        sed -e '/./,$!d' "$f"
        return 0
    fi
    begin_line=$(grep -n -F -m1 "$MARK_BEGIN_PREFIX" "$f" 2>/dev/null | cut -d: -f1 || true)
    if [ -z "$begin_line" ] || [ "$begin_line" -ge "$end_line" ] || [ "$end_line" -gt "$MAX_BLOCK_LINES" ]; then
        # Marker present but not in the shape we wrote it. Treat the whole file
        # as body: duplicating a header is survivable, deleting the company's
        # memory is not.
        sed -e '/./,$!d' "$f"
        return 0
    fi
    tail -n +$((end_line + 1)) "$f" | sed -e '/./,$!d'
}

money() { # cents -> $X.YZ
    local c="$1"
    if [ "$c" = "null" ]; then printf '$0.00 (unverified)'; return 0; fi
    printf '$%d.%02d' $((c / 100)) $((c % 100))
}

count_disp() { # n -> "n" or "0 (unverified)"
    if [ "$1" = "null" ]; then printf '0 (unverified)'; else printf '%s' "$1"; fi
}

write_consensus() {
    if [ ! -f "$CONSENSUS_FILE" ]; then
        say "ledger.sh: WARNING — $CONSENSUS_FILE does not exist; skipping the stamp."
        return 0
    fi

    local ts backup body_file cand
    ts=$(date -u +%Y%m%dT%H%M%SZ)
    backup="$BACKUP_DIR/consensus-$ts-pre-ledger-c$CYCLE.md"
    cp "$CONSENSUS_FILE" "$backup" || die "could not back up $CONSENSUS_FILE — refusing to mutate it"

    body_file=$(mktemp "$STATE_DIR/body.XXXXXX")
    extract_body "$CONSENSUS_FILE" > "$body_file"

    if [ ! -s "$body_file" ]; then
        rm -f "$body_file"
        say "ledger.sh: WARNING — extracted body was empty; leaving consensus.md untouched (backup: $backup)"
        return 1
    fi

    cand=$(mktemp "$(dirname "$CONSENSUS_FILE")/.consensus.XXXXXX")

    {
        # RULE 3 — the stamp, as the literal first line.
        if [ "$VERDICT" = "NO-PROGRESS" ]; then
            printf '%s\n' "$STOP_LINE"
        fi

        printf '%s\n' "$MARK_BEGIN"
        # RULE: the permanent header, cycle count next to dollars collected.
        printf 'Cycles: %s | Collected: %s | Dependent repos: %s | Live artifacts: %s | NO-PROGRESS streak: %s\n' \
            "$CYCLE" "$(money "$COLLECTED")" "$(count_disp "$DEPS")" "$(count_disp "$LIVE")" "$STREAK"
        printf '\n'
        printf 'Last row: `%s` at %s — verdict **%s**. npm_published: `%s`.\n' \
            "cycle $CYCLE" "$TS" "$VERDICT" "$NPM"
        printf '\n'
        printf '`0` means an external source answered zero. `(unverified)` means no external\n'
        printf 'source could be reached — the Ledger stores `null`, never a fabricated `0`.\n'
        printf 'Sources this cycle:\n'
        printf -- '- collected_cents: `%s`\n' "$COLLECTED_SRC"
        printf -- '- embed_domains: `%s`\n' "$EMBED_SRC"
        printf -- '- dependent_repos: `%s`\n' "$DEPS_SRC"
        printf -- '- live_artifacts_verified: `%s`\n' "$LIVE_SRC"
        printf -- '- npm_published: `%s`\n' "$NPM_SRC"
        printf '\n'

        if [ "$VERDICT" = "NO-PROGRESS" ]; then
            printf 'No externally-generated number moved. Per CEO ruling 2026-07-25 §7 rule 3\n'
            printf 'this cycle is stamped NO-PROGRESS. The stamp is written by a script, not by\n'
            printf 'an agent, and it is not open to reinterpretation by the cycle it describes.\n'
            printf '\n'
        fi

        # RULE 4 — automatic reallocation.
        if [ "$STREAK" -ge 3 ]; then
            printf '## MANDATORY REALLOCATION — %s CONSECUTIVE NO-PROGRESS CYCLES\n' "$STREAK"
            printf '\n'
            printf 'This cycle'"'"'s ONLY permitted work is **Opportunity Discovery under the\n'
            printf 'Autonomous Distribution Test** (CEO ruling 2026-07-25 §6 and §7 rule 4).\n'
            printf '\n'
            printf 'FORBIDDEN until a Ledger number moves: product code, docs about the current\n'
            printf 'product, refactors, tests, infrastructure work, and pricing work.\n'
            printf '\n'
            printf 'REQUIRED: `research-thompson` runs one Opportunity Discovery pass. Every\n'
            printf 'candidate must name, in one line, a specific distribution rail on which an\n'
            printf 'agent with no earned human account standing can put the product in front of\n'
            printf 'strangers repeatedly and durably. A candidate that cannot name its rail is\n'
            printf 'rejected, not deferred.\n'
            printf '\n'
            printf 'This was decided in advance, in writing, by an agent who was not yet invested\n'
            printf 'in the work. No agent — including the CEO — may argue with it in the moment.\n'
            printf '\n'
        fi

        # RULE 1 — pre-commitment reminder.
        printf 'Before doing anything else, this cycle must name — in ONE line under\n'
        printf '`## Ledger Pre-Commitment` — which Ledger number it intends to move.\n'
        printf 'A cycle that cannot name one is a discovery cycle by definition and may not\n'
        printf 'write product code. (§7 rule 1)\n'
        printf '\n'
        printf 'Full ledger: `memories/ledger.jsonl` (append-only). Written by\n'
        printf '`scripts/core/ledger.sh` ONLY — an agent hand-writing a row is a governance\n'
        printf 'violation.\n'
        printf '%s\n' "$MARK_END"
        printf '\n'
        cat "$body_file"
    } > "$cand"

    # ---- Verification. Any failure => the original is not touched. ----
    local fail=""

    [ -s "$cand" ] || fail="candidate is empty"

    if [ -z "$fail" ]; then
        local cand_body
        cand_body=$(mktemp "$STATE_DIR/candbody.XXXXXX")
        extract_body "$cand" > "$cand_body"
        cmp -s "$cand_body" "$body_file" || fail="body was not preserved byte-for-byte"
        rm -f "$cand_body"
    fi

    # The same three invariants auto-loop.sh's validate_consensus() checks, so we
    # can never hand the loop a file it will reject and restore over us.
    if [ -z "$fail" ]; then
        grep -q '^# Auto Company Consensus' "$cand" || fail="lost the '# Auto Company Consensus' heading"
    fi
    if [ -z "$fail" ]; then
        grep -q '^## Next Action' "$cand" || fail="lost the '## Next Action' heading"
    fi
    if [ -z "$fail" ]; then
        grep -q '^## Company State' "$cand" || fail="lost the '## Company State' heading"
    fi

    # RULE 3 — the stamp must be the LITERAL first line.
    if [ -z "$fail" ] && [ "$VERDICT" = "NO-PROGRESS" ]; then
        [ "$(head -1 "$cand")" = "$STOP_LINE" ] || fail="STOP stamp is not line 1"
    fi
    if [ -z "$fail" ] && [ "$VERDICT" = "PROGRESS" ]; then
        case "$(head -1 "$cand")" in
            '## STOP — LAST CYCLE: NO-PROGRESS'*) fail="a stale STOP stamp survived a PROGRESS cycle" ;;
        esac
    fi

    # The candidate must contain the WHOLE body plus a block. Note this is
    # deliberately NOT "the file never shrinks": on a PROGRESS cycle the STOP
    # stamp and any reallocation mandate are correctly removed, so the file gets
    # shorter. The invariant that matters is the body, checked byte-for-byte
    # above; this is a cheap second opinion on it.
    if [ -z "$fail" ]; then
        local body_lines new_lines
        body_lines=$(wc -l < "$body_file" | tr -d ' ')
        new_lines=$(wc -l < "$cand" | tr -d ' ')
        if [ "$new_lines" -lt "$body_lines" ]; then
            fail="candidate ($new_lines lines) is shorter than the body it must contain ($body_lines lines)"
        fi
    fi

    if [ -n "$fail" ]; then
        rm -f "$cand" "$body_file"
        say "ledger.sh: REFUSING to write consensus.md — $fail"
        say "ledger.sh: original untouched. Backup also at $backup"
        return 1
    fi

    chmod 644 "$cand"
    mv "$cand" "$CONSENSUS_FILE"   # same filesystem => atomic rename
    rm -f "$body_file"

    # Keep the last 30 backups; this directory is the only undo we have.
    ls -1t "$BACKUP_DIR"/consensus-*.md 2>/dev/null | tail -n +31 | while read -r old; do
        rm -f "$old"
    done

    say "ledger.sh: consensus.md updated (backup: $backup)"
    return 0
}

# ===========================================================================
# Main
# ===========================================================================
say "=== Ledger — cycle $CYCLE @ $TS ==="
if [ "$LEDGER_OFFLINE" = "1" ]; then
    say "!! LEDGER_OFFLINE=1 — network probes skipped, every value will be null"
fi

probe_polar
probe_d1
probe_demand
probe_gha
probe_npm

progressed=""
if num_progressed  "$PREV_COLLECTED" "$COLLECTED"; then progressed="$progressed collected_cents"; fi
if num_progressed  "$PREV_EMBED"     "$EMBED";     then progressed="$progressed embed_domains"; fi
if num_progressed  "$PREV_DEPS"      "$DEPS";      then progressed="$progressed dependent_repos"; fi
if num_progressed  "$PREV_LIVE"      "$LIVE";      then progressed="$progressed live_artifacts_verified"; fi
if bool_progressed "$PREV_NPM"       "$NPM";       then progressed="$progressed npm_published"; fi

if [ -n "$progressed" ]; then
    VERDICT="PROGRESS"
    STREAK=0
else
    VERDICT="NO-PROGRESS"
    STREAK=$((PREV_STREAK + 1))
fi
STOP_LINE="## STOP — LAST CYCLE: NO-PROGRESS (streak: $STREAK)"

ROW=$(jq -c -n \
    --argjson cycle "$CYCLE" \
    --arg     ts "$TS" \
    --argjson collected_cents "$COLLECTED" \
    --arg     collected_src "$COLLECTED_SRC" \
    --argjson embed_domains "$EMBED" \
    --arg     embed_domains_src "$EMBED_SRC" \
    --argjson dependent_repos "$DEPS" \
    --arg     dependent_repos_src "$DEPS_SRC" \
    --argjson live_artifacts_verified "$LIVE" \
    --arg     live_src "$LIVE_SRC" \
    --argjson npm_published "$NPM" \
    --arg     npm_src "$NPM_SRC" \
    --arg     verdict "$VERDICT" \
    --argjson streak "$STREAK" \
    '{cycle:$cycle, ts:$ts,
      collected_cents:$collected_cents, collected_src:$collected_src,
      embed_domains:$embed_domains, embed_domains_src:$embed_domains_src,
      dependent_repos:$dependent_repos, dependent_repos_src:$dependent_repos_src,
      live_artifacts_verified:$live_artifacts_verified, live_src:$live_src,
      npm_published:$npm_published, npm_src:$npm_src,
      verdict:$verdict, streak:$streak}') \
  || die "could not build the row — refusing to write a partial or hand-assembled row"

say ""
printf '%s\n' "$ROW" | jq .
say ""
if [ -n "$progressed" ]; then
    say "VERDICT: PROGRESS —$progressed"
else
    say "VERDICT: NO-PROGRESS (streak: $STREAK) — no externally-generated number moved."
fi

if [ "$MODE" = "dry-run" ]; then
    say ""
    say "DRY RUN — nothing was appended and consensus.md was not touched."
    say "Exiting 2 on purpose: no invocation of ledger.sh may ever exit 0 without a row."
    exit 2
fi

# ---- RULE 2 — append, then PROVE the append ----
count_lines() { # `grep -c ''` exits 1 on an empty file, which corrupts `|| echo 0`
    if [ -f "$1" ]; then wc -l < "$1" | tr -d ' '; else echo 0; fi
}

before=$(count_lines "$LEDGER_FILE")

printf '%s\n' "$ROW" >> "$LEDGER_FILE"

after=$(count_lines "$LEDGER_FILE")
if [ "$after" -ne $((before + 1)) ]; then
    die "append did not land ($before -> $after lines)"
fi
last=$(tail -1 "$LEDGER_FILE")
[ "$last" = "$ROW" ] || die "the last line of the ledger is not the row we just wrote"
printf '%s' "$last" | jq -e --argjson c "$CYCLE" '.cycle == $c' >/dev/null 2>&1 \
    || die "the appended row failed read-back validation"

ROW_APPENDED=1
say "Row appended to $LEDGER_FILE (row $after)"

printf '%s\n' "$ROW" > "$CYCLE_EVIDENCE/row.json"

consensus_rc=0
write_consensus || consensus_rc=$?

say ""
say "Evidence: $CYCLE_EVIDENCE"
if [ "$consensus_rc" -ne 0 ]; then
    say "ledger.sh: the row is recorded but consensus.md was NOT stamped. Fix and re-run."
    exit 3
fi
exit 0
