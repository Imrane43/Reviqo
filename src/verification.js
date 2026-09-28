/**
 * Email verification codes.
 *
 * Security properties (per spec):
 *  - 6-digit code generated with a CSPRNG, leading zeros preserved.
 *  - Never stored in clear: only an HMAC-SHA256 of the code is persisted.
 *  - Configurable expiry (default 10 min).
 *  - Single-use: consumed atomically so two concurrent validations cannot both win.
 *  - Max attempts per code (default 5).
 *  - Minimum delay between resends (default 60 s); sending a new code invalidates the old one.
 *  - Verification codes are never logged.
 */
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { sendMail, emailConfigured } from './mailer.js';

const CODE_TTL_MINUTES = Number(process.env.VERIFY_CODE_TTL_MINUTES || 10);
const MAX_ATTEMPTS = Number(process.env.VERIFY_MAX_ATTEMPTS || 5);
const RESEND_SECONDS = Number(process.env.VERIFY_RESEND_SECONDS || 60);
const SECRET = process.env.VERIFY_SECRET || process.env.JWT_SECRET || 'dev-verify-secret';

export function hmacCode(code) {
  return crypto.createHmac('sha256', SECRET).update(String(code)).digest('hex');
}

export function generateCode() {
  // randomInt(0, 1000000) then padStart preserves leading zeros (e.g. "000042").
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Whether unverified accounts are restricted.
 * - Explicit REQUIRE_EMAIL_VERIFICATION=true always enforces.
 * - Explicit false disables enforcement (useful before a mail provider is wired).
 * - Otherwise enforce only in production AND when a mail provider exists,
 *   so a misconfigured deployment never locks everyone out.
 */
export function verificationRequired() {
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true') return true;
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'false') return false;
  return process.env.NODE_ENV === 'production' && emailConfigured();
}

export function codeTtlMinutes() { return CODE_TTL_MINUTES; }
export function resendSeconds() { return RESEND_SECONDS; }

/**
 * Create a fresh code, store its HMAC and invalidate any previous one.
 * Enforces the resend delay unless `force` is set.
 */
export function issueVerificationCode(user, { force = false } = {}) {
  const d = getDb();
  const now = Date.now();
  if (!force && user.verify_last_sent) {
    const elapsed = (now - new Date(user.verify_last_sent).getTime()) / 1000;
    if (elapsed < RESEND_SECONDS) {
      return { error: 'RESEND_TOO_SOON', retryAfter: Math.ceil(RESEND_SECONDS - elapsed) };
    }
  }
  const code = generateCode();
  const expires = new Date(now + CODE_TTL_MINUTES * 60000).toISOString();
  d.prepare('UPDATE users SET verify_hash = ?, verify_expires = ?, verify_attempts = 0, verify_last_sent = ? WHERE id = ?')
    .run(hmacCode(code), expires, new Date(now).toISOString(), user.id);
  return { code, expiresAt: expires, ttlMinutes: CODE_TTL_MINUTES };
}

export async function sendVerificationCode(user, code, link = null) {
  const linkBlock = link
    ? { text: `\n\nOu clique sur ce lien de vérification :\n${link}\n`, html: `<p><a href="${link}">Vérifier mon adresse e-mail</a></p>` }
    : { text: '', html: '' };
  return sendMail({
    to: user.email,
    subject: 'Ton code de vérification REVIQO',
    text: `Ton code de vérification est : ${code}\n\nIl expire dans ${CODE_TTL_MINUTES} minutes et ne fonctionne qu'une seule fois.${linkBlock.text}Ne le partage avec personne.\n\n— REVIQO`,
    html: `<div style="font-family:system-ui,sans-serif">
      <p>Ton code de vérification :</p>
      <p style="font-size:26px;font-weight:700;letter-spacing:6px">${code}</p>
      ${linkBlock.html}
      <p style="color:#666">Il expire dans ${CODE_TTL_MINUTES} minutes et ne fonctionne qu'une seule fois. Ne le partage avec personne.</p>
    </div>`,
  });
}

/* ---------------- vérification par lien (token) ---------------- */

const LINK_TTL_MINUTES = Number(process.env.VERIFY_LINK_TTL_MINUTES || 30);

function hashToken(token) {
  return crypto.createHmac('sha256', SECRET).update(String(token)).digest('hex');
}

/** Génère un token de vérification aléatoire (usage unique), stocké haché. */
export function issueVerificationToken(user, { ttlMinutes = LINK_TTL_MINUTES } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ttlMinutes * 60000).toISOString();
  getDb().prepare('UPDATE users SET verify_token_hash = ?, verify_token_expires = ? WHERE id = ?')
    .run(hashToken(token), expires, user.id);
  return { token, expiresAt: expires, ttlMinutes };
}

/** Valide un token de vérification (expiration + usage unique + comparaison sûre). */
export function verifyEmailToken(email, token) {
  const d = getDb();
  const user = d.prepare('SELECT * FROM users WHERE email_canon = ?').get(String(email || '').trim().toLowerCase());
  if (!user) return { error: 'INVALID_TOKEN' };
  // Compte déjà vérifié : un rejeu est traité comme « déjà vérifié », pas comme un token invalide.
  if (user.email_verified) return { ok: true, alreadyVerified: true, user };
  if (!user.verify_token_hash || !token) return { error: 'INVALID_TOKEN' };
  if (!user.verify_token_expires || new Date(user.verify_token_expires).getTime() < Date.now()) return { error: 'EXPIRED' };
  const provided = Buffer.from(hashToken(token));
  const stored = Buffer.from(user.verify_token_hash);
  if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) return { error: 'INVALID_TOKEN' };
  const info = d.prepare(`UPDATE users SET email_verified = 1, verify_token_hash = NULL, verify_token_expires = NULL,
    verify_hash = NULL, verify_expires = NULL WHERE id = ? AND email_verified = 0`).run(user.id);
  if (info.changes !== 1) return { ok: true, alreadyVerified: true, user };
  return { ok: true, user: d.prepare('SELECT * FROM users WHERE id = ?').get(user.id) };
}

export function verificationLink(origin, email, token) {
  return `${String(origin || '').replace(/\/+$/, '')}/api/auth/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

/** Validate a code and consume it atomically. */
export function verifyCode(userId, code) {
  const d = getDb();
  const user = d.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { error: 'NOT_FOUND' };
  if (user.email_verified) return { error: 'ALREADY_VERIFIED' };
  if (!user.verify_hash || !user.verify_expires) return { error: 'NO_CODE' };
  if (new Date(user.verify_expires).getTime() < Date.now()) {
    d.prepare('UPDATE users SET verify_hash = NULL, verify_expires = NULL WHERE id = ?').run(userId);
    return { error: 'EXPIRED' };
  }
  if ((user.verify_attempts || 0) >= MAX_ATTEMPTS) return { error: 'TOO_MANY_ATTEMPTS' };

  if (!safeEqual(hmacCode(code), user.verify_hash)) {
    d.prepare('UPDATE users SET verify_attempts = verify_attempts + 1 WHERE id = ?').run(userId);
    return { error: 'INVALID_CODE', attemptsLeft: Math.max(0, MAX_ATTEMPTS - (user.verify_attempts + 1)) };
  }

  // Atomic single-use consumption: the row only flips if the hash still matches.
  const info = d.prepare(`UPDATE users SET email_verified = 1, verify_hash = NULL, verify_expires = NULL, verify_attempts = 0
    WHERE id = ? AND verify_hash = ? AND email_verified = 0`).run(userId, user.verify_hash);
  if (info.changes !== 1) return { error: 'ALREADY_VERIFIED' };
  return { ok: true, user: d.prepare('SELECT * FROM users WHERE id = ?').get(userId) };
}

export { CODE_TTL_MINUTES, MAX_ATTEMPTS, RESEND_SECONDS };
