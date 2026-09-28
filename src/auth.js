import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, addXp, levelForXp } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'reviqo_token';

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function checkPassword(pw, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(pw, hash);
}

export function signToken(user) {
  // token_version lets us revoke every existing session (ban, password reset).
  return jwt.sign({ id: user.id, role: user.role, tv: user.token_version || 0 }, JWT_SECRET, { expiresIn: '30d' });
}

export function revokeSessions(userId) {
  getDb().prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}

/* ---------- identity: email & pseudo normalisation ---------- */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
export function normalizeUsername(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}
export function usernameKey(name) {
  return normalizeUsername(name).toLowerCase();
}

const USERNAME_RE = /^[\p{L}\p{N} ._-]+$/u;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrateur', 'administrator', 'support', 'reviqo', 'moderateur', 'modérateur', 'moderator',
  'staff', 'root', 'system', 'système', 'official', 'officiel', 'help', 'aide', 'service',
  'equipe', 'équipe', 'bot', 'null', 'undefined', 'anonymous', 'anonyme', 'owner', 'proprietaire',
]);

export function validateUsername(raw) {
  const display = normalizeUsername(raw);
  if (display.length < 3 || display.length > 30) {
    return { error: 'BAD_USERNAME', message: 'Le pseudo doit contenir entre 3 et 30 caractères.' };
  }
  if (!USERNAME_RE.test(display)) {
    return { error: 'BAD_USERNAME', message: 'Le pseudo ne peut contenir que des lettres, chiffres, espaces et . _ -' };
  }
  const key = usernameKey(display);
  if (RESERVED_USERNAMES.has(key)) {
    return { error: 'USERNAME_RESERVED', message: 'Ce pseudo est réservé.' };
  }
  return { username: display, key };
}

export function isUsernameTaken(key, exceptUserId = null) {
  const row = getDb().prepare('SELECT id FROM users WHERE username_norm = ?').get(key);
  return !!row && row.id !== exceptUserId;
}

export function isEmailTaken(canon, exceptUserId = null) {
  const row = getDb().prepare('SELECT id FROM users WHERE email_canon = ?').get(canon);
  return !!row && row.id !== exceptUserId;
}

export function setAuthCookie(res, user) {
  res.cookie(COOKIE, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function publicUser(u) {
  const lvl = levelForXp(u.xp || 0);
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    plan: u.plan,
    isGuest: !!u.is_guest,
    isBanned: !!u.is_banned,
    firstName: u.first_name,
    username: u.username || null,
    schoolLevel: u.school_level,
    country: u.country,
    subjects: u.subjects ? JSON.parse(u.subjects) : [],
    goal: u.goal,
    system: u.system || null,
    systemLevel: u.system_level || null,
    grade: u.grade || null,
    track: u.track || null,
    domain: u.domain || null,
    domainDetail: u.domain_detail || null,
    specialties: u.specialties ? JSON.parse(u.specialties) : [],
    learningLanguage: u.learning_language || null,
    examSession: u.exam_session || null,
    schoolYear: u.school_year || null,
    examDate: u.exam_date || null,
    curriculumId: u.curriculum_id || null,
    onboardingDone: !!u.onboarding_done,
    avatar: u.avatar || (u.first_name ? u.first_name[0].toUpperCase() : 'R'),
    xp: u.xp,
    level: lvl.level,
    levelStart: lvl.levelStart,
    nextXp: lvl.nextXp,
    streak: u.streak,
    longestStreak: u.longest_streak,
    studyTime: u.study_time,
    bestScore: u.best_score,
    emailVerified: !!u.email_verified,
    adConsent: !!u.ad_consent,
    subscriptionStatus: u.subscription_status,
    trialEndsAt: u.trial_ends_at,
    currentPeriodEnd: u.current_period_end,
    paymentIssue: !!u.payment_issue,
    notifyPrefs: u.notify_prefs ? JSON.parse(u.notify_prefs) : null,
    coachProvider: u.coach_provider || null,
    coachModel: u.coach_model || null,
    coachKeySet: !!u.coach_api_key,
    createdAt: u.created_at,
  };
}

export function getUserFromReq(req) {
  const token = req.cookies?.[COOKIE] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return null;
    // Reject tokens issued before the last revocation (ban, password reset).
    if ((payload.tv || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Connecte-toi pour continuer.' });
  if (user.is_banned) return res.status(403).json({ error: 'BANNED', message: 'Ce compte a été suspendu.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Connecte-toi pour continuer.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès réservé à l’administration.' });
  req.user = user;
  next();
}

export function isPremium(u) {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.plan !== 'premium') return false;
  const status = u.subscription_status;
  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due') {
    // Impayé : accès conservé pendant le délai de grâce (politique explicite).
    const graceDays = Number(process.env.BILLING_GRACE_DAYS || 3);
    if (!u.current_period_end) return true;
    return Date.now() < new Date(u.current_period_end).getTime() + graceDays * 86400000;
  }
  if (status === 'canceled') {
    // Résiliation en fin de période : accès conservé jusqu'à l'échéance payée.
    if (!u.current_period_end) return false;
    return Date.now() < new Date(u.current_period_end).getTime();
  }
  return false;
}

export function touchStreak(user) {
  const d = getDb();
  const today = new Date().toISOString().slice(0, 10);
  if (user.last_active_date === today) return { streak: user.streak, bonus: 0 };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let streak = user.streak || 0;
  let bonus = 0;
  if (user.last_active_date === yesterday) {
    streak += 1;
  } else if (user.last_active_date !== today) {
    streak = 1;
  }
  const longest = Math.max(user.longest_streak || 0, streak);
  d.prepare('UPDATE users SET streak = ?, longest_streak = ?, last_active_date = ? WHERE id = ?').run(streak, longest, today, user.id);
  if (streak > 0 && streak % 7 === 0) {
    bonus = 150;
    addXp(user.id, bonus, 'streak', `streak:${user.id}:${today}`);
  } else if (streak > 1) {
    bonus = 10;
    addXp(user.id, bonus, 'streak', `streak:${user.id}:${today}`);
  }
  user.streak = streak;
  user.longest_streak = longest;
  user.last_active_date = today;
  return { streak, bonus };
}

export function createGuest() {
  const d = getDb();
  const email = `guest_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}@guest.reviqo.app`;
  const info = d.prepare(`INSERT INTO users (email, email_canon, password_hash, role, plan, is_guest, email_verified, first_name, onboarding_done)
    VALUES (?, ?, NULL, 'user', 'free', 1, 1, ?, 0)`).run(email, email, 'Invité');
  return d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Google credentials can be supplied either as the two separate env vars
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) or as one pasted OAuth client JSON
 * in GOOGLE_OAUTH_CLIENT_JSON ({"web":{"client_id":...,"client_secret":...}}).
 */
export function googleCreds() {
  const jsonVar = process.env.GOOGLE_OAUTH_CLIENT_JSON;
  if (jsonVar) {
    try {
      const parsed = JSON.parse(jsonVar);
      const cfg = parsed.web || parsed.installed || parsed;
      if (cfg.client_id && cfg.client_secret) return { id: cfg.client_id, secret: cfg.client_secret };
    } catch {
      const parts = jsonVar.split(/[\s|,]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return { id: parts[0], secret: parts[1] };
    }
  }
  return { id: process.env.GOOGLE_CLIENT_ID || '', secret: process.env.GOOGLE_CLIENT_SECRET || '' };
}

export const GOOGLE = {
  get configured() {
    const c = googleCreds();
    return !!(c.id && c.secret);
  },
  authUrl(redirectUri) {
    const params = new URLSearchParams({
      client_id: googleCreds().id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
  async exchange(code, redirectUri) {
    const c = googleCreds();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.id,
        client_secret: c.secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error('Google token exchange failed');
    return res.json();
  },
  async profile(accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Google profile fetch failed');
    return res.json();
  },
};

export function findOrCreateGoogleUser(profile) {
  const d = getDb();
  let user = d.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(profile.sub, profile.email);
  if (user) {
    d.prepare(`UPDATE users SET google_id = COALESCE(google_id, ?), email_verified = 1,
      email_canon = COALESCE(email_canon, lower(trim(email))) WHERE id = ?`).run(profile.sub, user.id);
    return d.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  const email = normalizeEmail(profile.email);
  const info = d.prepare(`INSERT INTO users (email, email_canon, google_id, role, plan, email_verified, first_name, onboarding_done, ad_consent)
    VALUES (?, ?, ?, 'user', 'free', 1, ?, 0, 1)`)
    .run(email, email, profile.sub, profile.given_name || profile.name || 'Étudiant');
  return d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function hashResetToken(token) {
  return crypto.createHmac('sha256', process.env.RESET_SECRET || JWT_SECRET).update(String(token)).digest('hex');
}

export function createResetToken(email) {
  const d = getDb();
  const user = d.prepare('SELECT * FROM users WHERE email_canon = ?').get(normalizeEmail(email));
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600 * 1000).toISOString();
  // Store only the HMAC of the token, never the raw value.
  d.prepare('UPDATE users SET reset_hash = ?, reset_token = NULL, reset_expires = ? WHERE id = ?')
    .run(hashResetToken(token), expires, user.id);
  return { token, user };
}

export function resetPassword(token, password) {
  const d = getDb();
  const hash = hashResetToken(token);
  const user = d.prepare('SELECT * FROM users WHERE reset_hash = ?').get(hash);
  if (!user) return { error: 'INVALID_TOKEN' };
  if (!user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) return { error: 'EXPIRED' };
  // Single-use + revoke all existing sessions.
  const info = d.prepare(`UPDATE users SET password_hash = ?, reset_hash = NULL, reset_expires = NULL, email_verified = 1,
    token_version = token_version + 1 WHERE id = ? AND reset_hash = ?`).run(hashPassword(password), user.id, hash);
  if (info.changes !== 1) return { error: 'INVALID_TOKEN' };
  return { user: d.prepare('SELECT * FROM users WHERE id = ?').get(user.id) };
}

export { COOKIE };
