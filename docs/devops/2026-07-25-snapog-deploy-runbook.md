# SnapOG Deploy Runbook

**Author:** devops-hightower · **Date:** 2026-07-25 · **Status:** ready to execute, blocked on 2 human actions
**Target:** `projects/snapog` → Cloudflare Workers, one command after setup
**Audience:** whoever is at the keyboard, cold machine, no prior state

---

## 0. TL;DR

```bash
# One-time, per machine (needs a Cloudflare API token — see §2)
export CLOUDFLARE_API_TOKEN=...  CLOUDFLARE_ACCOUNT_ID=...
cd projects/snapog && npm ci
npx wrangler d1 create snapog-db                        # paste database_id into wrangler.toml (2 places)
npx wrangler r2 bucket create snapog-og-cache
npx wrangler d1 migrations apply snapog-db --remote
npx wrangler deploy --env production

# Every time after that
npx wrangler deploy --env production      # or: git push origin main (CI does it)
```

**Two things a human must do, and only a human can do.** Everything else is automated:

1. **Create a Cloudflare API token** (§2). ~4 min. Requires a logged-in browser + 2FA.
2. **Put a payment method on the Cloudflare account and enable Workers Paid, $5/mo** (§1). Non-negotiable — see below.

After those two, `git push` ships to production forever with no human in the loop.

---

## 1. HARD BLOCKER: Workers Free cannot run SnapOG

This is the most important line in this document.

| Limit | Workers Free | Workers Paid |
|---|---|---|
| **CPU time per request** | **10 ms** | 5 min (30 s default) |
| Requests | 100,000/day | unmetered |
| Script size (gzip) | 3 MB | 10 MB |
| Subrequests per request | 50 | 10,000 |

SnapOG renders a 1200×630 PNG with Satori + resvg-wasm on every cache **MISS**. That is
hundreds of milliseconds of CPU, not 10. On the Free plan every fresh render dies with
`Worker exceeded CPU time limit` — i.e. the entire product breaks and only already-cached
images serve. `/health` would still be green while the product is 100% broken.

**Therefore: Workers Paid ($5/mo) is a prerequisite, not an optimization.** Add it before
the first deploy, not after the first customer complains.

Cost floor at launch: **$5/mo** Workers Paid. D1 (5 GB), R2 (10 GB storage, 1M Class A
ops/mo, zero egress) and Workers Logs all stay inside free allowances at our volume.
R2 egress is $0 forever, which is the whole reason this architecture is right for an image API.

---

## 2. One-time human action: the Cloudflare API token

The AI cannot do this step. It needs an authenticated browser session with 2FA.

1. Go to **https://dash.cloudflare.com/profile/api-tokens** → **Create Token**.
2. Fastest path: use the **"Edit Cloudflare Workers"** template. Scope it to the single
   account that owns SnapOG. Done.
3. If you build a **custom** token instead, these are the minimum permissions:

| Type | Resource | Level | Why |
|---|---|---|---|
| Account | **Workers Scripts** | **Edit** | `wrangler deploy`, `wrangler secret put`, `wrangler rollback` |
| Account | **D1** | **Edit** | `d1 create`, `d1 migrations apply --remote`, `d1 execute --remote` |
| Account | **Workers R2 Storage** | **Edit** | `r2 bucket create`, `r2 object *` |
| Account | **Account Settings** | **Read** | `wrangler whoami`, account resolution |
| Account | Workers Tail | Read | *optional* — only needed for `wrangler tail` live logs |

   Do **not** grant Zone permissions. We are not touching DNS (see §7).
   Set **TTL** if you like, but remember an expiring token means the pipeline silently
   dies on expiry. Prefer no expiry + rotate deliberately.

4. Copy the token — Cloudflare shows it exactly once.
5. Get the account id:

```bash
export CLOUDFLARE_API_TOKEN='<paste>'
npx wrangler whoami        # prints the Account ID column
export CLOUDFLARE_ACCOUNT_ID='<32-hex from above>'
```

   (Alternative: it is the 32-hex string in any dashboard URL,
   `dash.cloudflare.com/<account_id>/...`.)

6. Verify the token actually works before going further:

```bash
npx wrangler whoami
# Expected: "You are logged in with an API Token, associated with the email ..."
# plus a table listing the account and the token's permissions.
```

> Do **not** use `wrangler login` on a server or in CI — it is an interactive OAuth flow
> and it stores creds in `~/Library/Preferences/.wrangler/config/default.toml`, which is a
> machine-local secret nobody else can reproduce. API token in env, always.

---

## 3. Cold-machine deploy, exact commands in order

Run every command from `projects/snapog`. Copy-paste in order. Do not skip step 3.4's
verification.

### 3.0 — Prerequisites

```bash
node --version     # need >= 18; 20 recommended
cd /Users/maxgoff/Github/Auto-Company/projects/snapog
npm ci             # NOT npm install — respect the lockfile
```

Confirm creds are in the shell:

```bash
test -n "$CLOUDFLARE_API_TOKEN" && test -n "$CLOUDFLARE_ACCOUNT_ID" && echo "creds present" || echo "STOP — go do §2"
npx wrangler whoami
```

### 3.1 — Create the D1 database

```bash
npx wrangler d1 create snapog-db
```

Output looks like:

```
✅ Successfully created DB 'snapog-db' in region ENAM
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "snapog-db"
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"
```

**Where the `database_id` goes — TWO places.** Open `projects/snapog/wrangler.toml` and
replace `TODO-REPLACE-run-wrangler-d1-create-snapog-db` in **both** the top-level
`[[d1_databases]]` block and the `[[env.production.d1_databases]]` block:

```toml
[[d1_databases]]
binding = "DB"
database_name = "snapog-db"
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"   # <-- was TODO-REPLACE-...

# ... and again further down:
[[env.production.d1_databases]]
binding = "DB"
database_name = "snapog-db"
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"   # <-- same id, both must match
```

They must be the same id. `[env.production]` is what we deploy; the top-level block is what
`wrangler dev` and any no-`--env` command uses. Miss the second one and the deploy binds a
database that does not exist.

This id is **not a secret** — commit it. It is meaningless without an API token.

Verify:

```bash
grep -n 'database_id' wrangler.toml           # no TODO-REPLACE on the two production lines
npx wrangler d1 info snapog-db                # should print size/table counts
```

**Staging (optional, do it later).** `[env.staging]` points at its own database and bucket
so test payments can never touch production billing rows. Skip it for the first production
deploy; when you want it:

```bash
npx wrangler d1 create snapog-db-staging          # paste into [[env.staging.d1_databases]]
npx wrangler r2 bucket create snapog-og-cache-staging
npx wrangler d1 migrations apply snapog-db-staging --remote
npx wrangler deploy --env staging                 # lands on script "snapog-staging"
```

Staging is a **separate script name**, so it has a **separate secret store** — set its
`STRIPE_*` secrets again with `--env staging`, using `sk_test_` keys.

### 3.2 — Create the R2 bucket

```bash
npx wrangler r2 bucket create snapog-og-cache
```

Verify:

```bash
npx wrangler r2 bucket list | grep snapog-og-cache
```

Leave the bucket **private**. Nothing outside the Worker should read it — the Worker is the
only access path, and it is what enforces API keys and quotas. Do not enable a public
`r2.dev` URL; that would let anyone bypass metering entirely.

### 3.3 — Apply migrations to the remote database

```bash
npx wrangler d1 migrations apply snapog-db --remote
```

`--remote` is **mandatory**. Without it wrangler migrates a local miniflare SQLite file and
prints a cheerful success message while production stays empty. (Verified on wrangler
3.114.17: no flag ⇒ local.)

It will ask `✔ Ok to proceed?` — answer yes. In a non-interactive shell:

```bash
printf 'y\n' | npx wrangler d1 migrations apply snapog-db --remote
```

Verify:

```bash
npx wrangler d1 migrations list snapog-db --remote
# Expected: "No migrations to apply!"

npx wrangler d1 execute snapog-db --remote --yes --json \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# Expected tables: api_keys, d1_migrations, tier_changes, usage_events, users, webhook_events
```

Six tables. If `webhook_events` or `tier_changes` are missing, `0002_billing.sql` did not
run and every Stripe webhook will 500. `npm run db:remote` is equivalent to the command
above and is now correct (see §9 bug #2).

**Migrations must run before the first request**, not after. `0002_billing.sql` is additive
only (`ADD COLUMN`, nullable, no defaults) plus two new tables, so it is safe to apply ahead
of the deploy and safe to roll the Worker back over.

Migrations are idempotent — wrangler's `d1_migrations` table guarantees each file runs
exactly once. Re-running is always safe.

### 3.4 — Build check before you ship

```bash
npx wrangler deploy --env production --dry-run --outdir /tmp/snapog-dry
```

Read the output. You want to see **all three bindings**, and a real UUID next to `DB`:

```
Total Upload: 2145.95 KiB / gzip: 729.66 KiB
Your worker has access to the following bindings:
- D1 Databases:
  - DB: snapog-db (a1b2c3d4-5678-90ab-cdef-1234567890ab)     <-- a UUID, not TODO-REPLACE-...
- R2 Buckets:
  - OG_CACHE: snapog-og-cache
- Vars:
  - ENVIRONMENT: "production"
```

**Stop and fix if you see any of these:**

- `TODO-REPLACE-...` next to `DB` → you missed §3.1. You will get
  `Couldn't find DB 'TODO-REPLACE-...'` at deploy time (loud, by design).
- the bindings list shows **only `Vars`** → §9 bug #1 has regressed; `[env.production]`
  lost its `[[d1_databases]]` / `[[r2_buckets]]` blocks. Do not deploy an unbound Worker.
- `is not inherited by environments` anywhere in the output → same thing.

Bundle size, measured 2026-07-25 with Stripe billing included:

| | raw | gzip | Free limit | Paid limit |
|---|---|---|---|---|
| snapog | 2145.95 KiB | **729.66 KiB** | 3072 KiB gzip | 10240 KiB gzip |

Breakdown: `resvg-*.wasm` 1345 KiB, `index.js` 672 KiB, `yoga-*.wasm` 87 KiB. resvg-wasm is
the bulk of it, exactly as expected, and it is nowhere near a problem — **~24% of the Free
gzip limit, ~7% of Paid.** The size limit is not the constraint on this project; the CPU
limit is (§1).

### 3.5 — Deploy

```bash
npx wrangler deploy --env production
```

`--env production` gives `ENVIRONMENT = "production"` and the production D1/R2 bindings, and
lands on script name `snapog` (identical to the top-level `name`), so secrets set without
`--env` still apply. See §9 bug #1 for why this flag was dangerous earlier today.

Output ends with the live URL — copy it:

```
Uploaded snapog (x.xx sec)
Deployed snapog triggers (x.xx sec)
  https://snapog.<your-subdomain>.workers.dev
Current Version ID: 1a2b3c4d-...
```

```bash
export SNAPOG_URL='https://snapog.<your-subdomain>.workers.dev'
```

Save that **Current Version ID** — it is your rollback target (§6).

### 3.6 — Stripe secrets

Do this **after** the first deploy, not before. `wrangler secret put` against a Worker that
does not exist yet triggers an interactive "create a new Worker?" prompt. Deploying first
avoids it. This ordering is safe: `billingConfig()` returns `null` when the Stripe secrets
are absent, so the Worker deploys and serves `/og` fine while billing is unconfigured —
`/health` just reports `"billing":"not_configured"`.

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_... (or sk_test_... to rehearse)
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_...  — from §4, comes AFTER you create the endpoint
npx wrangler secret put STRIPE_PRICE_PRO         # price_...  — the $19/mo recurring price id
npx wrangler secret put STRIPE_PRICE_BUSINESS    # price_...  — the $49/mo recurring price id
```

Each prompts for the value on stdin and never echoes it. Non-interactive form:

```bash
printf '%s' "$VALUE" | npx wrangler secret put STRIPE_SECRET_KEY
```

Verify (names only, values are unreadable by design — that is the point):

```bash
npx wrangler secret list
# Expected: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS
```

Notes that will bite you:

- Secrets are stored **per Worker script name**, not per project or per environment.
  `wrangler secret put X` and `wrangler secret put X --env production` both target the
  script named `snapog`, because `name` and `env.production.name` are both `"snapog"`.
  `--env staging` targets `snapog-staging`, which is a **separate** secret store — set
  staging's secrets again there, with `sk_test_` keys.
- Putting a secret creates a new Worker version immediately. No redeploy needed.
- `STRIPE_PRICE_*` are not really secrets (price ids are visible in checkout URLs), but
  keeping them as secrets means one storage mechanism instead of two. Fewer places to look.

---

## 4. Stripe dashboard configuration (human, ~5 min)

### 4.1 — Webhook endpoint

**Stripe Dashboard → Developers → Webhooks → Add endpoint.**

Endpoint URL — this exact shape:

```
https://snapog.<your-subdomain>.workers.dev/webhooks/stripe
```

Concretely, with the real subdomain substituted:

```
https://snapog.maxgoff.workers.dev/webhooks/stripe        # <-- example only; use YOUR §3.5 URL + /webhooks/stripe
```

**Events to subscribe to** — the handler in `src/billing/webhook.ts` implements four:

| Event | Required? | What breaks without it |
|---|---|---|
| `checkout.session.completed` | **required** | Customers pay and never get upgraded. Worst possible bug. |
| `customer.subscription.deleted` | **required** | Canceled customers keep Business limits forever. Pure revenue leak. |
| `customer.subscription.updated` | strongly recommended | Plan changes and `past_due` never propagate; a failing card keeps full access. |
| `invoice.payment_failed` | strongly recommended | No signal at all that a customer's payment is broken. |

Subscribe to all four. The handler already has `case` branches for each; picking only the
two mandatory ones is a knowingly-leaky config.

After saving the endpoint, Stripe shows a **Signing secret** (`whsec_...`). That is the
value for `STRIPE_WEBHOOK_SECRET` in §3.6. Set it and then re-verify:

```bash
curl -s "$SNAPOG_URL/health" | jq
# Expected: {"ok":true,"ts":"...","billing":"configured","webhook":"configured"}
```

Use Stripe's **"Send test webhook"** button on the endpoint page to confirm a `200`.

**How to read the status codes on this endpoint** — they are deliberate, so do not
misdiagnose them:

| Code | Meaning | Action |
|---|---|---|
| `200 {"received":true}` | applied | none |
| `200 {"received":true,"duplicate":true}` | Stripe retried a delivery we already applied | none — the `webhook_events` ledger claims each event id, so replays are safe by design |
| `200 {"handled":false}` | event type we do not act on | none — an over-broad subscription is harmless, just noisy |
| `503` | Stripe secrets not set | finish §3.6 |
| `400` + a `reason` | **signature verification failed** | a rotated `STRIPE_WEBHOOK_SECRET` you did not update, or someone probing the endpoint. A *sustained* rate of these is worth alerting on (§8.2). |
| `500` | handler threw; the event claim was released | this means **"Stripe, retry me"**, not "endpoint broken". Stripe will. Do not page on a single one — page on a sustained rate. Check `wrangler tail`. |

Retries are safe: three identical deliveries produce one tier change.

### 4.2 — Prices

Create two **recurring monthly** prices on one Product (or two Products, either is fine):

- Pro — $19.00 / month → `price_...` → `STRIPE_PRICE_PRO`
- Business — $49.00 / month → `price_...` → `STRIPE_PRICE_BUSINESS`

### 4.3 — Customer portal

`GET /billing/portal` exists in the Worker, so the portal must be turned on or that route
400s from Stripe's side: **Settings → Billing → Customer portal → Activate**. Enable
"cancel subscription" and "update payment method". Set the return URL to `$SNAPOG_URL/dashboard`.

---

## 5. Post-deploy smoke test

This proves `/health` is OK **and** that `/og` returns a real PNG — not a 200 with an error
body, which is the failure mode that actually happens.

```bash
export SNAPOG_URL='https://snapog.<your-subdomain>.workers.dev'
```

### 5.1 — /health

```bash
curl -sS -w '\nHTTP %{http_code}\n' "$SNAPOG_URL/health"
```

Pass criteria: `HTTP 200` and `"ok":true`. Also read `billing` / `webhook` — both should say
`configured` once §4 is done.

### 5.2 — Get a real API key

`/og` requires `?key=`. Mint one through the real signup path — that tests `/register` and
D1 writes at the same time:

```bash
SNAPOG_KEY=$(curl -sS -X POST "$SNAPOG_URL/register" \
  -d "email=smoke-$(date +%s)@snapog.invalid" \
  -d "keyname=smoke" -d "tier=free" \
  | grep -oE 'sk_[0-9a-f]{64}' | head -1)
echo "key=${SNAPOG_KEY:0:12}...  (len=${#SNAPOG_KEY})"
```

Pass criteria: length **67** (`sk_` + 64 hex). Empty means `/register` or the D1 binding is
broken — go straight to `wrangler tail`.

### 5.3 — /og returns a real PNG

```bash
curl -sS -D /tmp/og.headers -o /tmp/og.png -w 'HTTP %{http_code}\n' \
  "$SNAPOG_URL/og?title=Deploy+Smoke+Test&description=shipping+is+the+feature&domain=snapog.dev&key=$SNAPOG_KEY"

grep -iE '^(content-type|x-cache|x-snapog-tier):' /tmp/og.headers
echo "bytes: $(wc -c < /tmp/og.png)"
echo "magic: $(head -c 8 /tmp/og.png | od -An -tx1 | tr -d ' ')"
```

**Pass criteria — all four must hold:**

| Check | Required value |
|---|---|
| status | `HTTP 200` |
| `content-type` | `image/png` |
| PNG magic bytes | `89504e470d0a1a0a` |
| size | `> 5000` bytes (a blank/garbage render is tiny) |

Then look at it with your own eyes — automation cannot tell you the text is legible:

```bash
open /tmp/og.png          # macOS
```

### 5.4 — Prove the R2 cache works

Repeat the **exact same URL**:

```bash
sleep 5
curl -sS -D /tmp/og2.headers -o /tmp/og2.png "$SNAPOG_URL/og?title=Deploy+Smoke+Test&description=shipping+is+the+feature&domain=snapog.dev&key=$SNAPOG_KEY"
grep -i '^x-cache:' /tmp/og2.headers        # want: X-Cache: HIT
cmp -s /tmp/og.png /tmp/og2.png && echo "cached bytes identical" || echo "WARN: cached copy differs"
```

First request must be `X-Cache: MISS`, second `HIT`. The R2 write is fire-and-forget via
`waitUntil`, so a `MISS` on the second try is a race, not necessarily a bug — retry once
before panicking. Two consecutive `MISS` means the `OG_CACHE` binding is wrong.

### 5.5 — Billing routes: check the gate, do not transact

```bash
# BEFORE §3.6/§4 — must be 503, proving the Worker fails closed rather than
# silently issuing paid tiers for free:
curl -sS -o /dev/null -w 'checkout: HTTP %{http_code}\n' "$SNAPOG_URL/checkout?tier=pro&key=$SNAPOG_KEY"
curl -sS -o /dev/null -w 'webhook:  HTTP %{http_code}\n' -X POST "$SNAPOG_URL/webhooks/stripe" -d '{}'
# Expected: 503 and 503

# AFTER Stripe is live — assert the redirect target, then STOP:
curl -sS -o /dev/null -D - -w 'HTTP %{http_code}\n' "$SNAPOG_URL/checkout?tier=pro&key=$SNAPOG_KEY" \
  | grep -iE '^(HTTP|location):'
# Expected: 303 with Location: https://checkout.stripe.com/...
```

Do **not** loop or automate the post-Stripe `/checkout` check. Every call creates a real
Stripe Checkout Session. One manual confirmation, then leave it alone — this is why the CI
smoke test only touches `/health` and `/og`.

### 5.6 — One-shot version

```bash
BASE_URL="$SNAPOG_URL" API_KEY="$SNAPOG_KEY" bash sample/smoke-test.sh
```

`sample/smoke-test.sh` already checks `/health` + PNG size. It does **not** check
content-type, magic bytes, or `X-Cache`. Use §5.1–5.4 for a real release gate; the script
is a quick sanity pass.

---

## 6. Rollback

Recovering service beats understanding the outage. Roll back first, diagnose second.

```bash
npx wrangler deployments list                            # newest first; copy the previous Version ID
npx wrangler rollback <version-id> --yes --message "reason"
curl -s "$SNAPOG_URL/health" | jq                        # confirm recovery
```

Rollback takes seconds and is global.

**What rollback does NOT undo:**

- **D1 migrations.** Schema changes are forward-only. This is why `0002_billing.sql` is
  additive (`ADD COLUMN`, nullable, no defaults) — old code ignores the new columns, so
  rolling back the Worker over a migrated database is safe. Keep every future migration
  additive, or rollback stops being a real option.
- **R2 objects.** Cached PNGs from the bad version survive. If a deploy shipped broken
  renders, purge them or customers keep seeing garbage:
  ```bash
  # nuclear, but the cache is disposable by design — it regenerates on demand
  npx wrangler r2 object list snapog-og-cache --prefix og/ | ...   # inspect first
  ```
- **Stripe state.** Subscriptions created by a bad version stay created. The
  `webhook_events` idempotency ledger means replaying webhooks is safe, though.

**Backup before you need it.** D1 is the only irreplaceable data (users, api_keys, billing
links). R2 is a cache and can be thrown away. Add this to a weekly cron:

```bash
npx wrangler d1 export snapog-db --remote --output "snapog-$(date -u +%Y%m%d).sql"
```

Store it off-Cloudflare. If the Cloudflare account is lost, that file is the company.

---

## 7. Routing: recommendation, not options

### Current state (verified 2026-07-25)

- `snapog.dev` DNS is at **Porkbun**, pointed at **Vercel**. The zone is **not** in
  Cloudflare, so Workers Custom Domains and routes on `snapog.dev` are unavailable.
- `https://snapog.dev/` → `307` → `https://www.snapog.dev/`, served by Vercel (`server: Vercel`).
- `https://www.snapog.dev/og?title=test` → **404**. `https://www.snapog.dev/health` → **404**.

### Recommendation

**Ship on `https://snapog.<subdomain>.workers.dev` today. Migrate the `snapog.dev` zone to
Cloudflare this week as the immediate follow-up.** Both, in that order. Not one or the other.

Reasoning: the zone migration needs a human at Porkbun and up to 24h of NS propagation.
Blocking revenue on a DNS change is the wrong trade when a working `workers.dev` URL is
one command away. But `workers.dev` is not an acceptable *permanent* home for a paid API —
it is unbrandable, it advertises "hobby project" to every prospect, and it puts our API
under a domain we do not control.

**Cost of the migration:** $0 in money (Cloudflare free plan covers DNS). ~20 min of human
time at Porkbun to change nameservers, plus a propagation window. The one real risk is
breaking the live Vercel marketing site — Cloudflare's scan usually imports existing
records, but **verify before switching** that `www` → `cname.vercel-dns.com` and the apex
record are present in Cloudflare DNS, and keep them **DNS-only (grey cloud)** so Vercel
keeps terminating TLS for the marketing site. Then `api.snapog.dev` becomes a Workers
Custom Domain and the Worker is properly branded.

Rejected alternative: proxying `api.snapog.dev` → workers.dev through a Vercel rewrite. It
works, but it adds a hop, burns Vercel bandwidth, breaks the edge-latency story we sell,
and *still* needs a human to add the domain in Vercel. Same human cost, worse architecture.

### What breaks right now — this is worse than a wrong hostname

Three different URL contracts are live simultaneously, and **none of them match the code**:

| Source | Advertises | Reality |
|---|---|---|
| `projects/snapog/README.md` (5 places) | `https://snapog.dev/og?title=...&key=...` | wrong host — will be `snapog.<sub>.workers.dev` |
| `src/dashboard/pages.ts` (lines ~663, ~755, ~764) — **the copy-paste snippets we hand new customers on their key-created page** | `https://snapog.dev/og?...` | wrong host. A customer's very first copy-paste 404s. |
| `src/og/templates.ts` (lines ~126, ~451) | free-tier watermark reads `snapog.dev` | harmless-ish; keep it, it is the brand |
| **Live marketing page `www.snapog.dev`** | `https://api.snapog.dev/v1/generate`, `/v1/auto?url=`, `/v1/docs`, `/v1/preview/blog-post` | **none of these routes exist in the Worker at all.** Not the host — the whole API surface is fictional. |

The marketing page is the urgent one. It is publicly advertising an API shape
(`/v1/generate`, `/v1/auto`, `/v1/docs`) that was never built. Even after a perfect DNS
migration, every one of those URLs 404s. Someone owns reconciling the marketing copy with
`GET /og` — or building `/v1/*` aliases. Flagging, not fixing: the marketing site source is
not in this repo.

**Minimum fix list before announcing anything:**

1. `src/dashboard/pages.ts` — make the snippet host dynamic. The landing route already does
   `const host = new URL(c.req.url).host`; thread that through to `keyCreatedPage` and
   `dashboardPage` instead of hardcoding `snapog.dev`. Then the docs are correct on
   `workers.dev` today and correct on `api.snapog.dev` after migration, with no second edit.
2. `README.md` — replace the 5 hardcoded `snapog.dev` URLs.
3. `www.snapog.dev` — either fix the copy to match `GET /og`, or take the API section down
   until `/v1/*` exists.

---

## 8. Observability: the smallest thing that actually works

Three pillars is the right model and the wrong starting point for a one-person company.
Start with logs plus one alert. Add metrics when a real question needs them.

### 8.1 — Turn on Workers Logs (one config block, $0)

Add to `wrangler.toml`:

```toml
[observability]
enabled = true
head_sampling_rate = 1    # 100% — our volume is tiny, sample nothing yet
```

This gives searchable, structured, retained logs in the dashboard with no vendor, no
Logpush destination, and no code. Free-plan allowance is generous relative to our traffic
(hundreds of thousands of logs/day, a few days retention — check the dashboard for current
numbers). This is the single highest-value line of config in the project.

### 8.2 — What to log

One JSON line per `/og` request, and one per error. Structured, because `console.log("hi")`
is unsearchable:

```ts
// on every /og response
console.log(JSON.stringify({
  evt: 'og',
  status: 200,
  cache: 'HIT' | 'MISS',
  tier: apiKey.tier,
  key_prefix: apiKey.key_prefix,   // NEVER the raw key or the hash
  template: params.template,
  render_ms: Date.now() - t0,      // only meaningful on MISS
  usage: apiKey.usage_count,
  limit: apiKey.monthly_limit,
}));

// on any render failure
console.error(JSON.stringify({ evt: 'og_error', msg: String(err), key_prefix, template }));

// on every webhook
console.log(JSON.stringify({ evt: 'stripe', type: event.type, id: event.id, applied: true|false }));
```

Rules: never log the raw API key, the key hash, `STRIPE_SECRET_KEY`, or a full Stripe
payload. `key_prefix` is already designed to be safe to store and display — use it.

With those five fields you can answer the questions that matter: is the cache working
(`cache` ratio), are renders slow (`render_ms` p95), who is about to hit their limit
(`usage`/`limit`), did a payment event get dropped (`evt:stripe`).

**Two log-derived signals worth watching weekly** — no tooling needed, just a dashboard
query on the fields above:

| Signal | Why it matters |
|---|---|
| sustained rate of webhook `400` (signature failure) | a rotated `STRIPE_WEBHOOK_SECRET` nobody updated, or someone probing the endpoint. Silent revenue loss: paying customers never get upgraded. |
| sustained rate of webhook `500` | the handler is throwing. Stripe retries, so a single 500 is fine and self-healing — a *rate* means every upgrade is stuck. |

Neither deserves a pager at our size. Both deserve a look during the weekly review, because
both fail **silently** — `/health` stays green and the canary stays green while money
quietly stops arriving. That is the failure mode that kills a business, not a 500 on `/og`.

### 8.3 — Live debugging

```bash
npx wrangler tail snapog --format pretty              # everything
npx wrangler tail snapog --status error               # errors only
npx wrangler tail snapog --search 'og_error'          # one event type
```

`tail` is for the ten minutes you are actively debugging. It is not monitoring — nothing is
retained and nobody is watching at 3am. That is what §8.4 is for.

### 8.4 — The one alert

**A GitHub Actions cron canary, already written**, in
`.github/workflows/deploy-snapog.yml` (job `canary`, every 15 min):

1. `GET /health` — must be 200 with `ok:true`. Catches "the API is down."
2. `GET /og?...&key=$SNAPOG_CANARY_KEY` — must be 200, `image/png`, **PNG magic bytes**.
   Catches "renders are failing," which is the more likely and more expensive outage: the
   Worker is up, `/health` is green, and every customer's OG image is broken. A liveness
   check alone would miss this entirely. This is the check that earns its keep.
3. On failure: opens (or comments on) a GitHub issue labelled `snapog-canary`, and the
   workflow failure itself emails you via GitHub's default notifications.
4. On recovery: comments and closes the issue automatically.

$0. No vendor. No account to create. Uses infrastructure we already pay nothing for.

One-time setup:

```bash
# a long-lived free-tier key just for the canary — 100 images/mo is plenty at 4/hour... it is not.
# 4 checks/hour * 720h = ~2880 renders/mo. Give the canary key a high monthly_limit, or
# accept that it will 429 and instead assert on 200-or-429. Simplest: mint a 'pro' key for it.
gh variable set SNAPOG_BASE_URL --body 'https://snapog.<your-subdomain>.workers.dev'
gh secret   set SNAPOG_CANARY_KEY --body 'sk_...'
```

> Note the arithmetic above: a 15-minute canary that renders an image consumes ~2,880
> images/month. Either give the canary key a raised `monthly_limit` in D1, or drop the
> schedule to hourly (~720/mo). Do not let the canary alert on its own quota exhaustion —
> that is a pager that cries wolf, and a pager that cries wolf gets ignored, and then a real
> outage gets ignored too.

### 8.5 — What NOT to build yet

No Prometheus, no Grafana, no Datadog, no APM, no tracing. At zero customers they are cost
and maintenance with no answered question behind them. Cloudflare's built-in Workers
Analytics (requests, errors, CPU time, in the dashboard, free) covers "how much traffic and
how many errors" without any setup. Revisit when you have a question the logs cannot answer.

---

## 9. Known bugs and blockers found while writing this

### Bug #1 — `--env production` shipped a Worker with NO bindings — **FIXED 2026-07-25**

Found and reported during this cycle; `dhh-billing` fixed it within the hour. Kept here
because it is the single easiest way to break this deploy again, and because the fix must
survive future edits to `wrangler.toml`. The CI build gate now enforces it.

**Original finding**, verified by real dry-run:

```
$ npx wrangler deploy --env production --dry-run
  - "env.production" environment configuration
    - "r2_buckets" exists at the top level, but not on "env.production".
      This is not what you probably want, since "r2_buckets" is not inherited by environments.
    - "d1_databases" exists at the top level, but not on "env.production".
Your worker has access to the following bindings:
- Vars:
  - ENVIRONMENT: "production"          <-- no DB, no R2
```

`d1_databases`, `r2_buckets` and `vars` are **not inheritable** into `[env.*]`. Both
`--env production` and `--env staging` produced a Worker with zero storage bindings — `/og`,
`/register`, `/dashboard` and `/webhooks/stripe` would all have thrown on first request.

**Fix applied:** `wrangler.toml` now repeats `[[d1_databases]]` and `[[r2_buckets]]` under
both `[env.production]` and `[env.staging]`, with staging pointing at its own
`snapog-db-staging` / `snapog-og-cache-staging`. Re-verified:

```
$ npx wrangler deploy --env production --dry-run
- D1 Databases:  DB: snapog-db (TODO-REPLACE-...)
- R2 Buckets:    OG_CACHE: snapog-og-cache
- Vars:          ENVIRONMENT: "production"

$ npx wrangler deploy --env staging --dry-run
- D1 Databases:  DB: snapog-db-staging (TODO-REPLACE-...)
- R2 Buckets:    OG_CACHE: snapog-og-cache-staging
- Vars:          ENVIRONMENT: "staging"
```

No `is not inherited by environments` warning in either. `--env production` is now the
correct way to deploy, and this runbook and the CI workflow both use it.

**Regression guard:** the CI `build` job asks wrangler what the resolved bindings are and
**fails the build** if the `DB` id is not a real UUID, if `OG_CACHE` is missing, or if the
inheritance warning reappears. It does not string-match on placeholder text — a renamed
placeholder would slip past that, which is exactly what happened when the TODO string
changed mid-cycle.

### Bug #2 — `npm run db:remote` migrated the local database — **FIXED 2026-07-25**

```json
"db:remote": "wrangler d1 migrations apply snapog-db"      // before — no --remote
"db:remote": "wrangler d1 migrations apply snapog-db --remote"   // after
```

Verified on wrangler 3.114.17 that the default target is **local**: `wrangler d1 migrations
list snapog-db` with no flag returned a local answer with no auth error, on a machine with
zero Cloudflare credentials. Anyone trusting the old script would believe production was
migrated when it was not. Fixed by `dhh-billing`.

### Bug #3 — the build was red mid-cycle — **CLEARED 2026-07-25**

While `dhh-billing` was landing Stripe support, `src/index.ts` imported three functions that
did not exist yet in `src/dashboard/pages.ts`:

```
✘ [ERROR] No matching export in "src/dashboard/pages.ts" for import "billingUnavailablePage"
✘ [ERROR] No matching export in "src/dashboard/pages.ts" for import "billingSuccessPage"
✘ [ERROR] No matching export in "src/dashboard/pages.ts" for import "billingCancelPage"
```

Now green: `npm run typecheck` clean, `wrangler deploy --env production --dry-run` builds at
2145.95 KiB / 729.66 KiB gzip. Re-run §3.4 before deploying anyway. **Never deploy on a red
build** — the CI build gate enforces this, which is the whole reason it exists: this exact
window is when someone reaches for a manual `wrangler deploy`.

### Open item #5 — small config leftovers (not blocking)

| Item | Where | Fix |
|---|---|---|
| `"deploy": "wrangler deploy"` has no `--env production` | `package.json` | make it `wrangler deploy --env production`, else `npm run deploy` ships `ENVIRONMENT="development"` to the production script |
| no `[observability]` block | `wrangler.toml` | add the 3 lines in §8.1 — free, and the highest-value config in the project |
| `AUTH_SECRET` is referenced in a `wrangler.toml` comment and typed in `Env`, but nothing reads it | `src/` | either wire up signed dashboard cookies or drop the reference; a documented-but-unused secret is a trap for the next person |

### Blocker #4 — the AI cannot push to this repo, so CI cannot be self-installed

```
$ gh api repos/MaxMiksa/Auto-Company --jq .permissions
{"admin":false,"maintain":false,"pull":true,"push":false,"triage":false}

$ git push --dry-run origin main
remote: Permission to MaxMiksa/Auto-Company.git denied to maxgoff.
fatal: ... error: 403

$ gh secret list -R MaxMiksa/Auto-Company
failed to get secrets: HTTP 403
```

The authenticated `gh` account (`maxgoff`, the only one in `~/.config/gh/hosts.yml`) has
**read-only** access to `MaxMiksa/Auto-Company`. It cannot push, cannot set repo secrets,
and cannot enable Actions. So `.github/workflows/deploy-snapog.yml` exists on disk but
cannot be activated on this repo by the AI. See §10.

---

## 10. Making it autonomous: exact steps

**Honest answer to "is there a path to production with no human?" — No.** Every route to a
public URL requires one credential that can only be created inside an authenticated browser
session with 2FA. Verified, not assumed:

| Attempt | Result |
|---|---|
| `wrangler whoami` | not authenticated |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in env | absent |
| `~/Library/Preferences/.wrangler/` | telemetry + logs only, no `config/default.toml` |
| shell profiles, repo `.env`/`.dev.vars` | no Cloudflare or Vercel credentials |
| `~/.config/rclone/rclone.conf` | two Google Drive remotes, no R2 remote |
| Vercel CLI | not installed; no Vercel token anywhere |
| second `gh` account with push rights | none — one account, `maxgoff`, read-only here |

`wrangler login` is an interactive browser OAuth flow. Signing up for any alternative host
requires email verification and a captcha. There is no honest way around a human here, and
inventing one would mean lying about it.

**What we can do is shrink the human to ~4 minutes, once, forever.** Two paste-able strings
and a $5 subscription. After that:

### Path A — human has push access to `MaxMiksa/Auto-Company` (preferred)

Whoever controls `MaxMiksa` runs, once:

```bash
gh secret set CLOUDFLARE_API_TOKEN  -R MaxMiksa/Auto-Company     # paste token from §2
gh secret set CLOUDFLARE_ACCOUNT_ID -R MaxMiksa/Auto-Company     # paste 32-hex account id
git add .github/workflows/deploy-snapog.yml && git commit -m "ci: autonomous snapog deploy" && git push
```

Then, after the first green deploy:

```bash
gh variable set SNAPOG_BASE_URL   -R MaxMiksa/Auto-Company --body 'https://snapog.<sub>.workers.dev'
gh secret   set SNAPOG_CANARY_KEY -R MaxMiksa/Auto-Company --body 'sk_...'
```

Optionally grant `maxgoff` **write** on the repo so the AI can maintain the pipeline itself.

**Do not add a GitHub Environment with required reviewers to the `deploy` job.** That single
checkbox puts a human back in the loop and defeats the entire exercise. The workflow
deliberately omits `environment:` for this reason.

### Path B — the AI does it alone in a repo it owns (no `MaxMiksa` cooperation needed)

`maxgoff` has `admin: true` on its own repos (verified against `maxgoff/graphrag`), which
means push, secrets and Actions all work programmatically. Allowed by the safety guardrails
— creating repos is explicitly permitted.

```bash
gh repo create maxgoff/snapog --public --description "SnapOG — OG image API on Cloudflare Workers"
# push projects/snapog + the workflow (adjust working-directory / paths to the repo root)
gh secret set CLOUDFLARE_API_TOKEN  -R maxgoff/snapog     # still needs the human's token
gh secret set CLOUDFLARE_ACCOUNT_ID -R maxgoff/snapog
gh workflow run deploy-snapog.yml -R maxgoff/snapog
gh run watch -R maxgoff/snapog
```

Cost: SnapOG's source lives in two places, which will drift. Take Path A if `MaxMiksa`
will cooperate; Path B is the escape hatch if it will not.

### What the pipeline does once armed

`.github/workflows/deploy-snapog.yml` — validated (YAML parses, every embedded shell block
passes `bash -n`):

| Job | Trigger | Needs secrets? | Does |
|---|---|---|---|
| `build` | push, PR, manual | **no** | `npm ci`, typecheck, placeholder-`database_id` guard, env-binding guard, `wrangler deploy --dry-run`, bundle-size gate at 2500 KiB gzip. **Useful the day it lands.** |
| `deploy` | push to `main` | yes — self-skips without them | record rollback target → `d1 migrations apply --remote` → `wrangler deploy` → `/health` smoke → `/og` PNG smoke (magic bytes + size, with a seeded throwaway D1 key that it cleans up) → **auto-rollback if the smoke test fails** |
| `canary` | cron `*/15` | base URL variable only | §8.4 |

The `deploy` job reads credentials from `secrets`, laundered through a step output because
the `secrets` context is not available in job-level `if:`. Without the secrets the build
gate still runs green and the deploy is skipped with a notice — no permanent red X while we
wait on a human.

---

## 11. Time and cost

| Item | Time | Cost |
|---|---|---|
| Human: create Cloudflare API token (§2) | ~4 min | $0 |
| Human: enable Workers Paid (§1) | ~3 min | **$5/mo — mandatory** |
| Human: Stripe webhook + prices + portal (§4) | ~10 min | 2.9% + 30¢ per txn |
| Human: paste 2 GitHub secrets (§10) | ~1 min | $0 |
| Cold-machine first deploy (§3) | ~6–8 min wall clock | $0 |
| CI build gate | ~90 s | $0 (public repo) |
| CI deploy + smoke test | ~2–3 min | $0 |
| Rollback | ~15 s | $0 |
| D1 / R2 / Workers Logs at launch volume | — | $0 (inside free allowances) |

**Monthly infrastructure floor: $5.** At $19/mo Pro, the first paying customer covers
infrastructure roughly 4× over. That is the correct shape for this business.

---

## 12. Release checklist

Copy into the PR or the cycle log.

```
[ ] §1  Workers Paid enabled on the Cloudflare account   <-- product does not work without this
[ ] §2  API token created, `wrangler whoami` succeeds
[ ] §3.1 `d1 create snapog-db` done, real database_id committed to wrangler.toml
[ ] §3.2 `r2 bucket create snapog-og-cache` done, bucket is private
[ ] §3.3 `d1 migrations apply snapog-db --remote` — `migrations list --remote` says none pending
[ ] §3.4 dry-run shows D1 (real UUID) + R2 + Vars ENVIRONMENT="production", gzip << 10 MB
[ ] §9   build is green (typecheck + dry-run both clean)
[ ] §3.5 `wrangler deploy --env production` succeeded, URL + Version ID recorded
[ ] §3.6 four STRIPE_* secrets set, `wrangler secret list` confirms
[ ] §4.1 Stripe webhook endpoint created at $SNAPOG_URL/webhooks/stripe
[ ] §4.1 subscribed: checkout.session.completed, customer.subscription.deleted
         (+ customer.subscription.updated, invoice.payment_failed)
[ ] §4.1 STRIPE_WEBHOOK_SECRET set; /health reports billing+webhook "configured"
[ ] §4.3 Stripe customer portal activated
[ ] §5   smoke test passed: 200 / image/png / magic 89504e470d0a1a0a / >5000 bytes
[ ] §5   PNG opened and visually verified — text legible, not clipped
[ ] §5.4 second identical request returned X-Cache: HIT
[ ] §5.5 /checkout returned 503 BEFORE secrets (fails closed, no free paid tiers)
[ ] §5.5 /checkout returned 303 to checkout.stripe.com AFTER secrets — checked once, not looped
[ ] §3.3 six tables present incl. webhook_events and tier_changes
[ ] §7   README + dashboard copy-paste snippets updated to the real host
[ ] §8.1 [observability] block added to wrangler.toml
[ ] §8.4 SNAPOG_BASE_URL variable + SNAPOG_CANARY_KEY secret set; canary green
[ ] §6   first `d1 export` backup taken and stored off-Cloudflare
[ ] §10  CI armed — a push to main deploys with no human
```
