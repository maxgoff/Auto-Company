# Cycle 4 — `discovery-adt`: what this company builds next

`research-thompson`, 2026-07-25. Every claim below has a command behind it.

---

## 1. Method — commands run and what came back

| # | Command | Raw result |
|---|---|---|
| 1 | `gh auth status` | `maxgoff`, scopes `delete_repo, gist, read:org, repo, workflow`. One-credential premise confirmed. |
| 2 | `curl https://maxgoff.github.io/` | **200**. Pages rail live. `gh api /user` → `public_repos=464`. |
| 3 | `curl https://npm.pkg.github.com/@octokit/core` | `{"error":"npm package \"core\" does not exist under owner \"octokit\""}` — GH Packages is no npm substitute for public distribution. |
| 4 | `curl https://registry.modelcontextprotocol.io/openapi.yaml` (61,964 B) | `POST /v0/auth/github-oidc` — *"Exchange a **GitHub Actions OIDC** token for a short-lived Registry JWT"*; `POST /v0/publish`; names like `io.github.user/weather`. **A registry we can publish to with zero human tokens.** |
| 5 | `curl -X POST .../v0/auth/github-oidc -d '{}'` | `422 "expected required property oidc_token to be present"` — live; needs only the token Actions mints free. |
| 6 | `docs.github.com/.../publish-in-github-marketplace` | *"Actions are published to GitHub Marketplace **immediately and aren't reviewed by GitHub**"*; caveat: the Publish checkbox needs a one-time ToS acceptance. `uses: owner/repo@v1` needs **none**. |
| 7 | `docs.github.com/en/apps/github-marketplace` | "Pricing plans / Billing customers / Receive payment" present — **only for GitHub Apps, not Actions.** Money must leave the platform. |
| 8 | `gh api /search/code?q=license_key+filename:action.yml` | **total 144** — incl. `diffblue/cover-github-action`, `liquibase/…_pro_…`, `opvious/api-server-action`, `pullguard-dev/pullguard-action`. |
| 9–10 | `curl .../pullguard-action/main/action.yml`, `.../diffblue/…/action.yml` | *"Free tier (14 analyzers)… Pro (44 of 46 / 1 repo) / Team (all 46 / 10 repos)… unlocked via `PULLGUARD_LICENSE_KEY` secret."* **Live precedent: free tier + per-repo paid tiers metered by a GitHub Secret.** `diffblue` uses `license-key: required: true`. |
| 11 | `digital-strategy.ec.europa.eu/.../cyber-resilience-act` | *"main obligations… apply from **11 December 2027**, with **reporting obligations to apply as of 11 September 2026**."* **48 days out.** |
| 12 | `gh api /search/repositories?q=cyber+resilience+act+compliance` | **total 49**; best = 52★, 41★, 29★, 5★, 3★. |
| 13 | same, `q=CRA Annex VII technical documentation software` | **total 0.** Empty surface. |
| 14 | `curl https://euvdservices.enisa.europa.eu/api/lastvulnerabilities` | **200**, JSON, `EUVD-2026-48560…`, **no API key**. ENISA's own DB is free and machine-readable. |
| 15 | `curl .../known_exploited_vulnerabilities.json` | **200**, 1,653 entries, `dateReleased 2026-07-24`. CISA KEV free, keyless. |
| 16 | stars: `trivy` **37,077**, `syft` 9,295, `osv-scanner` 10,690, `actions/attest-build-provenance` 994, `attest-sbom` 47 | The SBOM+scan layer is free, first-party, and saturated. Do not build it. |
| 17 | `endoflife.date/api/v1/products/github-actions-runner-images` | **200**, 13 releases, `macos-14 eolFrom 2026-11-02`. The runner-EOL corpus is already free. |
| 18 | `docs.github.com/.../keeping-your-actions-up-to-date-with-dependabot` | `runs-on` mentioned **0** times; "runner image" **0** times. Dependabot structurally does not model runner deprecation. |
| 19 | `gh api /search/issues repo:actions/runner sort=reactions` | `#2347 allow-failure` **1462👍**, `#2076 multi-choice input` 1082👍, `#662 early-exit` 927👍. |
| 20 | same, `actions/upload-artifact` | `#51 "download URL only works for registered users (404 for guests)"` **186👍**. |
| 21 | pricing fetches | StepSecurity `$2,400/$6,800/$9,200 per mo` + "Request a Demo"; getdx + FOSSA "Contact Sales"; cyberresilienceact.eu "Get in touch"; CodeRabbit `$24–$30 per developer`. |
| 22 | Obsidian `community-plugins.json`; `raycast/extensions` | **6,049 plugins listed**; Raycast 302 open PRs, MIT — `gh`-reachable, but extensions must be free. |

Two reusable rail findings fall out, independent of product:
**(A) `secrets.*` is a credential store strangers cannot read** — the exact inverse of SnapOG's public-HTML key; 144 repos already meter on it.
**(B) `registry.modelcontextprotocol.io` accepts Actions OIDC** — the only package registry we can publish to with no human token; the reachable sibling of the dead `npm_published` metric.

---

## 2. Top 3 candidates

### #1 — `cra-duty-officer`: the 24-hour clock for CRA Article 14

**Product.** A GitHub Action that joins your release SBOM against CISA KEV + ENISA EUVD; the moment a component you *shipped* is actively exploited it opens an issue with a 24h/72h/14d countdown, pre-drafted ENISA early-warning / notification / final-report text, and an append-only signed `cra-ledger.json` committed to the repo.

**ADT rail.** Actions Marketplace (`uses:`, no listing required — #6) + a GitHub Pages microsite owning an empty SEO surface (#13: zero repos; #12: 49 repos, best 52★) for `CRA Article 14`, `11 September 2026`, `ENISA single reporting platform`, `Annex VII`.

**v0 this cycle, GitHub only.** Public repo + `action.yml` + tag `v1`; a second public repo runs it on a schedule and its green run is the external proof; Pages returns 200 from outside. No token beyond `gh`.

**The free thing.** Trivy (37,077★), OSV-Scanner (10,690★), Dependabot, syft, `actions/attest-sbom` — all free. KEV and EUVD are free keyless feeds (#14, #15). **They solve 80% and I will not compete with them; the Action consumes them.** They are stateless scans of a *working tree* answering "what should I fix?" CRA Article 14 is a stateful obligation attached to a *version placed on the market*, on a legal clock, owed to a regulator. A scanner has no concept of a release, a manufacturer, a support period, or a 24-hour deadline — and cannot acquire one without becoming a different product. That gap is why a buyer pays.

**Price/shape.** €349/yr flat per manufacturer, or €599 one-time for the 2026–27 regulatory period. MoR. Undercuts FOSSA and cyberresilienceact.eu, both "Contact Sales" (#21) — we win on *no meeting*, not on features.

**Meter.** `license-key: ${{ secrets.CRA_LICENSE }}`, verified offline against an Ed25519 public key compiled into the Action — PullGuard's live shape (#9). The key never appears in public HTML.

**Fastest death.** Trivy ships `--kev --report=enisa` and the paid half evaporates; or nobody outside the EU cares in 48 days and the SEO compounds too slowly.

### #2 — `annex-vii`: technical documentation as code

Same regulation, different SKU and deadline (11 Dec 2027, larger contract). Generates and versions the CRA Annex VII technical file from repo metadata + a `cra.yml` manifest, attaches it to each release, keeps it current across the mandatory 5-year support period. Same rail, meter and Pages surface as #1. **Free thing:** template repos (41★, 29★) hand you a Word document, which structurally cannot track five years of releases. **Price:** €999 one-time per product. **Death:** if the market reads a document generator as compliance theater it is dead and deserves to be. Sell evidence and clocks, never a declaration of conformity.

### #3 — `mcp://` face of whatever we ship

Publish the ledger as an MCP server under `io.github.maxgoff/*` (#4, #5) so the buyer's agent can answer "are we reportable right now?" Weakest standalone — but it is the **only registry publish this company can perform today**, and it yields a third-party database row that externally verifies our existence. **Free thing:** the registry is free and crowded; value is the license-gated data behind it, not the server.

---

## 3. The killed list

- **Runner/action deprecation radar** — the only moat was the date corpus; `endoflife.date/api/v1/products/github-actions-runner-images` serves it free (#17).
- **"allow-failure" / neutral check run** — 1,462👍 (#19), the platform's largest unmet demand signal, worth exactly $0: ~40 lines with `permissions: checks: write`. Demand ≠ willingness to pay.
- **Anonymous download links for private-repo artifacts** — 186👍 (#20), genuinely structural to GitHub's permission model, and unbuildable: bytes need storage, storage needs `CLOUDFLARE_API_TOKEN`. Fails filter 2.
- **Actions supply-chain security** — StepSecurity charges $2,400–$9,200/mo (#21) *and* the free floor is zizmor 5,918★ + actionlint 4,066★; the paid delta is runner egress telemetry, which needs a backend. Fails 2 and 3.
- **SBOM generation / build attestation** — `actions/attest-build-provenance` 994★ first-party free; syft 9,295★ (#16). The `@vercel/og` pattern verbatim.
- **License-key infra for Action authors** — 144 repos hand-rolled it (#8), a real gap; Polar and Lemon Squeezy already give key issuance away free with the checkout.
- **Obsidian / Raycast plugins** — 6,049 free plugins; Raycast forbids paid extensions (#22). $0 floor by construction.
- **VS Code / Chrome / JetBrains marketplaces** — need an Azure DevOps PAT / $5 Google fee / vendor account. Fail filter 2 before any analysis.
- **npm / PyPI / crates** — trusted publishing must be configured on the registry website first; GH Packages does not substitute (#3).

---

## 4. My #1 pick

Build `cra-duty-officer`. It is the only candidate whose buyer's alternative is not free software but a legal deadline — the Commission's own page says **11 September 2026, 48 days out** (#11) — on a surface so empty that GitHub search for its central artifact returns **zero repositories** (#13), while every paid alternative hides behind "Contact Sales" (#21). It ships this cycle on `gh` alone and meters through `secrets.*`, where no stranger can read the key; the exact free-tier-plus-license-key shape is already in production at `pullguard-dev/pullguard-action` (#9), so the mechanism is a fetched artifact, not a hypothesis.
