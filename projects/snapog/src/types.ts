// SnapOG — shared types

export type Tier = 'free' | 'pro' | 'business';

/** Tiers that require a completed Stripe payment. */
export type PaidTier = Exclude<Tier, 'free'>;

/**
 * Monthly UNIQUE RENDERS. Cache hits are free and unmetered, so this is a count
 * of distinct images, not of requests.
 *
 * `free` was 100 — a number chosen to make an upgrade feel necessary. There is
 * no upgrade during the probe (ruling §2 condition 6: "any friction we add
 * corrupts the only measurement we are running"), so its only remaining job is
 * to stop a runaway loop from burning CPU. 10,000 is what the $19 tier used to
 * charge for and is far past anything an honest site reaches in a month.
 *
 * Migration 0004 backfills existing rows; keep the two in step if this changes.
 */
export const TIER_LIMITS: Record<Tier, number> = {
  free: 10_000,
  pro: 10_000,
  business: 100_000,
};

/**
 * Monthly price in USD cents.
 *
 * FROZEN, along with the rest of the Stripe path (ruling §3). Nothing
 * user-facing reads this any more — no page shows a price, no route sells a
 * tier. It survives only because the dormant billing pages reference it. Per
 * ruling §4 the future pricing shape is a flat per-domain licence and the number
 * is set at the 2026-09-08 gate; these two figures are not it.
 */
export const TIER_PRICE_CENTS: Record<Tier, number> = {
  free: 0,
  pro: 1900,
  business: 4900,
};

/**
 * Mirrors Stripe subscription statuses we care about.
 * `null` on a row means "no subscription has ever been attached".
 */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  tier: Tier;
  monthly_limit: number;
  usage_count: number;
  usage_reset_at: string;
  created_at: string;
  // ── Added in migration 0002_billing ──
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  tier_updated_at: string | null;
  // ── Added in migration 0003_publishable_keys ──
  publishable_prefix: string | null;
  publishable_hash: string | null;
  /** Comma-separated hostnames; null/empty = unrestricted. */
  allowed_domains: string | null;
  /** 0 | 1 — D1 has no boolean type. */
  require_signature: number;
}

/** Which half of the credential pair a request presented. */
export type KeyKind = 'secret' | 'publishable';

/**
 * The public demo site identifier, seeded by migration 0004.
 *
 * Published in our own HTML on purpose. Ruling §2 condition 3 says the
 * identifier IS public — it lives in the customer's page source on every page,
 * forever — so there is nothing to protect by hiding this one, and printing it
 * means a stranger can copy a working URL without an email, an account, or a
 * decision. That is the zero-friction path condition 6 demands.
 *
 * Enforcement for real users is the per-domain referrer allowlist, not secrecy.
 * The demo row deliberately has no allowlist, which is exactly why it is labelled
 * as shared and why the page tells people to claim their own.
 */
export const PUBLIC_DEMO_IDENTIFIER = 'pk_demo_snapog_public_2026';

export interface User {
  id: string;
  email: string;
  created_at: string;
  // ── Added in migration 0002_billing ──
  stripe_customer_id: string | null;
}

/** Idempotency ledger for Stripe webhook deliveries. */
export interface WebhookEvent {
  id: string;
  type: string;
  api_key_id: string | null;
  received_at: string;
}

export interface OGParams {
  title: string;
  description?: string;
  theme?: 'dark' | 'light';
  template?: 'default' | 'blog' | 'article';
  author?: string;
  domain?: string;
  tag?: string;
}

export interface Env {
  DB: D1Database;
  OG_CACHE: R2Bucket;
  ENVIRONMENT: string;
  // ── Stripe (set via `wrangler secret put`) ──
  // All optional: when absent, /checkout returns 503 and the rest of the app
  // keeps serving images.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_BUSINESS?: string;
}
