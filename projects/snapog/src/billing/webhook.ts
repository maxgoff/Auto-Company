// SnapOG — Stripe webhook event application.
//
// Everything here must be safe to run twice: Stripe retries a delivery until it
// receives a 2xx, and it can deliver events out of order.

import type { ApiKey, SubscriptionStatus, Tier } from '../types';
import { TIER_LIMITS } from '../types';
import { idOf, paidTierOf, stringOf, type StripeEvent } from './stripe';

/** Statuses that mean "this subscription no longer entitles a paid tier". */
const DEAD_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'unpaid',
  'incomplete_expired',
]);

/** Statuses that entitle the paid tier. */
const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

function asStatus(value: unknown): SubscriptionStatus | null {
  const s = stringOf(value);
  if (!s) return null;
  const known: SubscriptionStatus[] = [
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused',
  ];
  return (known as string[]).includes(s) ? (s as SubscriptionStatus) : null;
}

/**
 * Claim an event id. Returns false when this event was already processed,
 * in which case the caller must return 200 without re-applying anything.
 */
export async function claimEvent(
  db: D1Database,
  eventId: string,
  type: string
): Promise<boolean> {
  const res = await db
    .prepare(
      'INSERT INTO webhook_events (id, type) VALUES (?, ?) ON CONFLICT(id) DO NOTHING'
    )
    .bind(eventId, type)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Release a claim so Stripe's retry can have another go at a transient failure. */
export async function releaseEvent(db: D1Database, eventId: string): Promise<void> {
  await db.prepare('DELETE FROM webhook_events WHERE id = ?').bind(eventId).run();
}

async function noteTarget(
  db: D1Database,
  eventId: string,
  apiKeyId: string
): Promise<void> {
  await db
    .prepare('UPDATE webhook_events SET api_key_id = ? WHERE id = ?')
    .bind(apiKeyId, eventId)
    .run();
}

async function recordTierChange(
  db: D1Database,
  apiKeyId: string,
  fromTier: Tier,
  toTier: Tier,
  reason: string,
  eventId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tier_changes (id, api_key_id, from_tier, to_tier, reason, stripe_event_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), apiKeyId, fromTier, toTier, reason, eventId)
    .run();
}

// ─── Resolving which api_key an event is about ────────────────────────────────

async function findByApiKeyId(db: D1Database, id: string): Promise<ApiKey | null> {
  return (
    (await db
      .prepare('SELECT * FROM api_keys WHERE id = ?')
      .bind(id)
      .first<ApiKey>()) ?? null
  );
}

async function findBySubscription(
  db: D1Database,
  subscriptionId: string
): Promise<ApiKey | null> {
  return (
    (await db
      .prepare('SELECT * FROM api_keys WHERE stripe_subscription_id = ?')
      .bind(subscriptionId)
      .first<ApiKey>()) ?? null
  );
}

/**
 * Subscription events may land before `checkout.session.completed`, so resolve
 * by subscription id first and fall back to the metadata we stamped on the
 * subscription at checkout time.
 */
async function resolveFromSubscription(
  db: D1Database,
  object: Record<string, unknown>
): Promise<ApiKey | null> {
  const subscriptionId = stringOf(object['id']);
  if (subscriptionId) {
    const bySub = await findBySubscription(db, subscriptionId);
    if (bySub) return bySub;
  }
  const metadata = (object['metadata'] ?? {}) as Record<string, unknown>;
  const apiKeyId = stringOf(metadata['api_key_id']);
  return apiKeyId ? findByApiKeyId(db, apiKeyId) : null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function upgrade(
  db: D1Database,
  key: ApiKey,
  tier: Tier,
  fields: {
    customerId: string | null;
    subscriptionId: string | null;
    status: SubscriptionStatus | null;
  },
  eventId: string,
  reason: string
): Promise<string> {
  const limit = TIER_LIMITS[tier];
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE api_keys
          SET tier = ?,
              monthly_limit = ?,
              stripe_customer_id = COALESCE(?, stripe_customer_id),
              stripe_subscription_id = COALESCE(?, stripe_subscription_id),
              subscription_status = COALESCE(?, subscription_status),
              tier_updated_at = ?
        WHERE id = ?`
    )
    .bind(
      tier,
      limit,
      fields.customerId,
      fields.subscriptionId,
      fields.status,
      now,
      key.id
    )
    .run();

  // Keep the customer on the user too, so a second key for the same person can
  // reuse the Stripe customer instead of creating a duplicate.
  if (fields.customerId) {
    await db
      .prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
      .bind(fields.customerId, key.user_id)
      .run();
  }

  if (key.tier !== tier) {
    await recordTierChange(db, key.id, key.tier, tier, reason, eventId);
  }
  return `api_key ${key.id}: ${key.tier} -> ${tier} (limit ${limit})`;
}

async function downgrade(
  db: D1Database,
  key: ApiKey,
  status: SubscriptionStatus | null,
  eventId: string,
  reason: string
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE api_keys
          SET tier = 'free',
              monthly_limit = ?,
              subscription_status = ?,
              tier_updated_at = ?
        WHERE id = ?`
    )
    .bind(TIER_LIMITS.free, status, now, key.id)
    .run();

  if (key.tier !== 'free') {
    await recordTierChange(db, key.id, key.tier, 'free', reason, eventId);
  }
  return `api_key ${key.id}: ${key.tier} -> free (limit ${TIER_LIMITS.free})`;
}

async function setStatus(
  db: D1Database,
  key: ApiKey,
  status: SubscriptionStatus | null
): Promise<string> {
  await db
    .prepare('UPDATE api_keys SET subscription_status = ? WHERE id = ?')
    .bind(status, key.id)
    .run();
  return `api_key ${key.id}: status -> ${status ?? 'null'}`;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export interface HandleResult {
  /** True when we recognised the event type (even if it was a no-op). */
  handled: boolean;
  detail: string;
}

export async function applyEvent(
  db: D1Database,
  event: StripeEvent
): Promise<HandleResult> {
  const object = event.data.object;

  switch (event.type) {
    // ── Payment completed: grant the paid tier ──
    case 'checkout.session.completed': {
      const metadata = (object['metadata'] ?? {}) as Record<string, unknown>;
      const apiKeyId =
        stringOf(object['client_reference_id']) ?? stringOf(metadata['api_key_id']);
      if (!apiKeyId) {
        return { handled: true, detail: 'no client_reference_id/metadata.api_key_id' };
      }

      const key = await findByApiKeyId(db, apiKeyId);
      if (!key) {
        return { handled: true, detail: `api_key ${apiKeyId} not found` };
      }
      await noteTarget(db, event.id, key.id);

      const tier = paidTierOf(metadata['tier']);
      if (!tier) {
        return { handled: true, detail: `metadata.tier missing or invalid for ${key.id}` };
      }

      // Only grant when the session is actually paid for. Stripe sends
      // `payment_status: 'paid'` (or 'no_payment_required' for 100% coupons).
      const paymentStatus = stringOf(object['payment_status']);
      if (paymentStatus && paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
        return {
          handled: true,
          detail: `session not paid (payment_status=${paymentStatus}) — no upgrade`,
        };
      }

      const detail = await upgrade(
        db,
        key,
        tier,
        {
          customerId: idOf(object['customer']),
          subscriptionId: idOf(object['subscription']),
          status: 'active',
        },
        event.id,
        event.type
      );
      return { handled: true, detail };
    }

    // ── Subscription cancelled: back to free ──
    case 'customer.subscription.deleted': {
      const key = await resolveFromSubscription(db, object);
      if (!key) {
        return { handled: true, detail: 'no api_key matched this subscription' };
      }
      await noteTarget(db, event.id, key.id);
      const detail = await downgrade(
        db,
        key,
        asStatus(object['status']) ?? 'canceled',
        event.id,
        event.type
      );
      return { handled: true, detail };
    }

    // ── Status transitions: renewals, cancellations, dunning ──
    case 'customer.subscription.updated': {
      const key = await resolveFromSubscription(db, object);
      if (!key) {
        return { handled: true, detail: 'no api_key matched this subscription' };
      }
      await noteTarget(db, event.id, key.id);

      const status = asStatus(object['status']);
      const rawStatus = stringOf(object['status']);

      if (rawStatus && DEAD_STATUSES.has(rawStatus)) {
        const detail = await downgrade(db, key, status, event.id, event.type);
        return { handled: true, detail };
      }

      if (rawStatus && LIVE_STATUSES.has(rawStatus)) {
        const metadata = (object['metadata'] ?? {}) as Record<string, unknown>;
        const tier = paidTierOf(metadata['tier']);
        // Re-assert entitlement. Covers plan switches (pro -> business) and the
        // case where this event beat checkout.session.completed to us.
        if (tier && (key.tier !== tier || key.subscription_status !== status)) {
          const detail = await upgrade(
            db,
            key,
            tier,
            {
              customerId: idOf(object['customer']),
              subscriptionId: stringOf(object['id']),
              status,
            },
            event.id,
            event.type
          );
          return { handled: true, detail };
        }
      }

      // past_due / incomplete / paused: keep access, flag it in the dashboard.
      const detail = await setStatus(db, key, status);
      return { handled: true, detail };
    }

    // ── Dunning signal, surfaced in the dashboard ──
    case 'invoice.payment_failed': {
      const subscriptionId = idOf(object['subscription']);
      if (!subscriptionId) {
        return { handled: true, detail: 'invoice has no subscription' };
      }
      const key = await findBySubscription(db, subscriptionId);
      if (!key) {
        return { handled: true, detail: 'no api_key matched this subscription' };
      }
      await noteTarget(db, event.id, key.id);
      const detail = await setStatus(db, key, 'past_due');
      return { handled: true, detail };
    }

    default:
      return { handled: false, detail: `ignored event type ${event.type}` };
  }
}
