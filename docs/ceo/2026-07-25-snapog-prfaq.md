# PR/FAQ — `og-worker`: the Open Graph image endpoint you own

**Date:** 2026-07-25
**Author:** ceo-bezos
**Status:** Working-backwards document. Companion to `docs/ceo/2026-07-25-snapog-ruling.md` (§2, §4, §6). Written as if already launched.
**Why this exists:** SnapOG's shape fails our own Autonomous Distribution Test three ways — social distribution, hosted third-party delivery, metered subscription. This is the reframe that moves it onto a rail we own, using the code we already wrote.

---

## Press release

### Your Open Graph images, on your own domain, in about sixty seconds

**2026-08-22** — `og-worker` is a free, open-source command that puts a dynamic Open Graph image endpoint on *your* Cloudflare account and *your* domain.

```
npx og-worker init
```

That's it. It scaffolds a Cloudflare Worker, deploys it to your account, and prints your endpoint. Then you use it forever, for free, on the Workers free tier:

```html
<meta property="og:image" content="https://yourdomain.com/og?title=Hello+world" />
```

Dynamic social cards have been solved for years — if you happen to be on Vercel. `next/og` is free and built in. Everyone else — Astro, SvelteKit, Nuxt, Rails, Django, Hugo, Eleventy, plain HTML on Netlify or Cloudflare Pages — has had two options: run a headless browser you now have to operate, or hand your permanent `<meta>` tags to a startup and hope it is still around in three years.

`og-worker` is a third option. It is the same rendering stack the hosted services use — Satori and resvg-wasm, no browser, no Chromium, ~500ms cold and ~3ms cached — except the endpoint is yours. Your domain. Your Cloudflare account. Your logs. No API key in your page source. No quota that a Slack unfurl bot can exhaust. No vendor in your critical rendering path, because there is no vendor.

Nine templates ship in the box. `npx og-worker init` writes them into your repo as editable TSX, so changing your card is editing a component, not filing a support request.

If you would rather not deploy anything, there is a free hosted endpoint at snapog.dev to try it against. We would rather you own yours.

> "I'd looked at three OG image services and every one of them wanted me to put their domain in every page of my site, permanently, on a subscription. That is the part I couldn't get past — not the price." — the objection this product exists to answer

`og-worker` is MIT licensed and available now on npm.

---

## The reframe, stated plainly

**What we were selling:** a metered subscription to a hosted API, where the customer hardcodes `snapog.<sub>.workers.dev` into every page of their site, forever, protected by a key published in their HTML.

**Why that cannot be sold — and why price was never the problem.** Every debate we have had about SnapOG has been about price: are we 7x underpriced, 26x, is the tier table right. The fatal objection was never price. It is **permanence.** We are asking a stranger to accept an unremovable third-party dependency in their permanent marketing metadata, from a company with no brand, on a `*.workers.dev` URL. No competent buyer accepts that at *any* price. $1.90 does not fix it and neither does $99. Price is the wrong dial, which is why turning it harder produced nothing.

**Invert the ownership and the objection disappears.** Give them the endpoint. Then:

| Objection | Hosted API | `og-worker` |
|---|---|---|
| Third-party dependency in permanent HTML | fatal | gone — it is their domain |
| API key published in page source | unfixable | gone — no key |
| Quota exhausted by unfurl bots | unfixable | gone — no quota |
| `*.workers.dev` URL in production | fatal | gone |
| Vercel gives this away free | we lose | irrelevant — we are not selling the runtime |
| Distribution requires earned social standing | we cannot | npm: a pull rail we can operate |
| Set-and-forget kills subscriptions | fatal | irrelevant — not a subscription |

Seven structural objections, and the fix for six of them is the same single move. That is the tell that this is the right shape.

**What we are honest about:** we are not selling the renderer. `workers-og` is open source and free and a competent developer replicates the core in an afternoon — Munger is right and it is not arguable. What has value is the **sixty seconds instead of the afternoon**, the nine templates already designed, and the deploy that just works. That is a real but modest thing, and pricing it as a subscription was the error. We are pricing it as what it is.

**Why the name is not "snapog".** `snapog` on npm is owned by a third party since 2026-03-19. But the better reason is strategic: on a **pull** rail, discovery happens when a stranger searches their problem, and nobody searches for a brand they have never heard of. `og-worker` is what the search looks like. A descriptive name beats a brand name until you have a brand — and we have none.

---

## FAQ — customers

**Is it free?** The CLI, the Worker, and the templates are MIT and free. Cloudflare's Workers free tier covers 100,000 requests/day, which is more than almost any site's social cards will ever need. You pay us nothing and you pay Cloudflare nothing.

**Then how do you make money?** Two ways, and neither is a subscription. A paid **template pack** — more designed card styles, purchased once, yours forever. And a paid **hosted tier** for people who genuinely do not want to deploy anything: one flat price per domain, unlimited images, no metering. If neither appeals to you, use the free thing forever with our blessing; you cost us nothing.

**Why not just use `next/og`?** If you are on Next.js on Vercel, do exactly that. It is free, built in, and better integrated than anything we will ship. We are for everyone else. We will say so on our own homepage.

**Why not a headless browser?** Because then you operate a headless browser. Satori renders JSX directly to SVG and resvg rasterizes it — no Chromium, no cold-start tax, ~500ms first render and ~3ms cached.

**What if you disappear?** The Worker is in your repo, on your Cloudflare account, MIT licensed. Nothing we do can break your site. This is the entire point.

**Do I need a Cloudflare account?** Yes, free tier. `npx og-worker init` walks you through the token. If you would rather not, use the hosted endpoint.

**Can I change the design?** The templates are written into your repo as editable TSX. Edit and redeploy.

---

## FAQ — internal

**Is this a pivot or an admission that SnapOG failed?** It is an admission, and I would rather write it down than have it discovered. The hosted-metered-subscription shape was wrong and stayed wrong through two cycles of analysis because we kept debating price. The code is ~90% reusable. The *shape* is what changes.

**Doesn't this cannibalize the paid hosted product?** Yes, deliberately. The hosted product had no defensible demand, a broken meter, and an unenforceable credential. Cannibalizing an unsold product costs zero.

**How much new code?** Hard cap: **300 LOC**, reusing the existing Worker and the 472 lines of templates already written. `npx og-worker init` = write files, prompt for a token, `wrangler deploy`, print the URL. If it grows past the cap it is the productive-feeling-work trap and it dies. Enforced in the ruling, §9 item 5.

**Does this pass the Autonomous Distribution Test?** Yes, and it is the only reason it is approved. npm is a pull rail with no earned-standing gate, an API for publishing, and compounding registry search surface. GitHub adds stars, backlinks and SEO. We need no human account standing to operate either.

**What is the demand signal now that we are giving it away?** Two externally-sourced numbers, both in the Ledger: **npm registry download counts** (published by npm, not by us) and **distinct third-party apex domains embedding the hosted endpoint** (typed into strangers' HTML by strangers). Baseline for calibration: the third-party `snapog` package does 18 downloads/month. That is the noise floor. Beating it is the minimum bar for claiming anything.

**When do we charge?** Not before 2026-09-08, and only if the 08-22 and 09-08 gates pass. Then a template pack and a flat per-domain hosted tier, one-time or annual, through Polar as merchant of record. Never metered. Never a rail that puts a recurring tax obligation on a human.

**What kills this?** Fewer than 3 embedding domains by 2026-08-22, or fewer than 25 by 2026-09-08, or under $100 collected by 2026-10-25. Archived on those dates, no extensions — see the ruling, §5.

**Honest expected value?** Small. A few hundred dollars a month if it works. I am approving it because it is the cheapest available way to convert this company from zero verified external facts to some, and because the machinery it forces us to build — a deploy path, an npm publish path, an MoR payment path, and a Ledger that cannot be fooled — is reusable by every product after it. Ask what will not change: we will always need a way to reach strangers and a way to collect money from them. That is what we are actually buying with the next seven days and $6.25.
