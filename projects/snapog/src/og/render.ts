// SnapOG — OG image renderer
// Uses workers-og (Satori + resvg-wasm, CF Workers compatible)

import { ImageResponse } from 'workers-og';
import { buildElement, quotaExceededElement } from './templates';
import type { OGParams } from '../types';

// Fonts are BUNDLED, not fetched.
//
// workers-og defaults to downloading a font from fonts.googleapis.com on every
// cold isolate when no `fonts` option is passed. That put a third party inside
// our critical path — if Google Fonts is slow or down, every cold render is slow
// or fails — and it was a large part of the cold-vs-warm render gap.
//
// These four faces are Latin-subset TTFs (see scripts/gen-fonts.sh for exact
// provenance and the subsetting command): 117 KB total for all four, down from
// ~2 MB of full Noto TTFs. Wrangler inlines them via the `[[rules]] type="Data"`
// block in wrangler.toml, so there is zero network I/O at render time.
import sans400 from './fonts/noto-sans-400.ttf';
import sans700 from './fonts/noto-sans-700.ttf';
import serif400 from './fonts/noto-serif-400.ttf';
import serif700 from './fonts/noto-serif-700.ttf';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Every family referenced by templates.ts must appear here — Satori silently
 * falls back to whatever it has for anything it cannot resolve, which is how
 * `fontFamily: 'monospace'` used to render as a proportional face.
 */
const FONTS = [
  { name: 'Noto Sans', data: sans400, weight: 400 as const, style: 'normal' as const },
  { name: 'Noto Sans', data: sans700, weight: 700 as const, style: 'normal' as const },
  { name: 'Noto Serif', data: serif400, weight: 400 as const, style: 'normal' as const },
  { name: 'Noto Serif', data: serif700, weight: 700 as const, style: 'normal' as const },
];

export async function generateOGImage(
  params: OGParams,
  watermark: boolean
): Promise<Response> {
  const element = buildElement(params, watermark);

  const response = new ImageResponse(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: FONTS,
  });

  return response;
}

/**
 * The over-quota placeholder. Deliberately parameter-free so there is exactly
 * ONE of these images ever: it renders once, lands in R2 under a fixed key, and
 * every subsequent over-quota request is a cache hit. If it took the caller's
 * title it would be an unlimited free render endpoint.
 */
export async function generateQuotaExceededImage(): Promise<Response> {
  return new ImageResponse(quotaExceededElement(), {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: FONTS,
  });
}

/** Fixed R2 key for the placeholder — never parameterised. */
export const QUOTA_EXCEEDED_R2_KEY = 'og/_system/quota-exceeded-v1.png';

// Build a deterministic cache key from OG params
export async function buildCacheKey(params: OGParams, watermark: boolean): Promise<string> {
  const sorted = JSON.stringify(
    Object.fromEntries(
      Object.entries({ ...params, watermark }).sort(([a], [b]) => a.localeCompare(b))
    )
  );
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
