/**
 * Configuration centralisée + validation au démarrage.
 *
 * Toutes les intégrations externes passent par ici. Aucune valeur secrète n'est
 * jamais exportée vers le frontend : le serveur n'expose que des booléens
 * « configuré / non configuré » (voir /api/config, /api/admin/diagnostics).
 *
 * Les valeurs sont lues à l'appel (getters) pour rester justes même si
 * l'environnement est défini après l'import (tests, Render).
 */

/** Nettoie un secret : supprime espaces, tabulations et retours à la ligne parasites. */
export function sanitizeSecret(value) {
  return String(value ?? '').replace(/[\r\n\t ]/g, '').trim();
}

function str(value) {
  return String(value ?? '').trim();
}

/** URLs de « page de gestion » à ne jamais utiliser comme endpoint API. */
function looksLikeManagementUrl(url) {
  return /platform\.openai\.com|dashboard|api-keys|api[_-]?key|billing|account|settings|console\./i.test(url);
}

/**
 * Normalise la base d'une API compatible OpenAI.
 * - Rejette les pages de gestion (dashboard).
 * - Accepte `https://api.openai.com` → `https://api.openai.com/v1`.
 */
export function normalizeOpenAiBase(raw) {
  const value = str(raw);
  if (!value) return '';
  if (looksLikeManagementUrl(value)) return '';
  if (/^https?:\/\/(api\.)?openai\.com\/?$/i.test(value)) return 'https://api.openai.com/v1';
  return value.replace(/\/+$/, '');
}

/**
 * Origine publique de l'application, unique source de vérité pour les URL
 * (vérification d'e-mail, OAuth, redirections, liens générés).
 */
export function getAppOrigin(req) {
  const configured = str(process.env.APP_ORIGIN).replace(/\/+$/, '');
  if (configured) return configured;
  if (req && typeof req.get === 'function') {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host) return `${proto}://${host}`;
  }
  return `http://localhost:${str(process.env.PORT) || 3000}`;
}

export const config = {
  app: {
    get env() { return str(process.env.NODE_ENV) || 'development'; },
    get isProd() { return this.env === 'production'; },
    get port() { return Number(str(process.env.PORT) || 3000); },
    get dbPath() { return str(process.env.DB_PATH) || './data/reviqo.db'; },
    get originRaw() { return str(process.env.APP_ORIGIN); },
    get origin() { return getAppOrigin(); },
  },
  auth: {
    get jwtSecret() { return str(process.env.JWT_SECRET); },
    get requireVerification() {
      const v = str(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
      return config.app.isProd && config.email.configured;
    },
  },
  ai: {
    // `OPENAI_API_KEY` est accepté en alias de `LLM_API_KEY`.
    get key() { return sanitizeSecret(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY); },
    get baseUrl() { return normalizeOpenAiBase(process.env.OPENAI_BASE_URL || process.env.LLM_API_URL) || 'https://api.openai.com/v1'; },
    get rawBaseUrl() { return str(process.env.OPENAI_BASE_URL || process.env.LLM_API_URL); },
    get baseRejected() { return !!config.ai.rawBaseUrl && !normalizeOpenAiBase(config.ai.rawBaseUrl); },
    get model() { return str(process.env.LLM_MODEL) || 'gpt-4o-mini'; },
    get provider() { return str(process.env.LLM_PROVIDER) || 'openai'; },
    get configured() { return !!config.ai.key; },
  },
  email: {
    get provider() {
      if (sanitizeSecret(process.env.RESEND_API_KEY)) return 'resend';
      if (sanitizeSecret(process.env.SENDGRID_API_KEY)) return 'sendgrid';
      if (sanitizeSecret(process.env.SMTP_URL)) return 'smtp';
      return null;
    },
    get configured() { return !!config.email.provider; },
    get resendKey() { return sanitizeSecret(process.env.RESEND_API_KEY); },
    get sendgridKey() { return sanitizeSecret(process.env.SENDGRID_API_KEY); },
    get smtpUrl() { return sanitizeSecret(process.env.SMTP_URL); },
    get fromEmail() { return str(process.env.MAIL_FROM_EMAIL) || 'no-reply@reviqo.app'; },
    get fromName() { return str(process.env.MAIL_FROM_NAME) || 'REVIQO'; },
    get from() { return `${config.email.fromName} <${config.email.fromEmail}>`; },
  },
  google: {
    get clientId() { return str(process.env.GOOGLE_CLIENT_ID) || config.google.fromJson().id; },
    get clientSecret() { return str(process.env.GOOGLE_CLIENT_SECRET) || config.google.fromJson().secret; },
    fromJson() {
      const raw = str(process.env.GOOGLE_OAUTH_CLIENT_JSON);
      if (!raw) return { id: '', secret: '' };
      try {
        const parsed = JSON.parse(raw);
        const cfg = parsed.web || parsed.installed || parsed;
        return { id: str(cfg.client_id), secret: str(cfg.client_secret) };
      } catch {
        const parts = raw.split(/[\s|,]+/).map((s) => s.trim()).filter(Boolean);
        return { id: parts[0] || '', secret: parts[1] || '' };
      }
    },
    get configured() { return !!(config.google.clientId && config.google.clientSecret); },
    redirectUri(origin) { return `${origin || config.app.origin}/api/auth/google/callback`; },
  },
  video: {
    get youtubeKey() { return sanitizeSecret(process.env.YOUTUBE_API_KEY); },
    get aiKey() { return sanitizeSecret(process.env.VIDEO_AI_API_KEY); },
    get aiBaseUrl() { return normalizeOpenAiBase(process.env.VIDEO_AI_API_URL); },
    get aiModel() { return str(process.env.VIDEO_AI_MODEL) || 'sora'; },
    get configured() { return !!(config.video.aiKey && config.video.aiBaseUrl); },
  },
  stripe: {
    get secretKey() { return str(process.env.STRIPE_SECRET_KEY); },
    get webhookSecret() { return str(process.env.STRIPE_WEBHOOK_SECRET); },
    get configured() { return !!config.stripe.secretKey; },
    get mode() { return str(process.env.STRIPE_MODE) || 'both'; },
  },
  ads: {
    get enabled() { return str(process.env.ADS_ENABLED).toLowerCase() !== 'false'; },
  },
};

/**
 * Valide la configuration au démarrage.
 * `errors` = bloquant en production ; `warnings` = information.
 * Ne journalise jamais de valeur secrète.
 */
export function validateConfig() {
  const errors = [];
  const warnings = [];
  if (!config.auth.jwtSecret) errors.push('JWT_SECRET manquant : les sessions ne peuvent pas être signées.');
  if (config.app.isProd && !config.app.originRaw) warnings.push('APP_ORIGIN non défini : les liens e-mail/OAuth utiliseront l’en-tête Host.');
  if (config.ai.baseRejected) warnings.push('LLM_API_URL ressemble à une page de gestion et est ignorée ; base par défaut api.openai.com/v1 utilisée.');
  if (config.ai.key && !config.ai.baseRejected && !/^https?:\/\//.test(config.ai.baseUrl)) warnings.push('LLM_API_URL invalide : URL attendue.');
  if (config.stripe.configured && !config.stripe.webhookSecret && config.app.isProd) {
    warnings.push('STRIPE_WEBHOOK_SECRET absent : les webhooks seront refusés en production.');
  }
  if (config.email.configured && !process.env.MAIL_FROM_EMAIL) warnings.push('MAIL_FROM_EMAIL non défini : valeur par défaut utilisée.');
  return { ok: errors.length === 0, errors, warnings };
}

/** Résumé sûr (sans secret) pour les diagnostics. */
export function safeSummary() {
  return {
    env: config.app.env,
    originConfigured: !!config.app.originRaw,
    auth: { jwtSecret: !!config.auth.jwtSecret, requireVerification: config.auth.requireVerification },
    ai: { configured: config.ai.configured, base: config.ai.configured ? config.ai.baseUrl : null, baseRejected: config.ai.baseRejected, model: config.ai.model },
    email: { provider: config.email.provider, from: config.email.from },
    google: { configured: config.google.configured },
    video: { youtubeConfigured: !!config.video.youtubeKey, generationConfigured: config.video.configured },
    stripe: { configured: config.stripe.configured, webhookSecret: !!config.stripe.webhookSecret, mode: config.stripe.mode },
    ads: { enabled: config.ads.enabled },
  };
}
