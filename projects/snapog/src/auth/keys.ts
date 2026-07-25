// SnapOG — credential handling.
//
// Two credentials per api_keys row:
//
//   sk_...  secret / server-side only. Full control: dashboard, checkout,
//           billing portal, and rendering. Never belongs in page source.
//   pk_...  publishable. Rendering ONLY. Safe(r) to embed in a
//           <meta property="og:image"> tag, and can be locked down two ways:
//             - allowed_domains  → checked against Referer/Origin
//             - require_signature → HMAC over the params, the only protection
//               that survives a crawler with no Referer
//
// A leaked pk_ can never read usage, start a checkout, or reach Stripe.

import type { ApiKey, KeyKind } from '../types';

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSecretKey(): string {
  return 'sk_' + randomHex(32);
}

export function generatePublishableKey(): string {
  return 'pk_' + randomHex(16);
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export interface ResolvedKey {
  row: ApiKey;
  kind: KeyKind;
}

/**
 * Resolve either credential. `/og` accepts both; every control route must use
 * `resolveSecretKey` so a publishable key can never act on the account.
 */
export async function resolveAnyKey(
  db: D1Database,
  raw: string | null
): Promise<ResolvedKey | null> {
  if (!raw) return null;
  const hash = await sha256Hex(raw);

  if (raw.startsWith('pk_')) {
    const row = await db
      .prepare('SELECT * FROM api_keys WHERE publishable_hash = ?')
      .bind(hash)
      .first<ApiKey>();
    return row ? { row, kind: 'publishable' } : null;
  }

  const row = await db
    .prepare('SELECT * FROM api_keys WHERE key_hash = ?')
    .bind(hash)
    .first<ApiKey>();
  return row ? { row, kind: 'secret' } : null;
}

/** Secret keys only — publishable keys must never reach account surfaces. */
export async function resolveSecretKey(
  db: D1Database,
  raw: string | null
): Promise<ApiKey | null> {
  if (!raw || raw.startsWith('pk_')) return null;
  const hash = await sha256Hex(raw);
  const row = await db
    .prepare('SELECT * FROM api_keys WHERE key_hash = ?')
    .bind(hash)
    .first<ApiKey>();
  return row ?? null;
}

// ─── Domain allowlist ─────────────────────────────────────────────────────────

export function parseAllowedDomains(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Normalise a user-entered domain: strip scheme, path, port, leading dot/www. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, '');
  d = d.split('/')[0] ?? '';
  d = d.split(':')[0] ?? '';
  d = d.replace(/^\.+/, '');
  if (!d || !/^[a-z0-9.-]+$/.test(d) || !d.includes('.')) return null;
  return d;
}

function hostMatches(host: string, allowed: string): boolean {
  if (host === allowed) return true;
  // A bare domain also authorises its subdomains.
  return host.endsWith('.' + allowed);
}

export type DomainCheck =
  | { ok: true; reason: 'unrestricted' | 'matched' | 'no-referer' }
  | { ok: false; reason: string; host: string | null };

/**
 * Validate Referer/Origin against the allowlist.
 *
 * IMPORTANT LIMITATION, deliberately not hidden: social-media crawlers
 * (Twitterbot, facebookexternalhit, Slackbot, LinkedInBot, Discordbot) fetch
 * og:image with NO Referer and NO Origin. If we refused those we would break the
 * entire product, so a request with neither header is allowed through.
 *
 * That means the allowlist stops casual hotlinking from a browser page — which
 * does send Referer — but a deliberate attacker just omits the header. Customers
 * who need a hard guarantee must set require_signature; see verifyUrlSignature.
 */
export function checkDomain(
  key: ApiKey,
  referer: string | null,
  origin: string | null
): DomainCheck {
  const allowed = parseAllowedDomains(key.allowed_domains);
  if (allowed.length === 0) return { ok: true, reason: 'unrestricted' };

  const source = origin ?? referer;
  if (!source) return { ok: true, reason: 'no-referer' };

  let host: string | null = null;
  try {
    host = new URL(source).hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!host) return { ok: false, reason: 'unparseable Referer/Origin', host: null };

  for (const a of allowed) {
    if (hostMatches(host, a)) return { ok: true, reason: 'matched' };
  }
  return { ok: false, reason: 'domain not allowed', host };
}

// ─── Signed URLs ──────────────────────────────────────────────────────────────

/**
 * Canonical string to sign: every query parameter except `key` and `sig`,
 * sorted by name, `name=value` with encodeURIComponent, joined by `&`.
 *
 * Documented in the README so customers can reproduce it in any language.
 */
export function canonicalParams(url: URL): string {
  const parts: string[] = [];
  const names = [...new Set([...url.searchParams.keys()])]
    .filter(n => n !== 'key' && n !== 'sig')
    .sort();
  for (const name of names) {
    for (const value of url.searchParams.getAll(name).sort()) {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The signing secret is the api_key's stored `key_hash` — i.e. sha256(sk_).
 *
 * Neat property: the customer can derive it (they hold sk_) and we already have
 * it at rest, so signed URLs need no new secret column and no plaintext secret
 * in the database. A leaked pk_ reveals nothing about it.
 */
export async function signParams(keyHash: string, canonical: string): Promise<string> {
  return hmacHex(keyHash, canonical);
}

export async function verifyUrlSignature(
  key: ApiKey,
  url: URL
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const provided = url.searchParams.get('sig');
  if (!provided) return { ok: false, reason: 'sig parameter required' };
  const expected = await signParams(key.key_hash, canonicalParams(url));
  return constantTimeEqualHex(provided.toLowerCase(), expected)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}
