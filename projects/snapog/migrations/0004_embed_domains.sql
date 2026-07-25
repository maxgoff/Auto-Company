-- SnapOG D1 Schema
-- Migration 0004: embed-domain probe + generous free limit
--
-- CEO ruling 2026-07-25 (docs/ceo/2026-07-25-snapog-ruling.md), §2 conditions 4
-- and 6. SnapOG is no longer a paid product; it is a free demand probe that
-- exists to measure exactly ONE number:
--
--     distinct third-party apex domains with a live embed of our /og URL
--
-- The Ledger (memories/ledger.jsonl, §7) reads that number and an agent is
-- forbidden to author it, so this table has to be cheap to query and impossible
-- for us to inflate.

-- ── One row per apex domain, upserted. NOT an events table. ──────────────────
--
-- An events table (one row per request) would make the Ledger's query a
-- COUNT(DISTINCT) over unbounded rows that grows forever, on the hot path of
-- every image request. This is a counter table: at most a few hundred rows ever,
-- COUNT is a trivial scan, and there is nothing to prune.
--
-- `is_foreign` is the whole design. Exclusion (our own hosts, our own tooling)
-- is decided in the Worker at WRITE time, where we actually know the request's
-- Host and User-Agent, and frozen into this column. The Ledger then filters on
-- one integer and needs no knowledge of our domains. Two copies of that
-- knowledge is one copy too many, and the copy that rots silently is the SQL.
CREATE TABLE IF NOT EXISTS embed_domains (
  -- Apex domain (e.g. 'example.co.uk', 'alice.github.io'), or one of the four
  -- bucket sentinels: '(none)' '(invalid)' '(ip)' '(local)'. Sentinels are
  -- parenthesised because a real hostname can never contain '(' — see
  -- src/analytics/embed.ts.
  apex        TEXT PRIMARY KEY,
  -- Which HEADER produced it: 'referer' | 'origin' | 'none'. Not a verdict about
  -- the value — a malformed Referer is source='referer', apex='(invalid)'.
  -- Written once, never updated, so it reflects how we FIRST saw this domain.
  source      TEXT NOT NULL,
  -- 1 = counts toward the probe. 0 = a bucket, our own host, or our own tooling.
  is_foreign  INTEGER NOT NULL DEFAULT 0,
  hits        INTEGER NOT NULL DEFAULT 0,
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The Ledger's query is `WHERE is_foreign = 1`. With a table this small SQLite
-- would scan anyway, but the index makes the intent explicit and keeps the query
-- cheap if the probe succeeds beyond expectation.
CREATE INDEX IF NOT EXISTS idx_embed_domains_foreign
  ON embed_domains(is_foreign);

-- ── Condition 6: generous free limit, no payment path, no upgrade wall ───────
--
-- "Any friction we add corrupts the only measurement we are running."
-- 100/month was sized to sell an upgrade. There is no upgrade to sell during the
-- probe, so the limit's only remaining job is to stop a runaway loop from
-- burning CPU — 10,000 UNIQUE RENDERS a month (cache hits are free and
-- unmetered) is far past anything an honest site reaches, and is the number the
-- old $19 tier charged for.
UPDATE api_keys SET monthly_limit = 10000 WHERE tier = 'free' AND monthly_limit = 100;

-- ── The public demo identifier ───────────────────────────────────────────────
--
-- Seeded, not generated, so the landing page can show a URL that works the
-- instant a stranger pastes it — no signup, no email, no wall between a
-- stranger and an embed. This is the zero-friction path condition 6 demands.
--
-- The raw value is PUBLISHED IN OUR OWN HTML on purpose. That is not a leak; it
-- is condition 3 taken seriously. `key_hash` below is sha256 of a value nobody
-- may use for anything: it is not a working secret key, it exists only because
-- the column is NOT NULL UNIQUE and the demo row needs a placeholder there.
--
--   publishable identifier : pk_demo_snapog_public_2026
--   sha256(identifier)     : 0e756c1d...  (the publishable_hash below)
--
-- Limit is 50,000 so that someone hammering the demo cannot starve it and make
-- honest visitors see the paused-image placeholder — a placeholder on a
-- stranger's first look at us would corrupt the measurement far more than the
-- CPU costs.
INSERT OR IGNORE INTO users (id, email)
VALUES ('00000000-0000-4000-8000-00000000d3m0', 'demo@snapog.invalid');

INSERT OR IGNORE INTO api_keys (
  id, user_id, name, key_prefix, key_hash, tier, monthly_limit, usage_count,
  usage_reset_at, publishable_prefix, publishable_hash, allowed_domains,
  require_signature
) VALUES (
  '00000000-0000-4000-8000-00000000key0',
  '00000000-0000-4000-8000-00000000d3m0',
  'public demo',
  'demo-no-sk-',
  'demo-row-has-no-usable-secret-key-0000000000000000000000000000',
  'free',
  50000,
  0,
  strftime('%Y-%m-01T00:00:00.000Z', 'now'),
  'pk_demo_sna',
  '0e756c1d2351630d12b7e44c88fc50033ec2c9c47ce87ec4811b455f48ca7481',
  NULL,
  0
);
