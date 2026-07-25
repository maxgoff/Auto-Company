// SnapOG — Main Cloudflare Worker
// Routes: GET /og (image gen), GET / (landing), GET/POST /register,
//         GET /dashboard, GET/POST /checkout, POST /webhooks/stripe

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  generateOGImage,
  buildCacheKey,
  generateQuotaExceededImage,
  QUOTA_EXCEEDED_R2_KEY,
} from './og/render';
import {
  checkDomain,
  generatePublishableKey,
  generateSecretKey,
  normalizeDomain,
  parseAllowedDomains,
  resolveAnyKey,
  resolveSecretKey,
  sha256Hex,
  verifyUrlSignature,
} from './auth/keys';
import {
  landingPage,
  registerPage,
  keyCreatedPage,
  dashboardPage,
  errorPage,
  billingUnavailablePage,
  billingSuccessPage,
  billingCancelPage,
} from './dashboard/pages';
import type { ApiKey, Env, OGParams, PaidTier, Tier, User } from './types';
import { TIER_LIMITS } from './types';
import {
  billingConfig,
  createCheckoutSession,
  createPortalSession,
  parseEvent,
  verifyStripeSignature,
  webhookSecret,
} from './billing/stripe';
import { applyEvent, claimEvent, releaseEvent } from './billing/webhook';
import { observeEmbed, recordEmbed } from './analytics/embed';

const app = new Hono<{ Bindings: Env }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** True when the caller looks like a browser rather than curl/a script. */
function wantsHtml(c: { req: { header: (n: string) => string | undefined } }): boolean {
  return (c.req.header('accept') ?? '').includes('text/html');
}

function isPaidTierName(value: string | undefined | null): value is PaidTier {
  return value === 'pro' || value === 'business';
}

/**
 * Control-surface auth. Secret keys only — a publishable key must never be able
 * to read usage, start a checkout, or reach the Stripe portal.
 */
async function resolveApiKey(
  db: D1Database,
  rawKey: string | null
): Promise<ApiKey | null> {
  return resolveSecretKey(db, rawKey);
}

/**
 * First instant of the current month, in UTC.
 *
 * MUST be UTC: `new Date(y, m, 1)` resolves against the *runtime's* timezone,
 * which is UTC on Workers but the host timezone under `wrangler dev` — that
 * mismatch made quota resets fire spuriously and silently refill a used-up key.
 */
function startOfUtcMonth(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Reset monthly usage if billing month rolled over
async function maybeResetUsage(db: D1Database, key: ApiKey): Promise<ApiKey> {
  const resetAt = new Date(key.usage_reset_at);
  const thisMonth = startOfUtcMonth();

  if (resetAt.getTime() < thisMonth.getTime()) {
    const newResetAt = thisMonth.toISOString();
    await db
      .prepare(
        'UPDATE api_keys SET usage_count = 0, usage_reset_at = ? WHERE id = ?'
      )
      .bind(newResetAt, key.id)
      .run();
    return { ...key, usage_count: 0, usage_reset_at: newResetAt };
  }
  return key;
}

/**
 * Meter a RENDER. Called only on a cache miss.
 *
 * We advertise "images/month", so the billable unit is a unique image we
 * actually rendered — not an HTTP request. Cache hits are free and unmetered:
 * one popular post used to burn a customer's whole month through social unfurls
 * and crawler re-fetches they could neither forecast nor control, and it
 * inverted our cost curve (a hit costs ~4.7x less than a miss to serve, yet was
 * charged identically).
 */
async function recordRender(
  db: D1Database,
  key: ApiKey,
  template: string
): Promise<void> {
  const eventId = crypto.randomUUID();
  await db.batch([
    db
      .prepare('UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = ?')
      .bind(key.id),
    db
      .prepare(
        'INSERT INTO usage_events (id, api_key_id, template, cache_hit) VALUES (?, ?, ?, ?)'
      )
      .bind(eventId, key.id, template, 0),
  ]);
}

/**
 * One structured line per /og response. This is the analytics for cache hits.
 *
 * The old code wrote a usage_events row on every hit; that D1 batch measured as
 * ~76% of the total marginal cost of serving a cache hit — more than R2 + CPU +
 * request combined — to store a row nobody queried. Workers Logs answer "is the
 * cache working" and "are renders slow" for free, so hits now cost zero D1
 * writes.
 *
 * Never logs the raw key or its hash. `key_prefix` is designed to be safe.
 */
function logOg(fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ evt: 'og', ...fields }));
}

/**
 * The over-quota placeholder, rendered at most once per deployment.
 *
 * It lives in R2 under a fixed key, so the CPU cost of an over-quota request is
 * paid exactly once ever and every subsequent one is an R2 read. Rendering a
 * per-title image here would hand out unlimited free renders to anyone who
 * exceeded their quota.
 */
async function getQuotaExceededPng(
  env: Env,
  ctx: ExecutionContext
): Promise<ArrayBuffer> {
  const cached = await env.OG_CACHE.get(QUOTA_EXCEEDED_R2_KEY);
  if (cached) return cached.arrayBuffer();

  const rendered = await generateQuotaExceededImage();
  const buf = await rendered.arrayBuffer();
  ctx.waitUntil(
    env.OG_CACHE.put(QUOTA_EXCEEDED_R2_KEY, buf.slice(0), {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { kind: 'system-quota-exceeded' },
    })
  );
  return buf;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Landing page
app.get('/', c => {
  const host = new URL(c.req.url).host;
  return htmlResponse(landingPage(host));
});

// ── OG image generation ────────────────────────────────────────────────────────
app.get('/og', async c => {
  const started = Date.now();
  const url = new URL(c.req.url);
  const q = c.req.query();
  const rawKey = q['key'] ?? null;

  // Validate required param. A missing title is a developer mistake at
  // integration time, not a live-traffic condition, so JSON is fine here.
  const title = (q['title'] ?? '').trim().slice(0, 120);
  if (!title) {
    return c.json({ error: 'title parameter is required' }, 400);
  }

  // Resolve either credential (sk_ or pk_).
  if (!rawKey) {
    return c.json({ error: 'key parameter is required. Get a free key at /register' }, 401);
  }
  const resolved = await resolveAnyKey(c.env.DB, rawKey);
  if (!resolved) {
    logOg({ status: 401, reason: 'invalid_key' });
    return c.json({ error: 'Invalid API key' }, 401);
  }
  let apiKey = resolved.row;
  const keyKind = resolved.kind;

  // ── THE PROBE ──
  // CEO ruling §2 condition 4. This single call is why SnapOG is still alive:
  // it produces `embed_domains`, the only number in the Ledger that comes from
  // strangers rather than from us. It sits here — immediately after the key
  // resolves and BEFORE every branch below — so that "every /og hit, including
  // cache hits" is true by construction rather than by four call sites staying
  // in sync. Fire-and-forget: the PNG never waits on it and never fails with it.
  try {
    const obs = observeEmbed(
      c.req.header('referer') ?? null,
      c.req.header('origin') ?? null,
      url.host,
      c.req.header('user-agent') ?? null
    );
    c.executionCtx.waitUntil(recordEmbed(c.env.DB, obs));
  } catch (err) {
    console.error('embed probe failed:', err);
  }

  // The documented, published credential is the pk_ identifier. A sk_ in a URL
  // means someone pasted the wrong string into their page source; it still
  // renders (a 401 during a probe is friction we cannot afford), but it is a
  // misconfiguration we want to be able to find in Workers Logs rather than
  // discover from a support email we will never receive.
  if (keyKind === 'secret') {
    console.warn(
      JSON.stringify({
        evt: 'sk_used_for_render',
        key_prefix: apiKey.key_prefix,
        hint: 'embed the pk_ site identifier instead',
      })
    );
  }

  // ── Domain allowlist ──
  // Refused renders do not touch quota: an attacker must never be able to
  // exhaust a customer's month, and the customer must not pay for our refusal.
  const domainCheck = checkDomain(
    apiKey,
    c.req.header('referer') ?? null,
    c.req.header('origin') ?? null
  );
  if (!domainCheck.ok) {
    logOg({
      status: 403,
      reason: 'domain_blocked',
      key_prefix: apiKey.key_prefix,
      host: domainCheck.host,
      metered: false,
    });
    return c.json(
      {
        error: 'This key is not allowed to render from that domain',
        host: domainCheck.host,
        allowed: parseAllowedDomains(apiKey.allowed_domains),
      },
      403
    );
  }

  // ── Signed URL, when the customer has opted in ──
  if (apiKey.require_signature === 1) {
    const sig = await verifyUrlSignature(apiKey, url);
    if (!sig.ok) {
      logOg({
        status: 403,
        reason: 'signature_' + sig.reason.replace(/\s+/g, '_'),
        key_prefix: apiKey.key_prefix,
        metered: false,
      });
      return c.json({ error: 'Invalid or missing URL signature', detail: sig.reason }, 403);
    }
  }

  // Reset usage if month rolled
  apiKey = await maybeResetUsage(c.env.DB, apiKey);

  const params: OGParams = {
    title,
    description: (q['description'] ?? '').trim().slice(0, 200) || undefined,
    domain: (q['domain'] ?? '').trim().slice(0, 100) || undefined,
    author: (q['author'] ?? '').trim().slice(0, 80) || undefined,
    tag: (q['tag'] ?? '').trim().slice(0, 40) || undefined,
    theme: (q['theme'] === 'light' ? 'light' : 'dark') as 'dark' | 'light',
    template: (['blog', 'article'].includes(q['template'] ?? '')
      ? q['template']
      : 'default') as OGParams['template'],
  };
  const template = params.template ?? 'default';

  // No watermark, on any tier. CEO ruling §2 condition 5: watermarking a
  // customer's own marketing asset is a dealbreaker, not an upsell — we are
  // buying information here, not squeezing a funnel that does not exist. The
  // cache key no longer varies by tier either, so two keys asking for the same
  // image now share one render.
  const cacheKey = await buildCacheKey(params);
  const r2Key = `og/${cacheKey}.png`;

  // ── R2 cache lookup, BEFORE the quota check ──
  // Deliberate ordering: an already-rendered image costs us almost nothing, so
  // serving it is free and unmetered even for a key that is over quota. That is
  // what makes an over-quota customer's existing social cards keep working.
  const cached = await c.env.OG_CACHE.get(r2Key);
  if (cached) {
    const imageData = await cached.arrayBuffer();
    logOg({
      status: 200,
      cache: 'HIT',
      tier: apiKey.tier,
      key_kind: keyKind,
      key_prefix: apiKey.key_prefix,
      template,
      bytes: imageData.byteLength,
      ms: Date.now() - started,
      metered: false,
      usage: apiKey.usage_count,
      limit: apiKey.monthly_limit,
    });
    return new Response(imageData, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'X-Cache': 'HIT',
        'X-SnapOG-Tier': apiKey.tier,
        'X-SnapOG-Metered': 'false',
      },
    });
  }

  // ── Over quota: degrade, never break the customer's page ──
  // A new unique image would cost a real render, so this is where the limit
  // bites. We still answer 200 image/png: a `<meta og:image>` that receives JSON
  // breaks the customer's social cards, and platforms cache that failure. Short
  // TTL so cards recover quickly once they upgrade or the month rolls over.
  if (apiKey.usage_count >= apiKey.monthly_limit) {
    const placeholder = await getQuotaExceededPng(c.env, c.executionCtx);
    logOg({
      status: 200,
      cache: 'QUOTA',
      tier: apiKey.tier,
      key_kind: keyKind,
      key_prefix: apiKey.key_prefix,
      template,
      ms: Date.now() - started,
      metered: false,
      usage: apiKey.usage_count,
      limit: apiKey.monthly_limit,
    });
    return new Response(placeholder, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Cache': 'QUOTA_EXCEEDED',
        'X-SnapOG-Tier': apiKey.tier,
        'X-SnapOG-Metered': 'false',
        'X-SnapOG-Quota': 'exceeded',
        'X-SnapOG-Limit': String(apiKey.monthly_limit),
      },
    });
  }

  // ── Generate image — the one metered event ──
  const imageResponse = await generateOGImage(params);
  const imageBuffer = await imageResponse.arrayBuffer();

  // Store in R2 (fire-and-forget, don't block response)
  c.executionCtx.waitUntil(
    c.env.OG_CACHE.put(r2Key, imageBuffer.slice(0), {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { tier: apiKey.tier, template },
    })
  );

  // Meter the render (also fire-and-forget after we have the image)
  c.executionCtx.waitUntil(recordRender(c.env.DB, apiKey, template));

  logOg({
    status: 200,
    cache: 'MISS',
    tier: apiKey.tier,
    key_kind: keyKind,
    key_prefix: apiKey.key_prefix,
    template,
    bytes: imageBuffer.byteLength,
    ms: Date.now() - started,
    metered: true,
    usage: apiKey.usage_count + 1,
    limit: apiKey.monthly_limit,
  });

  return new Response(imageBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Cache': 'MISS',
      'X-SnapOG-Tier': apiKey.tier,
      'X-SnapOG-Metered': 'true',
    },
  });
});

// ── Registration ──────────────────────────────────────────────────────────────
app.get('/register', c => {
  const intent = c.req.query('tier');
  return htmlResponse(registerPage(undefined, intent));
});

/**
 * Registration ALWAYS issues a free-tier key.
 *
 * The `tier` form field is treated as *intent* only — it decides which CTA we
 * show next, never what the customer gets. Paid tiers are granted in exactly
 * one place: the Stripe webhook, after money has actually moved.
 */
app.post('/register', async c => {
  let email: string, keyname: string, intent: string;
  try {
    const form = await c.req.formData();
    email = (form.get('email') as string ?? '').trim().toLowerCase();
    keyname = (form.get('keyname') as string ?? '').trim() || 'default';
    intent = (form.get('tier') as string ?? '').trim();
  } catch {
    return htmlResponse(registerPage('Invalid form data'), 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return htmlResponse(registerPage('Please enter a valid email address', intent), 400);
  }

  // Upsert user
  const userId = crypto.randomUUID();
  await c.env.DB
    .prepare(
      'INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING'
    )
    .bind(userId, email)
    .run();

  const user = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (!user) {
    return htmlResponse(registerPage('Database error — please try again'), 500);
  }

  // Generate the credential PAIR — free tier, always.
  // sk_ is server-side only; pk_ is the one that belongs in page source.
  const rawKey = generateSecretKey();
  const rawPublishable = generatePublishableKey();
  const keyHash = await sha256Hex(rawKey);
  const publishableHash = await sha256Hex(rawPublishable);
  const keyPrefix = rawKey.slice(0, 12);
  const keyId = crypto.randomUUID();
  const resetAt = startOfUtcMonth().toISOString();
  const tier: Tier = 'free';

  await c.env.DB
    .prepare(
      `INSERT INTO api_keys
         (id, user_id, name, key_prefix, key_hash, tier, monthly_limit, usage_reset_at,
          publishable_prefix, publishable_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      keyId,
      user.id,
      keyname,
      keyPrefix,
      keyHash,
      tier,
      TIER_LIMITS[tier],
      resetAt,
      rawPublishable.slice(0, 12),
      publishableHash
    )
    .run();

  const upgradeIntent = isPaidTierName(intent) ? intent : undefined;
  return htmlResponse(keyCreatedPage(rawKey, rawPublishable, email, upgradeIntent));
});

// ── Checkout ──────────────────────────────────────────────────────────────────

/**
 * Start a Stripe Checkout session and 303 the browser to it.
 *
 * Accepts GET (so it can be a plain link from an email or the dashboard) and
 * POST (so it can be a form). Auth is the raw API key, same as /dashboard.
 */
async function handleCheckout(
  c: Context<{ Bindings: Env }>,
  tierParam: string | undefined,
  rawKey: string | undefined
): Promise<Response> {
  const cfg = billingConfig(c.env);
  if (!cfg) {
    // Stripe not wired up yet. Never throw — /og must keep working.
    console.warn('checkout attempted but billing is not configured');
    if (wantsHtml(c)) return htmlResponse(billingUnavailablePage(), 503);
    return c.json(
      {
        error: 'billing not configured',
        detail:
          'Stripe is not set up on this deployment. Required secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS.',
      },
      503
    );
  }

  if (!isPaidTierName(tierParam)) {
    return c.json({ error: 'tier must be "pro" or "business"' }, 400);
  }
  if (!rawKey) {
    return c.json(
      { error: 'key parameter is required — create one at /register' },
      401
    );
  }

  const apiKey = await resolveApiKey(c.env.DB, rawKey);
  if (!apiKey) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  // Already on this plan and paid up? Nothing to sell.
  if (
    apiKey.tier === tierParam &&
    (apiKey.subscription_status === 'active' || apiKey.subscription_status === 'trialing')
  ) {
    return c.redirect(`/dashboard?key=${encodeURIComponent(rawKey)}`, 303);
  }

  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(apiKey.user_id)
    .first<User>();

  const origin = new URL(c.req.url).origin;
  const keyParam = encodeURIComponent(rawKey);
  const session = await createCheckoutSession(cfg, {
    tier: tierParam,
    apiKeyId: apiKey.id,
    customerId: apiKey.stripe_customer_id ?? user?.stripe_customer_id ?? null,
    email: user?.email ?? null,
    successUrl: `${origin}/billing/success?tier=${tierParam}&key=${keyParam}`,
    cancelUrl: `${origin}/billing/cancel?tier=${tierParam}&key=${keyParam}`,
  });

  if (!session.ok) {
    // Log the real reason; never return it. Stripe's error strings can echo a
    // masked form of our secret key back to the caller.
    console.error('Stripe checkout session failed:', session.error.message);
    if (wantsHtml(c)) {
      return htmlResponse(
        errorPage(502, 'Could not reach Stripe — please try again'),
        502
      );
    }
    return c.json({ error: 'checkout failed, please try again' }, 502);
  }
  if (!session.data.url) {
    return c.json({ error: 'Stripe returned a session without a URL' }, 502);
  }

  return c.redirect(session.data.url, 303);
}

app.get('/checkout', c =>
  handleCheckout(c, c.req.query('tier'), c.req.query('key'))
);

app.post('/checkout', async c => {
  let tier: string | undefined;
  let key: string | undefined;
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('json')) {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    tier = typeof body['tier'] === 'string' ? body['tier'] : undefined;
    key = typeof body['key'] === 'string' ? body['key'] : undefined;
  } else {
    const form = await c.req.formData().catch(() => null);
    tier = (form?.get('tier') as string | null) ?? undefined;
    key = (form?.get('key') as string | null) ?? undefined;
  }
  return handleCheckout(c, tier, key);
});

// ── Post-checkout landings ────────────────────────────────────────────────────

app.get('/billing/success', async c => {
  const rawKey = c.req.query('key');
  const tier = c.req.query('tier');
  const apiKey = rawKey ? await resolveApiKey(c.env.DB, rawKey) : null;
  // The webhook is the source of truth and may not have landed yet — the page
  // renders "confirming" rather than lying about the tier.
  return htmlResponse(
    billingSuccessPage(
      apiKey,
      rawKey ?? null,
      isPaidTierName(tier) ? tier : 'pro'
    )
  );
});

app.get('/billing/cancel', c => {
  const rawKey = c.req.query('key');
  const tier = c.req.query('tier');
  return htmlResponse(
    billingCancelPage(rawKey ?? null, isPaidTierName(tier) ? tier : 'pro')
  );
});

/** Self-serve card update / cancel via Stripe's hosted portal. */
app.get('/billing/portal', async c => {
  const cfg = billingConfig(c.env);
  if (!cfg) {
    if (wantsHtml(c)) return htmlResponse(billingUnavailablePage(), 503);
    return c.json({ error: 'billing not configured' }, 503);
  }

  const rawKey = c.req.query('key');
  const apiKey = await resolveApiKey(c.env.DB, rawKey ?? null);
  if (!apiKey) return c.json({ error: 'Invalid API key' }, 401);

  const customerId = apiKey.stripe_customer_id;
  if (!customerId) {
    return c.redirect(`/dashboard?key=${encodeURIComponent(rawKey ?? '')}`, 303);
  }

  const origin = new URL(c.req.url).origin;
  const portal = await createPortalSession(
    cfg,
    customerId,
    `${origin}/dashboard?key=${encodeURIComponent(rawKey ?? '')}`
  );
  if (!portal.ok) {
    console.error('Stripe portal session failed:', portal.error.message);
    return htmlResponse(errorPage(502, 'Could not reach Stripe billing portal'), 502);
  }
  return c.redirect(portal.data.url, 303);
});

// ── Stripe webhook ────────────────────────────────────────────────────────────

/**
 * The ONLY place a paid tier is ever granted.
 *
 * Signature is verified before the body is parsed. Every delivery is claimed in
 * `webhook_events` first, so Stripe's retries can't double-apply.
 */
app.post('/webhooks/stripe', async c => {
  const secret = webhookSecret(c.env);
  if (!secret) {
    console.warn('stripe webhook received but STRIPE_WEBHOOK_SECRET is unset');
    return c.json({ error: 'billing not configured' }, 503);
  }

  // Raw body — must be the exact bytes Stripe signed.
  const rawBody = await c.req.text();
  const signature = c.req.header('stripe-signature');

  const verified = await verifyStripeSignature(rawBody, signature, secret);
  if (!verified.ok) {
    console.warn('rejected stripe webhook:', verified.reason);
    return c.json({ error: 'invalid signature', reason: verified.reason }, 400);
  }

  const event = parseEvent(rawBody);
  if (!event) {
    return c.json({ error: 'malformed event payload' }, 400);
  }

  // Idempotency: first writer wins, everyone else is a no-op.
  const claimed = await claimEvent(c.env.DB, event.id, event.type);
  if (!claimed) {
    return c.json({ received: true, duplicate: true, id: event.id });
  }

  try {
    const result = await applyEvent(c.env.DB, event);
    console.log(`stripe ${event.type} (${event.id}): ${result.detail}`);
    return c.json({
      received: true,
      id: event.id,
      handled: result.handled,
      detail: result.detail,
    });
  } catch (err) {
    // Release the claim so Stripe's retry can try again.
    await releaseEvent(c.env.DB, event.id).catch(() => {});
    console.error(`stripe ${event.type} (${event.id}) failed:`, err);
    return c.json({ error: 'handler failed' }, 500);
  }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/dashboard', async c => {
  const rawKey = c.req.query('key');
  if (!rawKey) {
    return htmlResponse(registerPage('Enter your API key or create a new one below'), 400);
  }

  const apiKey = await resolveApiKey(c.env.DB, rawKey);
  if (!apiKey) {
    return htmlResponse(errorPage(404, 'API key not found'), 404);
  }

  const refreshed = await maybeResetUsage(c.env.DB, apiKey);

  // Count recent events (last 24h)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await c.env.DB
    .prepare(
      'SELECT COUNT(*) as cnt FROM usage_events WHERE api_key_id = ? AND generated_at > ?'
    )
    .bind(refreshed.id, yesterday)
    .first<{ cnt: number }>();

  return htmlResponse(
    dashboardPage(
      refreshed,
      recent?.cnt ?? 0,
      rawKey,
      billingConfig(c.env) !== null,
      c.req.query('saved')
    )
  );
});

/**
 * Update the domain allowlist / signature requirement for a key.
 *
 * Authenticated by the secret key, like the rest of the dashboard. Without this
 * route the allowlist columns would be unreachable — a security control nobody
 * can switch on is not a control.
 */
app.post('/dashboard/domains', async c => {
  let rawKey = '';
  let domainsRaw = '';
  let requireSig = false;
  try {
    const form = await c.req.formData();
    rawKey = ((form.get('key') as string) ?? '').trim();
    domainsRaw = ((form.get('domains') as string) ?? '').trim();
    requireSig = ((form.get('require_signature') as string) ?? '') === 'on';
  } catch {
    return htmlResponse(errorPage(400, 'Invalid form data'), 400);
  }

  const apiKey = await resolveApiKey(c.env.DB, rawKey);
  if (!apiKey) {
    return htmlResponse(errorPage(401, 'Invalid API key'), 401);
  }

  // Accept newlines, commas or spaces; normalise and drop anything unparseable.
  const cleaned = [
    ...new Set(
      domainsRaw
        .split(/[\s,]+/)
        .map(normalizeDomain)
        .filter((d): d is string => d !== null)
    ),
  ];

  await c.env.DB
    .prepare('UPDATE api_keys SET allowed_domains = ?, require_signature = ? WHERE id = ?')
    .bind(cleaned.length ? cleaned.join(',') : null, requireSig ? 1 : 0, apiKey.id)
    .run();

  console.log(
    JSON.stringify({
      evt: 'domains_updated',
      key_prefix: apiKey.key_prefix,
      domains: cleaned.length,
      require_signature: requireSig,
    })
  );

  return c.redirect(`/dashboard?key=${encodeURIComponent(rawKey)}&saved=domains`, 303);
});

// ── Health / ops ──────────────────────────────────────────────────────────────
app.get('/health', c =>
  c.json({
    ok: true,
    ts: new Date().toISOString(),
    // Lets devops smoke-test whether Stripe is wired up without exposing values.
    billing: billingConfig(c.env) !== null ? 'configured' : 'not_configured',
    webhook: webhookSecret(c.env) !== null ? 'configured' : 'not_configured',
  })
);

// 404 fallback
app.notFound(_c => htmlResponse(errorPage(404, 'Page not found'), 404));
app.onError((err, _c) => {
  console.error('Unhandled error:', err);
  return htmlResponse(errorPage(500, 'Internal server error'), 500);
});

export default app;
