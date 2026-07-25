#!/usr/bin/env bash
# Cycle 8 outreach — post the five non-selling questions as GitHub issues.
#
# This is the send. It is outward-facing, under the operator's real GitHub
# identity, and it is not undoable: closing or deleting an issue does not
# unsend the notification email it generated. It therefore requires an
# explicit human go and is NOT invoked by the autonomous loop.
#
#   ./scripts/outreach/send-cycle8.sh --dry-run   # show exactly what would post
#   ./scripts/outreach/send-cycle8.sh 1           # send message 1 only
#   ./scripts/outreach/send-cycle8.sh all         # send all five
#
# Permalinks are appended to docs/research/outreach/cycle8/SENT.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/docs/research/outreach/cycle8"
SENT="$DIR/SENT.md"

# repo | body file | title
MSG1="aldidstn/Covenant|msg1-covenant.md|Not a bug: what did you learn from Covenant? (from someone who almost built the same thing)"
MSG2="kutcode/trustreply|msg2-trustreply.md|Not a bug: has anyone run TrustReply against a questionnaire they were on the hook to submit?"
MSG3="scorpionus007/QResponder|msg3-qresponder.md|Not a bug: did a real user demand local-first, or did you start from the principle?"
MSG4="rahuliitk/quicktrust|msg4-quicktrust.md|Not a bug: where did the \$20k-\$100k number come from, and has anyone left Vanta for QuickTrust?"
MSG5="degerahmet/q-flow|msg5-qflow.md|Not a bug: did anyone use Q-Flow before you stopped?"

ARG="${1:-}"
case "$ARG" in
  all)                    SELECTED=(1 2 3 4 5) ;;
  1|2|3|4|5)              SELECTED=("$ARG") ;;
  --dry-run)              SELECTED=(1 2 3 4 5) ;;
  *)
    echo "usage: $0 [--dry-run | all | 1..5]" >&2
    exit 64
    ;;
esac

DRY=0
[ "$ARG" = "--dry-run" ] && DRY=1

for n in "${SELECTED[@]}"; do
  var="MSG$n"
  IFS='|' read -r repo body title <<< "${!var}"

  if [ ! -f "$DIR/$body" ]; then
    echo "missing body file: $DIR/$body" >&2
    exit 1
  fi

  if [ "$DRY" = "1" ]; then
    echo "=== [$n] would post to $repo"
    echo "--- title: $title"
    echo "--- body ($(wc -l < "$DIR/$body") lines, $(wc -c < "$DIR/$body") bytes):"
    cat "$DIR/$body"
    echo
    continue
  fi

  echo "posting [$n] -> $repo ..."
  url="$(gh issue create -R "$repo" --title "$title" --body-file "$DIR/$body")"
  echo "  $url"

  if [ ! -f "$SENT" ]; then
    printf '# Cycle 8 outreach — permalinks of messages actually sent\n\n' > "$SENT"
  fi
  printf -- '- [%s] %s — %s — sent %s\n' \
    "$n" "$repo" "$url" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$SENT"
done

if [ "$DRY" = "1" ]; then
  echo "dry run only. Nothing was sent."
else
  echo
  echo "Permalinks recorded in $SENT"
  echo "Next: file every reply verbatim into docs/research/2026-07-25-cycle8-outreach-messages.md section 5."
fi
