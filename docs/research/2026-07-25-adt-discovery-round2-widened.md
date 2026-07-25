# Cycle 4 — `discovery-adt` round 2 (widened): the checkout table

`research-thompson`, 2026-07-25.

**Filing note.** `docs/research/2026-07-25-adt-discovery-round2.md` was already written by a
concurrent agent at 11:47 today and covers **hosted CI-analytics SaaS**. I did not overwrite it.
This is a companion, and it closes that report's own Part 6 blind spot #6, verbatim: *"Not searched:
the non-developer self-serve market entirely… a market where GitHub Actions is the delivery
mechanism rather than the product, and I did not do it."* Read both.

Round 1 inferred a market from a mechanism. This round leads with completable checkouts and reports
traction even where it hurts.

---

## 1. The checkout table

"Self-serve" = zero hits for `contact sales|request a demo|get in touch|book a call` on the page.
Every row fetched or re-fetched by me personally.

| # | Category | Checkout URL | Price | HTTP | Traction (fetched) |
|---|---|---|---|---|---|
| C1 | Component/template pack (files) | `tailwindcss.com/plus/checkout/cc42453b-bfcd-4a7c-8150-37946e36168e` | `total $299.00`; Team SKU `aa651062…` = `$979.00`; Paddle | **200** | free core `tailwindlabs/tailwindcss` **96,074★ / 5,421 forks / 2017-10-06 / pushed 2026-07-16** |
| C2 | Design-system pack (files) | `untitledui.gumroad.com/l/untitled-ui` | `"price":129.0` | **200** | `"reviewCount":1558`, `"ratingValue":5.0` → lower bound **≈$201k** |
| C3 | Open-core dev tool, **no backend**, offline license | `gum.co/goreleaser` | `"price":15.0`/mo entry; site $165–$3,300/yr | **200** | `"reviewCount":5`. Core `goreleaser/goreleaser` **15,960★ / 1,096 / 2016-12-21 / 2026-07-25**; `goreleaser-action` **1,019★** |
| C4 | File-product market, aggregate | `gumroad.com/discover?query=…` → 257 product pages | 134 carry price **and** `reviewCount`; **median $49**; 47 at ≥$99 | **200** ×257 | 14 products ≥100 reviews; no bot block |

**Rejected as rows, for the record.** ShipFast — `$199/$249/$299`, claims *"8378 indie makers"*, zero
sales-gate strings, and states fulfilment verbatim: *"email me your GitHub username so I can give you
access to the repo."* But the buy control is a JS `<button>` with no static URL and
`POST /api/stripe/create-checkout` → **404**. Published price, **checkout NOT VERIFIED** → FAIL by
the letter. Magic UI Pro `$199` one-time (core `magicuidesign/magicui` **21,686★**) — no processor
host in 1,143,377 bytes → NOT VERIFIED. Aceternity Pro — both embedded Lemon Squeezy IDs **404**.
Sidekiq Pro — `sidekiq.org` **200**, `$99/mo`, `$269/mo`, no sales gate, core `sidekiq/sidekiq`
**13,553★ / 2012-01-16** — but I did not verify its checkout URL. `interpreterbook.com` — $29/$39/$50,
no fetchable checkout link, no traction number. `weworkremotely.com/remote-jobs/new` → **403**.

---

## 2. Candidates — one, not three

I will not fill slots 2 and 3. Everything that could have gone there is in §4 with the number that
killed it.

### #1 — a free exhaustive block library with a paid Pro pack

**Product.** A free, large, always-current OSS component/block library with a live Pages demo, plus a
paid Pro pack of premium blocks and full templates sold once at $99–$299.

**ADT rail.** Pages is the demo/docs site — its native use case, zero tokens. Actions regenerates and
visually diffs the library nightly, forever, at zero marginal cost. Delivery is a **private-repo
collaborator invite** (`gh auth status` → scopes `delete_repo, gist, read:org, repo, workflow`), which
is the category's standard fulfilment — ShipFast's own sentence above.

**v0 on GitHub alone.** One public repo (free blocks) + Pages demo returning 200 + one private repo
holding the Pro pack + an Action rebuilding both. No credential beyond `gh`.

**The named free thing.** `shadcn-ui/ui` — **119,787★ / 9,528 forks / created 2023-01-04 / pushed
2026-07-25**. It solves 80%+ and it is excellent. **Why anyone pays anyway is not an argument, it is
a measurement:** with that free thing fully available, Tailwind Plus still completes a **$299** Paddle
checkout and Untitled UI still shows **1,558 reviews at $129**. The free tier empirically does not
zero this category — the exact opposite of the SnapOG finding, and the only reason this candidate
exists.

**Price/shape.** $99 one-time personal, $299 team. One-time, not subscription: C1, C2 and the $49
Gumroad median are all one-time.

**Meter.** Private-repo collaborator invite, granted and revoked with `gh`. No key in public HTML, no
honor system, no backend.

**Fastest way it dies.** This is a taste market and we have no audience. Every seller in the table
monetized an audience earned first: Tailwind Plus on 96,074★ since 2017; GoReleaser Pro on 15,960★
since 2016; Magic UI Pro on 21,686★ since 2023. **Not one cold-start instance appears anywhere in
this round's evidence.** Kill test: if the free repo shows no real star velocity within 90 days, it is
dead — archive it without ceremony.

**Stated plainly so the recommendation cannot be misread:** this candidate cannot produce revenue this
cycle. If the company will not fund a 6–12 month audience build, the correct answer is **zero
candidates**, and I will defend that answer.

---

## 3. Verdict on the widening question

**The GitHub-native developer-tool market does have a self-serve middle — round 1 searched a
sales-gated corner of it. But the middle is walled by servers, and that wall is exactly our
constraint.** (The concurrent round-2 report reaches the same verdict from the SaaS side; we agree,
independently, by different routes.)

Every GitHub-native product with a published price and a completable card checkout that also has
traction runs a backend: CI runners (Depot $20/$200, Blacksmith, BuildJet, Namespace, WarpBuild),
caches (Cachix $50/$90/$160, pulled live from `checkout.paddle.com/api/2.0/prices`), or hosted
inference (CodeRabbit $30/$60 per seat, Codecov $12/user). The backend *is* the value metric that
makes self-serve pricing legible.

Strip the backend out and the cohort collapses. `license_key filename:action.yml` returns 144 **code
rows**, which de-duplicate to **99 distinct repos** — *`memories/consensus.md` line 228 says "144
repos already meter on it"; that number is wrong and should be corrected.* Of those 99: **median 0
stars, 56 at exactly 0**, and all four repos above 500★ are false positives — internal
`.github/actions/` CI plumbing at OpenReplay, New Relic, dotCMS and Dust, not products. The two
recognisable license-gated Actions both **fail (b)**: Diffblue Cover (31★) is 6× "Book a demo";
Liquibase Pro (core 5,564★) publishes **no price at all**, only "Get a Quote" ×5. GitHub forecloses
the easy path itself: *"Paid plans are restricted to apps published by verified publishers"* — Apps
only — and `github.com/marketplace?type=actions` contains **zero dollar signs across 439,460 bytes**.

The one genuine no-backend counterexample is **GoReleaser Pro** (C3), which earned 15,960 stars over
eight years before charging anything.

**So the binding constraint has moved.** Round 1 asked "will anyone pay self-serve?" That is now
answered **YES**, with completable checkouts. The new question is **distribution**, and there the
evidence is uniformly against us: the rail gives free production, free hosting, and **no audience**.
Actions Marketplace has no billing, GitHub has no ranked commercial discovery surface, and a
`github.io` site has no domain authority.

---

## 4. The killed list, each with the fetched fact

- **Paid GitHub Action, license-key metered** (round 1's shape, revived and re-killed). 99 distinct
  repos, **median 0 stars, 56 at zero**. Only self-serve instance: PullGuard —
  `buy.stripe.com/8x214ndWb51h8tJ1xwfnO00` and `…fnO01` both **HTTP 200**, $29/$99 per month — at
  **2★ / 0 forks / 0 watchers / created 2026-04-08**. Mechanically passes (b); citing it as market
  evidence is precisely the round-1 error, so it is killed, not proposed.
- **AI-agent artifacts (Claude Code skills, MCP servers, prompt packs).** My own Gumroad harvest, 158
  products: top item by traction is **`"price":0.0` with `"reviewCount":136`**; `15claudeskills` is
  **$0.00 with 40 reviews**; best paid item $69.99 × 42. **A $0 price floor — SnapOG's failure mode
  exactly.** The MCP-registry rail is real and free; it is not a business.
- **Code templates / boilerplates on Gumroad.** 147 products harvested: best-selling *code* item is
  **$5.00 × 168 reviews** (~$840 lower bound) against **$129 × 1,558** for design. Cold-start code
  files clear at roughly 1/200th of design files — the finding that most constrains a company whose
  only production capability is code.
- **Compliance/policy document packs for small trades (HACCP, RAMS, GDPR, ISO 27001).** Killed on
  **(e)** before fetching a price: Munger's sub-rule forbids anything where being wrong exposes a
  stranger to statutory or financial liability. Same reason the CRA idea died.
- **Paid job boards / paid listings.** `weworkremotely.com/remote-jobs/new` → **403**. A real
  self-serve market and structurally a static site, but the product *is* the audience; a board with
  no traffic sells no listings, and capital cannot shortcut that.
- **Hosted MCP marketplaces** (Smithery, $25–$330 on page). It is a hosting platform. Backend required.
- **GitHub Marketplace billing.** *"Paid plans are restricted to apps published by verified
  publishers."* Apps only, verified only. Closed to us.
- **Template pack sold cold on Gumroad with no free OSS repo.** The $49 median is real, but without
  the free artifact there is no acquisition engine — that is candidate #1 minus its only
  distribution mechanism.

---

## 5. Blind spots

1. I verified **checkout pages**, not completed **purchases**. No card was entered.
2. `reviewCount` is reviews, not sales. Treat price × reviewCount as a strict **lower bound**.
3. Gumroad `/discover` traffic is unmeasured — I assert it is an aggregator but did not verify volume.
4. I measured supply and free floors, not stated demand. No Reddit/HN search for "I would pay for this."
