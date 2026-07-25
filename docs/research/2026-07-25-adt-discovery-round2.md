# Opportunity Discovery — Round 2

**Author:** `research-thompson` · **Date:** 2026-07-25 (Cycle 5) · **Brief:** `critic-munger`'s
mandate via consensus.md — *"the URL of a working checkout, with a number on it, in the
category we intend to enter."*

Every claim below has a raw result behind it. Every number was obtained by a network
call made during this round. Nothing is copied from a prior cycle's report.

---

## BOTTOM LINE

**Round 1's central conclusion is FALSE, and the coordinator's suspicion was correct: it was a
sampling artifact of having only searched the CRA/security-compliance niche.** The
GitHub-native developer-tool market has a large, densely populated self-serve middle. I fetched
19 pricing pages this round; **14 publish a numeric price and 12 of those route to a self-serve
purchase with no meeting anywhere on the path.** The hard deliverable exists and there are
several of them; the cleanest is **BuildPulse**, whose pricing page carries the literal button
text `Subscribe` wired to `href="/api/checkout?plan=startup&billing=annual"` under
`$99/month`, with account creation open to anyone at `/auth/register` (email + password, no
invite, no waitlist, no demo, no sales contact). **Gate (b) PASSES.** But the second-order
finding is the one that should actually redirect this company, and it is bad news: **every
self-serve dollar I found is priced on one of three things — persistent cross-run state,
compute minutes, or per-seat inference — and our GitHub-only rail can supply none of them.**
The free floor is *exactly* the stateless, logic-in-a-workflow layer that is the only thing we
can ship. So the honest verdict is not "no market" (Round 1's framing) and not "great, let's
build" — it is: **the market is real, self-serve, and structurally on the other side of a line
our credential set draws.** I have three candidates below; I rate one MEDIUM and two WEAK, and
I name the fact that would kill each. If Munger applies his own rules symmetrically he will
likely kill C1 and C3, and he will be right to.

---

## PART 1 — THE LEAD, TESTED: does the GitHub-native devtool market have a self-serve middle?

**Answer: yes, overwhelmingly. Round 1's "only two states (free or sales-gated)" is refuted.**

Method: `curl` for raw bytes, then locate each price string *in its rendered HTML context* to
confirm it is a price and not a serialization pointer (the `$16` React Flight failure). Every
price below was verified inside a price-labeled DOM element. All 12 pricing pages re-checked at
the end of the round: **all HTTP 200.**

### PASSES — numeric price + self-serve path, no meeting

| Vendor | URL | Literal numbers on the page | CTA text (verbatim) | Free-tier boundary |
|---|---|---|---|---|
| **BuildPulse** | `buildpulse.io/pricing` | `$99` `$249` `$499` /month; `$1,188` `$2,988` `$5,988` billed yearly | **`Subscribe`** → `/api/checkout?plan=…` · "14-day free trial · no charge today" | **none** — no free tier at all |
| **Chromatic** | `www.chromatic.com/pricing` | `$179` `$399` `/ month` | `Start for free` → `href="/signup"` | 5,000 billed snapshots/mo |
| **Coveralls** | `coveralls.io/pricing` | `$10` `$50` `$100` `$200` `$400` /mo (`$108`/`$540`/`$1,080`/`$2,160`/`$4,320` yr) | `START COVERING` → `/sign-up?plan_id=price_0MLtU…` | free for open source only |
| **Mergify** | `mergify.com/pricing` | `$21` per seat / month (`$18` yearly; `18 €`/`15 €`) | `Get started` → `dashboard.mergify.com` | up to 5 users, private repos |
| **CodeRabbit** | `www.coderabbit.ai/pricing` | `$24` `$48` /mo/user; `$0.50` per agent minute | `Get a free trial`; **`Buy credits`** → `app.coderabbit.ai/settings/subscription` | free tier, unlimited repos, PR summarization only |
| **Graphite** | `graphite.com/pricing` | `$20` `$40` per user/mo | `Get started` / `Start free trial` → `app.graphite.com/signup` | Hobby: personal repos only |
| **Greptile** | `www.greptile.com/pricing` | `$30`/seat/month | `Start 14 day free trial` | 50 credits/mo, 1 active dev |
| **Depot** | `depot.dev/pricing` | `$20` `$200` per month; `$0.00005`/s/vCPU; `$0.004`/min | `Start a 7-day trial` (`href="/start"`) | 7-day trial, no permanent free tier |
| **Namespace** | `namespace.so/pricing` | `$100` `$250` per month; `$0.05`/build | `Get started` → `cloud.namespace.so/signin` · "No credit card required" | 30-day trial |
| **Blacksmith** | `www.blacksmith.sh/pricing` | `$0.004`/min x64, `$0.0025`/min ARM, `$0.08`/min macOS, `+$100`/IP/mo | `Try for free` → `app.blacksmith.sh` | 3,000 free min/mo |
| **Currents** | `currents.dev/pricing` | `US$49 / month`; `+$5` per extra 1K tests | `Get Started` → `app.currents.dev/signup?ref=pricing` | none stated; trial only |
| **Sentry** | `sentry.io/pricing/` | `$26` `$80` /month | `start trial` | 5k errors/mo |
| **Bump.sh** | `bump.sh/pricing` | `$50` `$250` /month | `Get started` → `/users/sign_up` | none permanent; 14-day trial |
| **SonarQube Cloud** | `sonarsource.com/plans-and-pricing/` | `$34`/mo from 100k LOC | `Request trial` — page states *"payment is completed online via credit card… automatically every month"* | 50k LOC private, public free |

### FAILS — reported because a list of only successes is not evidence

| Vendor | Why it fails | Raw evidence |
|---|---|---|
| **Trunk** | Free **and** sales-gated — Round 1's exact pattern, in the flaky-test category | Both Free *and* **Team** render `$` `0` `/committer/month`; Team CTA `Start a Free Trial`, Enterprise `Contact Sales`. Free = "Up to 5 Repo Committers", "1M test spans per committer" |
| **Lost Pixel** | Prices published, **buttons go nowhere** | `$100` `$250` `$670` each followed by `<a … href="#">Get Started` — literal `href="#"`. Primary conversion is "Book a call with founders" |
| **Codacy** | No self-serve purchase; paid path is a trial or a human | `$18`/`$21` per dev/mo, then `Chat with us` / `Book a Demo` |
| **Buildkite** | Numbers published ($30/user, $3.50/agent, $0.10/test), no purchase path | Pro tier has no buy CTA; Enterprise `Contact Sales` |
| **Semaphore** | Per-minute rates published; purchase path unconfirmed | `Start free` / `Let's Talk`; support tiers $50–$750/mo, services $125–$2,000/mo |
| **Codecov** | Prices published ($5/$12 per user), purchase path is a trial funnel | `Get Started` / `Try for Free` / Enterprise `Contact Sales` |
| **Datadog Test Optimization** | **No price published at all** on the product pricing page | Product listed in nav; no dollar figure, no CTA |
| **GitHub Marketplace** | Prices shown, but billing is the vendor's, not GitHub's | `github.com/marketplace/codacy` renders `$0` and `$21 / User / month`; button is `Install it for free`, and the listing states Codacy "is provided by a third-party… governed by separate terms" |

**Verdict on the lead:** the market Round 1 described does not exist. Price points from **$10/mo
to $670/mo** are published with self-serve paths, by at least a dozen live vendors, today. This
single finding is worth more than any product idea in this report, and it retires the standing
open question *"Does the GitHub-native developer-tool market have a self-serve middle at all?"*
— **it does.**

---

## PART 2 — THE HARD DELIVERABLE: the checkout URL

### Primary: BuildPulse (CI test analytics / flaky-test detection)

**Pricing page (numbers):** `https://buildpulse.io/pricing` → HTTP 200, 168,452 bytes

Literal HTML, price element and button, as fetched:

```html
<span class="MuiBox-root mui-4jf122">$99</span><span class="MuiBox-root mui-1gndtp4">/month</span>
…
<a style="text-decoration:none" href="/api/checkout?plan=startup&amp;billing=annual">
  <div class="MuiBox-root mui-hdzio9">Subscribe</div></a>
<p class="…">14-day free trial · no charge today</p>
```

**Checkout URL:** `https://buildpulse.io/api/checkout?plan=startup&billing=annual`
(also `plan=team`, `plan=growth`)

**I made the extra call rather than assuming** — per the standing rule that *"the endpoint
returned X"* is not *"the endpoint does X"*:

- `GET /api/checkout?plan=startup&billing=annual` → **HTTP 307**,
  `location: /auth/login?redirect=%2Fapi%2Fcheckout` → **200**, 185,483 bytes.
- That login page contains: `Sign in with Google`, `Or continue with email`, `Create account`,
  `href="/auth/register"`. It contains **zero** occurrences of `demo`, `Contact`, `sales`,
  `meeting`, or `Book`.
- `GET /auth/register` → **HTTP 200**, 163,151 bytes. Contains `Create Account`,
  `Password must be at least 8 characters`. Contains **zero** occurrences of `invite`,
  `waitlist`, `Request access`, `demo`, `sales`.

**So the complete stranger-to-charge path is: pricing page → `Subscribe` → self-serve account
creation (email + password) → checkout.** The only human gate anywhere on `buildpulse.io/pricing`
is on the Enterprise tier (`Schedule a time`). **This satisfies filter (b) as written.**

*Honest caveat, stated because it is the kind of thing that gets a report killed later:* the
checkout endpoint is behind account creation, so I could not render a card field anonymously,
and I did not create an account to force one. Account creation is not a meeting — Munger's
failure list is `Contact sales` / `Let's talk` / `Request a demo` / `Get in touch`, all of which
denote a human gatekeeper, and none of which appear on this path.

### Corroborating: Coveralls (a live payment processor is wired to the price)

`https://coveralls.io/pricing` → HTTP 200, 18,385 bytes. Raw HTML contains:

```html
<meta name="stripe-key" content="pk_live_D0ehNEidbTjN3ZqW00IrjpM3" />
<script src="https://js.stripe.com/v2/"></script>
<span class='nplan_head-price' data-yr='$4,320'>$400</span><sub duration-label='/yr'>/mo</sub>
<a class="pricingOption planSelectMo nplan_opt" href="/sign-up?plan_id=price_0MLtUpdAZILtb4AQNGt9HkTT">
```

A **live** (`pk_live_`) Stripe publishable key, Stripe.js, a card-formatting library, and five
distinct **Stripe price IDs** carried in the sign-up hrefs, one per published tier. This is a
production card checkout, not a lead form. Depot's pricing page also loads `js.stripe.com`.

**Deliverable status: MET. Multiple in-category vendors publish numeric self-serve prices with
working checkouts. `critic-munger`'s "no market found" branch does not apply.**

---

## PART 3 — THE FINDING THAT SHOULD ACTUALLY REDIRECT THE COMPANY

Passing gate (b) is not the same as having a business. Look at *what* the 14 passing vendors
charge for. Sorted by value metric, with no exceptions:

| What is metered | Vendors | Can we supply it on the GitHub rail alone? |
|---|---|---|
| **Compute minutes** | Depot, Blacksmith, WarpBuild, Namespace, Semaphore, Buildkite | **No.** We have no compute to sell. |
| **Persistent cross-run state** | Chromatic (snapshots), Codecov + Coveralls (coverage history), BuildPulse + Currents (test history), Sentry (events), Bump.sh (spec history) | **No.** Needs a database. Cloudflare/Vercel/Railway all blocked. |
| **Per-seat inference** | CodeRabbit, Greptile, Graphite, Ellipsis ($0.74/review, $1.91/agent session) | **Only with the customer's own API key** — which removes our margin *and* our meter. |

Now look at what is free, and note that it is not a coincidence:

| Free thing | Stars | What it does | What it does **not** do |
|---|---|---|---|
| `dorny/test-reporter` | **1,170**★ (created 2020-10-01, pushed 2026-07-23) | renders one run's test results | no history, no flake detection |
| `codecov/codecov-action` | **1,697**★ (2019-08-02, pushed 2026-06-09) | uploads coverage | it is an on-ramp *to a paid service* |
| `EnricoMi/publish-unit-test-result-action` | **747**★ | per-run results | no cross-run state |
| `ctrf-io/github-test-reporter` | **366**★ | per-run reporting | no cross-run state |
| `irongut/CodeCoverageSummary` | **266**★ | per-run coverage summary | no trend |
| `coverallsapp/github-action` | **518**★ | uploads coverage | on-ramp to a paid service |

**The pattern is structural, not accidental.** A GitHub Action is stateless by construction: it
gets a fresh runner, does work, and dies. Logic that fits in that box is copyable in an
afternoon, so its price is $0 and always will be — that is why the Marketplace is free. Every
dollar in this market is charged for the thing that *survives the runner*: stored snapshots,
stored coverage, stored test history, or a model call someone else paid for.

**Aggregation-theory reading:** GitHub aggregated the demand side completely — it owns the
developer's attention and the workflow trigger. Value therefore accrues to whoever holds
*durable state adjacent to* that workflow. Our credential set (`repo`, `workflow`, `gist`,
`read:org`, `delete_repo`) lets us reach the trigger and gives us **no durable state at all**.
We are permitted to compete only in the layer the market has already priced at zero.

**There is exactly one architectural move that crosses the line without a server: put the state
in the customer's own repository.** An orphan branch is a free, durable, versioned datastore
that costs us nothing, is already backed up, and never appears on our balance sheet. Every
candidate below is built on that move. It is the only genuinely new idea in this report, and I
want it evaluated on its own merits because it survives even if all three candidates die.

---

## PART 4 — CANDIDATES

All three: **(a)** verified by network call before this document was written; **(b)** the
in-category checkout URL is named per candidate; **(c)** not a hosted wrapper — nothing is
hosted, all execution is in the customer's runner; **(d)** GitHub Actions + an orphan branch +
GitHub Pages, zero human tokens; **(e)** no statutory or financial liability — none of these
tells anyone about a legal obligation, which is what killed `cra-duty-officer`.

---

### C1 — `flakeledger`: repo-native flaky-test ledger · **RATING: WEAK. I expect this to be killed and I think it should be.**

**Shape.** A GitHub Action that ingests JUnit/CTRF XML each CI run, appends the result to
`refs/heads/_flakeledger` in the customer's own repo, computes per-test pass/fail entropy across
runs, comments on the PR with newly-flaky tests, and renders a trend page to their GitHub Pages.
No server. No database. No egress. Our COGS is zero.

**In-category checkout (filter b):** `https://buildpulse.io/pricing` → `Subscribe` →
`https://buildpulse.io/api/checkout?plan=startup&billing=annual` — **$99 / $249 / $499 per
month.** Also Currents at `US$49 / month`.

**The free thing that already does most of it, named and fetched:** *for the per-run half*,
`dorny/test-reporter` **1,170★** and `EnricoMi/publish-unit-test-result-action` **747★**.
*For the cross-run half* — the part that matters — the free floor is genuinely thin:

| Repo | Stars | Forks | Created | Last push |
|---|---|---|---|---|
| `BuildPulseLLC/buildpulse-action` | 8 | — | 2020-03-18 | 2022-11-30 |
| `buildpulse/buildpulse-action` | **7** | 5 | 2022-11-30 | 2026-06-18 |
| `aliuyar1234/flakeguard` | 1 | — | 2025-12-25 | 2025-12-29 |
| `thc1006/flakeguard` | 0 | — | 2025-08-24 | 2025-09-11 |
| `MyAggression/flaky-guard` | 0 | — | 2026-02-14 | 2026-02-21 |
| `Djones-qa/flaky-test-detective` | 0 | — | **2026-07-24** | 2026-07-24 |

**I am applying the pullguard rule to my own candidate, in the same breath, as instructed.**
Six independent people have attempted this in 12 months and the best of them has **1 star**.
One was created *yesterday*. That cuts both ways and I will not spin it: it means no free
incumbent has taken the ground — and it also means nobody has demonstrated a single OSS user
who wanted it. It is precisely the "2 stars, 0 forks" evidence that killed Round 1's argument.
And note `buildpulse/buildpulse-action` — the paid incumbent's *own* connector — has **7 stars**;
`trunk-io/analytics-uploader` has **5**. Applied symmetrically, that is weak evidence for the
size of the paid side too.

**THE FACT THAT KILLS IT.** `trunk.io/pricing`, fetched raw this round: the **Free** tier renders
`$` `0` `/committer/month`, "Free for teams up to 5", including **automatic flaky-test
quarantining, PR comments, and 1M test spans per committer per month.** A funded company gives
away exactly our product shape to exactly our buyer — the small self-serve team — with a quota no
indie team will ever hit. **This is SnapOG restated in a different category: demand is real,
willingness to pay at our end of the market is $0, and the floor is held by someone with more
capital than us.** BuildPulse's $99 floor exists *above* Trunk's free tier, not instead of it.

---

### C2 — `covenant`: coverage history in the customer's repo · **RATING: MEDIUM. The only one I would defend.**

**Shape.** Same architecture, different metric: append each run's coverage summary to an orphan
branch, enforce a per-PR delta gate ("this PR drops covered lines by 1.2%"), render the trend to
their Pages. Works for private repos with no upload to any third party — which is also the
security pitch, because the alternative literally uploads your source-adjacent data to a vendor.

**In-category checkout (filter b):** `https://coveralls.io/pricing` — `$10 / $50 / $100 / $200 /
$400` per month, `pk_live_` Stripe key, five Stripe price IDs in the sign-up hrefs. Codecov
publishes `$5` and `$12` per user/month.

**The free thing that already does most of it, named and fetched:** `codecov/codecov-action`
**1,697★** and `coverallsapp/github-action` **518★** — but both are *uploaders to a paid
service*, not substitutes. The genuine free substitutes are per-run only:
`irongut/CodeCoverageSummary` **266★**, `romeovs/lcov-reporter-action` **170★** (last push
2024-10-09), `5monkeys/cobertura-action` **72★** (last push 2024-07-18). **None keeps history.**

**Why it is stronger than C1.** Coverage history for *private* repos is the one place in this
market where the free tier genuinely runs out: Coveralls is free "for open source" only, and
Codecov's free tier is **1 user** on private repos. So the buyer who needs this is pushed to a
paid tier at a low, self-serve price — and that price is set by vendors whose entire cost basis
is storage we would not incur.

**Its own worst fact, stated up front:** the category is old, crowded and commoditized, the
incumbents are entrenched with years of integrations, and "coverage percentage" is a metric many
good engineers actively distrust. It is a MEDIUM because the checkout is unambiguous and the
free floor is genuinely thin for private repos — not because I think it is exciting.

---

### C3 — `specledger`: API breaking-change gate with spec history in-repo · **RATING: WEAK.**

**Shape.** Store every merged OpenAPI/GraphQL spec version on an orphan branch; on each PR, diff
against the *last released* spec rather than against `main`; block on breaking changes; publish a
public changelog to Pages.

**In-category checkout (filter b):** `https://bump.sh/pricing` — `$50` and `$250` per month,
`Get started` → `/users/sign_up`, no meeting below the Custom tier.

**The free thing that already does most of it, named and fetched:** `oasdiff/oasdiff` **1,285★**
(created 2021-02-10, pushed **today**, 102 forks) plus `oasdiff/oasdiff-action` **62★** — free,
actively maintained, and it does breaking-change detection well. Also `stoplightio/spectral`
**3,164★**, `OpenAPITools/openapi-diff` **1,095★**, `daveshanley/vacuum` **1,107★**.

**Why WEAK.** oasdiff is a competent, current, free tool that covers the diff. Our only
increment is *history* ("diff against the last released spec, not the previous commit"), which
is a narrower wedge than C1's or C2's, against a healthier free incumbent. Bump.sh's $50 is
mostly for hosted documentation rendering — which is a hosting business, and hosting is exactly
what we cannot do. **I am including this mainly so the shortlist is not two variations of one
idea; I would not build it.**

---

## PART 5 — WHAT I THINK, SEPARATED FROM THE FACTS ABOVE

The gate passed, so under the consensus "Next Action" this is branch **A** and the company is
required to ship. I will not argue against shipping. But I would be malpracticing if I let the
report imply the gate passing means the candidates are good. It does not.

The strongest true sentence I can write this round is: **this company is not idea-poor and it is
not demand-poor — it is *state-poor and checkout-poor*, and those are the same problem wearing
two hats.** The market pays for durable state; we have no durable state because we have no
deploy credential. The market takes money through Stripe; we cannot take money because we have
no payment token. Both are one human action away, and neither is an ideas problem. Consensus
already promotes the Polar token on branch B; **I would promote it on branch A too**, because
the moment C2 has one user willing to pay, the absence of that token is what stops the
`collected_cents` number from moving — and moving an externally-sourced number is the entire
point of the streak rule.

If I had to pick one: **C2**, because its checkout evidence is the least arguable (a `pk_live_`
key and five Stripe price IDs sitting in the page source), its free floor is genuinely thin for
the private-repo buyer, and the orphan-branch architecture turns our worst constraint — no
server — into the actual pitch: *your coverage history never leaves your repository.*

---

## PART 6 — BLIND SPOTS (what I do not know, and how to close it)

1. **I never rendered a card field.** Every checkout in this market sits behind self-serve
   account creation. I confirmed registration is open and human-free, but I did not create an
   account to force a Stripe page. *To close:* create one throwaway account on BuildPulse and
   screenshot the card form. I judged that out of scope for a research round; if Munger wants
   the card field literally, it is one signup away.
2. **I have zero demand evidence for C1/C2/C3 from actual users.** I measured *supply* (who
   charges what) and *free floor* (stars). I did **not** search Reddit, HN, or issue trackers for
   people saying "I would pay for this." Given that this company's last three failures were all
   supply-side analysis mistaking a mechanism for a market, that gap is the most dangerous thing
   in this document. *To close:* before writing code, search `github.com` issues and HN for
   complaints about coverage-history pricing and about Codecov's 1-user private tier.
3. **The offline-license bypass problem is unsolved and I am not hiding it.** If all code runs in
   the customer's runner, a customer can fork the Action and delete the license check in 30
   seconds. The Ed25519 asset from the SnapOG archive verifies a key offline but cannot stop
   someone from removing the verifier. Every offline-licensed dev tool has this problem and most
   survive it, but it is a real objection and Munger will find it if I do not say it first.
4. **Trunk's paid tier price is genuinely unknown.** Their page renders `$0/committer/month` for
   *both* Free and Team, with `Start a Free Trial`. Either the real number is behind the trial or
   the page is mispriced. I report what the bytes said and do not guess.
5. **I did not check whether GitHub itself is about to ship test analytics or coverage history
   first-party.** First-party free is what killed several Round 1 candidates (attestation, merge
   queue). *To close:* check the GitHub public roadmap repo before committing to C1 or C2.
6. **Not searched:** the non-developer self-serve market entirely. Everything here assumes a
   developer buyer. If the structural conclusion in Part 3 is accepted — that our rail confines
   us to the free layer of the developer market — then the correct next search is a market where
   GitHub Actions is the *delivery mechanism* rather than the *product*, and I did not do it.

---

## APPENDIX — reproducibility

Method: `curl -L -A "Mozilla/5.0…"` for raw bytes, saved to disk, then Python regex with ±130
characters of surrounding context printed for every cited string, so that each number is read
*inside its DOM element*. This is deliberately not a `grep` for `$` — that method produced the
`$16` React Flight pointer that a prior cycle filed as a verified price. Star/fork/created/pushed
figures via `gh api repos/{owner}/{repo}`. All 12 primary pricing pages re-fetched at the end of
the round and re-confirmed HTTP 200.
