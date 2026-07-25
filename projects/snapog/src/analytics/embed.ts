// SnapOG — the demand probe.
//
// CEO ruling 2026-07-25 §2 condition 4: log the Referer/Origin apex domain on
// every /og hit. "This is the entire point of the probe. If we ship without it
// we have shipped nothing."
//
// The product measures ONE number — distinct third-party apex domains with a
// live embed of our /og URL — and the Ledger (§7) reads it straight out of D1:
//
//     SELECT COUNT(DISTINCT apex) AS embed_domains
//       FROM embed_domains WHERE is_foreign = 1;
//
// Two properties matter more than anything else in this file:
//
//   1. It must never fail an image request. A probe that breaks the product it
//      is measuring measures nothing. Every write is fire-and-forget and every
//      throw is swallowed.
//   2. It must not be inflatable by us. An agent optimising for task completion
//      that can move its own reward number will move it. Our own hosts and our
//      own tooling are excluded here, at write time, and the exclusion is frozen
//      into `is_foreign` so the Ledger's query cannot drift away from it.

// ─── Bucket sentinels ─────────────────────────────────────────────────────────
//
// A hostname can never contain '(' — RFC 1123 allows only letters, digits, '-'
// and '.' — so these can never collide with a real apex. Buckets are RECORDED,
// never counted: the ruling says a request with no Referer is a fact about the
// world (most social crawlers send none), not a row to drop on the floor. The
// hit counter on '(none)' tells us how much unattributable crawler traffic the
// probe is getting, which is the difference between "nobody embedded us" and
// "we cannot tell who embedded us".
export const BUCKET_NONE = '(none)';
export const BUCKET_INVALID = '(invalid)';
export const BUCKET_IP = '(ip)';
export const BUCKET_LOCAL = '(local)';

/**
 * Multi-part public suffixes.
 *
 * DELIBERATE TRADEOFF — read before "fixing" this.
 *
 * The correct answer is the Public Suffix List: ~9,000 rules, updated
 * continuously by Mozilla. We are not pulling it in. At this size it is ~200 KB
 * of Worker bundle and a dependency to keep current, to improve the accuracy of
 * a number whose target is 25, in a product with a hard kill date of 2026-10-25.
 * A curated set of a few dozen entries is the right call for a six-week probe.
 *
 * WHERE THIS BREAKS, precisely:
 *
 *   - A country suffix not listed below (say `example.com.gh`) collapses to
 *     `com.gh`, and every Ghanaian commercial domain would then share one row.
 *     That UNDERCOUNTS: many real domains merge into one. Undercounting is the
 *     safe direction — it can only make a gate harder to clear, never easier.
 *   - A hosting suffix not listed below (a platform launched after this was
 *     written) collapses `alice.newhost.app` and `bob.newhost.app` into
 *     `newhost.app`. Same undercount, same safe direction.
 *
 * It never overcounts, which is the only failure mode that would matter — an
 * inflated number here is a lie told to the Ledger.
 *
 * SYMPTOM TO WATCH FOR: an `embed_domains` row whose `hits` count is wildly out
 * of line with its neighbours is almost certainly a collapsed suffix, not a
 * popular customer. Add the suffix and the row splits on subsequent traffic.
 */
const MULTI_PART_SUFFIXES = new Set([
  // ── Country-code second-level domains ──
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au',
  'co.nz', 'net.nz', 'org.nz', 'ac.nz', 'govt.nz',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.in', 'net.in', 'org.in', 'ac.in', 'gov.in', 'firm.in', 'gen.in', 'ind.in',
  'co.za', 'org.za', 'net.za', 'ac.za', 'gov.za',
  'co.kr', 'or.kr', 'ne.kr', 're.kr', 'pe.kr', 'go.kr', 'ac.kr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'com.my',
  'com.ph', 'com.vn', 'com.pl', 'com.co', 'com.pe', 'com.ua', 'com.ng', 'com.es',
  'co.il', 'co.id', 'co.th', 'co.ke', 'co.at', 'co.ma',

  // ── Hosting platforms. These matter MORE than the ccTLDs above. ──
  // Indie developers — the exact population this probe is aimed at — ship on
  // these. Without them every `*.vercel.app` in the world is one row, and three
  // separate strangers embedding us would read as one domain against a gate
  // whose threshold is three.
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app',
  'netlify.app', 'netlify.com', 'herokuapp.com', 'web.app', 'firebaseapp.com',
  'surge.sh', 'fly.dev', 'onrender.com', 'glitch.me', 'replit.app', 'repl.co',
  'notion.site', 'webflow.io', 'wordpress.com', 'blogspot.com', 'substack.com',
  'ghost.io', 'framer.website', 'framer.app', 'myshopify.com', 'bubbleapps.io',
  'squarespace.com', 'wixsite.com', 'render.com', 'deno.dev', 'val.run',
]);

/**
 * User-Agent markers that mean "this request is us, or a script, not a page".
 *
 * WHY THIS EXISTS: the Ledger's whole design is that its numbers originate
 * outside this machine. Our own smoke test, our own CI, and any agent with a
 * shell can send a Referer header. Without this filter the one number we are
 * measuring is a number we can type.
 *
 * WHY IT IS SAFE TO BE AGGRESSIVE: excluding a real integration costs us one
 * undercounted domain. Including one of our own costs us the credibility of the
 * only external fact the company owns. Those are not comparable, so the filter
 * errs hard toward exclusion. Browsers never match any of these.
 *
 * (Most tooling sends no Referer anyway and lands in '(none)'. This catches the
 * case where a script sets one — which is exactly what a well-meaning agent
 * "testing the probe end to end" would do.)
 */
const TOOLING_UA_MARKERS = [
  'curl/', 'wget/', 'wrangler', 'node-fetch', 'undici', 'python-requests',
  'python-urllib', 'go-http-client', 'okhttp', 'libwww-perl', 'httpie',
  'java/', 'ruby', 'axios/', 'postman', 'insomnia', 'headlesschrome',
  'github-actions', 'snapog', 'miniflare', 'workerd',
];

/**
 * Hosts that are ours no matter which deployment is answering.
 *
 * The request's own Host is excluded separately and dynamically (see
 * `isSelfHost`) — that one is load-bearing: our landing page embeds a live /og
 * preview, so without it the very first row in the table would be us, and the
 * number the whole company is being judged on would open at 1 for free.
 */
const OWN_APEXES = new Set(['snapog.dev', 'snapog.com', 'snapog.invalid']);

// ─── Apex extraction ──────────────────────────────────────────────────────────

/** Bare IPv4 literal. IPv6 arrives from URL.hostname wrapped in brackets. */
function isIpLiteral(host: string): boolean {
  if (host.startsWith('[')) return true; // [::1], [2001:db8::1]
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test') ||
    host === '0.0.0.0'
  );
}

/**
 * Reduce a hostname to its registrable apex.
 *
 * Returns a bucket sentinel for anything that is not a real registrable domain.
 * Never throws.
 */
export function apexFromHost(rawHost: string): string {
  const host = rawHost.trim().toLowerCase().replace(/\.+$/, ''); // trailing root dot
  if (!host) return BUCKET_INVALID;
  if (isLocalHost(host)) return BUCKET_LOCAL;
  if (isIpLiteral(host)) return BUCKET_IP;

  // Anything left must look like a hostname. This also rejects the sentinels
  // themselves, so a forged `Referer: https://(none)/` cannot poison a bucket.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
    return BUCKET_INVALID;
  }

  const labels = host.split('.');
  if (labels.length < 2) return BUCKET_INVALID; // bare 'example' is not a domain

  const lastTwo = labels.slice(-2).join('.');
  if (labels.length > 2 && MULTI_PART_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

export interface EmbedObservation {
  apex: string;
  /**
   * Which HEADER produced the value — never a verdict about the value. A
   * malformed `Referer` still has `source: 'referer'`; the fact that it was
   * garbage is carried by `apex: '(invalid)'`. Keeping the two orthogonal means
   * "how many hits arrived with no Referer at all" stays answerable, which is
   * the number that tells us how much of our traffic is unattributable crawlers.
   */
  source: 'referer' | 'origin' | 'none';
  isForeign: boolean;
}

function isToolingUserAgent(ua: string | null): boolean {
  if (!ua) return true; // no UA at all is a script, not a browser or a crawler
  const lower = ua.toLowerCase();
  return TOOLING_UA_MARKERS.some(m => lower.includes(m));
}

/**
 * Decide what this request tells us about who is embedding our URL.
 *
 * `Referer` is spelled wrong in the HTTP spec and therefore spelled wrong here.
 * `Origin` is preferred when both are present: it is the more trustworthy of the
 * two and it is never truncated by a referrer policy.
 *
 * NOTE ON `Referer` RELIABILITY, since it decides the gate: a page served with
 * `Referrer-Policy: no-referrer` sends nothing, and `strict-origin-when-cross-
 * origin` (the modern browser default) sends only the origin — which is all we
 * need, since we reduce to the apex anyway. So the default case works and the
 * opt-out case lands in '(none)'. We undercount. We never overcount.
 */
export function observeEmbed(
  referer: string | null,
  origin: string | null,
  requestHost: string,
  userAgent: string | null
): EmbedObservation {
  const raw = origin ?? referer;
  const source: EmbedObservation['source'] = origin
    ? 'origin'
    : referer
      ? 'referer'
      : 'none';

  if (!raw) return { apex: BUCKET_NONE, source: 'none', isForeign: false };

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    // Some clients send a bare hostname rather than a full URL. Try that before
    // giving up, but never let a malformed header reach the counter.
    host = raw.includes('/') || raw.includes(' ') ? '' : raw;
    if (!host) return { apex: BUCKET_INVALID, source, isForeign: false };
  }

  const apex = apexFromHost(host);

  // Buckets never count.
  if (apex.startsWith('(')) return { apex, source, isForeign: false };

  const selfApex = apexFromHost(requestHost);
  const isSelfHost = apex === selfApex || OWN_APEXES.has(apex);

  return {
    apex,
    source,
    isForeign: !isSelfHost && !isToolingUserAgent(userAgent),
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Isolate-local write suppressor.
 *
 * Cycle 2 measured a per-request D1 batch at ~76% of the marginal cost of
 * serving a cache hit and removed it. Condition 4 requires a write on every hit,
 * including cache hits, so it is coming back — but not unguarded.
 *
 * Correctness never depends on this cache: the write is an idempotent UPSERT, a
 * cold isolate always writes, and a stale entry can only cost us an undercounted
 * `hits` tally. It can NEVER lose a distinct apex, which is the only column the
 * Ledger reads. A new domain is therefore always persisted on its first request
 * to any isolate, which is exactly the latency the gate needs.
 */
const recentlyWritten = new Map<string, number>();
const WRITE_TTL_MS = 5 * 60_000;
const WRITE_CACHE_MAX = 500;

function shouldWrite(apex: string, now: number): boolean {
  const last = recentlyWritten.get(apex);
  if (last !== undefined && now - last < WRITE_TTL_MS) return false;
  if (recentlyWritten.size >= WRITE_CACHE_MAX) recentlyWritten.clear();
  recentlyWritten.set(apex, now);
  return true;
}

/**
 * Upsert the observation. Returns void and never rejects.
 *
 * `source` and `first_seen` are written once and never updated, so they always
 * describe how we FIRST saw this domain. `is_foreign` is likewise not updated:
 * whether a domain counts is decided the first time we see it, so a later
 * request that happens to arrive with a tooling UA cannot silently demote a real
 * customer's domain out of the count.
 */
export async function recordEmbed(
  db: D1Database,
  obs: EmbedObservation
): Promise<void> {
  const now = Date.now();
  if (!shouldWrite(obs.apex, now)) return;

  const ts = new Date(now).toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO embed_domains (apex, source, is_foreign, hits, first_seen, last_seen)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(apex) DO UPDATE SET
           hits = hits + 1,
           last_seen = excluded.last_seen`
      )
      .bind(obs.apex, obs.source, obs.isForeign ? 1 : 0, ts, ts)
      .run();
  } catch (err) {
    // Swallowed on purpose. An image request must never fail because the probe
    // failed — the probe exists to observe the product, not to gate it. Drop the
    // suppressor entry so the next request retries rather than waiting out the
    // TTL on a write that never landed.
    recentlyWritten.delete(obs.apex);
    console.error('embed probe write failed:', err);
  }
}
