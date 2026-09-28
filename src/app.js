import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb, addXp, levelForXp, findCurriculum, getCurriculumById } from './db.js';
import {
  hashPassword, checkPassword, setAuthCookie, clearAuthCookie, publicUser,
  getUserFromReq, requireAuth, requireAdmin, isPremium, touchStreak,
  createGuest, GOOGLE, findOrCreateGoogleUser, createResetToken, resetPassword,
  normalizeEmail, validateUsername, isUsernameTaken, isEmailTaken, revokeSessions,
} from './auth.js';
import {
  issueVerificationCode, sendVerificationCode, verifyCode, verificationRequired,
  codeTtlMinutes, resendSeconds,
} from './verification.js';
import { sendMail, emailProvider, emailConfigured } from './mailer.js';
import { generateWithLLM, gradeAnswers, checkAchievements, progressDailyChallenge, getDailyBoard } from './content.js';
import { generateVideoScript, askCoach } from './coach.js';
import { findVideosForRequest, youtubeConfigured } from './video.js';
import {
  dueReviews, reviewStats, scheduleReview, errorNotebook, resolveError, recordErrors,
  generatePlan, getPlan, globalSearch, dashboard,
} from './learning.js';
import { notifyUser } from './notify.js';
import {
  createTeam, teamDetail, listInvites, createInvite, revokeInvite, joinByCode,
  removeMember, setRole, leaveTeam, updateTeam, deleteTeam, goalHistory, activityFeed,
  teamsLeaderboard, proposeChallenge, respondChallenge, finalizeChallenge, listChallenges,
  membership, isTeamAdmin,
} from './teams.js';
import {
  PLANS, YEARLY, TRIAL_DAYS, billingStatus, createCheckout, createPortal,
  cancelSubscription, resumeSubscription, downgrade, handleWebhook, stripeConfigured, getPrices,
  paymentLinkFor, reconcileWithStripe, PAYMENT_LINKS, POLICY,
} from './billing.js';
import {
  COUNTRIES, SYSTEMS, countryByLabel, programsCatalog, examTabsFor,
  PROGRAM_NOTICE, PROGRAM_GENERIC_NOTE, genericLevelToSystem,
} from './programs.js';
import { CONTENT_STATUSES } from './content-library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FREE_AI_PER_DAY = 3;

const rateBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === '1') return next();
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > max) return res.status(429).json({ error: 'RATE_LIMITED', message: 'Trop de tentatives. Réessaie dans une minute.' });
    next();
  };
}

function origin(req) {
  return process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
}

/** Journalise une action sensible (ne casse jamais l'action en cas d'échec). */
function auditLog(actorId, action, targetType, targetId, meta) {
  try {
    getDb().prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, meta) VALUES (?, ?, ?, ?, ?)')
      .run(actorId || null, action, targetType || null, targetId != null ? String(targetId) : null, meta ? JSON.stringify(meta) : null);
  } catch { /* l'audit ne doit pas casser l'action */ }
}

/* ---------- temps réel : clients SSE du classement ---------- */
const leaderboardClients = new Set();
function broadcastLeaderboard() {
  if (!leaderboardClients.size) return;
  const payload = `event: leaderboard\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const client of leaderboardClients) {
    try { client.write(payload); } catch { leaderboardClients.delete(client); }
  }
}

const emailBuckets = new Map();
function rateLimitEmail(max, windowMs) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === '1') return next();
    const email = normalizeEmail(req.body?.email);
    if (!email) return next();
    const key = `${req.path}:${email}`;
    const now = Date.now();
    const bucket = emailBuckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
    bucket.count += 1;
    emailBuckets.set(key, bucket);
    if (bucket.count > max) return res.status(429).json({ error: 'RATE_LIMITED', message: 'Trop de tentatives pour cette adresse. Réessaie plus tard.' });
    next();
  };
}

/**
 * Blocks unverified accounts from reserved features — but only when email
 * verification is actually enforced (see verificationRequired()).
 */
function requireVerified(req, res, next) {
  if (!verificationRequired()) return next();
  if (!req.user.email_verified) {
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', message: 'Vérifie ton adresse e-mail pour continuer.' });
  }
  next();
}

/* ---------- étape 4 : profil scolaire & programmes ---------- */

/** Champs de profil manquants pour identifier un programme sans ambiguïté. */
function curriculumNeeds({ country, countryLabel, systemLevel, schoolLevel, grade, track, domain, domainDetail }) {
  const countryInfo = countryByLabel(countryLabel || country);
  if (!countryInfo) return ['country'];
  const def = SYSTEMS[countryInfo.system];
  if (!def) return ['country'];
  const level = systemLevel || genericLevelToSystem(schoolLevel, countryInfo.system);
  const levelDef = def.levels.find((l) => l.level === level);
  if (!levelDef) return ['level'];
  if (levelDef.domains) {
    if (!domain) return ['domain'];
    if (domain === 'autre' && !domainDetail) return ['domainDetail'];
    return [];
  }
  if (!grade) return ['grade'];
  const gradeDef = (levelDef.grades || []).find((g) => g.grade === grade);
  if (!gradeDef) return ['grade'];
  if (gradeDef.tracks && gradeDef.tracks.length && !gradeDef.tracks.some((t) => t.track === track)) return ['track'];
  return [];
}

function serializeCurriculum(row) {
  if (!row) return null;
  const parse = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v ? JSON.parse(v) : []));
  return {
    id: row.id,
    countryCode: row.country_code,
    countryLabel: row.country_label,
    system: row.system,
    level: row.level,
    grade: row.grade,
    track: row.track,
    domain: row.domain,
    label: row.label,
    subjects: parse(row.subjects),
    examCode: row.exam_code,
    examLabel: row.exam_label,
    examSubjects: parse(row.exam_subjects),
    examOptions: parse(row.exam_options),
    series: parse(row.series),
    contentStatus: row.content_status,
    needsDetail: !!row.needs_detail,
    schoolYear: row.school_year,
    session: row.session,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
  };
}

/** Programme effectif d'un utilisateur (par son id de curriculum, sinon résolu depuis son profil). */
function curriculumForUser(user) {
  if (!user) return null;
  if (user.curriculum_id) {
    const byId = getCurriculumById(user.curriculum_id);
    if (byId) return byId;
  }
  const country = countryByLabel(user.country);
  if (!country) return null;
  const level = user.system_level || genericLevelToSystem(user.school_level, country.system);
  if (!level) return null;
  return findCurriculum({ countryCode: country.code, level, grade: user.grade || '', track: user.track || '', domain: user.domain || '' });
}

function programNoticeFor(cur) {
  if (!cur) return PROGRAM_NOTICE;
  if (cur.content_status === 'unavailable') return PROGRAM_NOTICE;
  return null;
}

function parseJsonArr(v) {
  return Array.isArray(v) ? v : (typeof v === 'string' && v ? JSON.parse(v) : []);
}

/** Métadonnées de bibliothèque communes aux quiz et flashcards. */
function resourceMetadata(row) {
  const curId = row.curriculum_id ?? row.curriculumId ?? null;
  return {
    chapter: row.chapter || null,
    objectives: parseJsonArr(row.objectives),
    prerequisites: parseJsonArr(row.prerequisites),
    language: row.language || 'fr',
    version: row.version || 1,
    sources: parseJsonArr(row.sources),
    status: row.status || 'published',
    contentType: row.content_type || row.contentType || 'original',
    countryCode: row.country_code || row.countryCode || null,
    level: row.level || null,
    grade: row.grade || null,
    curriculumId: curId,
    target: curId ? 'class' : 'subject',
  };
}

/**
 * Contrôles de cohérence avant publication (contenus IA ou manuels).
 * Renvoie la liste des raisons empêchant la publication.
 */
function validateResource(type, data) {
  const errors = [];
  const objectives = parseJsonArr(data.objectives);
  if (!objectives.length) errors.push('Au moins un objectif d’apprentissage est requis.');
  const sources = parseJsonArr(data.sources);
  const chapter = String(data.chapter || '');
  if (/brevet|bac|examen/i.test(chapter) && !sources.length) errors.push('Un chapitre d’examen doit citer au moins une source officielle.');
  if (data.status && !CONTENT_STATUSES.includes(data.status)) errors.push('Statut inconnu.');
  if (type === 'quiz') {
    const questions = parseJsonArr(data.questions);
    if (!questions.length) errors.push('Au moins une question est requise.');
    questions.forEach((q, i) => {
      if (!q.text) errors.push(`Question ${i + 1} : énoncé manquant.`);
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Question ${i + 1} : au moins deux options.`);
      if (typeof q.answer !== 'number') errors.push(`Question ${i + 1} : réponse correcte manquante.`);
      if (!q.explanation) errors.push(`Question ${i + 1} : correction pédagogique manquante.`);
    });
  }
  if (type === 'flashcard') {
    if (data.front !== undefined && !String(data.front || '').trim()) errors.push('Recto vide.');
    if (data.back !== undefined && !String(data.back || '').trim()) errors.push('Verso vide.');
  }
  return errors;
}

/** Recalcule `system` + `curriculum_id` d'un utilisateur après une mise à jour de profil. */
function recomputeCurriculum(d, userId) {
  const u = d.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const country = countryByLabel(u.country);
  let curriculumId = null;
  let system = u.system || null;
  if (country) {
    system = country.system;
    const level = u.system_level || genericLevelToSystem(u.school_level, country.system);
    if (level) {
      const row = findCurriculum({ countryCode: country.code, level, grade: u.grade || '', track: u.track || '', domain: u.domain || '' });
      curriculumId = row?.id || null;
    }
  }
  d.prepare('UPDATE users SET system = ?, curriculum_id = ? WHERE id = ?').run(system, curriculumId, userId);
  return curriculumId;
}

/** Issue a fresh code and try to deliver it. Never leaks the code in production. */
async function issueAndSend(user) {
  const issued = issueVerificationCode(user, { force: true });
  if (issued.error) return { emailSent: false, resendAfter: issued.retryAfter || 0, codeTtlMinutes: codeTtlMinutes() };
  const mail = await sendVerificationCode(user, issued.code);
  const payload = { emailSent: !!mail.delivered, emailProvider: mail.provider || null, codeTtlMinutes: codeTtlMinutes(), resendAfter: resendSeconds() };
  if (!mail.delivered) {
    payload.emailError = mail.reason || 'send_failed';
    if (process.env.NODE_ENV !== 'production') {
      payload.devVerificationCode = issued.code;
      payload.devNote = 'Mode démo : code affiché directement (aucun e-mail envoyé).'; 
    }
  }
  return payload;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(cookieParser());

  // Stripe webhooks need the raw body for signature verification.
  app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    try {
      const result = await handleWebhook(req.body, req.headers['stripe-signature']);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: 'WEBHOOK_ERROR', message: err.message });
    }
  });

  app.use(express.json({ limit: '6mb' }));

  // ---------- health / config ----------
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'reviqo', version: '1.0.0' }));
  app.get('/api/config', async (req, res) => {
    let prices = { monthly: { amount: 499, currency: 'EUR' }, yearly: { amount: 3999, currency: 'EUR' } };
    try { prices = await getPrices(); } catch { /* keep fallback */ }
    res.json({
      googleEnabled: GOOGLE.configured,
      stripeEnabled: stripeConfigured(),
      trialDays: TRIAL_DAYS,
      freeAiPerDay: FREE_AI_PER_DAY,
      plans: PLANS,
      yearly: YEARLY,
      prices,
    });
  });

  app.get('/api/billing/prices', async (req, res) => {
    try { res.json(await getPrices()); }
    catch { res.json({ monthly: { amount: 499, currency: 'EUR' }, yearly: { amount: 3999, currency: 'EUR' } }); }
  });
  app.get('/api/ads/config', (req, res) => {
    const d = getDb();
    const user = getUserFromReq(req);
    const premium = isPremium(user);
    const globalRow = d.prepare("SELECT value FROM settings WHERE key = 'ads_enabled'").get();
    const globallyEnabled = globalRow ? globalRow.value !== '0' : process.env.ADS_ENABLED !== 'false';
    const slots = d.prepare('SELECT slot, provider, enabled, width, height, label, consent_required FROM ad_settings WHERE enabled = 1').all();
    res.json({
      show: globallyEnabled && !premium,
      globallyEnabled,
      premium,
      neverShowForPremium: true,
      consentRequired: slots.some((s) => s.consent_required),
      slotCount: slots.length,
      slots,
      policy: 'Aucune conversation du Coach IA ni résultat scolaire n’est transmise aux annonceurs.',
    });
  });

  app.post('/api/admin/ads/global', requireAdmin, (req, res) => {
    const enabled = req.body.enabled !== false;
    getDb().prepare("INSERT INTO settings (key, value) VALUES ('ads_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(enabled ? '1' : '0');
    res.json({ ok: true, enabled });
  });

  // ---------- auth ----------
  app.get('/api/auth/session', (req, res) => {
    const user = getUserFromReq(req);
    res.json({ user: user ? publicUser(user) : null, verifyRequired: verificationRequired() });
  });

  app.post('/api/auth/signup', rateLimit(20, 60000), async (req, res) => {
    const d = getDb();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'Entre une adresse e-mail valide.' });
    if (password.length < 6) return res.status(400).json({ error: 'BAD_PASSWORD', message: 'Le mot de passe doit contenir au moins 6 caractères.' });

    // Pseudo: same namespace for guests and classic accounts.
    const rawName = req.body.username ?? req.body.firstName;
    let identity = null;
    if (rawName) {
      const v = validateUsername(rawName);
      if (v.error) return res.status(400).json({ error: v.error, message: v.message });
      identity = v;
    }
    if (isEmailTaken(email)) return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cet e-mail.' });
    if (identity && isUsernameTaken(identity.key)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'ce pseudo est déjà pris' });

    const firstName = identity ? identity.username : (String(req.body.firstName || '').trim() || 'Étudiant');
    let info;
    try {
      info = d.prepare(`INSERT INTO users (email, email_canon, password_hash, first_name, username, username_norm, role, plan, email_verified, onboarding_done, ad_consent)
        VALUES (?, ?, ?, ?, ?, ?, 'user', 'free', 0, 0, 1)`)
        .run(email, email, hashPassword(password), firstName, identity?.username || null, identity?.key || null);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'ALREADY_EXISTS', message: 'Un compte existe déjà avec ces informations.' });
      throw e;
    }
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const mail = await issueAndSend(user);
    setAuthCookie(res, user);
    res.status(201).json({ user: publicUser(user), verifyRequired: verificationRequired(), ...mail });
  });

  // ---------- email verification ----------
  app.get('/api/auth/username-available', (req, res) => {
    const v = validateUsername(String(req.query.u || ''));
    if (v.error) return res.json({ available: false, reason: v.error, message: v.message });
    const taken = isUsernameTaken(v.key);
    res.json({ available: !taken, username: v.username, message: taken ? 'ce pseudo est déjà pris' : 'Pseudo disponible.' });
  });

  app.post('/api/auth/verify', rateLimit(30, 60000), rateLimitEmail(10, 60000), (req, res) => {
    const d = getDb();
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const user = d.prepare('SELECT * FROM users WHERE email_canon = ?').get(email);
    if (!user) return res.status(400).json({ error: 'INVALID_CODE', message: 'Code incorrect ou expiré.' });
    const result = verifyCode(user.id, code);
    if (result.error === 'EXPIRED') return res.status(400).json({ error: 'CODE_EXPIRED', message: 'Ce code a expiré. Demande-en un nouveau.' });
    if (result.error === 'TOO_MANY_ATTEMPTS') return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Demande un nouveau code.' });
    if (result.error === 'INVALID_CODE') {
      const suffix = result.attemptsLeft !== undefined ? ` Il te reste ${result.attemptsLeft} essai(s).` : '';
      return res.status(400).json({ error: 'INVALID_CODE', message: `Code incorrect.${suffix}` });
    }
    if (result.error === 'ALREADY_VERIFIED') { setAuthCookie(res, user); return res.json({ user: publicUser(user), alreadyVerified: true }); }
    setAuthCookie(res, result.user);
    res.json({ user: publicUser(result.user) });
  });

  app.post('/api/auth/verify/resend', rateLimit(10, 60000), rateLimitEmail(5, 60000), async (req, res) => {
    const d = getDb();
    const email = normalizeEmail(req.body.email);
    const user = d.prepare('SELECT * FROM users WHERE email_canon = ?').get(email);
    const payload = { ok: true, message: 'Si un compte non vérifié existe, un nouveau code a été envoyé.' };
    if (!user || user.email_verified) return res.json(payload);
    const issued = issueVerificationCode(user, { force: false });
    if (issued.error === 'RESEND_TOO_SOON') {
      return res.status(429).json({ error: 'RESEND_TOO_SOON', message: 'Patiente avant de demander un nouveau code.', retryAfter: issued.retryAfter });
    }
    const mail = await sendVerificationCode(user, issued.code);
    payload.emailSent = !!mail.delivered;
    if (!mail.delivered && process.env.NODE_ENV !== 'production') payload.devVerificationCode = issued.code;
    res.json(payload);
  });

  app.post('/api/auth/login', rateLimit(20, 60000), (req, res) => {
    const d = getDb();
    const email = String(req.body.email || '').toLowerCase().trim();
    const user = d.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'E-mail ou mot de passe incorrect.' });
    }
    if (user.is_banned) return res.status(403).json({ error: 'BANNED', message: 'Ce compte a été suspendu.' });
    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/guest', rateLimit(20, 60000), (req, res) => {
    // Every guest gets a UNIQUE throwaway identity so guests never share an account.
    const user = createGuest();
    setAuthCookie(res, user);
    res.status(201).json({ user: publicUser(user), notice: 'Compte invité unique créé. Crée un compte pour sauvegarder ta progression.' });
  });

  // Guest -> registered conversion: same internal id, so progression/friends/xp are kept.
  app.post('/api/auth/convert', requireAuth, rateLimit(10, 60000), async (req, res) => {
    const d = getDb();
    if (!req.user.is_guest) return res.status(409).json({ error: 'NOT_GUEST', message: 'Ce compte est déjà un compte inscrit.' });
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'Entre une adresse e-mail valide.' });
    if (password.length < 6) return res.status(400).json({ error: 'BAD_PASSWORD', message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    let identity = null;
    if (req.body.username) {
      const v = validateUsername(req.body.username);
      if (v.error) return res.status(400).json({ error: v.error, message: v.message });
      identity = v;
    }
    if (isEmailTaken(email, req.user.id)) return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cet e-mail.' });
    if (identity && isUsernameTaken(identity.key, req.user.id)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'ce pseudo est déjà pris' });
    try {
      d.prepare(`UPDATE users SET email = ?, email_canon = ?, password_hash = ?, is_guest = 0, email_verified = 0,
        username = COALESCE(?, username), username_norm = COALESCE(?, username_norm), first_name = COALESCE(?, first_name) WHERE id = ?`)
        .run(email, email, hashPassword(password), identity?.username || null, identity?.key || null, identity?.username || null, req.user.id);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'ALREADY_EXISTS', message: 'Un compte existe déjà avec ces informations.' });
      throw e;
    }
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const mail = await issueAndSend(user);
    setAuthCookie(res, user);
    res.json({ user: publicUser(user), verifyRequired: verificationRequired(), ...mail });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.post('/api/auth/onboarding', requireAuth, (req, res) => {
    const d = getDb();
    const { firstName, schoolLevel, country, subjects, goal, username } = req.body;
    let uname = null, ukey = null;
    if (username) {
      const v = validateUsername(username);
      if (v.error) return res.status(400).json({ error: v.error, message: v.message });
      if (isUsernameTaken(v.key, req.user.id)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'ce pseudo est déjà pris' });
      uname = v.username; ukey = v.key;
    }
    const countryInfo = countryByLabel(country);
    const systemLevel = req.body.systemLevel || (countryInfo ? genericLevelToSystem(schoolLevel, countryInfo.system) : null);
    d.prepare(`UPDATE users SET first_name = COALESCE(?, first_name), username = COALESCE(?, username), username_norm = COALESCE(?, username_norm),
      school_level = ?, country = ?, subjects = ?, goal = ?, system = ?, system_level = ?, grade = ?, track = ?, domain = ?, domain_detail = ?,
      learning_language = ?, exam_session = ?, school_year = ?, exam_date = ?, onboarding_done = 1 WHERE id = ?`)
      .run(firstName || null, uname, ukey, schoolLevel || null, country || null, JSON.stringify(subjects || []), goal || null,
        countryInfo?.system || null, systemLevel, req.body.grade || null, req.body.track || null, req.body.domain || null, req.body.domainDetail || null,
        req.body.learningLanguage || null, req.body.examSession || null, req.body.schoolYear || null, req.body.examDate || null, req.user.id);
    recomputeCurriculum(d, req.user.id);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({
      user: publicUser(user),
      needs: curriculumNeeds({ countryLabel: user.country, systemLevel: user.system_level, schoolLevel: user.school_level, grade: user.grade, track: user.track, domain: user.domain, domainDetail: user.domain_detail }),
    });
  });

  app.post('/api/auth/forgot', rateLimit(10, 60000), rateLimitEmail(5, 60000), async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const result = createResetToken(email);
    // Never reveal whether the account exists.
    const payload = { ok: true, message: 'Si un compte existe pour cet e-mail, un lien de réinitialisation a été envoyé.' };
    if (result) {
      const link = `${origin(req)}/auth.html#reset?token=${result.token}`;
      const mail = await sendMail({
        to: result.user.email,
        subject: 'Réinitialise ton mot de passe REVIQO',
        text: `Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure) :\n${link}\n\nSi tu n'es pas à l'origine de cette demande, ignore cet e-mail.`,
        html: `<p>Pour choisir un nouveau mot de passe, clique sur ce lien (valable 1 heure) :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>`,
      });
      payload.emailSent = !!mail.delivered;
      if (!mail.delivered && process.env.NODE_ENV !== 'production') {
        payload.devResetUrl = `/auth.html#reset?token=${result.token}`;
        payload.devNote = 'Mode démo : lien de réinitialisation affiché directement (aucun e-mail envoyé).';
      }
    }
    res.json(payload);
  });

  app.post('/api/auth/reset', rateLimit(10, 60000), (req, res) => {
    const { token, password } = req.body;
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'BAD_PASSWORD', message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    const result = resetPassword(String(token || ''), String(password));
    if (result.error === 'INVALID_TOKEN') return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Ce lien de réinitialisation est invalide.' });
    if (result.error === 'EXPIRED') return res.status(400).json({ error: 'EXPIRED', message: 'Ce lien a expiré. Demande-en un nouveau.' });
    setAuthCookie(res, result.user);
    res.json({ user: publicUser(result.user) });
  });

  app.get('/api/auth/google', (req, res) => {
    if (!GOOGLE.configured) return res.redirect('/auth.html?error=google_not_configured');
    res.redirect(GOOGLE.authUrl(`${origin(req)}/api/auth/google/callback`));
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      if (!GOOGLE.configured) return res.redirect('/auth.html?error=google_not_configured');
      if (req.query.error) return res.redirect('/auth.html?error=google_denied');
      const tokens = await GOOGLE.exchange(req.query.code, `${origin(req)}/api/auth/google/callback`);
      const profile = await GOOGLE.profile(tokens.access_token);
      const user = findOrCreateGoogleUser(profile);
      setAuthCookie(res, user);
      res.redirect(user.onboarding_done ? '/app.html' : '/auth.html#onboarding');
    } catch {
      res.redirect('/auth.html?error=google_failed');
    }
  });

  // ---------- me ----------
  app.get('/api/me', requireAuth, (req, res) => {
    const d = getDb();
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  });

  app.patch('/api/me', requireAuth, (req, res) => {
    const d = getDb();
    const { firstName, schoolLevel, country, subjects, goal, avatar, notifyPrefs, adConsent, password } = req.body;
    if (password) {
      d.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), req.user.id);
      revokeSessions(req.user.id); // changing the password kills existing sessions
    }
    if (req.body.username !== undefined) {
      const v = validateUsername(req.body.username);
      if (v.error) return res.status(400).json({ error: v.error, message: v.message });
      if (isUsernameTaken(v.key, req.user.id)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'ce pseudo est déjà pris' });
      d.prepare('UPDATE users SET username = ?, username_norm = ?, first_name = ? WHERE id = ?').run(v.username, v.key, v.username, req.user.id);
    }
    d.prepare(`UPDATE users SET first_name = COALESCE(?, first_name), school_level = COALESCE(?, school_level), country = COALESCE(?, country),
      subjects = COALESCE(?, subjects), goal = COALESCE(?, goal), avatar = COALESCE(?, avatar), notify_prefs = COALESCE(?, notify_prefs),
      ad_consent = COALESCE(?, ad_consent) WHERE id = ?`)
      .run(firstName ?? null, schoolLevel ?? null, country ?? null, subjects ? JSON.stringify(subjects) : null, goal ?? null,
        avatar ?? null, notifyPrefs ? JSON.stringify(notifyPrefs) : null, adConsent === undefined ? null : (adConsent ? 1 : 0), req.user.id);
    const programTouched = ['systemLevel', 'grade', 'track', 'domain', 'domainDetail', 'learningLanguage', 'examSession', 'schoolYear', 'examDate', 'specialties']
      .some((k) => req.body[k] !== undefined);
    const programRebuild = programTouched || country !== undefined || schoolLevel !== undefined;
    if (programRebuild) {
      // Quand le niveau ou le pays change sans niveau système explicite, on redérive
      // le code de niveau (ex. « Collège » → 'college') pour que le programme suive.
      let derivedLevel = req.body.systemLevel;
      if (derivedLevel === undefined && (schoolLevel !== undefined || country !== undefined)) {
        const cInfo = countryByLabel(country ?? req.user.country);
        const lvlLabel = schoolLevel ?? req.user.school_level;
        derivedLevel = cInfo ? genericLevelToSystem(lvlLabel, cInfo.system) : null;
      }
      d.prepare(`UPDATE users SET system_level = COALESCE(?, system_level), grade = COALESCE(?, grade), track = COALESCE(?, track),
        domain = COALESCE(?, domain), domain_detail = COALESCE(?, domain_detail), specialties = COALESCE(?, specialties),
        learning_language = COALESCE(?, learning_language), exam_session = COALESCE(?, exam_session),
        school_year = COALESCE(?, school_year), exam_date = COALESCE(?, exam_date) WHERE id = ?`)
        .run(derivedLevel ?? null, req.body.grade ?? null, req.body.track ?? null, req.body.domain ?? null,
          req.body.domainDetail ?? null, req.body.specialties ? JSON.stringify(req.body.specialties) : null,
          req.body.learningLanguage ?? null, req.body.examSession ?? null, req.body.schoolYear ?? null, req.body.examDate ?? null,
          req.user.id);
      recomputeCurriculum(d, req.user.id);
    }
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  });

  // ---------- confidentialité : export et suppression (étape 12) ----------
  app.get('/api/me/export', requireAuth, (req, res) => {
    const d = getDb();
    const id = req.user.id;
    const u = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({
      exportedAt: new Date().toISOString(),
      profile: {
        id: u.id, email: u.email, firstName: u.first_name, username: u.username, role: u.role, plan: u.plan,
        country: u.country, schoolLevel: u.school_level, grade: u.grade, track: u.track, domain: u.domain,
        subjects: u.subjects, goal: u.goal, xp: u.xp, streak: u.streak, created_at: u.created_at,
        subscriptionStatus: u.subscription_status, notifyPrefs: u.notify_prefs, quietStart: u.quiet_start, quietEnd: u.quiet_end,
      },
      attempts: d.prepare('SELECT id, quiz_id, subject_id, score, total, xp, accuracy, duration, mode, created_at FROM quiz_attempts WHERE user_id = ?').all(id),
      study: d.prepare('SELECT id, subject_id, input_type, substr(input,1,500) AS input, created_at FROM study_sessions WHERE user_id = ?').all(id),
      xp: d.prepare('SELECT amount, reason, created_at FROM xp_transactions WHERE user_id = ?').all(id),
      achievements: d.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?').all(id),
      favorites: d.prepare('SELECT target_type, target_id, note, created_at FROM favorites WHERE user_id = ?').all(id),
      errorNotebook: d.prepare('SELECT quiz_id, question_index, topic, resolved, created_at FROM error_notebook WHERE user_id = ?').all(id),
      reviews: d.prepare('SELECT flashcard_id, ease, interval_days, reps, lapses, due_date, last_rating FROM flashcard_reviews WHERE user_id = ?').all(id),
      plans: d.prepare('SELECT exam_date, minutes_per_day, subjects, created_at FROM study_plans WHERE user_id = ?').all(id),
      payments: d.prepare('SELECT amount_cents, currency, status, plan, created_at FROM payments WHERE user_id = ?').all(id),
      team: d.prepare('SELECT team_id, role, joined_at FROM team_members WHERE user_id = ?').get(id) || null,
      notifications: d.prepare('SELECT type, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(id),
      notice: 'Aucun secret (mot de passe, clé API, jetons) n’est inclus dans cet export.',
    });
  });

  app.delete('/api/me', requireAuth, (req, res) => {
    const d = getDb();
    const id = req.user.id;
    if (req.user.role === 'admin') return res.status(400).json({ error: 'ADMIN_PROTECTED', message: 'Un compte administrateur ne peut pas être supprimé depuis l’application.' });
    for (const table of ['quiz_attempts', 'study_sessions', 'game_sessions', 'xp_transactions', 'user_achievements', 'user_challenges', 'notifications', 'favorites', 'error_notebook', 'flashcard_reviews', 'study_plans', 'coach_usage', 'video_usage', 'team_xp_events']) {
      try { d.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id); } catch { /* table absente tolérée */ }
    }
    try { d.prepare('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?').run(id, id); } catch { /* ignore */ }
    try { d.prepare('DELETE FROM team_members WHERE user_id = ?').run(id); } catch { /* ignore */ }
    const anon = `deleted_${id}@reviqo.invalid`;
    d.prepare(`UPDATE users SET email = ?, email_canon = ?, password_hash = NULL, first_name = 'Compte supprimé', username = NULL,
      username_norm = NULL, google_id = NULL, coach_api_key = NULL, coach_provider = NULL, coach_model = NULL,
      reset_hash = NULL, reset_token = NULL, verify_hash = NULL, avatar = NULL, deleted_at = datetime('now'),
      is_banned = 1, token_version = token_version + 1, xp = 0, subjects = '[]' WHERE id = ?`).run(anon, anon, id);
    auditLog(id, 'account_deleted', 'user', id, {});
    clearAuthCookie(res);
    res.json({ ok: true, deleted: true, note: 'Données personnelles supprimées. Les données de facturation sont conservées pour obligation légale.' });
  });

  app.get('/api/me/stats', requireAuth, (req, res) => {
    const d = getDb();
    const uidv = req.user.id;
    const attempts = d.prepare('SELECT COUNT(*) AS quizzes, COALESCE(SUM(total),0) AS questions, COALESCE(AVG(accuracy),0) AS avgAccuracy, COALESCE(MAX(accuracy),0) AS best, COALESCE(SUM(duration),0) AS duration FROM quiz_attempts WHERE user_id = ?').get(uidv);
    const bySubject = d.prepare(`SELECT s.name, s.icon, s.color, ROUND(AVG(a.accuracy),0) AS accuracy, COUNT(a.id) AS attempts
      FROM quiz_attempts a JOIN subjects s ON s.id = a.subject_id WHERE a.user_id = ? GROUP BY s.id ORDER BY accuracy DESC`).all(uidv);
    const games = d.prepare('SELECT COUNT(*) AS plays, COALESCE(MAX(score),0) AS best FROM game_sessions WHERE user_id = ?').get(uidv);
    const xpByDay = d.prepare(`SELECT date(created_at) AS day, SUM(amount) AS xp FROM xp_transactions WHERE user_id = ? AND created_at >= datetime('now','-13 days') GROUP BY day ORDER BY day`).all(uidv);
    const recent = d.prepare(`SELECT a.*, q.title AS quiz_title, s.name AS subject_name FROM quiz_attempts a
      LEFT JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN subjects s ON s.id = a.subject_id WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 8`).all(uidv);
    const user = d.prepare('SELECT xp, streak, longest_streak, study_time FROM users WHERE id = ?').get(uidv);
    const lvl = levelForXp(user.xp);
    res.json({
      xp: user.xp, level: lvl.level, levelStart: lvl.levelStart, nextXp: lvl.nextXp,
      streak: user.streak, longestStreak: user.longest_streak,
      quizzes: attempts.quizzes, questions: attempts.questions, avgAccuracy: Math.round(attempts.avgAccuracy),
      best: attempts.best, duration: attempts.duration, games: games.plays, bestGame: games.best,
      bySubject, xpByDay, recent,
    });
  });

  app.get('/api/me/achievements', requireAuth, (req, res) => {
    const d = getDb();
    checkAchievements(req.user);
    const all = d.prepare('SELECT * FROM achievements ORDER BY id').all();
    const unlocked = d.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?').all(req.user.id);
    const map = Object.fromEntries(unlocked.map((u) => [u.achievement_id, u.unlocked_at]));
    res.json({ achievements: all.map((a) => ({ ...a, unlocked: !!map[a.id], unlockedAt: map[a.id] || null })) });
  });

  app.get('/api/notifications', requireAuth, (req, res) => {
    const d = getDb();
    const items = d.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(req.user.id);
    res.json({ notifications: items, unread: items.filter((n) => !n.read).length });
  });

  app.post('/api/notifications/read', requireAuth, (req, res) => {
    const d = getDb();
    if (req.body.id) d.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.body.id, req.user.id);
    else d.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  // ---------- programmes scolaires (étape 4) ----------
  app.get('/api/programs', (req, res) => res.json(programsCatalog()));

  app.get('/api/curriculum', (req, res) => {
    const user = getUserFromReq(req);
    const src = user
      ? { country: user.country, schoolLevel: user.school_level, systemLevel: user.system_level, grade: user.grade, track: user.track, domain: user.domain, domainDetail: user.domain_detail }
      : { country: req.query.country, schoolLevel: req.query.schoolLevel, systemLevel: req.query.systemLevel, grade: req.query.grade, track: req.query.track, domain: req.query.domain, domainDetail: req.query.domainDetail };
    const country = countryByLabel(src.country);
    const level = src.systemLevel || (country ? genericLevelToSystem(src.schoolLevel, country.system) : null);
    let row = null;
    if (country && level) row = findCurriculum({ countryCode: country.code, level, grade: src.grade || '', track: src.track || '', domain: src.domain || '' });
    const serialized = serializeCurriculum(row);
    const needs = curriculumNeeds(src);
    res.json({
      profile: src,
      curriculum: serialized,
      examTabs: examTabsFor(row || serialized),
      contentStatus: serialized?.contentStatus || 'unavailable',
      notice: serialized ? (serialized.contentStatus === 'unavailable' ? PROGRAM_NOTICE : null) : PROGRAM_NOTICE,
      genericNote: serialized?.contentStatus === 'partial' ? PROGRAM_GENERIC_NOTE : null,
      needs,
    });
  });

  // ---------- content ----------
  app.get('/api/subjects', (req, res) => {
    const d = getDb();
    const subjectRows = d.prepare('SELECT * FROM subjects ORDER BY id').all();
    const user = getUserFromReq(req);
    let progress = [];
    if (user) progress = d.prepare('SELECT subject_id, ROUND(AVG(accuracy),0) AS accuracy, COUNT(*) AS attempts FROM quiz_attempts WHERE user_id = ? GROUP BY subject_id').all(user.id);
    const pmap = Object.fromEntries(progress.map((p) => [p.subject_id, p]));
    let visible = subjectRows;
    let programCurriculum = null;
    if (req.query.scope === 'program') {
      const cur = user && curriculumForUser(user);
      const notice = programNoticeFor(cur);
      if (!cur || notice) return res.json({ subjects: [], scope: 'program', programNotice: notice || PROGRAM_NOTICE, contentStatus: cur?.content_status || 'unavailable' });
      programCurriculum = serializeCurriculum(cur);
      const allowed = new Set(programCurriculum.subjects);
      visible = subjectRows.filter((s) => allowed.has(s.slug));
    }
    res.json({
      subjects: visible.map((s) => ({ ...s, progress: pmap[s.id]?.accuracy || 0, attempts: pmap[s.id]?.attempts || 0 })),
      ...(req.query.scope === 'program' ? { scope: 'program', programNotice: null, contentStatus: programCurriculum.contentStatus, curriculum: programCurriculum } : {}),
    });
  });

  app.get('/api/quizzes', (req, res) => {
    const d = getDb();
    const { subject, difficulty, type } = req.query;
    const user = getUserFromReq(req);
    const premium = isPremium(user);
    let sql = `SELECT q.id, q.title, q.description, q.type, q.difficulty, q.is_premium AS isPremium, q.plays, q.questions,
      q.curriculum_id, q.status, q.language, q.chapter, q.objectives, q.prerequisites, q.version, q.sources, q.content_type, q.country_code, q.level, q.grade,
      s.slug AS subjectSlug, s.name AS subjectName, s.icon AS subjectIcon, s.color AS subjectColor
      FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.active = 1 AND q.status = 'published'`;
    const params = [];
    if (subject) { sql += ' AND s.slug = ?'; params.push(subject); }
    if (difficulty) { sql += ' AND q.difficulty = ?'; params.push(difficulty); }
    if (type) { sql += ' AND q.type = ?'; params.push(type); }
    sql += ' ORDER BY q.id';
    let rows = d.prepare(sql).all(...params);
    let programCurriculum = null;
    if (req.query.scope === 'program') {
      const cur = user && curriculumForUser(user);
      const notice = programNoticeFor(cur);
      if (!cur || notice) return res.json({ quizzes: [], scope: 'program', programNotice: notice || PROGRAM_NOTICE, contentStatus: cur?.content_status || 'unavailable' });
      programCurriculum = serializeCurriculum(cur);
      const allowed = new Set(programCurriculum.subjects);
      // Priorité au contenu de la classe ; le contenu générique vient en complément.
      const classRows = rows.filter((r) => r.curriculum_id === cur.id);
      const subjectRows = rows.filter((r) => !r.curriculum_id && allowed.has(r.subjectSlug));
      rows = req.query.only === 'class' ? classRows : classRows.concat(subjectRows);
    }
    res.json({
      quizzes: rows.map((r) => ({
        id: r.id, title: r.title, description: r.description, type: r.type, difficulty: r.difficulty,
        isPremium: !!r.isPremium, plays: r.plays, subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.subjectIcon, color: r.subjectColor },
        questionCount: JSON.parse(r.questions).length, locked: !!r.isPremium && !premium,
        ...resourceMetadata(r),
      })),
      ...(req.query.scope === 'program' ? { scope: 'program', programNotice: null, contentStatus: programCurriculum.contentStatus, curriculum: programCurriculum, classCount: rows.filter((r) => r.curriculum_id).length } : {}),
    });
  });

  app.get('/api/quizzes/:id', (req, res) => {
    const d = getDb();
    const user = getUserFromReq(req);
    const row = d.prepare(`SELECT q.*, s.slug AS subjectSlug, s.name AS subjectName, s.icon AS subjectIcon, s.color AS subjectColor FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ?`).get(req.params.id);
    if (!row || !row.active) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ce quiz est temporairement indisponible.' });
    const isAdmin = !!(user && user.role === 'admin');
    if (row.status && row.status !== 'published' && !isAdmin) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ce quiz est temporairement indisponible.' });
    if (row.is_premium && !isPremium(user)) return res.status(402).json({ error: 'PREMIUM_REQUIRED', message: 'Ce quiz avancé est réservé aux membres Premium.' });
    res.json({
      quiz: {
        id: row.id, title: row.title, description: row.description, type: row.type, difficulty: row.difficulty,
        isPremium: !!row.is_premium, subject: { slug: row.subjectSlug, name: row.subjectName, icon: row.subjectIcon, color: row.subjectColor },
        questions: JSON.parse(row.questions).map(({ answer, ...rest }, i) => ({ ...rest, index: i })),
        ...resourceMetadata(row),
      },
    });
  });

  app.post('/api/quizzes/:id/attempt', requireAuth, (req, res) => {
    const d = getDb();
    const row = d.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ce quiz est temporairement indisponible.' });
    if (row.is_premium && !isPremium(req.user)) return res.status(402).json({ error: 'PREMIUM_REQUIRED', message: 'Ce quiz avancé est réservé aux membres Premium.' });
    const quiz = { questions: JSON.parse(row.questions) };
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const mode = req.body.mode || 'quiz';
    const duration = Math.min(3600, Math.max(0, Number(req.body.duration) || 0));
    const result = gradeAnswers(quiz, answers);
    recordErrors(req.user.id, row.id, row.subject_id, result.details);
    // Anti-farming : répéter le même quiz le même jour rapporte de moins en moins d'XP.
    const priorToday = d.prepare("SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND date(created_at) = date('now')").get(req.user.id, row.id).c;
    const grantedXp = priorToday >= 3 ? 0 : priorToday >= 1 ? Math.round(result.xp * 0.2) : result.xp;
    const info = d.prepare(`INSERT INTO quiz_attempts (user_id, quiz_id, subject_id, score, total, xp, accuracy, duration, mode, weak_topics, curriculum_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, row.id, row.subject_id, result.score, result.total, grantedXp, result.accuracy, duration, mode, JSON.stringify(result.weak), req.user.curriculum_id || null);
    d.prepare('UPDATE quizzes SET plays = plays + 1 WHERE id = ?').run(row.id);
    // Idempotence : rejouer la même tentative (attemptId client) ne crédite pas deux fois.
    const clientRef = req.body.attemptId ? String(req.body.attemptId).slice(0, 80) : null;
    const xpRef = clientRef ? `quiz:${row.id}:${clientRef}` : `attempt:${info.lastInsertRowid}`;
    const grant = grantedXp > 0 ? addXp(req.user.id, grantedXp, 'quiz', xpRef) : { granted: false, amount: 0 };
    broadcastLeaderboard();
    d.prepare('UPDATE users SET study_time = study_time + ?, best_score = MAX(best_score, ?) WHERE id = ?').run(duration, result.accuracy, req.user.id);
    touchStreak(req.user);
    progressDailyChallenge(req.user.id, 'quiz', 1);
    progressDailyChallenge(req.user.id, 'questions', result.total);
    progressDailyChallenge(req.user.id, 'accuracy80', result.accuracy);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const unlocked = checkAchievements(user);
    const recommendation = result.accuracy < 80
      ? `Révise : ${result.weak[0] || row.title}`
      : `Passe au niveau ${row.difficulty === 'easy' ? 'moyen' : 'difficile'} en ${row.title}`;
    res.json({
      attemptId: info.lastInsertRowid, score: result.score, total: result.total, accuracy: result.accuracy,
      xp: grantedXp, xpGranted: !!grant.granted, xpReduced: grantedXp < result.xp, bonus: result.bonus, weak: result.weak, details: result.details,
      recommendation, unlocked, user: publicUser(user),
    });
  });

  app.post('/api/study/generate', requireAuth, requireVerified, async (req, res) => {
    const d = getDb();
    const today = d.prepare("SELECT COUNT(*) AS c FROM study_sessions WHERE user_id = ? AND date(created_at) = date('now')").get(req.user.id).c;
    if (!isPremium(req.user) && today >= FREE_AI_PER_DAY) {
      return res.status(402).json({
        error: 'QUOTA_REACHED',
        message: `Limite gratuite atteinte (${FREE_AI_PER_DAY} générations/jour). Passe en Premium pour l’illimité.`,
        quota: { used: today, limit: FREE_AI_PER_DAY },
      });
    }
    const input = String(req.body.input || '').slice(0, 12000);
    if (input.trim().length < 20 && !req.body.topic) {
      return res.status(400).json({ error: 'TOO_SHORT', message: 'Ajoute un peu de contenu à étudier (au moins quelques phrases).' });
    }
    const subjectId = req.body.subjectId ? Number(req.body.subjectId) : null;
    let subjectName = 'Général';
    if (subjectId) {
      const s = d.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId);
      subjectName = s?.name || subjectName;
    }
    const result = await generateWithLLM({ input: input || req.body.topic, subject: subjectName, difficulty: req.body.difficulty || 'medium' });
    const info = d.prepare('INSERT INTO study_sessions (user_id, subject_id, input_type, input, result) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, subjectId, req.body.inputType || 'text', input.slice(0, 2000), JSON.stringify(result));
    addXp(req.user.id, 15, 'study', `study:${info.lastInsertRowid}`);
    broadcastLeaderboard();
    touchStreak(req.user);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    checkAchievements(user);
    res.json({ sessionId: info.lastInsertRowid, result, quota: { used: today + 1, limit: isPremium(user) ? null : FREE_AI_PER_DAY } });
  });

  app.get('/api/study/history', requireAuth, (req, res) => {
    const d = getDb();
    const rows = d.prepare(`SELECT id, subject_id, input_type, substr(input,1,80) AS preview, created_at FROM study_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(req.user.id);
    res.json({ sessions: rows });
  });

  app.get('/api/study/:id', requireAuth, (req, res) => {
    const d = getDb();
    const row = d.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable.' });
    res.json({ session: { ...row, result: JSON.parse(row.result) } });
  });

  // ---------- flashcards ----------
  app.get('/api/flashcards', (req, res) => {
    const d = getDb();
    const user = getUserFromReq(req);
    const { subject } = req.query;
    let sql = `SELECT f.id, f.deck, f.front, f.back, f.is_premium, f.curriculum_id, f.status, f.language, f.chapter,
      f.objectives, f.prerequisites, f.version, f.sources, f.content_type, f.country_code, f.level, f.grade, f.difficulty,
      s.slug AS subjectSlug, s.name AS subjectName, s.icon, s.color
      FROM flashcards f JOIN subjects s ON s.id = f.subject_id WHERE f.status = 'published'`;
    const params = [];
    if (subject) { sql += ' AND s.slug = ?'; params.push(subject); }
    sql += ' ORDER BY s.id, f.deck, f.id';
    let rows = d.prepare(sql).all(...params);
    let programCurriculum = null;
    if (req.query.scope === 'program') {
      const cur = user && curriculumForUser(user);
      const notice = programNoticeFor(cur);
      if (!cur || notice) return res.json({ decks: [], scope: 'program', programNotice: notice || PROGRAM_NOTICE, contentStatus: cur?.content_status || 'unavailable' });
      programCurriculum = serializeCurriculum(cur);
      const allowed = new Set(programCurriculum.subjects);
      const classRows = rows.filter((r) => r.curriculum_id === cur.id);
      const subjectRows = rows.filter((r) => !r.curriculum_id && allowed.has(r.subjectSlug));
      rows = req.query.only === 'class' ? classRows : classRows.concat(subjectRows);
    }
    const premium = isPremium(user);
    const decksMap = new Map();
    for (const r of rows) {
      const key = `${r.curriculum_id || 'subject'}::${r.deck}`;
      if (!decksMap.has(key)) decksMap.set(key, { deck: r.deck, subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.icon, color: r.color }, cards: [], locked: false, ...resourceMetadata(r) });
      const deck = decksMap.get(key);
      if (r.is_premium && !premium) deck.locked = true;
      deck.cards.push({ id: r.id, front: r.front, back: r.back, isPremium: !!r.is_premium });
    }
    res.json({
      decks: [...decksMap.values()],
      ...(req.query.scope === 'program' ? { scope: 'program', programNotice: null, contentStatus: programCurriculum.contentStatus, curriculum: programCurriculum } : {}),
    });
  });

  // ---------- bibliothèque pédagogique (étape 5) ----------
  app.get('/api/library', (req, res) => {
    const d = getDb();
    const user = getUserFromReq(req);
    let cur = null;
    if (req.query.scope === 'program') {
      cur = user && curriculumForUser(user);
      const notice = programNoticeFor(cur);
      if (!cur || notice) return res.json({ resources: [], scope: 'program', programNotice: notice || PROGRAM_NOTICE, contentStatus: cur?.content_status || 'unavailable' });
    }
    const allowed = cur ? new Set(parseJsonArr(cur.subjects)) : null;
    const quizzes = d.prepare(`SELECT q.id, q.title, q.description, q.difficulty, q.curriculum_id, q.status, q.language, q.chapter, q.objectives, q.prerequisites, q.version, q.sources, q.content_type, q.country_code, q.level, q.grade, s.slug AS subjectSlug, s.name AS subjectName FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.active = 1 AND q.status = 'published' ORDER BY q.id`).all();
    const cards = d.prepare(`SELECT f.id, f.deck, f.front, f.back, f.difficulty, f.curriculum_id, f.status, f.language, f.chapter, f.objectives, f.prerequisites, f.version, f.sources, f.content_type, f.country_code, f.level, f.grade, s.slug AS subjectSlug, s.name AS subjectName FROM flashcards f JOIN subjects s ON s.id = f.subject_id WHERE f.status = 'published' ORDER BY f.id`).all();
    const inScope = (r) => !cur || r.curriculum_id === cur.id || (!r.curriculum_id && allowed.has(r.subjectSlug));
    res.json({
      resources: [
        ...quizzes.filter(inScope).map((r) => ({ type: 'quiz', id: r.id, title: r.title, description: r.description, difficulty: r.difficulty, subject: { slug: r.subjectSlug, name: r.subjectName }, ...resourceMetadata(r) })),
        ...cards.filter(inScope).map((r) => ({ type: 'flashcard', id: r.id, title: r.front, description: r.back, deck: r.deck, difficulty: r.difficulty, subject: { slug: r.subjectSlug, name: r.subjectName }, ...resourceMetadata(r) })),
      ],
      ...(cur ? { scope: 'program', programNotice: null, contentStatus: cur.content_status, curriculum: serializeCurriculum(cur) } : {}),
    });
  });

  // ---------- AI video ----------
  // Recherche vidéo premium : analyse sémantique + YouTube réel (RAG + cache + quota).
  app.post('/api/video/search', requireAuth, requireVerified, rateLimit(20, 60000), async (req, res) => {
    if (!isPremium(req.user)) return res.status(402).json({ error: 'PREMIUM_REQUIRED', message: 'La Vidéo IA est une fonctionnalité Premium.' });
    const query = String(req.body.query || req.body.input || '').slice(0, 300);
    if (!query.trim()) return res.status(400).json({ error: 'BAD_INPUT', message: 'Décris le cours ou la notion recherchée.' });
    const language = /^[a-z]{2}$/.test(String(req.body.language || '')) ? req.body.language : 'fr';
    const d = getDb();
    const limit = Number(process.env.VIDEO_DAILY_LIMIT || 60);
    const day = new Date().toISOString().slice(0, 10);
    d.prepare('INSERT INTO video_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1').run(req.user.id, day);
    const used = d.prepare('SELECT count FROM video_usage WHERE user_id = ? AND day = ?').get(req.user.id, day).count;
    if (used > limit) return res.status(429).json({ error: 'VIDEO_QUOTA', message: `Limite quotidienne de Vidéo IA atteinte (${limit}). Réessaie demain.`, quota: { used, limit } });
    const result = await findVideosForRequest(req.user, query, { premium: true, language });
    res.json({ ...result, quota: { used, limit }, disclaimer: 'Les métadonnées YouTube ne permettent pas d’analyser le contenu complet d’une vidéo.' });
  });

  app.post('/api/video/generate', requireAuth, requireVerified, async (req, res) => {
    const d = getDb();
    const today = d.prepare("SELECT COUNT(*) AS c FROM study_sessions WHERE user_id = ? AND input_type = 'video' AND date(created_at) = date('now')").get(req.user.id).c;
    if (!isPremium(req.user) && today >= 1) {
      return res.status(402).json({ error: 'QUOTA_REACHED', message: 'La vidéo IA est une fonctionnalité Premium (1 essai gratuit/jour). Passe en Premium pour l’illimité.', quota: { used: today, limit: 1 } });
    }
    const input = String(req.body.input || '').slice(0, 12000);
    if (input.trim().length < 20) return res.status(400).json({ error: 'TOO_SHORT', message: 'Ajoute un peu de contenu pour créer la vidéo.' });
    let subjectName = 'Général';
    if (req.body.subjectId) { const s = d.prepare('SELECT name FROM subjects WHERE id = ?').get(req.body.subjectId); subjectName = s?.name || subjectName; }
    const script = generateVideoScript({ input, subject: subjectName, difficulty: req.body.difficulty || 'medium', tone: req.body.tone || 'dynamic' });
    const session = d.prepare('INSERT INTO study_sessions (user_id, subject_id, input_type, input, result) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, req.body.subjectId || null, 'video', input.slice(0, 2000), JSON.stringify(script));
    addXp(req.user.id, 25, 'video', `video:${session.lastInsertRowid}`);
    broadcastLeaderboard();
    touchStreak(req.user);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    checkAchievements(user);
    res.json({ script, user: publicUser(user) });
  });

  // ---------- AI coach (premium) ----------
  app.get('/api/coach/settings', requireAuth, (req, res) => {
    res.json({ provider: req.user.coach_provider || '', model: req.user.coach_model || '', hasKey: !!req.user.coach_api_key, premium: isPremium(req.user) });
  });

  app.post('/api/coach/settings', requireAuth, (req, res) => {
    const d = getDb();
    const provider = ['openai', 'anthropic', 'gemini', 'custom'].includes(req.body.provider) ? req.body.provider : null;
    const apiKey = req.body.apiKey ? String(req.body.apiKey).slice(0, 400) : null;
    const clear = !!req.body.clear;
    d.prepare('UPDATE users SET coach_provider = ?, coach_model = ?, coach_api_key = COALESCE(?, coach_api_key) WHERE id = ?')
      .run(provider, req.body.model ? String(req.body.model).slice(0, 120) : null, clear ? null : apiKey, req.user.id);
    if (clear) d.prepare('UPDATE users SET coach_api_key = NULL WHERE id = ?').run(req.user.id);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ provider: user.coach_provider || '', model: user.coach_model || '', hasKey: !!user.coach_api_key });
  });

  app.post('/api/coach/chat', requireAuth, requireVerified, rateLimit(40, 60000), async (req, res) => {
    if (!isPremium(req.user)) return res.status(402).json({ error: 'PREMIUM_REQUIRED', message: 'Le Coach IA est réservé aux membres Premium.' });
    const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-12) : [];
    if (!messages.length) return res.status(400).json({ error: 'BAD_INPUT', message: 'Écris un message.' });
    // Maîtrise des coûts : quota quotidien par utilisateur.
    const d = getDb();
    const limit = Number(process.env.COACH_DAILY_LIMIT || 200);
    const day = new Date().toISOString().slice(0, 10);
    d.prepare('INSERT INTO coach_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1').run(req.user.id, day);
    const used = d.prepare('SELECT count FROM coach_usage WHERE user_id = ? AND day = ?').get(req.user.id, day).count;
    if (used > limit) return res.status(429).json({ error: 'COACH_QUOTA', message: `Limite quotidienne du Coach atteinte (${limit} messages). Réessaie demain.`, quota: { used, limit } });
    const reply = await askCoach(req.user, messages, { premium: isPremium(req.user) });
    res.json({ reply, quota: { used, limit } });
  });

  // ---------- daily ----------
  app.get('/api/daily', requireAuth, (req, res) => {
    res.json({ challenges: getDailyBoard(req.user.id), serverDate: new Date().toISOString().slice(0, 10) });
  });

  // ---------- games ----------
  // Game questions include answers because mini-games give instant feedback.
  // XP is derived and capped server-side, so this cannot be abused for rewards.
  app.get('/api/games/questions', requireAuth, (req, res) => {
    const d = getDb();
    const count = Math.min(30, Math.max(3, Number(req.query.count) || 8));
    const subject = req.query.subject;
    let sql = `SELECT q.id, q.title, q.questions, q.difficulty, s.slug AS subjectSlug, s.name AS subjectName FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.active = 1`;
    const params = [];
    if (subject) { sql += ' AND s.slug = ?'; params.push(subject); }
    const rows = d.prepare(sql).all(...params);
    let pool = [];
    for (const r of rows) {
      const qs = JSON.parse(r.questions);
      qs.forEach((question) => pool.push({ ...question, subject: r.subjectName, subjectSlug: r.subjectSlug, quizTitle: r.title }));
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    res.json({ questions: pool.slice(0, count) });
  });

  app.post('/api/games/score', requireAuth, (req, res) => {
    const d = getDb();
    const game = String(req.body.game || 'unknown').slice(0, 40);
    const rawScore = Math.max(0, Math.min(100000, Number(req.body.score) || 0));
    const combo = Math.max(0, Math.min(1000, Number(req.body.combo) || 0));
    const duration = Math.max(0, Math.min(600, Number(req.body.duration) || 0));
    // Anti-abuse: XP is derived server-side from score, capped per session.
    const xp = Math.min(120, Math.max(5, Math.round(rawScore / 12)));
    const info = d.prepare('INSERT INTO game_sessions (user_id, game, score, xp, combo, duration) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, game, rawScore, xp, combo, duration);
    addXp(req.user.id, xp, `game:${game}`, `game:${info.lastInsertRowid}`);
    broadcastLeaderboard();
    touchStreak(req.user);
    progressDailyChallenge(req.user.id, 'game', 1);
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const unlocked = checkAchievements(user);
    const rank = d.prepare('SELECT COUNT(*) + 1 AS r FROM game_sessions WHERE game = ? AND score > ?').get(game, rawScore).r;
    res.json({ sessionId: info.lastInsertRowid, xp, rank, unlocked, user: publicUser(user) });
  });

  app.get('/api/games/leaderboard', (req, res) => {
    const d = getDb();
    const game = req.query.game || 'quiz-rush';
    const rows = d.prepare(`SELECT u.id, u.first_name AS name, u.avatar, MAX(g.score) AS best FROM game_sessions g JOIN users u ON u.id = g.user_id WHERE g.game = ? GROUP BY u.id ORDER BY best DESC LIMIT 10`).all(game);
    res.json({ game, leaderboard: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
  });

  // ---------- leaderboards (paginés, départage déterministe) ----------
  app.get('/api/leaderboard', requireAuth, (req, res) => {
    const d = getDb();
    const scope = ['global', 'weekly', 'monthly', 'friends'].includes(req.query.scope) ? req.query.scope : 'global';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const clean = 'u.is_guest = 0 AND u.is_banned = 0';
    const friends = `SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'`;
    let rows, total, myXp, myRank;
    if (scope === 'weekly' || scope === 'monthly') {
      const days = scope === 'weekly' ? 7 : 30;
      const since = `-${days} days`;
      const from = `FROM users u LEFT JOIN xp_transactions t ON t.user_id = u.id AND t.created_at >= datetime('now', ?) WHERE ${clean}`;
      total = d.prepare(`SELECT COUNT(*) AS c ${from}`).get(since).c;
      rows = d.prepare(`SELECT u.id, u.first_name AS name, u.username, u.avatar, COALESCE(SUM(t.amount),0) AS xp ${from} GROUP BY u.id ORDER BY xp DESC, u.id ASC LIMIT ? OFFSET ?`).all(since, limit, offset);
      myXp = d.prepare("SELECT COALESCE(SUM(amount),0) AS xp FROM xp_transactions WHERE user_id = ? AND created_at >= datetime('now', ?)").get(req.user.id, since).xp;
      myRank = d.prepare(`SELECT COUNT(*) + 1 AS r FROM (SELECT u.id, COALESCE(SUM(t.amount),0) AS xp ${from} GROUP BY u.id) x WHERE x.xp > ? OR (x.xp = ? AND x.id < ?)`).get(since, myXp, myXp, req.user.id).r;
    } else if (scope === 'friends') {
      total = d.prepare(`SELECT COUNT(*) AS c FROM users u WHERE (u.id = ? OR u.id IN (${friends})) AND ${clean}`).get(req.user.id, req.user.id, req.user.id, req.user.id).c;
      rows = d.prepare(`SELECT u.id, u.first_name AS name, u.username, u.avatar, u.xp FROM users u WHERE (u.id = ? OR u.id IN (${friends})) AND ${clean} ORDER BY u.xp DESC, u.id ASC LIMIT ? OFFSET ?`).all(req.user.id, req.user.id, req.user.id, req.user.id, limit, offset);
      myXp = req.user.xp;
      myRank = d.prepare(`SELECT COUNT(*) + 1 AS r FROM users u WHERE (u.id = ? OR u.id IN (${friends})) AND ${clean} AND (u.xp > ? OR (u.xp = ? AND u.id < ?))`).get(req.user.id, req.user.id, req.user.id, req.user.id, myXp, myXp, req.user.id).r;
    } else {
      total = d.prepare(`SELECT COUNT(*) AS c FROM users u WHERE ${clean}`).get().c;
      rows = d.prepare(`SELECT u.id, u.first_name AS name, u.username, u.avatar, u.xp FROM users u WHERE ${clean} ORDER BY u.xp DESC, u.id ASC LIMIT ? OFFSET ?`).all(limit, offset);
      myXp = req.user.xp;
      myRank = d.prepare(`SELECT COUNT(*) + 1 AS r FROM users u WHERE ${clean} AND (u.xp > ? OR (u.xp = ? AND u.id < ?))`).get(myXp, myXp, req.user.id).r;
    }
    const list = rows.map((r, i) => ({ id: r.id, name: r.name, username: r.username || null, avatar: r.avatar, xp: Number(r.xp) || 0, rank: offset + i + 1, level: levelForXp(r.xp || 0).level }));
    res.json({ scope, page, limit, pages: Math.max(1, Math.ceil(total / limit)), total, leaderboard: list, me: { ...publicUser(req.user), rank: myRank, xp: myXp } });
  });

  // Temps réel (SSE) : le serveur pousse un signal, le client recharge son classement.
  app.get('/api/leaderboard/stream', requireAuth, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ scope: String(req.query.scope || 'global'), at: Date.now() })}\n\n`);
    leaderboardClients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 25000);
    if (typeof ping.unref === 'function') ping.unref();
    req.on('close', () => { clearInterval(ping); leaderboardClients.delete(res); });
  });

  // ---------- apprentissage : révisions, carnet, planning, tableau de bord, recherche, favoris (étape 11) ----------
  app.get('/api/reviews/due', requireAuth, (req, res) => res.json(dueReviews(req.user.id, { limit: req.query.limit })));
  app.get('/api/reviews/stats', requireAuth, (req, res) => res.json(reviewStats(req.user.id)));
  app.post('/api/reviews/:flashcardId', requireAuth, rateLimit(120, 60000), (req, res) => {
    const r = scheduleReview(req.user.id, Number(req.params.flashcardId), String(req.body.rating || ''));
    if (r.error) return res.status(400).json({ error: r.error, message: r.error === 'BAD_RATING' ? 'Note inconnue.' : 'Carte introuvable.' });
    res.json(r);
  });
  app.get('/api/error-notebook', requireAuth, (req, res) => res.json(errorNotebook(req.user.id)));
  app.post('/api/error-notebook/:id/resolve', requireAuth, (req, res) => {
    const r = resolveError(req.user.id, Number(req.params.id));
    if (r.error) return res.status(404).json({ error: 'NOT_FOUND', message: 'Entrée introuvable.' });
    res.json(r);
  });
  app.get('/api/planner', requireAuth, (req, res) => res.json(getPlan(req.user.id)));
  app.post('/api/planner', requireAuth, requireVerified, rateLimit(20, 60000), (req, res) => res.json(generatePlan(req.user.id, req.body)));
  app.get('/api/dashboard', requireAuth, (req, res) => res.json(dashboard(req.user, { premium: isPremium(req.user) })));
  app.get('/api/search', (req, res) => {
    const user = getUserFromReq(req);
    res.json(globalSearch(user, req.query.q, { subject: req.query.subject, difficulty: req.query.difficulty, type: req.query.type, premium: isPremium(user), limit: req.query.limit }));
  });
  app.get('/api/favorites', requireAuth, (req, res) => {
    res.json({ favorites: getDb().prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(req.user.id) });
  });
  app.post('/api/favorites', requireAuth, rateLimit(60, 60000), (req, res) => {
    const type = ['quiz', 'flashcard', 'video', 'course'].includes(req.body.targetType) ? req.body.targetType : null;
    const targetId = String(req.body.targetId || '').slice(0, 60);
    if (!type || !targetId) return res.status(400).json({ error: 'BAD_INPUT', message: 'Cible invalide.' });
    getDb().prepare(`INSERT INTO favorites (user_id, target_type, target_id, note) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET note = COALESCE(excluded.note, favorites.note)`)
      .run(req.user.id, type, targetId, req.body.note ? String(req.body.note).slice(0, 500) : null);
    res.status(201).json({ ok: true });
  });
  app.patch('/api/favorites/:id', requireAuth, (req, res) => {
    const info = getDb().prepare('UPDATE favorites SET note = ? WHERE id = ? AND user_id = ?').run(req.body.note ? String(req.body.note).slice(0, 500) : null, Number(req.params.id), req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Favori introuvable.' });
    res.json({ ok: true });
  });
  app.delete('/api/favorites/:id', requireAuth, (req, res) => {
    getDb().prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/notifications/prefs', requireAuth, (req, res) => {
    res.json({ prefs: req.user.notify_prefs ? JSON.parse(req.user.notify_prefs) : null, quietStart: req.user.quiet_start || null, quietEnd: req.user.quiet_end || null, frequency: req.user.notify_frequency || 'instant' });
  });
  app.patch('/api/notifications/prefs', requireAuth, (req, res) => {
    const d = getDb();
    const prefs = req.body.prefs ? JSON.stringify(req.body.prefs) : null;
    const freq = ['instant', 'daily', 'weekly', 'off'].includes(req.body.frequency) ? req.body.frequency : null;
    d.prepare(`UPDATE users SET notify_prefs = COALESCE(?, notify_prefs), quiet_start = COALESCE(?, quiet_start),
      quiet_end = COALESCE(?, quiet_end), notify_frequency = COALESCE(?, notify_frequency) WHERE id = ?`)
      .run(prefs, req.body.quietStart ?? null, req.body.quietEnd ?? null, freq, req.user.id);
    const u = d.prepare('SELECT notify_prefs, quiet_start, quiet_end, notify_frequency FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, prefs: u.notify_prefs ? JSON.parse(u.notify_prefs) : null, quietStart: u.quiet_start, quietEnd: u.quiet_end, frequency: u.notify_frequency });
  });

  // ---------- équipes (étape 10) ----------
  const sendTeam = (res, result) => {
    if (result && result.error) return res.status(result.status || 400).json({ error: result.error, message: result.message });
    res.json(result);
  };
  const myTeamId = (userId) => membership(userId)?.team_id || null;

  app.get('/api/teams/me', requireAuth, (req, res) => {
    const teamId = myTeamId(req.user.id);
    if (!teamId) return res.json({ team: null });
    sendTeam(res, teamDetail(req.user, teamId));
  });
  app.post('/api/teams', requireAuth, requireVerified, rateLimit(10, 60000), (req, res) => sendTeam(res, createTeam(req.user, req.body)));
  app.post('/api/teams/join', requireAuth, rateLimit(20, 60000), (req, res) => sendTeam(res, joinByCode(req.user, req.body.code)));
  app.post('/api/teams/leave', requireAuth, (req, res) => sendTeam(res, leaveTeam(req.user)));
  app.get('/api/teams/leaderboard', requireAuth, (req, res) => {
    sendTeam(res, teamsLeaderboard({ league: req.query.league || null, page: req.query.page, limit: req.query.limit }));
  });
  app.get('/api/teams/goal/history', requireAuth, (req, res) => {
    const teamId = myTeamId(req.user.id);
    if (!teamId) return res.json({ history: [] });
    sendTeam(res, goalHistory(req.user, teamId, req.query.weeks));
  });
  app.get('/api/teams/activity', requireAuth, (req, res) => {
    const teamId = myTeamId(req.user.id);
    if (!teamId) return res.json({ activity: [] });
    sendTeam(res, activityFeed(req.user, teamId, req.query.limit));
  });
  app.get('/api/teams/challenges/list', requireAuth, (req, res) => res.json(listChallenges(req.user)));
  app.post('/api/teams/challenges', requireAuth, rateLimit(20, 60000), (req, res) => sendTeam(res, proposeChallenge(req.user, req.body)));
  app.post('/api/teams/challenges/:id/respond', requireAuth, (req, res) => sendTeam(res, respondChallenge(req.user, Number(req.params.id), req.body.action)));
  app.post('/api/teams/challenges/:id/finalize', requireAuth, (req, res) => sendTeam(res, finalizeChallenge(req.user, Number(req.params.id))));
  app.get('/api/teams/:id/invites', requireAuth, (req, res) => {
    const teamId = Number(req.params.id);
    if (!isTeamAdmin(teamId, req.user.id)) return res.status(403).json({ error: 'FORBIDDEN', message: 'Réservé aux administrateurs d’équipe.' });
    res.json({ invites: listInvites(teamId) });
  });
  app.post('/api/teams/:id/invites', requireAuth, rateLimit(20, 60000), (req, res) => sendTeam(res, createInvite(req.user, Number(req.params.id), req.body)));
  app.post('/api/teams/invites/:inviteId/revoke', requireAuth, (req, res) => sendTeam(res, revokeInvite(req.user, Number(req.params.inviteId))));
  app.post('/api/teams/members/:userId/remove', requireAuth, (req, res) => {
    const teamId = myTeamId(req.user.id);
    if (!teamId) return res.status(403).json({ error: 'FORBIDDEN', message: 'Tu n’es dans aucune équipe.' });
    sendTeam(res, removeMember(req.user, teamId, Number(req.params.userId)));
  });
  app.post('/api/teams/members/:userId/role', requireAuth, (req, res) => {
    const teamId = myTeamId(req.user.id);
    if (!teamId) return res.status(403).json({ error: 'FORBIDDEN', message: 'Tu n’es dans aucune équipe.' });
    sendTeam(res, setRole(req.user, teamId, Number(req.params.userId), req.body.role));
  });
  app.patch('/api/teams/:id', requireAuth, (req, res) => sendTeam(res, updateTeam(req.user, Number(req.params.id), req.body)));
  app.delete('/api/teams/:id', requireAuth, (req, res) => sendTeam(res, deleteTeam(req.user, Number(req.params.id))));
  app.get('/api/teams/:id', requireAuth, (req, res) => sendTeam(res, teamDetail(req.user, Number(req.params.id))));

  // ---------- friends ----------
  app.get('/api/friends', requireAuth, (req, res) => {
    const d = getDb();
    const friends = d.prepare(`SELECT u.id, u.first_name AS name, u.avatar, u.xp, u.streak
      FROM users u WHERE u.id IN (SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted')`)
      .all(req.user.id, req.user.id, req.user.id)
      .map((f) => ({ ...f, level: levelForXp(f.xp).level }));
    const incoming = d.prepare(`SELECT f.id, u.id AS userId, u.first_name AS name, u.avatar FROM friendships f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending'`).all(req.user.id);
    const outgoing = d.prepare(`SELECT f.id, u.id AS userId, u.first_name AS name, u.avatar FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending'`).all(req.user.id);
    const challenges = d.prepare(`SELECT c.*, u.first_name AS challenger_name FROM friend_challenges c JOIN users u ON u.id = c.challenger_id
      WHERE c.challenger_id = ? OR c.opponent_id = ? ORDER BY c.created_at DESC LIMIT 20`).all(req.user.id, req.user.id);
    res.json({ friends, incoming, outgoing, challenges });
  });

  app.post('/api/friends/request', requireAuth, requireVerified, rateLimit(30, 60000), (req, res) => {
    const d = getDb();
    const target = d.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').toLowerCase().trim());
    if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Aucun compte trouvé avec cet e-mail.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'SELF', message: 'Tu ne peux pas t’ajouter toi-même.' });
    const existing = d.prepare('SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').get(req.user.id, target.id, target.id, req.user.id);
    if (existing) return res.status(409).json({ error: 'EXISTS', message: 'Demande déjà envoyée.' });
    d.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')").run(req.user.id, target.id);
    notifyUser(target.id, 'friend', 'Nouvelle demande d’ami 👥', `${req.user.first_name || 'Un élève'} veut devenir ton ami.`);
    res.status(201).json({ ok: true });
  });

  app.post('/api/friends/accept', requireAuth, (req, res) => {
    const d = getDb();
    const row = d.prepare("SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = 'pending'").get(req.body.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Demande introuvable.' });
    d.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  app.delete('/api/friends/:id', requireAuth, (req, res) => {
    const d = getDb();
    d.prepare('DELETE FROM friendships WHERE id = ? AND (user_id = ? OR friend_id = ?)').run(req.params.id, req.user.id, req.user.id);
    res.json({ ok: true });
  });

  app.post('/api/friends/challenge', requireAuth, (req, res) => {
    const d = getDb();
    const friendId = Number(req.body.friendId);
    const friend = d.prepare('SELECT * FROM users WHERE id = ?').get(friendId);
    if (!friend) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ami introuvable.' });
    const info = d.prepare('INSERT INTO friend_challenges (challenger_id, opponent_id, subject_id, difficulty, questions) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, friendId, req.body.subjectId || null, req.body.difficulty || 'medium', Math.min(20, Math.max(3, Number(req.body.questions) || 5)));
    notifyUser(friendId, 'challenge', 'Défi reçu ⚔️', `${req.user.first_name || 'Un ami'} te défie sur ${req.body.questions || 5} questions.`);
    res.status(201).json({ id: info.lastInsertRowid, link: `/app.html#play?challenge=${info.lastInsertRowid}` });
  });

  // ---------- billing ----------
  app.get('/api/billing/status', requireAuth, (req, res) => {
    res.json(billingStatus(req.user));
  });

  app.get('/api/billing/links', (req, res) => res.json({ links: PAYMENT_LINKS, policy: POLICY }));

  app.post('/api/billing/checkout', requireAuth, requireVerified, rateLimit(10, 60000), async (req, res) => {
    try {
      const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
      const result = await createCheckout(req.user, plan);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: 'STRIPE_ERROR', message: 'Le paiement n’a pas pu être initialisé. Réessaie plus tard.' });
    }
  });

  // Lien de paiement `buy.stripe.com` avec clientreferenceid construit depuis la session serveur.
  app.post('/api/billing/link', requireAuth, requireVerified, rateLimit(10, 60000), (req, res) => {
    const d = getDb();
    const fresh = d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (isPremium(fresh) && ['active', 'trialing'].includes(fresh.subscription_status)) {
      return res.status(409).json({ error: 'ALREADY_SUBSCRIBED', message: 'Tu as déjà un abonnement actif. Gère-le depuis « Mon abonnement ».', status: billingStatus(fresh) });
    }
    const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
    res.json({ url: paymentLinkFor(fresh, plan), plan, userId: fresh.id, paymentLink: true });
  });

  app.post('/api/billing/portal', requireAuth, async (req, res) => {
    try { res.json(await createPortal(req.user, origin(req))); }
    catch { res.status(502).json({ error: 'STRIPE_ERROR', message: 'Impossible d’ouvrir le portail de facturation.' }); }
  });

  // Réconciliation si un webhook a été manqué.
  app.post('/api/billing/sync', requireAuth, async (req, res) => {
    try { res.json(await reconcileWithStripe(req.user)); }
    catch { res.status(502).json({ error: 'STRIPE_ERROR', message: 'Synchronisation avec Stripe impossible pour le moment.' }); }
  });

  app.post('/api/billing/cancel', requireAuth, async (req, res) => {
    try { res.json(await cancelSubscription(req.user)); }
    catch { res.status(502).json({ error: 'STRIPE_ERROR', message: 'Annulation impossible pour le moment.' }); }
  });
  app.post('/api/billing/resume', requireAuth, async (req, res) => {
    try { res.json(await resumeSubscription(req.user)); }
    catch { res.status(502).json({ error: 'STRIPE_ERROR', message: 'Réactivation impossible pour le moment.' }); }
  });
  app.post('/api/billing/downgrade', requireAuth, (req, res) => res.json(downgrade(req.user)));

  // ---------- admin ----------
  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const d = getDb();
    const total = d.prepare('SELECT COUNT(*) AS c FROM users WHERE is_guest = 0').get().c;
    const guests = d.prepare('SELECT COUNT(*) AS c FROM users WHERE is_guest = 1').get().c;
    const premium = d.prepare("SELECT COUNT(*) AS c FROM users WHERE plan = 'premium'").get().c;
    const free = d.prepare("SELECT COUNT(*) AS c FROM users WHERE plan = 'free' AND is_guest = 0").get().c;
    const dau = d.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM quiz_attempts WHERE created_at >= datetime('now','-1 day')").get().c;
    const mau = d.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM quiz_attempts WHERE created_at >= datetime('now','-30 days')").get().c;
    const completions = d.prepare('SELECT COUNT(*) AS c FROM quiz_attempts').get().c;
    const revenue = d.prepare("SELECT COALESCE(SUM(amount_cents),0) AS c FROM payments WHERE status = 'paid'").get().c;
    const conversions = total ? Math.round((premium / total) * 1000) / 10 : 0;
    const avgSession = d.prepare('SELECT COALESCE(AVG(duration),0) AS c FROM quiz_attempts').get().c;
    const adImpressions = d.prepare('SELECT COUNT(*) AS c FROM xp_transactions').get().c * 3; // placeholder metric
    const signups = d.prepare(`SELECT date(created_at) AS day, COUNT(*) AS count FROM users GROUP BY day ORDER BY day DESC LIMIT 14`).all().reverse();
    const revenueByDay = d.prepare(`SELECT date(created_at) AS day, SUM(amount_cents) AS cents FROM payments WHERE status = 'paid' GROUP BY day ORDER BY day DESC LIMIT 14`).all().reverse();
    res.json({
      totalUsers: total, guests, premiumUsers: premium, freeUsers: free, dau, mau, quizCompletions: completions,
      revenueCents: revenue, conversionRate: conversions, avgSessionDuration: Math.round(avgSession), adImpressions,
      signups, revenueByDay,
    });
  });

  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const d = getDb();
    const q = `%${String(req.query.q || '').toLowerCase()}%`;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 25;
    const rows = d.prepare(`SELECT id, email, role, plan, is_guest, is_banned, first_name, xp, streak, subscription_status, payment_issue, created_at
      FROM users WHERE lower(email) LIKE ? OR lower(COALESCE(first_name,'')) LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(q, q, limit, (page - 1) * limit);
    const count = d.prepare('SELECT COUNT(*) AS c FROM users WHERE lower(email) LIKE ? OR lower(COALESCE(first_name,\'\')) LIKE ?').get(q, q).c;
    res.json({ users: rows.map((u) => ({ ...u, is_guest: undefined, isGuest: !!u.is_guest, isBanned: !!u.is_banned, level: levelForXp(u.xp).level })), page, pages: Math.ceil(count / limit) || 1, total: count });
  });

  app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const d = getDb();
    const target = d.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
    const { role, plan, isBanned, subscriptionStatus } = req.body;
    if (isBanned === true && target.id === req.user.id) {
      return res.status(400).json({ error: 'SELF', message: 'Impossible de bannir ton propre compte admin.' });
    }
    d.prepare(`UPDATE users SET role = COALESCE(?, role), plan = COALESCE(?, plan), is_banned = COALESCE(?, is_banned), subscription_status = COALESCE(?, subscription_status) WHERE id = ?`)
      .run(role ?? null, plan ?? null, isBanned === undefined ? null : (isBanned ? 1 : 0), subscriptionStatus ?? null, target.id);
    // Banning/unbanning revokes every existing token so the change is immediate.
    if (isBanned === true || isBanned === false) revokeSessions(target.id);
    auditLog(req.user.id, 'admin_user_update', 'user', target.id, { role: role ?? null, plan: plan ?? null, isBanned: isBanned ?? null });
    res.json({ ok: true });
  });

  app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const d = getDb();
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'SELF', message: 'Impossible de supprimer ton propre compte admin.' });
    d.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    auditLog(req.user.id, 'admin_user_delete', 'user', req.params.id, {});
    res.json({ ok: true });
  });

  app.get('/api/admin/activity', requireAdmin, (req, res) => {
    const d = getDb();
    const attempts = d.prepare(`SELECT a.created_at, a.accuracy, a.score, a.total, u.first_name AS user, q.title AS quiz FROM quiz_attempts a
      LEFT JOIN users u ON u.id = a.user_id LEFT JOIN quizzes q ON q.id = a.quiz_id ORDER BY a.created_at DESC LIMIT 25`).all();
    const games = d.prepare(`SELECT g.created_at, g.game, g.score, u.first_name AS user FROM game_sessions g LEFT JOIN users u ON u.id = g.user_id ORDER BY g.created_at DESC LIMIT 15`).all();
    res.json({ attempts, games });
  });

  app.get('/api/admin/subscriptions', requireAdmin, (req, res) => {
    const d = getDb();
    const subs = d.prepare(`SELECT id, email, plan, subscription_status, trial_ends_at, current_period_end, payment_issue, stripe_customer_id FROM users WHERE plan = 'premium' OR subscription_status IS NOT NULL ORDER BY created_at DESC LIMIT 100`).all();
    const payments = d.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 50').all();
    res.json({ subscriptions: subs, payments });
  });

  app.get('/api/admin/quizzes', requireAdmin, (req, res) => {
    const d = getDb();
    const rows = d.prepare(`SELECT q.*, s.name AS subject FROM quizzes q JOIN subjects s ON s.id = q.subject_id ORDER BY q.id`).all();
    res.json({ quizzes: rows.map((r) => ({ ...r, questionCount: JSON.parse(r.questions || '[]').length, questions: undefined })) });
  });

  app.post('/api/admin/quizzes', requireAdmin, (req, res) => {
    const d = getDb();
    const { subjectId, title, description, difficulty, isPremium, questions } = req.body;
    if (!subjectId || !title) return res.status(400).json({ error: 'BAD_INPUT', message: 'Sujet et titre requis.' });
    const info = d.prepare('INSERT INTO quizzes (subject_id, title, description, type, difficulty, is_premium, questions) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(subjectId, title, description || '', req.body.type || 'qcm', difficulty || 'medium', isPremium ? 1 : 0, JSON.stringify(questions || []));
    res.status(201).json({ id: info.lastInsertRowid });
  });

  app.patch('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
    const d = getDb();
    const { title, description, difficulty, isPremium, active, questions } = req.body;
    d.prepare(`UPDATE quizzes SET title = COALESCE(?, title), description = COALESCE(?, description), difficulty = COALESCE(?, difficulty),
      is_premium = COALESCE(?, is_premium), active = COALESCE(?, active), questions = COALESCE(?, questions) WHERE id = ?`)
      .run(title ?? null, description ?? null, difficulty ?? null, isPremium === undefined ? null : (isPremium ? 1 : 0),
        active === undefined ? null : (active ? 1 : 0), questions ? JSON.stringify(questions) : null, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
    getDb().prepare('UPDATE quizzes SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/admin/ads', requireAdmin, (req, res) => {
    res.json({ ads: getDb().prepare('SELECT * FROM ad_settings ORDER BY id').all() });
  });

  app.patch('/api/admin/ads/:id', requireAdmin, (req, res) => {
    const d = getDb();
    const { enabled, provider, code } = req.body;
    d.prepare('UPDATE ad_settings SET enabled = COALESCE(?, enabled), provider = COALESCE(?, provider), code = COALESCE(?, code), updated_at = datetime(\'now\') WHERE id = ?')
      .run(enabled === undefined ? null : (enabled ? 1 : 0), provider ?? null, code ?? null, req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/admin/reports', requireAdmin, (req, res) => {
    res.json({ reports: getDb().prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 50').all() });
  });

  app.patch('/api/admin/reports/:id', requireAdmin, (req, res) => {
    const status = ['open', 'resolved', 'rejected'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'BAD_STATUS', message: 'Statut inconnu.' });
    const info = getDb().prepare("UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?")
      .run(status, req.user.id, Number(req.params.id));
    if (info.changes === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Signalement introuvable.' });
    auditLog(req.user.id, `report_${status}`, 'report', req.params.id, {});
    res.json({ ok: true, status });
  });

  // ---------- administration des contenus, du support et diagnostics (étape 12) ----------
  app.get('/api/admin/audit', requireAdmin, (req, res) => {
    res.json({ logs: getDb().prepare('SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.created_at, u.email AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 200').all() });
  });

  app.get('/api/admin/diagnostics', requireAdmin, (req, res) => {
    const d = getDb();
    res.json({
      mail: { provider: emailProvider(), configured: emailConfigured() },
      stripe: { secretConfigured: stripeConfigured(), webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET, mode: process.env.STRIPE_MODE || 'both' },
      youtube: { configured: youtubeConfigured() },
      llm: { studyConfigured: !!(process.env.LLM_API_URL && process.env.LLM_API_KEY), videoAiConfigured: !!process.env.VIDEO_AI_API_KEY },
      counts: {
        unverifiedUsers: d.prepare('SELECT COUNT(*) AS c FROM users WHERE email_verified = 0 AND is_guest = 0 AND deleted_at IS NULL').get().c,
        pendingReports: d.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").get().c,
        stripeEvents: d.prepare('SELECT COUNT(*) AS c FROM stripe_events').get().c,
        stripeEventsUnprocessed: d.prepare('SELECT COUNT(*) AS c FROM stripe_events WHERE processed = 0').get().c,
        unpublishedContent: d.prepare("SELECT COUNT(*) AS c FROM quizzes WHERE status != 'published'").get().c,
      },
    });
  });

  app.get('/api/admin/curricula', requireAdmin, (req, res) => {
    const rows = getDb().prepare('SELECT id, country_code, country_label, level, grade, track, domain, label, content_status, school_year, session, source_url, source_checked_at FROM curricula ORDER BY sort_order LIMIT 500').all();
    res.json({ curricula: rows, statuses: ['published', 'partial', 'unavailable'] });
  });

  app.patch('/api/admin/curricula/:id', requireAdmin, (req, res) => {
    const status = ['published', 'partial', 'unavailable'].includes(req.body.contentStatus) ? req.body.contentStatus : null;
    if (!status) return res.status(400).json({ error: 'BAD_STATUS', message: 'Statut de contenu inconnu.' });
    const info = getDb().prepare(`UPDATE curricula SET content_status = ?, school_year = COALESCE(?, school_year), session = COALESCE(?, session),
      source_url = COALESCE(?, source_url), source_checked_at = COALESCE(?, source_checked_at) WHERE id = ?`)
      .run(status, req.body.schoolYear ?? null, req.body.session ?? null, req.body.sourceUrl ?? null, req.body.sourceCheckedAt ?? null, Number(req.params.id));
    if (info.changes === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Programme introuvable.' });
    auditLog(req.user.id, 'curriculum_updated', 'curricula', req.params.id, { contentStatus: status });
    res.json({ ok: true, contentStatus: status });
  });

  // Prévisualisation d'un profil scolaire SANS usurper de compte réel.
  app.post('/api/admin/preview-program', requireAdmin, (req, res) => {
    const country = countryByLabel(req.body.country);
    if (!country) return res.status(400).json({ error: 'BAD_INPUT', message: 'Pays inconnu.' });
    const level = req.body.systemLevel || genericLevelToSystem(req.body.schoolLevel, country.system);
    if (!level) return res.status(400).json({ error: 'BAD_INPUT', message: 'Niveau inconnu.' });
    const row = findCurriculum({ countryCode: country.code, level, grade: req.body.grade || '', track: req.body.track || '', domain: req.body.domain || '' });
    const serialized = serializeCurriculum(row);
    const counts = row ? getDb().prepare("SELECT COUNT(*) AS c FROM quizzes WHERE curriculum_id = ? AND status = 'published'").get(row.id) : { c: 0 };
    res.json({
      curriculum: serialized,
      examTabs: examTabsFor(row || serialized),
      classContentCount: counts.c,
      contentStatus: serialized?.contentStatus || 'unavailable',
      needs: curriculumNeeds({ countryLabel: req.body.country, systemLevel: req.body.systemLevel, schoolLevel: req.body.schoolLevel, grade: req.body.grade, track: req.body.track, domain: req.body.domain, domainDetail: req.body.domainDetail }),
    });
  });

  app.post('/api/reports', requireAuth, (req, res) => {
    const d = getDb();
    const version = Number(req.body.contentVersion) || null;
    d.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, content_version) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, req.body.targetType || 'other', String(req.body.targetId || ''), String(req.body.reason || '').slice(0, 500), version);
    res.status(201).json({ ok: true });
  });

  // ---------- admin : bibliothèque & publication (étape 5) ----------
  app.get('/api/admin/library', requireAdmin, (req, res) => {
    const d = getDb();
    const status = req.query.status ? String(req.query.status) : null;
    const quizSql = `SELECT q.id, 'quiz' AS type, q.title, q.status, q.curriculum_id, q.chapter, q.difficulty, q.objectives, q.prerequisites, q.sources, q.language, q.version, q.content_type, q.country_code, q.level, q.grade, s.slug AS subjectSlug FROM quizzes q JOIN subjects s ON s.id = q.subject_id ${status ? 'WHERE q.status = ?' : ''} ORDER BY q.id DESC LIMIT 300`;
    const cardSql = `SELECT f.id, 'flashcard' AS type, f.deck AS title, f.status, f.curriculum_id, f.chapter, f.difficulty, f.objectives, f.prerequisites, f.sources, f.language, f.version, f.content_type, f.country_code, f.level, f.grade, s.slug AS subjectSlug FROM flashcards f JOIN subjects s ON s.id = f.subject_id ${status ? 'WHERE f.status = ?' : ''} ORDER BY f.id DESC LIMIT 300`;
    const quizzes = status ? d.prepare(quizSql).all(status) : d.prepare(quizSql).all();
    const flashcards = status ? d.prepare(cardSql).all(status) : d.prepare(cardSql).all();
    res.json({ resources: [...quizzes, ...flashcards].map((r) => ({ ...r, ...resourceMetadata(r) })), statuses: CONTENT_STATUSES });
  });

  app.post('/api/admin/library', requireAdmin, (req, res) => {
    const d = getDb();
    const type = req.body.type === 'flashcard' ? 'flashcard' : 'quiz';
    const status = CONTENT_STATUSES.includes(req.body.status) ? req.body.status : 'draft';
    if (status === 'published') {
      const errors = validateResource(type, req.body);
      if (errors.length) return res.status(422).json({ error: 'VALIDATION_FAILED', message: `Contenu non publiable : ${errors[0]}`, errors });
    }
    const subjectId = Number(req.body.subjectId) || null;
    const curriculumId = req.body.curriculumId ? Number(req.body.curriculumId) : null;
    const objectives = JSON.stringify(parseJsonArr(req.body.objectives));
    const prerequisites = JSON.stringify(parseJsonArr(req.body.prerequisites));
    const sources = JSON.stringify(parseJsonArr(req.body.sources));
    if (type === 'quiz') {
      if (!subjectId || !req.body.title) return res.status(400).json({ error: 'BAD_INPUT', message: 'Sujet et titre requis.' });
      const info = d.prepare(`INSERT INTO quizzes (subject_id, title, description, type, difficulty, is_premium, questions, curriculum_id, status, language, chapter, objectives, prerequisites, version, sources, country_code, level, grade, content_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(subjectId, req.body.title, req.body.description || '', req.body.type || 'qcm', req.body.difficulty || 'medium', req.body.isPremium ? 1 : 0,
          JSON.stringify(parseJsonArr(req.body.questions)), curriculumId, status, req.body.language || 'fr', req.body.chapter || '',
          objectives, prerequisites, Number(req.body.version) || 1, sources, req.body.countryCode || null, req.body.level || null, req.body.grade || null, req.body.contentType || 'original');
      return res.status(201).json({ id: info.lastInsertRowid, type, status });
    }
    if (!subjectId || !req.body.deck || !req.body.front || !req.body.back) return res.status(400).json({ error: 'BAD_INPUT', message: 'Sujet, paquet, recto et verso requis.' });
    const info = d.prepare(`INSERT INTO flashcards (subject_id, deck, front, back, is_premium, curriculum_id, status, language, chapter, objectives, prerequisites, version, sources, country_code, level, grade, content_type, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(subjectId, req.body.deck, req.body.front, req.body.back, req.body.isPremium ? 1 : 0, curriculumId, status, req.body.language || 'fr',
        req.body.chapter || '', objectives, prerequisites, Number(req.body.version) || 1, sources, req.body.countryCode || null,
        req.body.level || null, req.body.grade || null, req.body.contentType || 'original', req.body.difficulty || 'easy');
    res.status(201).json({ id: info.lastInsertRowid, type, status });
  });

  app.patch('/api/admin/library/:type/:id', requireAdmin, (req, res) => {
    const d = getDb();
    const type = req.params.type === 'flashcard' ? 'flashcard' : 'quiz';
    const table = type === 'quiz' ? 'quizzes' : 'flashcards';
    const row = d.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ressource introuvable.' });
    const status = req.body.status !== undefined ? req.body.status : row.status;
    if (!CONTENT_STATUSES.includes(status)) return res.status(400).json({ error: 'BAD_STATUS', message: 'Statut inconnu.' });
    // On valide l'état fusionné (existant + modifications) avant d'autoriser la publication.
    const merged = {
      ...row,
      chapter: req.body.chapter !== undefined ? req.body.chapter : row.chapter,
      objectives: req.body.objectives !== undefined ? req.body.objectives : row.objectives,
      prerequisites: req.body.prerequisites !== undefined ? req.body.prerequisites : row.prerequisites,
      sources: req.body.sources !== undefined ? req.body.sources : row.sources,
      questions: req.body.questions !== undefined ? req.body.questions : row.questions,
      status,
    };
    if (status === 'published') {
      const errors = validateResource(type, merged);
      if (errors.length) return res.status(422).json({ error: 'VALIDATION_FAILED', message: `Contenu non publiable : ${errors[0]}`, errors });
    }
    const touched = ['objectives', 'prerequisites', 'sources', 'chapter', 'questions'].some((k) => req.body[k] !== undefined);
    const version = Number(req.body.version) || (touched ? (row.version || 1) + 1 : row.version || 1);
    d.prepare(`UPDATE ${table} SET status = ?, chapter = COALESCE(?, chapter), objectives = COALESCE(?, objectives),
      prerequisites = COALESCE(?, prerequisites), sources = COALESCE(?, sources), language = COALESCE(?, language),
      version = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status,
        req.body.chapter ?? null,
        req.body.objectives !== undefined ? JSON.stringify(parseJsonArr(req.body.objectives)) : null,
        req.body.prerequisites !== undefined ? JSON.stringify(parseJsonArr(req.body.prerequisites)) : null,
        req.body.sources !== undefined ? JSON.stringify(parseJsonArr(req.body.sources)) : null,
        req.body.language ?? null, version, row.id);
    if (type === 'quiz' && req.body.questions !== undefined) {
      d.prepare('UPDATE quizzes SET questions = ? WHERE id = ?').run(JSON.stringify(parseJsonArr(req.body.questions)), row.id);
    }
    auditLog(req.user.id, status === 'published' ? 'content_published' : 'content_status_changed', type, row.id, { status, version });
    res.json({ ok: true, status, version });
  });

  // ---------- static ----------
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const idx = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(idx)) return res.sendFile(idx);
    next();
  });

  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Page introuvable.' }));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Une erreur est survenue. Réessaie.' });
  });

  return app;
}
