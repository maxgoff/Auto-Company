// SnapOG — Stripe integration via the plain REST API.
//
// Deliberately NO `stripe` npm SDK: it drags in Node built-ins, needs
// nodejs_compat shims, and bloats the Worker bundle. Stripe's API is just
// form-encoded HTTP — `fetch` is all we need.

import type { Env, PaidTier, Tier } from '../types';

const STRIPE_API = 'https://api.stripe.com/v1';
// Pin the API version so Stripe can't change object shapes under us.
const STRIPE_VERSION = '2024-11-20.acacia';

/** Signature timestamps older than this are rejected (replay protection). */
const SIGNATURE_TOLERANCE_SECONDS = 300;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BillingConfig {
  secretKey: string;
  prices: Record<PaidTier, string>;
}

/**
 * Returns null when billing is not configured. Callers MUST handle null with a
 * 503 rather than throwing — an unconfigured Stripe must never take down /og.
 */
export function billingConfig(env: Env): BillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const pro = env.STRIPE_PRICE_PRO?.trim();
  const business = env.STRIPE_PRICE_BUSINESS?.trim();
  if (!secretKey || !pro || !business) return null;
  return { secretKey, prices: { pro, business } };
}

export function webhookSecret(env: Env): string | null {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

// ─── Low-level request helper ─────────────────────────────────────────────────

function formEncode(
  params: Record<string, string | number | boolean | undefined>
): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    usp.set(key, String(value));
  }
  return usp.toString();
}

export interface StripeError {
  message: string;
  status: number;
}

async function stripePost<T>(
  cfg: BillingConfig,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  idempotencyKey?: string
): Promise<{ ok: true; data: T } | { ok: false; error: StripeError }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': STRIPE_VERSION,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers,
      body: formEncode(params),
    });
  } catch (err) {
    return {
      ok: false,
      error: { message: `Network error calling Stripe: ${String(err)}`, status: 502 },
    };
  }

  const text = await res.text();
  if (!res.ok) {
    let message = `Stripe returned ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* keep the generic message */
    }
    return { ok: false, error: { message, status: res.status } };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      error: { message: 'Stripe returned a non-JSON body', status: 502 },
    };
  }
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

export interface CheckoutSession {
  id: string;
  url: string | null;
}

export interface CreateCheckoutInput {
  tier: PaidTier;
  apiKeyId: string;
  /** Existing Stripe customer, when we've already seen this user. */
  customerId?: string | null;
  /** Used only when there is no customerId yet. */
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  cfg: BillingConfig,
  input: CreateCheckoutInput
): Promise<{ ok: true; data: CheckoutSession } | { ok: false; error: StripeError }> {
  const params: Record<string, string | number | boolean | undefined> = {
    mode: 'subscription',
    'line_items[0][price]': cfg.prices[input.tier],
    'line_items[0][quantity]': 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // How the webhook finds its way back to the right API key.
    client_reference_id: input.apiKeyId,
    'metadata[api_key_id]': input.apiKeyId,
    'metadata[tier]': input.tier,
    // Mirror onto the subscription so subscription.* events carry it too.
    'subscription_data[metadata][api_key_id]': input.apiKeyId,
    'subscription_data[metadata][tier]': input.tier,
    allow_promotion_codes: true,
  };

  // Stripe rejects `customer` and `customer_email` together.
  if (input.customerId) {
    params['customer'] = input.customerId;
  } else if (input.email) {
    params['customer_email'] = input.email;
  }

  return stripePost<CheckoutSession>(
    cfg,
    '/checkout/sessions',
    params,
    // Same key + same tier retried within the session shouldn't double-create.
    `checkout:${input.apiKeyId}:${input.tier}`
  );
}

// ─── Billing portal (self-serve cancel / card update) ─────────────────────────

export async function createPortalSession(
  cfg: BillingConfig,
  customerId: string,
  returnUrl: string
): Promise<{ ok: true; data: { url: string } } | { ok: false; error: StripeError }> {
  return stripePost<{ url: string }>(cfg, '/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
}

// ─── Webhook signature verification ───────────────────────────────────────────

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/** Length-independent, data-independent comparison. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verify Stripe's `Stripe-Signature` header.
 *
 * Header format: `t=<unix_ts>,v1=<hex hmac>[,v1=<hex hmac>...]`
 * Signed payload is literally `${t}.${rawBody}`, HMAC-SHA256 with the endpoint
 * secret. Multiple v1 values appear during secret rotation — any match passes.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<SignatureResult> {
  if (!header) return { ok: false, reason: 'missing Stripe-Signature header' };

  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp) return { ok: false, reason: 'no timestamp in signature header' };
  if (signatures.length === 0) {
    return { ok: false, reason: 'no v1 signature in signature header' };
  }

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'malformed timestamp in signature header' };
  }
  const age = nowSeconds - ts;
  if (Math.abs(age) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp outside tolerance (age ${age}s)` };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${rawBody}`)
    )
  );

  for (const candidate of signatures) {
    const bytes = hexToBytes(candidate);
    if (bytes && constantTimeEqual(bytes, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}

// ─── Event shapes (only the fields we actually read) ──────────────────────────

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function parseEvent(rawBody: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as Partial<StripeEvent>;
    if (
      typeof parsed?.id !== 'string' ||
      typeof parsed?.type !== 'string' ||
      typeof parsed?.data !== 'object' ||
      parsed.data === null ||
      typeof parsed.data.object !== 'object' ||
      parsed.data.object === null
    ) {
      return null;
    }
    return parsed as StripeEvent;
  } catch {
    return null;
  }
}

/** Stripe expands-or-ids: a field is either "cus_123" or { id: "cus_123" }. */
export function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

export function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** Read `metadata[tier]` and validate it against our known paid tiers. */
export function paidTierOf(value: unknown): PaidTier | null {
  const tier = stringOf(value);
  return tier === 'pro' || tier === 'business' ? tier : null;
}

export function isPaidTier(tier: Tier): tier is PaidTier {
  return tier === 'pro' || tier === 'business';
}
