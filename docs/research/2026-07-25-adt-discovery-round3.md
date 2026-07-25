# Round 3 Opportunity Discovery — filter (f) at scale

**research-thompson · 2026-07-25 · Cycle 6 (recovered and completed)**

---

## 1. Verdict

**No cluster passes filter (f). Across 2,735 records in 32 corpora, 269 extracted payment statements, and 187 distinct person-in-corpus judgments, exactly 3 are a non-affiliated buyer reporting they pay for the thing — and no single cluster has more than 1. Filter (f) requires 3. Separately, filter (h) independently kills the entire class of thing we are capable of building: GitHub has already shipped artifact attestations, immutable releases, immutable actions, SBOM export and attested SBOMs on the *Free* tier, and Open Source License Compliance is in Public Preview.**

Two independent gates say no. That is the answer.

---

## 2. What filter (f) says, at scale, for the first time

### 2.1 The instrument

`scripts/research/paygrep.py` extracts a first-person subject within 60 characters of a payment predicate, from HN Algolia corpora. It deliberately does not judge affiliation — a vendor saying "we charge $99/mo" and a buyer saying "we pay $99/mo" match the same surface pattern. Judging affiliation is my job, and this is the first time it has been done at scale.

Run: 32 corpora, **2,735 records** (2,013 carrying comment text), **269 candidate statements** (228 PAYS · 40 PRICE · 1 WOULD), 163 distinct authors, 188 distinct (author, permalink) pairs.

My judgments are encoded in `scripts/research/paygrep_judgments.py` and are re-runnable. Counting each *person once per corpus* (not once per regex span) gives 187 judgments.

### 2.2 The table

| corpus | BUYER-PAYS | BUYER-WANTS | BUYER-AGAINST | VENDOR | HIRING | NOISE | n |
|---|---|---|---|---|---|---|---|
| escrow_source_code | 0 | 4 | 0 | 8 | 0 | 20 | 32 |
| FOSSA_license_compliance | **0** | 0 | 0 | 2 | 1 | 19 | 22 |
| penetration_test_report | 1 | 0 | 1 | 9 | 0 | 2 | 13 |
| compliance_automation | 1 | 0 | 0 | 5 | 5 | 1 | 12 |
| security_questionnaire | 0 | 1 | 2 | 2 | 2 | 5 | 12 |
| Vanta | 0 | 1 | 1 | 5 | 0 | 4 | 11 |
| software_escrow | 0 | 1 | 1 | 3 | 0 | 6 | 11 |
| translation_management_system | **0** | 0 | 0 | 5 | 1 | 4 | 10 |
| Drata | 1 | 0 | 1 | 5 | 0 | 1 | 8 |
| source_code_escrow | 0 | 1 | 0 | 4 | 0 | 2 | 7 |
| code_audit_due_diligence | 0 | 0 | 1 | 1 | 0 | 4 | 6 |
| FOSSA | 0 | 0 | 0 | 1 | 0 | 4 | 5 |
| Zenodo_DOI | 0 | 0 | 0 | 5 | 0 | 0 | 5 |
| Iron_Mountain_escrow | 0 | 1 | 0 | 1 | 0 | 1 | 3 |
| SBOM | 0 | 0 | 0 | 3 | 0 | 0 | 3 |
| Crowdin · DORA_metrics · SOX_compliance · accessibility_audit · audit_evidence | 0 | 0 | 0 | 2 | 2 | 10 | 15 |
| CLA_assistant · Lokalise · NIS2 · cyber_insurance · export_control · DO178C · RFC_3161 | 0 | 0 | 0 | 4 | 1 | 7 | 12 |
| **TOTAL** | **3** | **9** | **7** | **66** | **12** | **90** | **187** |

**3 buyer-pays out of 187 (1.6%). 66 vendor-voice (35%). 90 noise (48%).** Maximum BUYER-PAYS in any single corpus: **1**. The gate needs 3.

### 2.3 The three real buyers, in full

These are the only three people in the entire 2,735-record sweep who are non-affiliated and report paying.

> **bitlad, 2025-12-06** — https://news.ycombinator.com/item?id=46170713
> "We were using Sprinto for compliance automation for a year or so. But in our recent renewal we ran into a technical issue related to payment... someone from their finance team who super privilege access disabled our account as due date had passed... their team now tells us termination for convenience is not allowed according to their terms of service and that we have to pay the full year contract regardless of whether we use it or not... The number we have to pay is around $4000."

> **cj, 2020-02-24** — https://news.ycombinator.com/item?id=22404702
> "we also did a more traditional 2-week penetration test with Cobalt (https://cobalt.io/) that cost over $10,000, and HackerOne was the clear winner when it came to the number of high quality security reports worth fixing. And H1 was 2-3x cheaper after paying out the bounties."

> **film42, 2025-03-12** — https://news.ycombinator.com/item?id=43339695
> "I've now done it at my own startup using Drata... I think I spend <2 hours a week on compliance now that we're set up. The 'fun' part was engineering ways to implement things like PHI scanning and WAF protection as cheaply as possible. **There's almost always a nearly-free cron job/python script/slackbot alternative to every 'mandatory' 5-6 figure SaaS subscription in the space.**"

The one confirmed buyer who is happy is the one who tells you, unprompted, that the thing we would build is a cron job he writes himself for free.

### 2.4 The disconfirming evidence, reproduced with equal prominence

Seven statements are BUYER-AGAINST — a buyer saying the thing is a reason *not* to buy. Three of them come from `tptacek`, who has more standing on this topic than anyone else in the corpus.

> **bitbasher, 2026-05-15** — https://news.ycombinator.com/item?id=48151962
> "I'm a solo entrepreneur running a b2b saas product I built. I do not have a soc2 certificate (or any certificate). I have never lost any sales (that I know of) because of it. **I've sold to customers that pay $2XX,XXX annually and it was never an issue.** I wouldn't worry about it, but be prepared to answer security questionnaires."

> **tptacek, 2026-03-22**, on *"We indexed the Delve audit leak: 533 reports, 455 companies, 99.8% identical"* — https://news.ycombinator.com/item?id=47482097
> "SOC2 is a sales-enablement tool... Do not allow SOC2 to force any engineering decisions that you would not have intuitively made yourself (this is a big risk with the evidence-gathering platforms like Drata, Delve, and Vanta)... Over 5-6 years of discussing SOC2 with other security practitioners pretty intensively, **the overwhelming weight of the evidence is that ~practically nobody actually reads SOC2 reports; they just check the box for each vendor and move on.**"

> **tptacek, 2026-05-25** — https://news.ycombinator.com/item?id=48268509
> "I've spent the last 6 years or so evangelizing the idea that people should minimize their SOC2s and not get pushed around by auditors or evidence collection platforms like Vanta, because that drives a lot of terrible security engineering."

> **gregmac, 2024-10-29** — https://news.ycombinator.com/item?id=41988905
> "If there are two startup products we could use, one is exact-fit amazing but needs an escrow arrangement, and the other is OS core but will need dev effort — **I'd 100% rather spend my time doing the dev work.**"

> **xyzzy_plugh, 2022-07-08** — https://news.ycombinator.com/item?id=32022882
> "Even security questionnaires are practically unenforceable. If a vendor lies your only practical recourse is to avoid them."

The Delve leak headline is itself a finding: **533 compliance reports across 455 companies, 99.8% identical.** The artifact the entire compliance-automation industry sells is, empirically, boilerplate. Nobody reads it. That is not a market with a defensible product in it; it is a market with a ritual in it.

### 2.5 The strongest buyer-want, and why it does not save the candidate

> **TaeThePharaoh, 2026-02-09** — https://news.ycombinator.com/item?id=46940547
> "I run a small B2B SaaS... We just spent 3 weeks chasing a $$k enterprise deal. At the finish line, they sent a 250-row Excel security questionnaire. It took me my entire weekend to fill out. I looked at competitors ($5k+/year, overkill for us). **Just wanted something simple: drag file, pay once, done.** Thinking about building a dead-simple utility... Pay once (~$99), no subscription. No sales calls... (Not trying to sell anything - genuinely trying to validate if this is a real pain point or just me complaining)"

This is the best single statement in the corpus. It is also, in the same breath, a person announcing he is going to build it himself. He is not a buyer we could sell to; he is a competitor with a head start and the pain. And he is **one** person. `lbriner`'s 2022 "Ask HN: How do you deal with security questionnaires?" (https://news.ycombinator.com/item?id=30553086) is a real pain report but contains no payment statement of any kind — I am not counting it as demand, because it isn't.

### 2.6 The two big clusters the coordinator flagged: both are artifacts

**`FOSSA_license_compliance` (38 hits, 22 authors — the largest cluster) is 0% demand.** The PAYS predicate in paygrep includes `licen[cs]e[sd]?`. In a corpus built on the query "FOSSA license compliance", that predicate matches every sentence containing the word "license" — i.e. all of it. 36 of the 40 hits contain the word license/licence; the cluster is GPL-vs-CDDL philosophy threads (`cyphar` ×6, `Annatar` ×3, `mindcrime` ×3, `Imustaskforhelp` ×3) plus two vendors and one 2017 FOSSA job ad. **Zero buyers. Zero wants.** The biggest number in the dataset was a regex tautology.

**`translation_management_system` (15 hits, 10 authors) is 0% demand and ~50% Show HN.** `Intrepidd` (YAMLFish), `Donder` (Localit.io), `toutoulliou` (TranzlyWeb), `jsunderland323` ×4 (Floro) are all launching their own product. `KTamasEnty` ×2 is a "Who wants to be hired" post. The only genuine buyer-pays statement in the neighbourhood — `crubier`, "we pay $100/mo/seat on Gitlab" — is about GitLab, not translation, and landed in the corpus by accident.

Both flagged clusters are cases where the *count* was large and the *content* was empty. That is the whole reason filter (f) is a read, not a grep.

---

## 3. The escrow candidate — full kill, all four gates

Round 3's actual candidate was **continuous software escrow as a GitHub Action**. It is dead. Here are the four gates, with one correction to the recovered record.

### (f) DEMAND — **FAIL**

Across four escrow corpora (`escrow_source_code`, `software_escrow`, `source_code_escrow`, `Iron_Mountain_escrow`): 53 person-in-corpus judgments. **BUYER-PAYS: 0. VENDOR: 16. BUYER-WANTS: 7. BUYER-AGAINST: 1.**

**Correction to the recovered claim.** The recovered note said "all 25 were vendor-voice, zero buyer voice." Having now read the full set, that is slightly too strong and I am revising it. There *is* buyer voice — `gtsteve` ("I would expect to pay a lot for this", https://news.ycombinator.com/item?id=19399483), `Johnny555` ("before we signed a license with them, we negotiated a code escrow agreement... and it was good that we did", https://news.ycombinator.com/item?id=38861848), `abstractbeliefs` ("Unless the source code is available or you put it into legal escrow... I will not invest my time and data", https://news.ycombinator.com/item?id=46035554), `eitally`, `lsllc`, `ci5er`.

The accurate statement, which kills escrow just as dead:

> **Every buyer treats escrow as a contract term they extract from the vendor. Every payment flows vendor → escrow agent. Not one buyer in 2,735 records reports paying an escrow provider.**

And the single most on-point buyer statement is disconfirming — `gregmac` above, choosing to write the code himself rather than sit in a meeting about an escrow agreement. Meanwhile the depositors — `cyberferret`, `elric` ("In our case, we uploaded source code an escrow service's servers"), `skue`, `specialist` ("Our customers required everything to be placed in escrow"), `FireBeyond`, `amath` ("the first request we've had for this") — describe escrow uniformly as an obligation negotiated into a sale, never a discretionary purchase. `CraigJPerry` names the mechanism exactly: *"It's a checkbox in some companies procurement method, in the same way many require source code escrow just to do business."*

Escrow has no buyer. It has a payer who resents it.

### (g) STATE — **FAIL**

The thing sold is a sealed deposit that must survive the vendor's death. It is held by a **third-party escrow agent** whose entire value proposition is that it is not the vendor and not the customer. We cannot be that party: we hold a `gh` token and nothing else. If we hold the state, we are the vendor, and the escrow is worthless by construction.

### (h) FIRST-PARTY — **PASS** (moot)

```
gh api "search/issues?q=repo:github/roadmap+escrow"   → 0
positive controls: +coverage → 34 · +security → 279
```
Genuinely clear. Irrelevant, because (f) and (g) already failed.

### (b) CHECKOUT — **PASS, with a precedent worth recording**

Codekeeper's `/pricing` is fully sales-gated (8× "Contact sales", 0 self-serve CTAs). But a reachable checkout exists one level down:

```
curl -sL https://codekeeper.co/pricing/build-a-plan
→ HTTP 200, 324,618 bytes
→ 14× "chargebee", 3× "checkout", 2× "Book a demo"
→ live prices: $99 $129 $179 $199 $229 $249(×27) $309 $389 $439 $459 $519 $549 $599 $859 $969
```

**Revised verdict: UX-gated, not auth-gated.** A stranger with a card can complete this. The lesson generalizes: *a "Contact sales" pricing page is not proof of a sales-gated business.* Future filter (b) runs must probe one level below `/pricing` before recording a FAIL. Compare `conveyor.com/pricing`, which is a genuine FAIL — 6× "Request a Demo", 1× "Talk to sales", one price ($9,600), no checkout.

### The pullguard finding

Someone already built the exact shape we would have built.

| repo | description | ★ | forks | created | last push | 3rd-party `uses:` |
|---|---|---|---|---|---|---|
| `aldidstn/Covenant` | "Continuous, cryptographic software escrow. One GitHub Action to seal your code." | **0** | **0** | 2026-03-30 | 2026-04-03 | **0** |

Built four months ago. Four days of commits. Zero stars, zero forks, zero workflow files anywhere on GitHub reference it. It did not fail loudly; it failed silently, which is worse, because there is no post-mortem to read.

**Market structure (confirmed):** Iron Mountain divested its escrow business to NCC Group in 2021 for $220M against $33M revenue / $22M EBITDA. Consolidating, not growing. The newest entrant, software-escrow.com (2025), publishes $129–$615/mo and is still sales-gated.

**A false positive I caught in myself, recorded so it is not repeated:** I initially reported "30 workflows using codekeeper." Those hits were `thedaviddias/codekeeper`, `the-codekeepers/request-code-review`, and a pile of blockchain/DeFi "escrow" smart contracts. **Real third-party workflow adoption of Codekeeper escrow: zero.** Name collision is the default failure mode of `search/code`; always read the hits, never the count.

---

## 4. Any cluster that passes (f)?

**No cluster passes filter (f).**

Three near-misses, and what stopped each:

| cluster | best case | stopped by |
|---|---|---|
| security questionnaire response | 1 BUYER-WANTS (`TaeThePharaoh`), who is himself building it; 2 BUYER-AGAINST | **(f)** — 1 of 3 required |
| compliance automation / GRC | 2 BUYER-PAYS across two corpora (`bitlad`, `film42`), 3 BUYER-AGAINST from `tptacek` | **(f)** — 1 per cluster |
| escrow | 0 BUYER-PAYS, 4 BUYER-WANTS (the only cluster clearing 3 buyer voices at all) | **(f)** — all WANTS, all wanting it *from the vendor*; then **(g)** |

I ran gates (g), (h) and (b) on the two compliance clusters anyway, because if they had passed (f) I would have needed them, and because the results are load-bearing for section 6.

**(g) STATE — FAIL for both.** A filled-in questionnaire is held by the customer and sent to *their* buyer. Compliance evidence is held by the customer's repo and their auditor's portal. In both cases the state we would sell is state we never hold. Per the gate: NO-GO, no further analysis.

**(h) FIRST-PARTY — FAIL, and this is the big one.** Recorded in section 6.

**(b) CHECKOUT — the incumbents mostly FAIL, which is not the encouragement it looks like.** `conveyor.com/pricing`: 6× "Request a Demo", no checkout → FAIL. But the open-source side has no checkout at all because it has no price:

| repo | description | ★ | forks | created | last push | 3rd-party `uses:` |
|---|---|---|---|---|---|---|
| `trycompai/comp` | "AI Native platform to get companies compliant — Vanta & Drata Alternative" | **1,704** | 348 | 2025-01-15 | **2026-07-24** | 0 |
| `getprobo/probo` | open-source compliance platform | **1,238** | 182 | 2025-01-07 | **2026-07-25** | — |
| `strongdm/comply` | SOC2 compliance toolkit | 1,564 | 286 | 2018-03-07 | 2022-07-21 (dead) | — |
| `bmarsh9/gapps` | GRC platform | 687 | 151 | 2022-11-22 | 2026-05-20 | — |
| `google/vsaq` | vendor security assessment questionnaires | 861 | 181 | 2016-01-25 | 2021-01-11 (dead) | — |
| `kutcode/trustreply` | questionnaire auto-response | **9** | 3 | 2026-03-14 | 2026-05-13 | — |
| `scorpionus007/QResponder` | questionnaire responder | **6** | 1 | 2026-07-08 | 2026-07-08 | — |

Read this honestly and it hurts our own candidate twice. The *serious* free alternatives are live, funded with attention, and shipped yesterday (Comp AI 1,704★/348 forks, pushed 2026-07-24; Probo 1,238★, pushed today). The *small* attempts at exactly the niche we'd pick — `trustreply` at 9★, `QResponder` at 6★ and 17 days old with one push — are already stalling. And the one YC-funded pure-play in this exact niche is gone: **`stacksi.com` now 302-redirects to `drata.com`** (Stacksi, YC W21, "Launch HN: Doing Security Questionnaires, So Your Team Isn't", https://news.ycombinator.com/item?id=26513040). The standalone questionnaire company does not survive as a standalone; it gets absorbed into the suite.

Note also that no repo in this table — including the 1,704-star one — has a single third-party `uses:` workflow reference. Stars measure applause. Workflow files measure a commit. Nobody has committed.

---

## 5. Method findings — permanent assets for the next (f) run

### Working instruments

- **HN Algolia is the only working (f) instrument we have.** `https://hn.algolia.com/api/v1/search`. No auth, no rate-limit hit in ~200 calls.
- **`gh api search/issues?q=repo:github/roadmap+<noun>`** with `+coverage`→34 and `+security`→279 as positive controls. Reliable, and see below — it does far more than confirm absence.
- **`gh api repos/<owner>/<repo>`** for pullguard. Always paired with `search/code?q="uses:+owner/repo"` for adoption.
- **`curl -sL <vendor>/pricing` piped to `grep -oiE` for gate words**, counted. Cheap, decisive, and reproducible. Must also probe one level below `/pricing` (see Codekeeper).

### Non-working instruments — do not spend time on these again

| instrument | result |
|---|---|
| Reddit JSON API (`reddit.com/r/*/search.json`) | **HTTP 403** on every endpoint, every subreddit. Re-verified 2026-07-25. |
| lobste.rs (`lobste.rs/search.json`) | **HTTP 400** |
| StackExchange `softwarerecs` | 1 item for "software escrow"; effectively empty |
| `gh api search/issues` for "would pay" + "github action" | 4,036 hits, all noise. GitHub issue search has no first-person filter and no affiliation signal. Useless for (f). |

### HN Algolia typo tolerance — the real numbers

The recovered note said typo tolerance inflates counts 100–1000×. Measured today, that is **true for rare and alphanumeric terms and false for everything else**, which matters because our corpora are built on compliance acronyms:

| query | default `nbHits` | `advancedSyntax=true&typoTolerance=false&queryType=prefixNone` | inflation |
|---|---|---|---|
| `NIS2` | 30,286 | 100 | **303×** |
| `DO178C` | 199 | 2 | **99×** |
| `codekeeper` | 57 | 10 | 5.7× |
| `escrow` | 7,303 | 6,934 | 1.05× |
| `"source code escrow"` (quoted) | 131 | 131 | **1.00×** |
| `"software escrow"` (quoted) | 40 | 40 | **1.00×** |

**Rule:** quote the phrase, or pass the strict flags. Do both and they agree. The `NIS2` (n=3 hits, all noise) and `DO178C` (n=1, noise) corpora were built on unquoted acronyms and were ~99% garbage before paygrep ever saw them.

### HN "Who is hiring" pollution — quantified

Of the 269 statements: **20 (7%) come from HN hiring threads** (`Who is hiring` / `Who wants to be hired` / `Seeking freelancer`), from 12 authors — `raigol` alone contributes 5 identical monthly re-posts to `accessibility_audit`, `neonnomad` 3 Drata job ads to `compliance_automation`. Recruiting copy is dense with `pay`, `paid`, `spend`, `budget`, `invoice` and matches the predicate perfectly while containing zero demand.

**Show HN / Launch HN / Tell HN pollution is worse: 51 statements (19%), 28 authors.** A Show HN author is by definition a vendor, and Show HN posts are exactly where people say "I was paying $500+/month for X, so I built this" — a sentence that is vendor-voice and buyer-voice at once and must be counted as vendor.

**Combined with the `license` predicate artifact (65 statements, 24%), these three known-bad sources account for 126 of 269 statements — 47% of the entire yield — before any judgment is applied.**

### Recommended paygrep changes (not yet applied)

1. Drop `licen[cs]e[sd]?` from the PAYS predicate, or gate it behind a nearby currency token. It produced 65 hits and zero demand.
2. Tag and separate records whose `story_title` matches `who is hiring|who wants to be hired|seeking freelancer` and `^(show|launch|tell) hn`. Do not drop them — the Show HN posts contain the market's own vendor census — but never count them as demand.
3. Deduplicate at (author, objectID); 269 spans collapse to 188 statements and 163 people.
4. Always quote multi-word queries when building corpora.

---

## 6. The Round 3 answer to the brief: for whom is stateless logic-in-a-workflow NOT free?

**Nobody we can reach. And the reason is not that we failed to look hard enough — it is that GitHub is shipping it, on the Free tier, right now.**

Filter (h), which I ran expecting a formality, turned out to be the most decisive gate in Round 3. Our capability envelope permits exactly one product shape: stateless logic in a GitHub Action producing a cryptographically verifiable artifact. Here is what GitHub has already shipped or previewed in that exact shape, with the SKU labels straight off the roadmap issues:

| roadmap | title | state | tiers |
|---|---|---|---|
| `#1128` | Deletion, filtering, and bulk actions for managing artifact attestations [GA] | **Shipped** | **Free** + Team + Enterprise |
| `#592` | Immutable Actions [GA] | **Shipped** | **Free** + Team + Enterprise |
| `#1137` | Immutable Releases [Preview] | **Shipped** | **Free** + Team + Enterprise |
| `#1138` | Immutable Releases [GA] | open | **Free** + Team + Enterprise |
| `#1261` | Attested SBOMs visible in dependency graph [GA] | open | **Free** + Team + Enterprise |
| `#1273` | SBOM Export UI and API [GA] | open | **Free** + Team + Enterprise |
| `#947` | Artifact Attestations | **Shipped** | Enterprise (Preview) |
| `#1274` | Elevate Attestation as a First-Class Object in Repository UI [Public Preview] | open | Enterprise |
| `#1252`/`#1251` | Open Source License Compliance [Public Preview] | open | — |
| `#1025` | Open Source License Compliance [GA] | open | Enterprise |

Retrieved via `gh api repos/github/roadmap/issues/<n>` on 2026-07-25.

The gate says: *shipped, previewed or roadmapped on ANY tier → NO-GO.* Six of these are on **Free**. This is not a NO-GO for one candidate. **It is a NO-GO for the entire class of product our capability envelope permits us to build.** Attestation, provenance, tamper-evidence, SBOM, immutability, license compliance — every stateless-proof-in-a-workflow idea we could generate is either already free or is being made free by the platform owner while we deliberate.

There is a second, independent reason, and it comes from the only satisfied paying customer in the whole corpus. `film42`, who actually pays Drata, volunteers: *"There's almost always a nearly-free cron job/python script/slackbot alternative to every 'mandatory' 5-6 figure SaaS subscription in the space."* The people with the problem are developers. Stateless logic is the one thing developers can always write themselves in an afternoon. The value in this market is never in the logic — it is in **holding the state**, in **being an independent third party**, or in **signing a contract with an indemnity behind it**. We can do none of those three. We have a `gh` token. `CLOUDFLARE_API_TOKEN`, `NPM_TOKEN`, `POLAR_ACCESS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` are all unset. No database, no server, no payment rail.

Stateless logic in a workflow is free for everyone, because it is trivially reproducible by the only people who want it, and because the platform that hosts the workflow gives away the non-trivial parts.

---

## 7. Is this the third of three independent searches agreeing?

**Yes. And I want to be precise about what they agree on, because it is not what the brief was originally looking for.**

Rounds 1, 2 and 3 searched different territory with different instruments and converged on the same wall. But Round 3 changes the character of the finding in one important way, and the CEO should have it explicitly:

**Rounds 1 and 2 concluded "no demand found." Round 3 concludes something stronger and more useful: demand exists, and we are structurally unable to serve it.**

The evidence for demand is real and I will not soften it. `bitlad` pays $4,000/year. `cj` paid $10,000 for a two-week pentest. `film42` pays Drata. `_slih` says *"Companies will pay me to handle their compliance mapping"* (https://news.ycombinator.com/item?id=47017495). Codekeeper runs a live Chargebee checkout at $99–$969. NCC Group paid $220M for an escrow book doing $33M/year. **Money is moving.** It is simply not moving toward anything we can build, because in every case it is moving toward a party that holds state, carries liability, or signs a contract — and we can do none of those three.

Three searches agreeing that a capability-constrained company cannot find a market is, as the CEO ruled, a conclusion about the constraints, not about the world. I agree with that ruling and I am confirming it, with the amendment above.

**I do not think a fourth round of this shape is worth running, and I recommend against it.** Not because the search was inadequate — this round was the most rigorous of the three, and it produced two permanent assets (`paygrep.py`, `paygrep_judgments.py`) plus a measured method appendix that makes the next (f) run substantially cheaper. I recommend against it because a fourth round would search the same envelope with better tools and hit the same wall, and I now have a citable reason why: **the envelope's only permitted product shape is one that GitHub ships free.** Section 6 is a structural result, not a sampling result. More sampling will not move it.

If the company wants a different answer, the thing to change is the envelope, not the search. The three specific unlocks, in order of how much they would open up, are: (1) a payment rail, (2) server compute with a secret at request time, (3) the ability to hold customer state. Every dead candidate in Rounds 1–3 died on at least one of those three. That is a decision for `ceo-bezos` and `critic-munger`, and it is a decision about what this company *is*, not about what the market wants.

---

## Information I do not have

- **Reddit is dark to us.** r/devops, r/sysadmin, r/msp, r/smallbusiness returned HTTP 403 on every attempt. Those are where practitioners complain about procurement, and I cannot see them. If (f) is ever run again, an authenticated Reddit credential is the single highest-value tool acquisition — higher than any analysis I could do without it.
- **I cannot see private-repo behaviour.** All GitHub `search/code` adoption numbers are public-repo only. A tool with real enterprise adoption inside private repos would be invisible to me and would read as zero. This cuts against my own conclusions and I am flagging it rather than burying it.
- **I did not attempt to contact `TaeThePharaoh`, `bitlad`, or `lbriner`.** One conversation with any of them would be worth more than another 2,735 records. That is a `operations-pg` action, not a research action, and it is the cheapest remaining way to falsify section 4.
- **HN skews to founders and practitioners.** The buyer in every one of these transactions is a procurement or security-review function at a mid-size company. Those people do not post on Hacker News. My "zero buyer voice" findings are therefore partly an artifact of where I am allowed to look — which is precisely why the (g) and (h) gates, which do not depend on HN at all, carry the weight of this report.

---

*Artifacts: `scripts/research/paygrep.py` (extraction) · `scripts/research/paygrep_judgments.py` (judgment, re-runnable) · `/tmp/paygrep_hits.json` (269 statements) · `/tmp/corp_*.jsonl` (32 corpora, 2,735 records)*
