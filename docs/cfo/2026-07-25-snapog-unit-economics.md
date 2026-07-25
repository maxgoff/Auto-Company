# SnapOG — Unit Economics, Pricing & Path to $1,000 MRR

**Author:** CFO (Patrick Campbell model)
**Date:** 2026-07-25
**Status:** Decision memo. Sections 2, 3 and 5 are implementation-binding for this cycle.
**Audience:** CEO, `fullstack-dhh` (currently implementing Stripe Checkout), `sales-ross`, `critic-munger`

---

## 0. Bottom line first

**SnapOG's cost structure is a non-issue. Gross margin is 87–95% in the worst case I can construct, at every tier, at every utilization, with a 0% cache hit rate.** I could not build a scenario where a customer loses us money short of ~928,000 images/month on a $19 plan. Stop thinking about cost.

The financial problems are all on the revenue side, and there are three:

1. **We are metering the wrong thing.** We bill *requests*, including cache hits and crawler traffic the customer cannot control. Then we hard-429. That combination will break paying customers' production social cards and generate involuntary churn from day one.
2. **We are underpriced by 7–26x on volume-per-dollar** versus the OG-image products people actually pay for, while simultaneously having a $19→$49 tier structure with a "penalty box" between 10,001 and 25,789 images/month where upgrading makes the customer *worse off per image*.
3. **There is no revenue ceiling.** A customer doing 500,000 images/month has nowhere to pay us. We would hard-429 our single most valuable prospect.

All three are free to fix right now because we have zero customers and therefore zero grandfathering liability. They become expensive to fix the moment we take the first dollar.

**Verdict: GO.** See §5.

---

## 1. Unit economics

### 1.1 Verified unit prices (fetched 2026-07-25, Cloudflare docs)

| Resource | Price | Included on Workers Paid |
|---|---|---|
| Workers subscription | **$5.00/mo** | — |
| Workers requests | **$0.30 / million** | 10M/mo |
| Workers CPU time | **$0.02 / million CPU-ms** | 30M CPU-ms/mo |
| R2 Class A (PutObject) | **$4.50 / million** | 1M/mo free tier |
| R2 Class B (GetObject) | **$0.36 / million** | 10M/mo free tier |
| R2 storage (Standard) | **$0.015 / GB-mo** | 10 GB-mo free tier |
| R2 egress | **$0.00** | unlimited |
| D1 rows written | **$1.00 / million** | 50M/mo |
| D1 rows read | **$0.001 / million** | 25B/mo |
| Stripe | **2.9% + $0.30** per charge | — |

Workers Free plan caps CPU at **10 ms/invocation**. Our render measures 27–45 CPU-ms on an M2 Max. **SnapOG cannot run on the Workers free plan.** The $5/mo paid plan is mandatory, not optional.

### 1.2 Measured render cost — I benchmarked it, I did not guess

I ran the actual `satori` + `@resvg/resvg-wasm` pipeline from `projects/snapog/node_modules` against the real element tree from `src/og/templates.ts`, on an Apple M2 Max, 30 iterations per case with cache-defeating title variation:

| Case | CPU-ms | Wall-ms | PNG size |
|---|---|---|---|
| Short title, minimal fields | 27.5 | 17.6 | 18.7 KB |
| Typical blog post (title + desc + domain + tag + author) | 35.2 | 23.9 | 56.5 KB |
| Long title + long description + long domain | 44.5 | 31.0 | 95.7 KB |

Cold-isolate decomposition (first request into a fresh isolate):

| Phase | CPU-ms |
|---|---|
| `resvg` `initWasm()` | 34.8 |
| First `satori()` — includes yoga-wasm init + Bitter font parse | 63.4 |
| First `resvg` render | 113.2 |
| **Cold total** | **211.4** |
| Warm 2nd full render | 36.7 |

**Translation to Cloudflare hardware.** Workers runs on AMD EPYC; WASM-heavy single-thread work runs roughly 2–2.5x slower than an M2 Max. I use a **2.5x factor** throughout, deliberately conservative:

- **Warm render on Workers: ~90 CPU-ms**
- **Cold render on Workers: ~530 CPU-ms**

**Which one applies is the interesting part.** A Pro customer at 10,000 images/month averages **13.7 requests/hour — one every 4.4 minutes**, spread across whatever colos their crawlers hit. Isolates will not stay warm. At our realistic volumes, **nearly every uncached render is a cold render.** I therefore use the 530 CPU-ms cold number as the planning case for all margin math below. That is the worst case, and it is also the likely case.

Also measured: `workers-og` fetches **Bitter weight 600 from Google Fonts at request time** because `src/og/render.ts` passes no `fonts` option (149,528 bytes, 239 ms wall on my connection, cached in `caches.default` per-colo after first hit). Not a cost item — wall time is not billed — but it is an uptime dependency on `fonts.googleapis.com` for every cold colo. Flagged to CTO/DHH, not a pricing input.

### 1.3 Per-image marginal cost

**Cache MISS (uncached render), cold isolate — the worst case:**

| Component | Qty | Cost | Share |
|---|---|---|---|
| Workers CPU | 530 ms | $0.00001060 | **56.5%** |
| R2 PUT (Class A) | 1 | $0.00000450 | 24.0% |
| D1 rows written (`UPDATE api_keys` 1 + `INSERT usage_events` 1 + `idx_usage_key` 1) | 3 | $0.00000300 | 16.0% |
| R2 GET (miss probe) | 1 | $0.00000036 | 1.9% |
| Workers request | 1 | $0.00000030 | 1.6% |
| D1 rows read | 2 | $0.0000000015 | ~0% |
| **Total** | | **$0.0000188** | **= $0.0188 / 1,000 images** |

Warm-isolate miss: **$0.0000100** = $0.0100/1k.

**Cache HIT:**

| Component | Qty | Cost | Share |
|---|---|---|---|
| **D1 rows written (3)** | 3 | **$0.00000300** | **75.7%** |
| R2 GET | 1 | $0.00000036 | 9.1% |
| Workers request | 1 | $0.00000030 | 7.6% |
| Workers CPU (~15 ms, no WASM on this path) | 15 ms | $0.00000030 | 7.6% |
| **Total** | | **$0.0000040** | **= $0.0040 / 1,000 images** |

> **Finding worth acting on:** on the cache-hit path — which will be the *majority* of traffic — the `recordUsage()` D1 write batch is **76% of the entire marginal cost of serving a request.** It costs more than R2, more than CPU, more than the Workers request itself. Writing one `usage_events` row per request at $1.00/million rows is the most expensive thing we do on the cheap path. At 10M hits/month that is $30/mo of pure telemetry against ~$4 of actual serving cost. Recommend sampling or batching `usage_events` (or moving it to Analytics Engine, which is far cheaper for this shape) once volume is real. Not urgent at 0 users; will become the #1 line item at scale.

**Blended cost per 1,000 requests by cache hit rate:**

| Cache hit rate | Worst case (cold misses) | Best case (warm misses) |
|---|---|---|
| 0% | **$0.0188 / 1k** | $0.0100 / 1k |
| 50% | **$0.0114 / 1k** | $0.0070 / 1k |
| 90% | **$0.0054 / 1k** | $0.0046 / 1k |

**R2 storage:** at 55 KB average PNG, each stored object costs **$0.000000787/mo**, recurring forever — there is no lifecycle rule in `wrangler.toml`. Worth $0.00079 per 1,000 objects per month.

### 1.4 Gross margin at current pricing — worst case (0% cache, 100% cold renders)

| Tier | Price | Util | Images | Infra | R2 storage | Stripe | COGS | Gross profit | **GM** |
|---|---|---|---|---|---|---|---|---|---|
| Free | $0 | 20% | 20 | $0.0004 | $0.0000 | — | $0.0004 | — | cost **$0.0004/user/mo** |
| Free | $0 | 60% | 60 | $0.0011 | $0.0000 | — | $0.0012 | — | cost **$0.0012/user/mo** |
| Free | $0 | 100% | 100 | $0.0019 | $0.0001 | — | $0.0020 | — | cost **$0.0020/user/mo** |
| Pro | $19 | 20% | 2,000 | $0.0375 | $0.0016 | $0.851 | $0.890 | $18.11 | **95.3%** |
| Pro | $19 | 60% | 6,000 | $0.1126 | $0.0047 | $0.851 | $0.968 | $18.03 | **94.9%** |
| **Pro** | **$19** | **100%** | **10,000** | **$0.1876** | **$0.0079** | **$0.851** | **$1.047** | **$17.95** | **94.5%** |
| Business | $49 | 20% | 20,000 | $0.3752 | $0.0157 | $1.721 | $2.112 | $46.89 | **95.7%** |
| Business | $49 | 60% | 60,000 | $1.1257 | $0.0472 | $1.721 | $2.894 | $46.11 | **94.1%** |
| **Business** | **$49** | **100%** | **100,000** | **$1.8762** | **$0.0787** | **$1.721** | **$3.676** | **$45.32** | **92.5%** |

### 1.5 The two worst cases you asked about, answered directly

> **A Pro customer burns their full 10,000 quota with a 0% cache hit rate. Is $19 still profitable?**

**Yes, overwhelmingly. Gross profit $17.95 on $19.00 — 94.5% gross margin.** The 10,000 cold renders consume 5.3M CPU-ms and cost **$0.19 of infrastructure**. Stripe's $0.851 fee costs us **4.5x more than all of Cloudflare combined.** Break-even on a $19 plan is **928,395 cold-miss images/month** — 93x the advertised quota.

> **A Business customer burns their full 100,000 quota with a 0% cache hit rate. Is $49 still profitable?**

**Yes. Gross profit $45.32 — 92.5% gross margin.** 100,000 cold renders = 53M CPU-ms, which does exceed the 30M included allowance, costing $1.06 marginal CPU. Total infra $1.88 + $0.08 storage. Stripe's $1.72 is still the largest COGS line. Break-even is **2,418,513 images/month** — 24x quota.

> **What does a free user cost?**

**$0.0020/month at full 100-image utilization.** One thousand fully-abusive free users cost **$2.00/month**. The free tier is not a cost center; it is a distribution channel that happens to be nearly free.

### 1.6 The real COGS is Stripe, not Cloudflare

| Price point | Stripe fee | **% of revenue** | Net |
|---|---|---|---|
| $5 | $0.445 | **8.90%** | $4.55 |
| $9 | $0.561 | **6.23%** | $8.44 |
| $12 | $0.648 | **5.40%** | $11.35 |
| $19 | $0.851 | **4.48%** | $18.15 |
| $29 | $1.141 | **3.93%** | $27.86 |
| $49 | $1.721 | **3.51%** | $47.28 |
| $99 | $3.171 | **3.20%** | $95.83 |
| $299 | $8.971 | **3.00%** | $290.03 |

The $0.30 fixed component is what punishes low prices. **Do not ship a paid tier below $12/mo** — below that, Stripe eats over 5.4% and the tier can't carry its own support cost. Offer annual billing (12 months for the price of 10) on every tier: it converts 12 charges into 1, cutting fee drag from ~4% to ~0.3% and pulling a year of cash forward. On a $29 plan, annual billing at 2 months free nets **$286.10/yr vs $334.32** for monthly — we give up $48 of gross revenue to gain ~$13 in fees and, far more valuably, remove 12 months of churn risk. Do it.

### 1.7 Fixed costs and ramen profitability

| Item | $/mo |
|---|---|
| Cloudflare Workers Paid | $5.00 |
| `snapog.dev` domain (amortized $15/yr) | $1.25 |
| R2 storage (inside 10 GB free tier) | $0.00 |
| D1 (inside included allowances) | $0.00 |
| **Total fixed** | **$6.25** |

**Ramen profitability = 1 paying customer.** One $12 Starter subscriber ($11.35 net) covers 182% of all fixed cost.

Two housekeeping items: (a) kill the Vercel marketing page — the Worker already serves a landing page in `src/dashboard/pages.ts`, and Vercel's ToS requires a $20/mo Pro seat for commercial use, so keeping it would be a 320% increase in fixed cost for a page we already own; (b) set an **R2 lifecycle expiry at 24 months, not 90 days** — storing an object costs $0.000000787/mo while re-rendering it costs $0.0000188, so **storage is cheaper than re-rendering for 23.8 months.** Aggressive cache eviction would *raise* our costs.

---

## 2. Is the current price structure right?

No. Three specific defects, in order of revenue impact.

### 2.1 Defect #1 — we meter requests, not renders, and then we hard-429

`src/index.ts` increments `usage_count` on **every** request, including cache hits (line 160: `recordUsage(..., true)` inside the R2 hit branch). Then line 128 returns **HTTP 429** when `usage_count >= monthly_limit`.

This is the most expensive mistake in the product, for three compounding reasons:

1. **The customer cannot control the metered quantity.** OG image URLs sit in `<meta property="og:image">`. Twitter, Facebook, LinkedIn, Slack, Discord, WhatsApp, iMessage, Pinterest, Mastodon and every link-preview bot fetch them repeatedly and unpredictably. A blog with 20 posts can burn 100 "images" in a day from crawler traffic while having generated exactly 20 images. Campbell's rule: **never meter something the buyer cannot forecast.** It produces defensive over-buying, support tickets, and rage-churn.
2. **The failure mode is a visible production outage on someone else's brand.** A 429 means a shipped blog post shows a broken social card — on Twitter, permanently, because crawlers cache negative results. This is worse than a normal outage: it's public and it's their reputation, not ours.
3. **It bills the wrong side of our own cost curve.** A cache hit costs $0.0040/1k; a cold miss costs $0.0188/1k — **4.7x more.** We charge identically for both, which means we monetize the free thing and give away the expensive thing at the same rate.

**Fix:** meter **unique renders (cache misses) only. Cache hits are free, unmetered, unlimited.** And **never return 429 from `/og`.** On quota exhaustion:

| Tier | Behavior on exhaustion |
|---|---|
| Free | Keep serving cached images at 200. New render requests return a valid image with an enlarged watermark + `X-SnapOG-Quota: exceeded` header. Email + dashboard alert. |
| Paid | Keep rendering. Bill overage at the tier rate. Email at 80%, 100%, and on first overage dollar. |

"Your OG images never break" is a marketing claim, a churn-reduction mechanism, and a cost reduction all at once. It also attacks a real category weakness: **Bannerbear, Placid, Templated, Microlink, MyOG and OGMagic all hard-block or pause.** Only ScreenshotOne, htmlcsstoimage and Urlbox degrade gracefully. Placid publishes it as policy: *"We do not charge overage fees… you won't be able to generate any more creatives."* Five of our eleven closest competitors fail on exactly the axis where failure is most visible.

### 2.2 Defect #2 — the $19→$49 penalty box

| | Price | Quota | **$/1,000 images** |
|---|---|---|---|
| Pro | $19 | 10,000 | **$1.90** |
| Business | $49 | 100,000 | **$0.49** |

That is a **74.2% volume discount for 10x volume**, granted in a single step. The consequence:

**Business only beats Pro on price-per-image above 25,789 images/month.**

| Actual usage | Business $/1k | Pro $/1k | Customer's situation |
|---|---|---|---|
| 11,000 | $4.45 | $1.90 | Pays 2.3x more per image to upgrade |
| 15,000 | $3.27 | $1.90 | Pays 1.7x more per image |
| 20,000 | $2.45 | $1.90 | Pays 1.3x more per image |
| 25,789 | $1.90 | $1.90 | Break-even |

**Every customer between 10,001 and 25,789 images/month is worse off per image on Business than a Pro customer is** — and today they don't even get the choice, they get a 429. A customer at 11,000 images faces a **+158% price increase for +10% usage.** They will churn, or open five free accounts.

**What overage recovers.** Compare what we bill today (hard 429) against a $0.004/image Pro overage:

| Usage | Today (429) | With overage | Business tier |
|---|---|---|---|
| 11,000 | $19 + broken site | **$23.00** | $49 |
| 15,000 | $19 + broken site | **$39.00** | $49 |
| 20,000 | $19 + broken site | **$59.00** | $49 |
| 25,000 | $19 + broken site | **$79.00** | $49 |
| 40,000 | $19 + broken site | **$139.00** | $49 |

Overage strictly dominates on both axes: more revenue *and* a working customer site. At $0.004/image against a $0.0000188 cost that is a **213x markup at 99.5% margin** — and it is *cheaper for the customer than the category norm* (htmlcsstoimage charges $0.01/image, ScreenshotOne $0.009).

### 2.3 Defect #3 — we are underpriced on volume-per-dollar, and have no ceiling

Competitive benchmark (list prices, fetched 2026-07-25), **entry paid tier, price per 1,000 images:**

| Vendor | Entry tier | $/1k images | Overage |
|---|---|---|---|
| **Bannerbear** | $49 / 1,000 | **$49.00** | hard block |
| **Placid** | $19 / 500 credits | **$38.00** | hard block |
| **RenderForm** | $9 / 250 | **$36.00** | PAYG $0.036–0.076 |
| **Templated.io** | $29 / 1,000 | **$29.00** | upgrade prompt |
| **Orshot** | $39 / 1,500 | **$26.00** | $0.024–0.036 |
| **MyOG.social** | $20 / 1,000 | **$20.00** | pause (cached keeps serving) |
| **htmlcsstoimage** | $14 / 1,000 | **$14.00** | **$0.01/img, opt-in** |
| **Urlbox** | $19 / 2,000 | **$9.50** | auto-upgrade tier |
| **ScreenshotOne** | $17 / 2,000 | **$8.50** | **$0.009/img** |
| **ApiFlash** | $7 / 1,000 | **$7.00** | unpublished |
| **Microlink** | $49 / 46,000 | **$1.07** | notify at 80% |
| **Cloudinary Plus** | $99 / 225 credits | ~$0.44 raw | soft limit |
| **@vercel/og on Vercel Pro** | $20/seat + PAYG | ~$0.01–0.02 marginal | uncapped PAYG |
| **SnapOG (current)** | $19 / 10,000 | **$1.90** | **hard 429** |
| **SnapOG (recommended)** | $12 / 5,000 | **$2.40** | **$0.008/img** |

Two structural facts constrain us:

- **The category's *product-priced* players clear at $14–$49 per 1,000 images.** We are at $1.90. We are 7–26x cheaper than the products people actually buy. Bannerbear is not selling pixels at $49/1k; it's selling "you never touch Puppeteer again."
- **A $9–$12 flat-unlimited tier already exists** (ogimage.art $9, Screenhance $12, OGMagic $12 *one-time*). Critically, **both flat-rate players gate on watermark, not volume.** They monetize brand removal. That is the tell.

And **there is nothing above $49.** A programmatic-SEO site, marketplace, or UGC platform doing 500,000 images/month — precisely the customer whose economics work best for us — cannot buy anything. We would 429 them.

**The synthesis.** Our cost structure is genuinely different from the category. Bannerbear, Placid, Urlbox and ScreenshotOne run headless Chrome; that is 50–100x our compute cost per render, and they all pay egress. We run Satori on Workers with **$0 R2 egress**. Our cost per image is $0.0000188. **Volume generosity is nearly free for us and structurally expensive for them.** So: be radically generous on volume (it is a claim they cannot match without losing money) and price on the axes the buyer actually values — **watermark removal, domains, custom branding, and the promise that nothing ever breaks.**

But note the discipline: volume headroom is *marketing*, not *conversion*. The category's paying customers mostly consume under 2,000 images/month (Placid's entry tier is 500 credits; htmlcsstoimage's is 1,000). Nobody converts because of quota they never touch. So we set volume high enough to win the comparison table and monetize the things that actually bind.

### 2.4 Is the free tier too generous, too stingy, or wrong in shape?

**Wrong in shape — and, once reshaped, too stingy.**

- **Wrong shape:** it meters requests (uncontrollable, crawler-driven) and enforces with a 429 (public brand damage). A free user with 20 blog posts can be broken by Slack previews in a week. That user was our best Starter prospect; instead they churn and tell people the product broke their site.
- **Too stingy once reshaped:** at $0.0020/user/month, the free tier costs nothing. 3,800 free users cost **$10.10/month** all-in. Meanwhile every free image carries a `snapog.dev` watermark in front of every visitor to that customer's social links — the free tier is a **paid-media-equivalent billboard we get for a tenth of a cent per user.** Under-provisioning it is the most expensive kind of frugality.
- **Missing the actual fence:** there is no domain limit, so a programmatic site can rotate free keys indefinitely. Cost-wise that is fine; conversion-wise it is fatal. **1 domain is the fence.** The watermark is the conversion lever.

### 2.5 Recommended final price/quota table — implement this

| | **Free** | **Starter** | **Pro** | **Business** |
|---|---|---|---|---|
| **Price** | $0 | **$12/mo** ($120/yr) | **$29/mo** ($290/yr) | **$99/mo** ($990/yr) |
| **Unique renders/mo** | 1,000 | 5,000 | 50,000 | 500,000 |
| **Cache hits** | unlimited, unmetered | unlimited | unlimited | unlimited |
| **Overage** | none (degrade) | **$0.008/img** | **$0.004/img** | **$0.002/img** |
| **Domains** | 1 | 3 | 10 | unlimited |
| **Watermark** | yes | **no** | no | no |
| **Custom colors + logo** | — | yes | yes | yes |
| **Custom fonts / uploaded templates** | — | — | yes | yes |
| **On quota exhaustion** | serve cached + degraded watermark, 200 | bill overage | bill overage | bill overage |
| **$/1,000 images** | — | $2.40 | $0.58 | $0.198 |

**Margins on the recommended table, worst case (0% cache, 100% cold renders):**

| Tier | 20% util | 60% util | 100% util | GP at 100% |
|---|---|---|---|---|
| Starter $12 | 94.4% | 94.1% | **93.8%** | $11.25 |
| Pro $29 | 95.4% | 94.0% | **92.7%** | $26.88 |
| Business $99 | 94.8% | 90.9% | **86.9%** | $86.05 |

Overage markups: Starter **426x cost (99.8% GM)**, Pro **213x (99.5%)**, Business **107x (99.1%)**.

**Rationale for each number:**

- **Free at 1,000 renders / 1 domain / watermarked.** Costs $0.020/user/mo maxed out. 10x the current free tier, which makes the comparison table brutal for Bannerbear (30 lifetime credits) and htmlcsstoimage (50/mo), and it means a real blog can run entirely free and advertise us. Conversion comes from the watermark, not the wall.
- **Starter $12.** Above the $12/5.40% Stripe fee floor. Sits between the $9 flat-unlimited watermark-removers and htmlcsstoimage's $14/1,000. We give 5x their volume, a real API, and 3 domains. This is the tier that converts the brand-conscious indie.
- **Pro $29.** Standard, credible developer price point. Raising from $19 to $29 while going 10,000 → 50,000 renders is a **price increase that is simultaneously a value increase** — indefensible to complain about, +53% revenue per Pro customer, and zero migration risk because we have zero customers. Ship at $29; you can always discount, you can almost never raise.
- **Business $99.** Fills the ceiling gap. $99 for 500,000 renders is $0.198/1k — a number no Chrome-based competitor can approach. Still 86.9% GM at full burn.
- **Overage everywhere, on day one.** Usage-based overage typically contributes 5–15% incremental MRR in this model. More importantly it converts our worst outcome (429 → broken site → churn) into our best (silent upsell). The rate ladder ($0.008 → $0.004 → $0.002) also creates natural upgrade pressure: at 20,000 renders, Starter-plus-overage costs $132 vs $29 on Pro. The customer upgrades themselves.
- **Annual at 2 months free on every tier.** Cuts Stripe drag from ~4–5% to ~0.3% and removes 12 months of churn exposure.

One dissent I want on record: three paid tiers at zero customers is arguably over-engineering, and DHH will say so. My answer is that the incremental code is a price-ID lookup table, and the cost of retrofitting a tier after customers exist is grandfathering — which is real money. Ship all three.

---

## 3. The value metric question

**Commitment: unique renders per month (cache misses only), with domains as the packaging fence — not the meter.**

Evaluating the candidates on Campbell's two tests — *does it scale linearly with the value the customer receives*, and *can the customer predict it*:

| Candidate | Scales with value? | Predictable by buyer? | Verdict |
|---|---|---|---|
| **Requests (current)** | No — a crawler refetch delivers zero incremental value | **No** — driven by bots the customer doesn't control | **Reject.** Metering an uncontrollable quantity is the #1 source of involuntary churn. Also inverts our own cost curve. |
| **Unique renders (cache misses)** | Yes — one render = one new piece of content that now looks professional | Yes — "I publish 40 posts a month, I need ~40 renders" | **Adopt as the meter.** |
| **Domains / sites** | Partially — an agency with 30 client sites gets ~30x the value | Very — the most forecastable metric available | **Adopt as the fence, not the meter.** Correctly separates the solo dev from the agency, but a 5,000-page marketplace and a 5-page brochure site would pay identically. Leaves the whole high-volume segment uncaptured. |
| **Unique templates** | No — that's a feature, not a unit of value | Yes | **Reject as a meter.** Use as a tier entitlement (custom template upload = Pro+). |
| **Seats** | No | Yes | **Reject outright.** This is a machine-to-machine API with no collaborative surface. Nobody logs in. A seat meter on an API is a category error. |

**Why unique renders wins.** It is the only candidate that is simultaneously (a) the thing that has real marginal cost — 4.7x a cache hit, (b) the thing that grows as the customer's business grows, (c) forecastable from the customer's own content plan, and (d) honest — we charge for work we actually did.

**Why domains has to be present as a fence.** Metering renders alone leaves a hole: the realistic distribution of consumption is severely bimodal.

- **Buyer A — the blog / docs site / small SaaS.** Generates 10–100 unique images *ever*. Will never touch any quota at any tier. A pure volume meter extracts $0 from this buyer. What they will pay for is **removing the watermark from their brand's social previews.** That is why ogimage.art and Screenhance both gate on watermark rather than volume, and it is why Starter exists.
- **Buyer B — the programmatic site.** Marketplace, directory, UGC platform, per-user share cards. 1,000–1,000,000 unique renders/month. A volume meter works perfectly here and this is where the revenue concentration lives.

One meter cannot monetize both. **Renders monetize Buyer B; watermark + domains monetize Buyer A.** That is a two-axis package with one meter — which is what Campbell actually prescribes, not "pick one dimension and ignore the market."

**A note on the competitive lane.** The recon found **zero** vendors pricing on domains. The entire category has converged on image/credit metering (supply-side cost-plus thinking) or flat-unlimited (indie thinking). MyOG.social advertises "unlimited domains" as a *feature*, not a price axis. There is an open positioning lane for a per-site model, and it is tempting because it's the most forecastable thing a buyer can be sold. I am declining it, for one reason: per-site pricing caps our upside at exactly the customer whose economics are best for us. A 500,000-render marketplace would pay the same as a brochure site. **We take the fence, not the meter** — that captures the agency segment without surrendering the volume segment.

**Implementation implications for `dhh-billing` (this is the load-bearing part):**

1. In `src/index.ts`, move the `usage_count` increment **out of the R2 cache-hit branch** (currently line 160). Cache hits must not consume quota. Continue writing the `usage_events` row for analytics if desired, but with `cache_hit = 1` excluded from quota math — or better, sample it, per the 76%-of-marginal-cost finding in §1.3.
2. Replace the 429 at line 128 with graceful degradation per the table in §2.5. **`/og` should never return a non-200 to a browser or crawler.** A 4xx here is a visible defect on the customer's site.
3. Add a `domains` allowlist per key and a `domain_limit` per tier. Enforce on the `domain` query param and/or `Origin`/`Referer`. This is the Free→Starter and Pro→Business fence and it needs to exist before launch, not after.
4. Add `overage_rate` and `overage_units` to `api_keys`, and report metered usage to Stripe. Subscription mode alone is insufficient — you need a metered price item alongside the flat one. Cap overage at 3x the base price by default with an opt-out, so nobody gets a surprise $2,000 invoice; that single guardrail prevents the chargeback-and-Twitter-thread scenario.
5. Rename the metric everywhere in the UI and docs from "images" to **"renders"**, and state explicitly: *"cached images are free and unlimited forever."* The naming is the product promise.

---

## 4. Path to first $1,000 MRR

### 4.1 Customer count and mix

| Mix scenario | Starter/Pro/Business split | Blended ARPU | Net of Stripe | **Customers for $1,000 MRR** |
|---|---|---|---|---|
| Low-end heavy | 70 / 25 / 5 | $20.60 | $19.70 (4.4% drag) | **49** |
| **Base** | **55 / 35 / 10** | **$26.65** | **$25.58 (4.0%)** | **38** |
| Upmarket | 35 / 45 / 20 | $37.05 | $35.68 (3.7%) | **27** |

**Base case: 38 paying customers** — roughly 21 Starter, 13 Pro, 4 Business. Add 5–15% from overage at that scale ($50–150/mo), so realistically **34–38 customers** reach $1,000 MRR. Net contribution margin after Stripe and all infrastructure: **~$950/month against $6.25 of fixed cost.**

### 4.2 Required free-signup volume

| Free→paid conversion | Free signups needed |
|---|---|
| 4% (strong PMF, watermark-gated) | **950** |
| 3% | **1,267** |
| **2% (base case)** | **1,900** |
| 1% (weak — free tier fully satisfies the buyer) | **3,800** |

I use **2%** as the planning number. Justification: freemium developer tools run 1–5%; a *volume*-gated free tier for this product would land near 1% because the median user never approaches the quota, but a *watermark*-gated free tier converts materially better — a watermark on your company's Twitter card is a hard blocker for anything public-facing, and it triggers on day one rather than at some quota threshold that may never arrive. This is the entire strategic reason §2.5 puts the fence on the watermark instead of the volume.

Cost of carrying that funnel: **3,800 free users = $10.10/month.** Irrelevant. Do not let anyone argue for a smaller free tier on cost grounds.

### 4.3 Is 1,900 signups realistic? Yes — over 12–18 months, not 3

| Channel | Realistic signups | Timing |
|---|---|---|
| Show HN, front page | 150–600 | one-shot, unreliable |
| Product Hunt, top 5 of day | 40–120 | one-shot |
| Reddit (r/webdev, r/SaaS, r/selfhosted), Indie Hackers, Lobsters | 50–200 | weeks 1–8 |
| **Free public generator (no key required) as an SEO/lead asset** | **30–240/mo, compounding** | **months 3–12** |
| Organic SEO: "og image api", "dynamic open graph images", "open graph image generator" | folded into above | months 6–18 |
| Framework-specific integrations + docs (Rails, Astro, Hugo, Laravel, WordPress plugin) | 20–80/mo | months 4–12 |

Summing honestly: **month 9–14 to reach ~1,900 cumulative signups**, contingent on the free-generator asset and the framework integrations actually shipping. Neither exists today. **$1,000 MRR is a 12–18 month target.** Anyone modeling it in one quarter is modeling a fantasy.

### 4.4 The blunt part: $1,000 MRR is also close to the ceiling unless distribution compounds

Steady-state MRR = (gross adds/month ÷ monthly logo churn) × ARPU. At $26.65 ARPU:

| Gross adds/mo | 3% churn | 5% churn | 8% churn |
|---|---|---|---|
| 3 | 100 cust / **$2,665** | 60 / $1,599 | 38 / **$999** |
| 5 | 167 / $4,442 | 100 / $2,665 | 63 / $1,666 |
| 8 | 267 / $7,107 | 160 / $4,264 | 100 / $2,665 |

**Read the bottom-left cell. At 3 new customers per month and 8% monthly churn, steady-state MRR is $999.** $1,000 MRR isn't a milestone on the way to somewhere in that scenario — it *is* the terminus. You would hit it in ~14 months and sit there forever.

Which makes churn, not acquisition, the variable that decides whether this becomes a business or a plateau. Two of the largest churn drivers are in our control and are addressed above: (1) the **hard-429 breaking production sites**, which is the single most churn-inducing event this product can produce, and (2) **involuntary churn from failed payments** — Stripe dunning, smart retries, and card-expiry emails typically recover 20–40% of failed charges, which at 8% total churn is worth 1–3 points. Both are cheap. Turn on Stripe Smart Retries and the dunning email sequence in the same PR as Checkout; it is a settings toggle and it is the highest-ROI thing in this entire memo per line of code.

### 4.5 Where the numbers say to be worried

The honest risk is not cost, price, or funnel math. It is that **`@vercel/og` is free at the margin (~$0.01–0.02 per 1,000) for anyone already on Vercel Pro, and wiring it up costs one afternoon.** A large share of the natural target market — Next.js developers — has a near-free in-house substitute. We cannot win them on price and should not try.

The addressable market is therefore explicitly **non-Vercel**: Rails, Laravel, Django, Hugo, Astro-on-Netlify, WordPress, Ghost, and anyone whose backend isn't JavaScript. `@vercel/og` does nothing for them; they would otherwise run headless Chrome on a VPS or pay Bannerbear $49/1,000. **That segment is the whole business, and it is also the segment where our $0.58/1k Pro tier looks like a 25–80x price cut rather than a 50x price increase over free.** Positioning and pricing have to be aimed there or the funnel math in §4.2 doesn't hold.

---

## 5. Verdict

**GO on monetizing SnapOG — but the cost analysis is a red herring and should stop consuming attention. At 87–95% gross margin in every worst case I could construct, with $6.25/month of fixed cost and ramen profitability at a single $12 customer, infrastructure will never be why this fails.** Stripe's fees are 4.5x our entire Cloudflare bill on a $19 plan; that is how irrelevant COGS is here. What will decide the outcome is whether ~38 developers on non-Vercel stacks can be found, converted at ~2% of ~1,900 free signups, and *kept* — because at 8% churn and 3 adds/month, $1,000 MRR is not a waypoint, it is the steady state. Ship Stripe Checkout this cycle with the §2.5 table ($0 / $12 / $29 / $99, annual at 2 months free), and spend the recovered attention on the free public generator and the Rails/Astro/Hugo/WordPress integrations, because distribution is the only binding constraint in this model.

**The single change that most improves expected revenue: stop metering requests and stop returning 429. Meter unique renders only, make cache hits free and unlimited, and bill overage ($0.008 / $0.004 / $0.002 per image) instead of blocking.** It is one change with four compounding effects — it converts our worst failure mode (a paying customer's social cards break publicly, then they churn and say so) into our best revenue event (a silent, 213x-margin upsell); it recovers real money we currently refuse, $139 instead of $19 at 40,000 renders; it deletes the $19→$49 penalty box where 10,001–25,789-image customers pay *more* per image to upgrade; and it hands marketing a claim that five of our eleven closest competitors structurally cannot match — *your OG images never break.* It costs one afternoon of DHH's time, and it is free today only because we have zero customers to grandfather.

---

## Appendix: assumption ledger

| # | Assumption | Status |
|---|---|---|
| 1 | Cloudflare unit prices (Workers, R2, D1) | **Confirmed** — developers.cloudflare.com, fetched 2026-07-25 |
| 2 | Render CPU 27.5–44.5 ms, PNG 18.7–95.7 KB | **Measured** — real satori + resvg-wasm, project's own `node_modules`, Apple M2 Max, 30 iterations/case |
| 3 | Cold-isolate render 211.4 CPU-ms | **Measured** — same harness, decomposed by phase |
| 4 | 2.5x CPU multiplier for Workers vs M2 Max | **Estimated**, deliberately conservative. Margins survive a 10x multiplier: at 5,300 CPU-ms/render, Pro at full 10,000 still yields ~92% GM |
| 5 | Nearly all renders are cold at our volumes | **Reasoned** — 10,000/mo = 1 request per 4.4 min, spread across colos. Used as the planning case |
| 6 | 55 KB average PNG | **Estimated** from the measured 18.7/56.5/95.7 KB range, weighted toward "typical" |
| 7 | 3 D1 rows written per request | **Derived** from `migrations/0001_init.sql` + Cloudflare's documented index-write behavior. `UPDATE api_keys` (1) + `INSERT usage_events` (1) + `idx_usage_key` (1) |
| 8 | Competitor list prices | **Confirmed** for Bannerbear, htmlcsstoimage, Urlbox, ScreenshotOne, Templated, Orshot, RenderForm, MyOG, Vercel, imgix. **Partly inferred** for Placid annual, Cloudinary blended credit cost, ApiFlash overage (page 404s). Assume real annual/enterprise deals land 10–25% below list |
| 9 | 2% free→paid conversion | **Estimated** — freemium developer-tool range is 1–5%. This is the single most load-bearing unverified number in §4; the funnel is 2x wrong if it's 1% or 4% |
| 10 | 3–8% monthly logo churn | **Estimated** — no data. Will be measurable ~90 days after first paying customer, and should be re-forecast then |
| 11 | Overage adds 5–15% incremental MRR | **Benchmark**, usage-based SaaS. Unvalidated for this product |
| 12 | Revenue $0, users 0, Worker never deployed | **Given** by CEO, not re-audited |
| 13 | Vercel commercial-use ToS requires $20/mo Pro | **Confirmed** via vercel.com/pricing. Recommendation is to retire the Vercel page regardless, since the Worker already serves a landing page |
