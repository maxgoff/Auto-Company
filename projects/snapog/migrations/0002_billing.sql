-- SnapOG D1 Schema
-- Migration 0002: Stripe billing
--
-- Additive only. D1/SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
-- so these ALTERs are plain — safe because wrangler's d1_migrations table
-- guarantees each migration file runs exactly once per database.
-- All added columns are nullable with no default: that is the only form of
-- ADD COLUMN SQLite can do without rewriting the table.

-- Stripe customer, kept on the user (one customer per email).
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

-- Billing lives on the api_key, because the api_key is what carries the tier
-- and the monthly_limit that /og enforces.
ALTER TABLE api_keys ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE api_keys ADD COLUMN stripe_subscription_id TEXT;
-- active | trialing | past_due | canceled | unpaid | incomplete
--   | incomplete_expired | paused  (NULL = never subscribed)
ALTER TABLE api_keys ADD COLUMN subscription_status TEXT;
-- ISO timestamp of the last tier change (upgrade or downgrade).
ALTER TABLE api_keys ADD COLUMN tier_updated_at TEXT;

-- Webhook events arrive out of order and get retried; look-ups are by
-- subscription id when Stripe sends us a subscription.* event.
CREATE INDEX IF NOT EXISTS idx_api_keys_subscription
  ON api_keys(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_customer
  ON api_keys(stripe_customer_id);

-- Idempotency ledger. Stripe retries every delivery until it gets a 2xx, so a
-- handler that isn't idempotent will double-apply. We claim the event id first
-- and bail out if the claim was already taken.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,          -- Stripe event id, e.g. evt_1A2b3C
  type         TEXT NOT NULL,             -- e.g. checkout.session.completed
  api_key_id   TEXT,                      -- resolved target, when known
  received_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events(received_at);

-- Audit trail of tier changes. Cheap to write, invaluable when a customer
-- claims they were downgraded by mistake.
CREATE TABLE IF NOT EXISTS tier_changes (
  id           TEXT PRIMARY KEY,
  api_key_id   TEXT NOT NULL,
  from_tier    TEXT NOT NULL,
  to_tier      TEXT NOT NULL,
  reason       TEXT NOT NULL,             -- stripe event type that caused it
  stripe_event_id TEXT,
  changed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tier_changes_key
  ON tier_changes(api_key_id);
