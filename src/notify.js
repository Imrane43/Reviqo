/**
 * Notifications respectueuses de l'utilisateur.
 * - Les préférences par type sont respectées (désactiver un type = plus de notification).
 * - Les « heures silencieuses » sont respectées (fuseau UTC).
 * - Aucun mécanisme culpabilisant : les libellés restent neutres.
 * - Les notifications transactionnelles (facturation) peuvent être marquées urgentes.
 */
import { getDb } from './db.js';

const PREF_BY_TYPE = {
  friend: 'friend', challenge: 'friend', team: 'friend',
  achievement: 'achievement', streak: 'streak', daily: 'daily',
  billing: 'billing', news: 'news',
};

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Heures silencieuses : fenêtre [start, end] en UTC ; gère le passage de minuit. */
export function inQuietHours(user, now = new Date()) {
  const start = toMinutes(user?.quiet_start);
  const end = toMinutes(user?.quiet_end);
  if (start == null || end == null || start === end) return false;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

export function notifyUser(userId, type, title, body, { urgent = false } = {}) {
  const d = getDb();
  const u = d.prepare('SELECT notify_prefs, quiet_start, quiet_end FROM users WHERE id = ?').get(userId);
  if (!u) return false;
  let prefs = {};
  try { prefs = JSON.parse(u.notify_prefs || '{}'); } catch { prefs = {}; }
  const prefKey = PREF_BY_TYPE[type] || type;
  if (!urgent && prefs[prefKey] === false) return false;
  if (!urgent && inQuietHours(u)) return false;
  d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)").run(userId, type, title, body || null);
  return true;
}
