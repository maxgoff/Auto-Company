#!/usr/bin/env python3
"""
paygrep — the filter (f) instrument.

CEO Ruling 2026-07-25, clause 10 (canonical filter (f), runs FIRST):

    "before any artifact is written, produce >=3 dated, linked, first-person
     statements from distinct non-affiliated people saying they pay for -- or
     actively want to pay for -- the specific thing. Vendor pricing pages, star
     counts, and market-size reasoning do NOT satisfy it. The exact queries must
     be reported even when empty."

This script is the mechanical half of that gate. It does not decide anything.
It extracts candidate statements from an HN Algolia corpus so a human-readable
report can quote them with author, date, and permalink.

WHY IT IS A SCRIPT AND NOT A NORM
---------------------------------
Filter (f) had been a standing note in `memories/consensus.md` since Cycle 4 and
no cycle ever executed it. Munger, Cycle 5: "a norm has now failed six times --
this is a required COMMAND, not a warning." A gate that must be re-improvised
every cycle is a gate that gets skipped in the cycle that is short on time,
which is exactly the cycle that most needs it.

INPUT
-----
JSONL, one HN Algolia hit per line, as returned by
`https://hn.algolia.com/api/v1/search?...` (`hits[]` splatted one-per-line).
Both `story` and `comment` records are accepted; only records carrying text are
searched (`comment_text`, `story_text`, `title`).

WHAT COUNTS AS A HIT
--------------------
A first-person subject (`I`, `we`, `my company`, `$WORK`, ...) within a short
window of a payment predicate (`pay`, `paid`, `paying`, `subscribe`, `spend`,
`$N/mo`, ...). Two buckets are reported SEPARATELY and must never be merged:

  PAYS   -- reports actually paying today            ("we pay $500/mo for X")
  WOULD  -- reports wanting to pay, no purchase yet  ("I'd pay for this")

`WOULD` is weaker evidence and is labelled so. Filter (f) accepts either, but a
report that shows three WOULDs and calls it demand is misreporting its own
evidence.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It does not judge affiliation. A vendor saying "we charge $99/mo" matches the
same surface pattern as a buyer saying "we pay $99/mo", and only a reader can
tell them apart. Round 3 proved this matters: 25 escrow matches were extracted
and ALL 25 were vendor-voice compliance obligation, not buyer demand -- a real
finding that a stricter regex would have hidden by returning zero. So: extract
generously, quote in full, and let the report do the judging in the open.

USAGE
    python3 scripts/research/paygrep.py /tmp/corp_*.jsonl
    python3 scripts/research/paygrep.py --json corpora/*.jsonl > hits.json
"""

import json
import re
import sys
import glob
import html
import os

# --- first-person subjects -------------------------------------------------
# Deliberately excludes bare "you"/"they" -- second- and third-person reports of
# other people's spending are hearsay and filter (f) asks for first person.
FIRST_PERSON = r"(?:\bI\b|\bwe\b|\bwe're\b|\bwe've\b|\bwe'd\b|\bI'm\b|\bI've\b|\bI'd\b|\bmy (?:company|team|employer|startup|org)\b|\bour (?:company|team|startup|org)\b|\b\$?WORK\b|\bmy \$dayjob\b)"

# --- payment predicates, split by strength ---------------------------------
PAYS = r"(?:pay(?:s|ing|ed)?\b|paid\b|subscribe[sd]?\b|subscription\b|spend(?:s|ing)?\b|spent\b|shell(?:ed)? out\b|are on the\b|bought\b|buy(?:ing)?\b|expens(?:e|ed|ing)\b|budget(?:ed)?\b|invoice[sd]?\b|licen[cs]e[sd]?\b)"
WOULD = r"(?:would (?:gladly |happily )?pay\b|'d (?:gladly |happily )?pay\b|willing to pay\b|happy to pay\b|would (?:buy|subscribe)\b|'d (?:buy|subscribe)\b|take my money\b|shut up and take\b|worth paying\b)"

# A price token near a first-person subject is strong evidence on its own.
PRICE = r"(?:\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b|/\s?(?:mo|month|yr|year|seat|user)\b|\s?(?:per|a)\s?(?:month|year|seat|user)\b)?)"

WINDOW = 60  # characters between subject and predicate


def _compile(pred):
    return re.compile(
        r"%s.{0,%d}?%s" % (FIRST_PERSON, WINDOW, pred),
        re.IGNORECASE | re.DOTALL,
    )


RX_PAYS = _compile(PAYS)
RX_WOULD = _compile(WOULD)
RX_PRICE_NEAR = _compile(PRICE)
RX_PRICE_ANY = re.compile(PRICE)
TAG_RX = re.compile(r"<[^>]+>")


def clean(text):
    """HN comment_text is HTML. Strip tags, unescape entities, collapse space."""
    if not text:
        return ""
    text = TAG_RX.sub(" ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def excerpt(text, match, pad=180):
    """Quote enough context that a reader can judge affiliation themselves."""
    lo = max(0, match.start() - pad)
    hi = min(len(text), match.end() + pad)
    return ("..." if lo else "") + text[lo:hi] + ("..." if hi < len(text) else "")


def permalink(rec):
    oid = rec.get("objectID")
    return "https://news.ycombinator.com/item?id=%s" % oid if oid else ""


def scan_record(rec, corpus):
    text = clean(rec.get("comment_text") or rec.get("story_text") or "")
    title = clean(rec.get("title") or "")
    body = (title + ". " + text) if title and text else (title or text)
    if not body:
        return []

    out = []
    seen_spans = set()
    for kind, rx in (("WOULD", RX_WOULD), ("PAYS", RX_PAYS), ("PRICE", RX_PRICE_NEAR)):
        for m in rx.finditer(body):
            # WOULD wins over PAYS wins over PRICE on the same span.
            key = m.start() // 40
            if key in seen_spans:
                continue
            seen_spans.add(key)
            out.append(
                {
                    "kind": kind,
                    "corpus": corpus,
                    "author": rec.get("author") or "?",
                    "date": (rec.get("created_at") or "")[:10],
                    "points": rec.get("points"),
                    "url": permalink(rec),
                    "story": clean(rec.get("story_title") or rec.get("title") or ""),
                    "quote": excerpt(body, m),
                    "has_price": bool(RX_PRICE_ANY.search(body)),
                }
            )
    return out


def main(argv):
    as_json = "--json" in argv
    paths = []
    for a in argv:
        if a.startswith("--"):
            continue
        paths.extend(glob.glob(a))
    if not paths:
        print("usage: paygrep.py [--json] <corpus.jsonl> ...", file=sys.stderr)
        return 2

    hits = []
    records = 0
    for path in sorted(paths):
        corpus = os.path.basename(path).replace("corp_", "").replace(".jsonl", "")
        with open(path, errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                records += 1
                hits.extend(scan_record(rec, corpus))

    if as_json:
        json.dump(hits, sys.stdout, indent=1)
        return 0

    # Report grouped by corpus; PAYS and WOULD kept visibly separate.
    by_corpus = {}
    for h in hits:
        by_corpus.setdefault(h["corpus"], []).append(h)

    print("paygrep — filter (f) extraction")
    print("corpora: %d | records scanned: %d | candidate statements: %d"
          % (len(paths), records, len(hits)))
    print("=" * 78)
    for corpus in sorted(by_corpus, key=lambda c: -len(by_corpus[c])):
        group = by_corpus[corpus]
        pays = [h for h in group if h["kind"] == "PAYS"]
        would = [h for h in group if h["kind"] == "WOULD"]
        price = [h for h in group if h["kind"] == "PRICE"]
        authors = len({h["author"] for h in group})
        print("\n### %s — %d candidates / %d distinct authors  (PAYS %d · WOULD %d · PRICE %d)"
              % (corpus, len(group), authors, len(pays), len(would), len(price)))
        for h in sorted(group, key=lambda x: {"WOULD": 0, "PAYS": 1, "PRICE": 2}[x["kind"]]):
            print("  [%s] %s  %s  %s" % (h["kind"], h["date"], h["author"], h["url"]))
            print("      %s" % h["quote"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
