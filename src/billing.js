import crypto from 'node:crypto';
import { getDb } from './db.js';

// Public Stripe price IDs supplied by the product owner (safe to expose).
export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1UK1fI135y6qw8XWu5M2rbpY',
  yearly: process.env.STRIPE_PRICE_YEARLY || 'price_1UK1gE135y6qw8XWjySyztec',
};

// Public Stripe Payment Links supplied by the product owner (safe to expose).
export const PAYMENT_LINKS = {
  monthly: process.env.STRIPE_LINK_MONTHLY || 'https://buy.stripe.com/aFa4grauo6UnduBh1D8N202',
  yearly: process.env.STRIPE_LINK_YEARLY || 'https://buy.stripe.com/8x28wH5a4baDeyFbHj8N204',
};

/**
 * Politique de droits après impayé / remboursement / contestation.
 * Elle est explicite et documentée (README) — pas de règle implicite.
 */
export const POLICY = {
  graceDays: Number(process.env.BILLING_GRACE_DAYS || 3),
  pastDueKeepsAccess: true,          // accès conservé pendant le délai de grâce
  canceledKeepsAccessUntilPeriodEnd: true,
  refundRevokesImmediately: true,    // remboursement/contestation -> retrait immédiat
};

export const PLANS = [
  {
    id: 'free',
    name: 'Gratuit',
    price: 0,
    period: 'mois',
    features: ['Générations IA limitées (3/jour)', 'Quiz standards', 'Mini-jeux', 'Défis du jour', 'Progression de base', 'Avec publicités'],
    limits: { aiPerDay: 3 },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 4.99,
    period: 'mois',
    features: ['Générations IA illimitées', 'Quiz avancés', 'Sessions d’étude illimitées', 'Analyses complètes', 'Mini-jeux exclusifs', 'Badges premium', 'Zéro publicité', 'Tests d’examen avancés'],
    limits: { aiPerDay: Infinity },
  },
];

export const YEARLY = { price: 39.99, period: 'an', note: 'Économise 33 %', months: 12 };
export const TRIAL_DAYS = 7;

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Construit le lien de paiement du plan demandé en injectant l'identifiant
 * interne de l'utilisateur authentifié (session serveur). On n'accepte JAMAIS
 * un identifiant venant du navigateur, et on n'utilise pas l'e-mail.
 *
 * `client_reference_id` est le paramètre Stripe officiel ; `clientreferenceid`
 * est fourni en alias pour les intégrations qui l'attendent sous cette forme.
 */
export function paymentLinkFor(user, plan) {
  const base = plan === 'yearly' ? PAYMENT_LINKS.yearly : PAYMENT_LINKS.monthly;
  const url = new URL(base);
  const ref = String(user.id);
  url.searchParams.set('client_reference_id', ref);
  url.searchParams.set('clientreferenceid', ref);
  return url.toString();
}

let priceCache = null;
/** Real Stripe price amounts (so the UI never contradicts what Stripe charges). */
export async function getPrices() {
  if (priceCache) return priceCache;
  const fallback = {
    monthly: { amount: 499, currency: 'EUR', interval: 'month' },
    yearly: { amount: 3999, currency: 'EUR', interval: 'year' },
  };
  const s = await stripe();
  if (!s) { priceCache = fallback; return fallback; }
  try {
    const [m, y] = await Promise.all([s.prices.retrieve(STRIPE_PRICES.monthly), s.prices.retrieve(STRIPE_PRICES.yearly)]);
    priceCache = {
      monthly: { amount: m.unit_amount, currency: (m.currency || 'eur').toUpperCase(), interval: (m.recurring && m.recurring.interval) || 'month' },
      yearly: { amount: y.unit_amount, currency: (y.currency || 'eur').toUpperCase(), interval: (y.recurring && y.recurring.interval) || 'year' },
    };
  } catch {
    priceCache = fallback;
  }
  return priceCache;
}

let stripeClient = null;
async function stripe() {
  if (!stripeConfigured()) return null;
  if (!stripeClient) {
    const Stripe = (await import('stripe')).default;
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeClient;
}

function iso(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function toUser(user) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id);
}

export function billingStatus(user) {
  reconcileTrial(user);
  const d = getDb();
  const fresh = d.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  let trialDaysLeft = null;
  if (fresh.subscription_status === 'trialing' && fresh.trial_ends_at) {
    trialDaysLeft = Math.max(0, Math.ceil((new Date(fresh.trial_ends_at).getTime() - Date.now()) / 86400000));
  }
  const payments = d.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
  const premium = ['active', 'trialing', 'past_due'].includes(fresh.subscription_status)
    || (fresh.subscription_status === 'canceled' && fresh.current_period_end && new Date(fresh.current_period_end).getTime() > Date.now());
  return {
    plan: fresh.plan,
    status: fresh.subscription_status,
    premium,
    offer: fresh.plan === 'premium' ? (fresh.subscription_status === 'trialing' ? 'Essai Premium' : 'Premium') : 'Gratuit',
    trialEndsAt: fresh.trial_ends_at,
    trialDaysLeft,
    currentPeriodEnd: fresh.current_period_end,
    nextDueDate: premium ? fresh.current_period_end : null,
    cancelAtPeriodEnd: fresh.subscription_status === 'canceled' && premium,
    paymentIssue: !!fresh.payment_issue,
    stripeCustomer: !!fresh.stripe_customer_id,
    stripeSubscription: !!fresh.stripe_subscription_id,
    stripeConfigured: stripeConfigured(),
    prices: STRIPE_PRICES,
    links: PAYMENT_LINKS,
    policy: POLICY,
    payments,
  };
}

/**
 * Mode démo (aucune clé Stripe) : on reproduit le même cycle localement
 * (7 jours offerts puis activation) pour pouvoir tester le produit hors ligne.
 */
export function reconcileTrial(user) {
  const d = getDb();
  const fresh = d.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!fresh || fresh.subscription_status !== 'trialing' || !fresh.trial_ends_at) return;
  if (stripeConfigured()) return; // en production, les webhooks Stripe pilotent le cycle
  if (new Date(fresh.trial_ends_at).getTime() > Date.now()) return;
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  d.prepare("UPDATE users SET subscription_status = 'active', current_period_end = ? WHERE id = ?").run(periodEnd, fresh.id);
  d.prepare(`INSERT INTO payments (user_id, provider, amount_cents, currency, status, plan) VALUES (?, 'demo', 499, 'EUR', 'paid', 'premium')`).run(fresh.id);
  d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'billing', ?, ?)")
    .run(fresh.id, 'Abonnement activé 💳', 'Ton essai gratuit est terminé. Premium est maintenant actif (4,99 €/mois).');
}

export function startTrialDemo(user, plan) {
  const d = getDb();
  const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
  d.prepare(`UPDATE users SET plan = 'premium', subscription_status = 'trialing', trial_ends_at = ?, payment_issue = 0 WHERE id = ?`)
    .run(trialEnd, user.id);
  d.prepare(`INSERT INTO payments (user_id, provider, amount_cents, currency, status, plan) VALUES (?, 'demo', 0, 'EUR', 'trialing', ?)`)
    .run(user.id, plan);
  d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'billing', ?, ?)")
    .run(user.id, 'Essai gratuit de 7 jours activé 🎁', 'Profite de Premium gratuitement. Ensuite, l’abonnement est prélevé automatiquement.');
  return billingStatus(user);
}

/**
 * Point d'entrée du parcours d'abonnement :
 *  - sans clé Stripe -> mode démo (essai local) ;
 *  - avec clé Stripe -> lien de paiement `buy.stripe.com` + clientreferenceid.
 * Aucune activation ici : seuls les webhooks vérifiés activent Premium.
 */
export async function createCheckout(user, plan) {
  const s = await stripe();
  if (!s) return { demo: true, status: startTrialDemo(user, plan) };
  return { paymentLink: true, plan, url: paymentLinkFor(user, plan) };
}

export async function createPortal(user, origin) {
  const s = await stripe();
  if (!s || !user.stripe_customer_id) return { demo: true };
  const session = await s.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/app.html#billing`,
  });
  return { url: session.url };
}

export async function cancelSubscription(user) {
  const s = await stripe();
  if (s && user.stripe_subscription_id) {
    const sub = await s.subscriptions.update(user.stripe_subscription_id, { cancel_at_period_end: true });
    applySubscription(sub, sub.created, { source: 'cancel' });
    return billingStatus(user);
  }
  // Mode démo : mêmes règles de droits qu'en production.
  const d = getDb();
  const periodEnd = user.current_period_end || new Date(Date.now() + (user.subscription_status === 'trialing' ? TRIAL_DAYS : 30) * 86400000).toISOString();
  d.prepare("UPDATE users SET subscription_status = 'canceled', current_period_end = ? WHERE id = ?").run(periodEnd, user.id);
  d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'billing', ?, ?)")
    .run(user.id, 'Abonnement annulé', `Tu gardes l’accès Premium jusqu’au ${new Date(periodEnd).toLocaleDateString('fr-FR')}.`);
  return billingStatus(user);
}

export async function resumeSubscription(user) {
  const s = await stripe();
  if (s && user.stripe_subscription_id) {
    const sub = await s.subscriptions.update(user.stripe_subscription_id, { cancel_at_period_end: false });
    applySubscription(sub, sub.created, { source: 'resume' });
    return billingStatus(user);
  }
  const d = getDb();
  d.prepare("UPDATE users SET subscription_status = 'active', payment_issue = 0 WHERE id = ?").run(user.id);
  d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'billing', ?, ?)")
    .run(user.id, 'Abonnement réactivé ✨', 'Ton abonnement Premium est de nouveau actif.');
  return billingStatus(user);
}

export function downgrade(user) {
  const d = getDb();
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  d.prepare("UPDATE users SET subscription_status = 'canceled', current_period_end = ? WHERE id = ?").run(periodEnd, user.id);
  return billingStatus(user);
}

/* ------------------------------------------------------------------ */
/* Webhooks Stripe : signature, idempotence, ordre, cycle de vie       */
/* ------------------------------------------------------------------ */

/**
 * Vérifie la signature Stripe sur le corps BRUT de la requête.
 * Schéma officiel : header `t=<ts>,v1=<hmac>` avec hmac = HMAC_SHA256(secret, `${ts}.${payload}`).
 */
export function verifyStripeSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!header) return { ok: false, reason: 'missing_signature' };
  const parts = {};
  for (const piece of String(header).split(',')) {
    const i = piece.indexOf('=');
    if (i > 0) parts[piece.slice(0, i)] = piece.slice(i + 1);
  }
  const t = Number(parts.t);
  if (!t || !parts.v1) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid_signature' };
  return { ok: true };
}

const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'];

function mapStatus(st) {
  if (!SUBSCRIPTION_STATUSES.includes(st)) return st;
  if (st === 'unpaid') return 'past_due';
  return st;
}

function findUserByCustomer(d, customerId) {
  if (!customerId) return null;
  return d.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId) || null;
}

/** Applique l'état d'un abonnement Stripe à un compte interne (ordonné + validé). */
function applySubscription(sub, eventCreated, { source = 'webhook' } = {}) {
  const d = getDb();
  const refId = sub.metadata?.userId || sub.metadata?.clientReferenceId || sub.client_reference_id
    || sub.metadata?.clientreferenceid || null;
  let user = refId ? d.prepare('SELECT * FROM users WHERE id = ?').get(Number(refId)) : null;
  if (!user) user = findUserByCustomer(d, sub.customer);
  if (!user) return { applied: false, reason: 'unknown_user' };
  // Ne jamais voler un client Stripe déjà rattaché à un autre compte.
  const owner = findUserByCustomer(d, sub.customer);
  if (owner && owner.id !== user.id && source === 'checkout') return { applied: false, reason: 'customer_already_linked' };

  // Vérifie que le prix attendu fait partie des offres connues avant d'accorder des droits.
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const expectedPrices = Object.values(STRIPE_PRICES);
  if (priceId && !expectedPrices.includes(priceId)) return { applied: false, reason: 'unexpected_price' };

  // Ordre : on ignore un événement plus ancien que le dernier état appliqué.
  const eventAt = Number(eventCreated) || Math.floor(Date.now() / 1000);
  if (user.stripe_last_event_at && eventAt < user.stripe_last_event_at) {
    return { applied: false, reason: 'stale_event' };
  }

  let status = mapStatus(sub.status);
  // Résiliation programmée : on conserve l'accès jusqu'à la fin de la période payée.
  if (sub.cancel_at_period_end && status === 'active') status = 'canceled';

  const grantsAccess = ['active', 'trialing', 'past_due', 'canceled'].includes(status);
  const periodEnd = iso(sub.current_period_end);
  d.prepare(`UPDATE users SET plan = ?, subscription_status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id),
    stripe_subscription_id = ?, trial_ends_at = ?, current_period_end = ?, payment_issue = ?, stripe_last_event_at = ? WHERE id = ?`)
    .run(grantsAccess ? 'premium' : 'free', status, sub.customer || null, sub.id || null,
      iso(sub.trial_end), periodEnd, status === 'past_due' ? 1 : 0, eventAt, user.id);
  return { applied: true, userId: user.id, status };
}

function recordInvoicePaid(inv) {
  const d = getDb();
  const user = findUserByCustomer(d, inv.customer) || (inv.subscription && d.prepare('SELECT * FROM users WHERE stripe_subscription_id = ?').get(inv.subscription));
  if (!user) return { applied: false, reason: 'unknown_user' };
  const info = d.prepare(`INSERT OR IGNORE INTO payments (user_id, provider, amount_cents, currency, status, plan, stripe_invoice_id) VALUES (?, 'stripe', ?, ?, 'paid', 'premium', ?)`)
    .run(user.id, inv.amount_paid || 0, (inv.currency || 'eur').toUpperCase(), inv.id);
  const periodEnd = inv.lines?.data?.[0]?.period?.end ? iso(inv.lines.data[0].period.end) : undefined;
  if (periodEnd) d.prepare("UPDATE users SET payment_issue = 0, subscription_status = 'active', plan = 'premium', current_period_end = ? WHERE id = ?").run(periodEnd, user.id);
  else d.prepare("UPDATE users SET payment_issue = 0, subscription_status = 'active', plan = 'premium' WHERE id = ?").run(user.id);
  return { applied: true, duplicate: info.changes === 0, userId: user.id };
}

function notifyUser(userId, title, body) {
  getDb().prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'billing', ?, ?)").run(userId, title, body);
}

/** Traite un événement Stripe (déjà désérialisé). Idempotent et testable hors ligne. */
export function processStripeEvent(event) {
  if (!event || !event.id || !event.type) return { received: false, reason: 'malformed_event' };
  const d = getDb();
  const isLive = !!event.livemode;
  // Idempotence : un même event.id n'est traité qu'une seule fois.
  const ins = d.prepare('INSERT OR IGNORE INTO stripe_events (id, type, livemode, payload) VALUES (?, ?, ?, ?)')
    .run(event.id, event.type, isLive ? 1 : 0, JSON.stringify({ type: event.type, created: event.created }));
  if (ins.changes === 0) return { received: true, duplicate: true, type: event.type };

  // Séparation strict test / production : `STRIPE_MODE` filtre les événements.
  const mode = process.env.STRIPE_MODE;
  if ((mode === 'test' && isLive) || (mode === 'live' && !isLive)) {
    d.prepare('UPDATE stripe_events SET processed = 1 WHERE id = ?').run(event.id);
    return { received: true, skipped: 'mode_mismatch', type: event.type };
  }

  const obj = event.data?.object || {};
  const created = event.created;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const refId = obj.client_reference_id || obj.clientreferenceid || obj.metadata?.userId;
        const user = refId ? d.prepare('SELECT * FROM users WHERE id = ?').get(Number(refId)) : null;
        if (user && obj.customer) {
          const owner = findUserByCustomer(d, obj.customer);
          if (!owner || owner.id === user.id) d.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(obj.customer, user.id);
        }
        // Paiement différé (ex. virement) : aucune activation tant que ce n'est pas payé.
        if (obj.subscription && ['paid', 'no_payment_required'].includes(obj.payment_status || 'paid')) {
          d.prepare('UPDATE users SET stripe_subscription_id = COALESCE(?, stripe_subscription_id) WHERE id = ?').run(obj.subscription, user?.id ?? 0);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        applySubscription(obj, created, { source: 'webhook' });
        break;
      case 'customer.subscription.deleted': {
        const user = findUserByCustomer(d, obj.customer);
        if (user) {
          // Fin d'abonnement : on conserve l'accès jusqu'à la fin de la période payée.
          d.prepare("UPDATE users SET subscription_status = 'canceled', current_period_end = ?, stripe_subscription_id = NULL WHERE id = ?")
            .run(iso(obj.current_period_end) || new Date().toISOString(), user.id);
          notifyUser(user.id, 'Abonnement terminé', 'Ton abonnement Premium est arrivé à son terme.');
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        recordInvoicePaid(obj);
        break;
      case 'invoice.payment_failed': {
        const user = findUserByCustomer(d, obj.customer);
        if (user) {
          d.prepare("UPDATE users SET payment_issue = 1, subscription_status = 'past_due' WHERE id = ?").run(user.id);
          notifyUser(user.id, 'Paiement refusé ⚠️', `Mets à jour ton moyen de paiement. Ton accès est conservé ${POLICY.graceDays} jours.`);
        }
        break;
      }
      case 'invoice.payment_action_required': {
        const user = findUserByCustomer(d, obj.customer);
        if (user) {
          d.prepare("UPDATE users SET payment_issue = 1, subscription_status = 'past_due' WHERE id = ?").run(user.id);
          notifyUser(user.id, 'Action de paiement requise 🔐', 'Ton paiement nécessite une validation (authentification bancaire).');
        }
        break;
      }
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const user = findUserByCustomer(d, obj.customer);
        if (user && POLICY.refundRevokesImmediately) {
          d.prepare("UPDATE users SET payment_issue = 1, subscription_status = 'canceled', current_period_end = ? WHERE id = ?")
            .run(new Date().toISOString(), user.id);
          notifyUser(user.id, 'Abonnement suspendu', 'Un remboursement ou une contestation a entraîné la suspension de Premium.');
        }
        break;
      }
      default:
        break;
    }
    d.prepare('UPDATE stripe_events SET processed = 1 WHERE id = ?').run(event.id);
  } catch (err) {
    // On laisse l'événement non traité pour permettre un nouveau traitement.
    console.error(`[billing] traitement ${event.type} échoué: ${err.message}`);
    return { received: true, type: event.type, error: err.message };
  }
  return { received: true, type: event.type };
}

/**
 * Webhook : vérifie la signature sur le corps brut AVANT toute désérialisation.
 * En production, l'absence de secret est une erreur (on refuse l'événement).
 */
export async function handleWebhook(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (secret) {
    const v = verifyStripeSignature(rawBody, signature, secret);
    if (!v.ok) {
      const err = new Error(`Signature de webhook invalide (${v.reason})`);
      err.code = 'INVALID_SIGNATURE';
      throw err;
    }
  } else if (isProd) {
    const err = new Error('STRIPE_WEBHOOK_SECRET manquant en production');
    err.code = 'WEBHOOK_SECRET_MISSING';
    throw err;
  }
  let event;
  try { event = JSON.parse(rawBody.toString('utf8') || '{}'); }
  catch { return { received: false, reason: 'invalid_json' }; }
  return processStripeEvent(event);
}

/**
 * Réconciliation : si un webhook a été manqué, on relit l'état réel chez Stripe.
 * Sans clé Stripe (mode démo), c'est un no-op explicite.
 */
export async function reconcileWithStripe(user) {
  const s = await stripe();
  if (!stripeConfigured()) return { synced: false, reason: 'demo' };
  if (!s || !user.stripe_customer_id) return { synced: false, reason: 'no_customer' };
  const subs = await s.subscriptions.list({ customer: user.stripe_customer_id, status: 'all', limit: 5 });
  if (!subs.data.length) return { synced: true, subscriptions: 0 };
  const sub = subs.data.find((x) => ['active', 'trialing', 'past_due'].includes(x.status)) || subs.data[0];
  applySubscription(sub, sub.created, { source: 'reconcile' });
  return { synced: true, subscriptions: subs.data.length, status: sub.status };
}
