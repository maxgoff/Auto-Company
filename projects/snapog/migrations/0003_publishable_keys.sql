-- SnapOG D1 Schema
-- Migration 0003: publishable keys + domain allowlist + signed URLs
--
-- Why: the documented integration is
--   <meta property="og:image" content=".../og?title=X&key=sk_...">
-- which publishes a bearer secret in the page source of every page. Harvestable
-- at zero cost, lets a stranger burn quota, and rotating means editing every
-- page.
--
-- Fix: split the credential in two. `sk_` stays server-side and keeps full
-- control (dashboard, checkout, billing portal). `pk_` is the embeddable one:
-- it can ONLY render images, and it can be domain-locked and/or require a
-- signature.
--
-- The publishable key lives on the SAME api_keys row as its secret key rather
-- than in a row of its own, so the pair shares one quota and one subscription.
-- Splitting them into separate rows would split monthly_limit and break the
-- billing webhook, which upgrades a single api_key row.
--
-- Additive only; nullable columns with constant defaults (all SQLite/D1 can do).

-- Display prefix of the publishable key, e.g. 'pk_1a2b3c4d'.
ALTER TABLE api_keys ADD COLUMN publishable_prefix TEXT;
-- SHA-256 hex of the full publishable key — the lookup column.
ALTER TABLE api_keys ADD COLUMN publishable_hash TEXT;

-- Comma-separated lowercase hostnames, e.g. 'example.com,blog.example.com'.
-- NULL or empty = unrestricted (we cannot guess a domain at signup time).
-- A bare domain also matches its subdomains.
ALTER TABLE api_keys ADD COLUMN allowed_domains TEXT;

-- When 1, /og refuses any request without a valid `sig` HMAC, regardless of
-- Referer. This is the only protection that holds for social-media crawlers,
-- which fetch og:image with no Referer or Origin header at all.
ALTER TABLE api_keys ADD COLUMN require_signature INTEGER NOT NULL DEFAULT 0;

-- Publishable keys are looked up on every image request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_publishable
  ON api_keys(publishable_hash);
