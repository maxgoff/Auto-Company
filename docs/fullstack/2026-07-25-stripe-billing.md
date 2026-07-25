# SnapOG — Stripe billing, and closing the paid-tier giveaway

**Date:** 2026-07-25
**Author:** fullstack-dhh
**Status:** Implemented and verified locally. NOT deployed (nobody is authenticated to Cloudflare or Stripe on this machine).

---

## The hole we closed

`POST /register` accepted a `tier` form field and honoured it:

```
curl -X POST /register -d "email=x@y.dev&tier=business"
→ a business key, 100,000 images/month, $0 paid
```

Anyone who read the HTML could self-issue a $49/mo key. The product had no
payment path at all — the Business CTA was a `mailto:`.

**Now:** registration always mints a `free` key. `tier` survives only as
*intent* (which CTA to show next). A paid tier is granted in exactly one place
in the codebase — the Stripe webhook, after money has moved.

Verified:

```
$ curl -s -X POST /register -d "email=attacker@evil.dev&tier=business"
$ wrangler d1 execute snapog-db --local --command "SELECT tier,monthly_limit FROM api_keys"
        "tier": "free",
        "monthly_limit": 100,
```

---

## Files changed

| File | What |
|---|---|
| `src/billing/stripe.ts` | **new** — Stripe REST client over plain `fetch`; checkout + portal sessions; webhook signature verification |
| `src/billing/webhook.ts` | **new** — event application, idempotency claim, upgrade/downgrade/status mutations |
| `src/index.ts` | `/register` forced to free; added `/checkout` (GET+POST), `/webhooks/stripe`, `/billing/success`, `/billing/cancel`, `/billing/portal`; `/health` reports billing config; **fixed a UTC quota-reset bug** |
| `src/types.ts` | `PaidTier`, `TIER_PRICE_CENTS`, `SubscriptionStatus`, billing columns on `ApiKey`, `User`, `WebhookEvent`, Stripe env vars |
| `src/dashboard/pages.ts` | Two-step register flow, payment CTA on key creation, Plan & Billing card, dunning banner, success/cancel/503 pages, HTML escaping |
| `migrations/0002_billing.sql` | **new** — additive billing columns, `webhook_events`, `tier_changes` |
| `wrangler.toml` | Placeholder D1 id that fails loudly; **per-env bindings** (see below); secret documentation |
| `package.json` | `db:remote` was silently migrating *local* — added `--remote` |
| `.gitignore` | **new** — `.dev.vars` was not ignored anywhere in the repo |
| `.dev.vars.example` | **new** — documents the four secrets |

### No `stripe` npm SDK

Deliberate. It pulls Node built-ins, needs `nodejs_compat` shims, and inflates
the bundle. Stripe's API is form-encoded HTTP. Cost of the whole billing layer:

```
before: Total Upload: 2104.67 KiB / gzip: 720.58 KiB   (reported by devops)
after:  Total Upload: 2145.95 KiB / gzip: 729.66 KiB
        → +41 KiB raw, +9 KiB gzip
```

---

## Webhook security

`POST /webhooks/stripe` verifies `Stripe-Signature` before parsing the body:

- HMAC-SHA256 over the literal `{timestamp}.{raw_body}`
- constant-time compare (length check, then XOR accumulate — no early return)
- multiple `v1=` values accepted, so secret rotation doesn't drop events
- timestamps outside ±300s rejected
- no secret → **503**, never a bypass

Handled events: `checkout.session.completed` (upgrade, store customer/subscription
ids), `customer.subscription.deleted` (downgrade to free/100),
`customer.subscription.updated` (plan switch, cancel, dunning),
`invoice.payment_failed` (flag `past_due`, keep access). Unknown types 200 with
`handled: false`.

`checkout.session.completed` also refuses to upgrade unless `payment_status` is
`paid` or `no_payment_required`.

**Idempotency:** every delivery claims its event id via
`INSERT ... ON CONFLICT(id) DO NOTHING` and bails if `meta.changes === 0`. If the
handler throws, the claim is released so Stripe's retry can succeed.

**Out-of-order safety:** `subscription_data[metadata][api_key_id]` is stamped at
checkout, so a `subscription.updated` that arrives *before*
`checkout.session.completed` still resolves to the right key.

---

## Verification — commands actually run, with real output

All local, `wrangler 3.114.17` / miniflare / node v25.2.0.

### Typecheck

```
$ npx tsc --noEmit
EXIT=0
```

### Migrations

```
$ npx wrangler d1 migrations apply snapog-db --local
┌──────────────────┬────────┐
│ 0001_init.sql    │ ✅     │
│ 0002_billing.sql │ ✅     │
└──────────────────┴────────┘
🚣 12 commands executed successfully.

$ ... pragma_table_info('api_keys')
id, user_id, name, key_prefix, key_hash, tier, monthly_limit, usage_count,
usage_reset_at, created_at, stripe_customer_id, stripe_subscription_id,
subscription_status, tier_updated_at
```

Tables: `api_keys, d1_migrations, tier_changes, usage_events, users, webhook_events`.

### workers-og renders in the local runtime — YES

This was the biggest unknown. It works.

```
$ curl -D- -o a.png "/og?title=Fresh...&key=sk_..."
HTTP 200  time=0.501451s
X-Cache: MISS
$ file c.png
PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced
bytes: 19268

$ # second call, same params
HTTP 200  time=0.003343s
X-Cache: HIT
identical bytes: YES
```

MISS 501ms → HIT 3ms, byte-identical. PNG magic confirmed (`211 P N G \r \n 032 \n`).

### Rate limit (429)

Seeded `monthly_limit=1, usage_count=1`:

```
{"error":"Monthly image limit reached","tier":"free","limit":1,
 "upgrade_url":"/checkout?tier=pro&key=sk_limittest"}
HTTP 429
```

### `/checkout` without Stripe → 503

```
$ curl "/checkout?tier=pro&key=sk_..."
{"error":"billing not configured","detail":"Stripe is not set up on this
 deployment. Required secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO,
 STRIPE_PRICE_BUSINESS."}
HTTP 503
```

Browsers (`Accept: text/html`) get the styled 503 page instead. POST behaves the same.

### Signature verification — every forgery rejected

```
forged (right length, one hex digit flipped) → 400 {"reason":"signature mismatch"}
garbage  t=1,v1=deadbeef                     → 400 {"reason":"timestamp outside tolerance (age 1784992503s)"}
no header                                     → 400 {"reason":"missing Stripe-Signature header"}
valid signature, 360s old                     → 400 {"reason":"timestamp outside tolerance (age 360s)"}
valid signature, body tampered after signing  → 400 {"reason":"signature mismatch"}
```

### Happy path + idempotency

```
$ # correctly signed checkout.session.completed
{"received":true,"id":"evt_test_completed_001","handled":true,
 "detail":"api_key 12579725-...: free -> business (limit 100000)"}
HTTP 200

$ # same event id, twice more (Stripe retry)
{"received":true,"duplicate":true,"id":"evt_test_completed_001"}   HTTP 200
{"received":true,"duplicate":true,"id":"evt_test_completed_001"}   HTTP 200

$ SELECT tier,monthly_limit,subscription_status,stripe_customer_id,stripe_subscription_id
"business", 100000, "active", "cus_TEST123", "sub_TEST123"
$ SELECT COUNT(*) FROM tier_changes → 1        # 3 deliveries, 1 change
$ users.stripe_customer_id → "cus_TEST123"      # propagated
```

Paid key then rendered `X-SnapOG-Tier: business` with a different cache key
(watermark removed), 12768 bytes.

### Downgrade, out-of-order, dunning

```
customer.subscription.deleted   → "business -> free (limit 100)", status canceled
customer.subscription.updated   → "free -> pro (limit 10000)"   (resolved via
                                   metadata; subscription id was unknown)
invoice.payment_failed          → "status -> past_due"  (tier/limit preserved)
customer.updated (unknown type) → 200 {"handled":false,"detail":"ignored event type"}
```

### Graceful degradation with all Stripe vars removed

```
/health              → {"billing":"not_configured","webhook":"not_configured"}
/webhooks/stripe     → 503 (correctly signed event still refused — no bypass)
/checkout            → 503
/og                  → 200, X-Cache: MISS, valid 1200x630 PNG
/register            → 200, key issued
/dashboard           → 200, "billing is not configured", zero /checkout links
```

### Build

```
$ npx wrangler deploy --dry-run
Total Upload: 2145.95 KiB / gzip: 729.66 KiB

$ npx wrangler deploy --env production --dry-run
- D1 Databases:  DB: snapog-db (TODO-REPLACE-...)
- R2 Buckets:    OG_CACHE: snapog-og-cache
- Vars:          ENVIRONMENT: "production"
```

Dev server killed after testing.

---

## Bugs found and fixed along the way

### 1. Quota resets were timezone-dependent (revenue leak)

`maybeResetUsage` compared a UTC-stored `usage_reset_at` against
`new Date(y, m, 1)` — which resolves in the **runtime's** timezone. UTC on
Workers, but the host timezone under `wrangler dev`.

Caught because my 429 test returned **HTTP 200 with a PNG**. The DB showed
`usage_reset_at` silently rewritten from `2026-07-01T00:00:00.000Z` to
`2026-07-01T05:00:00.000Z` (CDT midnight) — the reset had fired and refilled a
used-up key.

Fixed with an explicit `startOfUtcMonth()` used by the reset check, by
`/register`, and by the dashboard's "Resets" label (`timeZone: 'UTC'`), so the
date displayed is the date enforced. Production Workers is UTC so this was
mostly latent there, but quota enforcement must not depend on ambient timezone.

### 2. Stored XSS via the email field

`keyCreatedPage` interpolated the email raw, and the validation regex
(`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) happily accepts `<script>alert(1)</script>@evil.dev`.
Added `esc()` and applied it to email, key, key name, tier timestamps and error
messages. Verified: 0 occurrences of raw `<script>`, escaped form present.

### 3. `/checkout` leaked a masked form of our Stripe secret

My own first cut passed Stripe's error message through:
`{"detail":"Invalid API Key provided: sk_test_****************_key"}`. Now logged
server-side, generic message to the client.

### 4. `.dev.vars` was not gitignored anywhere in the repo

Nothing in the root `.gitignore` covered it. One `wrangler secret`-shaped
copy-paste from committing live Stripe keys. Added `projects/snapog/.gitignore`
plus `.dev.vars.example`. Confirmed with `git check-ignore -v .dev.vars`.

### 5. Named environments deployed with zero bindings (reported by devops-hightower)

`d1_databases` / `r2_buckets` / `vars` are **not** inherited by named
environments. `wrangler deploy --env production` was shipping a Worker with no
DB and no R2 — every route would have 500'd on first request. Duplicated the
blocks under `[env.staging]` and `[env.production]`; staging gets its own
database and bucket so test payments can't touch production billing rows.
Verified by dry-run above.

### 6. `npm run db:remote` silently migrated the local DB

`wrangler d1 migrations apply snapog-db` with no `--remote` defaults to local.
Added `--remote`, plus a `db:remote:staging` script.

---

## Frontend

Followed `.claude/skills/frontend-design.md`. The existing "Carbon Terminal"
aesthetic (near-black, amber accent, JetBrains Mono + DM Sans, dot-grid) is
already distinctive and intentional, so the right move was extending that system
with precision rather than inventing a second visual language mid-app.

New components, all in the same vocabulary:

- **Two-step rail** — `[1] Create key ── [2] Payment`, mono micro-caps. The
  `?tier=pro` arrival is never a bait-and-switch: step 2 is visible from step 1.
- **Receipt card** — dashed rules, amber top-edge gradient, itemised lines
  (`Your key today: Free — 100/mo` → `After payment: 10,000/mo`). Money-related
  surfaces get receipt-paper texture; nothing else does.
- **Plan & Billing card** — tier, status pill (colour-coded per Stripe status),
  Manage-billing link, upgrade tiles.
- **Dunning banner** — red, only on `past_due`/`unpaid`/`incomplete`, links to
  the portal.
- **Success page** — tells the truth: celebratory `✓` only when the DB actually
  shows a paid tier, otherwise a "Confirming with Stripe" spinner that
  self-refreshes every 3s (the webhook usually beats the redirect; not always).
- **503 page** — explicitly ours-not-yours, with a per-subsystem status list.
- `prefers-reduced-motion` respected on all new animation.

Upgrade path from `/register?tier=pro` is now: plan summary → free key (must be
saved) → `Pay $19/mo with Stripe →`. The old dashboard CTA pointed at
`/register?tier=pro`, which re-registered a *new* key; it now points at
`/checkout` for the key you're looking at. Usage-based upgrade prompt appears at
≥80% consumed.

Landing page Business CTA changed from `mailto:hello@snapog.dev` to
`/register?tier=business` — self-serve.

---

## Still broken / needed before revenue

1. **Nothing is deployed.** No Cloudflare auth on this machine. `snapog.dev` is
   still a Vercel marketing page and `/og` 404s.
2. **`database_id` is a deliberate TODO** in all three scopes:
   `TODO-REPLACE-run-wrangler-d1-create-snapog-db`. Local dev works (miniflare
   only uses it as a filename); remote deploy fails loudly, which is the point.
   Run `wrangler d1 create snapog-db` and paste the real ids.
3. **Stripe side never touched.** No products, no Prices, no webhook endpoint.
   The four secrets need `wrangler secret put`. The `price_...` ids must be
   *recurring monthly* — a one-time price silently breaks `mode=subscription`.
4. **Never tested against real Stripe.** Signature verification is proven against
   a local HMAC harness that mirrors Stripe's algorithm, and the request path is
   proven by Stripe's own API answering our HTTP call ("Invalid API Key
   provided") — but no real Checkout Session has been created. Run
   `stripe listen --forward-to` + a test-mode purchase before trusting it.
5. **Raw API key travels in `success_url`/`cancel_url`**, so it lands in Stripe's
   session object. Same exposure class as the pre-existing `/dashboard?key=`
   pattern, but worth replacing with a short-lived exchange token when auth gets
   revisited.
6. **No email delivery.** The key is shown once on screen and never sent. Lose
   the tab, lose the key — and there is no "resend"/rotate flow.
7. **Multiple keys per user aren't modelled for billing.** A subscription
   upgrades *one* api_key. A user with two keys who pays once upgrades one of
   them. Fine for launch; revisit if anyone asks.
8. **Cache-hit requests still consume quota.** Intentional today, but a customer
   whose CDN is doing its job will notice they're billed for R2 reads.
9. **No tests.** Everything above was verified by hand with curl. The signing
   harness (`/tmp/stripe-sign.mjs`) should move into the repo as a real test.
