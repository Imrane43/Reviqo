/**
 * Équipes de révision.
 *
 * - Création, adhésion par code d'invitation SECURISÉ, révocable, limité en
 *   temps et/ou en usages.
 * - Rôles `admin` / `member` : TOUTES les permissions sont vérifiées côté serveur.
 *   Un admin d'équipe n'est pas un admin de plateforme.
 * - XP collectif : alimenté par des ÉVÉNEMENTS UNIQUES (`team_xp_events.ref`
 *   unique) — jamais par un compteur modifiable par le client.
 * - Classement inter-équipes par LIGUE DE TAILLE (score normalisé par membre).
 * - Objectif hebdomadaire + historique, fil d'activité respectueux de la vie privée.
 * - Défis entre équipes : proposition / acceptation / refus, score serveur,
 *   égalités traitées de façon déterministe, finalisation idempotente.
 */
import crypto from 'node:crypto';
import { getDb, onXpGranted } from './db.js';

export const LEAGUES = {
  small: { label: 'Petite (≤ 5 membres)', max: 5 },
  medium: { label: 'Moyenne (6 à 15 membres)', max: 15 },
  large: { label: 'Grande (16+ membres)', max: Infinity },
};
export const CHALLENGE_STATUSES = ['pending', 'accepted', 'declined', 'completed', 'expired'];

const fail = (status, error, message) => ({ error, status, message });

/** Début de semaine (lundi) en UTC — période calculée côté serveur. */
export function weekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export function leagueForSize(n) {
  if (n <= LEAGUES.small.max) return 'small';
  if (n <= LEAGUES.medium.max) return 'medium';
  return 'large';
}

function normalizeName(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function genCode() {
  return crypto.randomBytes(9).toString('base64url');
}

/** Date au format SQLite (UTC, sans T/Z) pour des comparaisons de chaînes fiables. */
function sqlDatetime(msFromNow = 0) {
  return new Date(Date.now() + msFromNow).toISOString().slice(0, 19).replace('T', ' ');
}
function parseSql(s) {
  if (!s) return null;
  return new Date(String(s).replace(' ', 'T') + 'Z').getTime();
}

/* ------------------------------ helpers ------------------------------ */

export function membership(userId) {
  return getDb().prepare('SELECT * FROM team_members WHERE user_id = ?').get(userId) || null;
}
export function memberCount(teamId) {
  return getDb().prepare('SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?').get(teamId).c;
}
export function adminCount(teamId) {
  return getDb().prepare("SELECT COUNT(*) AS c FROM team_members WHERE team_id = ? AND role = 'admin'").get(teamId).c;
}
export function isTeamAdmin(teamId, userId) {
  const m = getDb().prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
  return !!m && m.role === 'admin';
}
function getTeam(teamId) {
  return getDb().prepare('SELECT * FROM teams WHERE id = ? AND archived = 0').get(teamId) || null;
}
function logActivity(teamId, actorId, type, body) {
  getDb().prepare('INSERT INTO team_activity (team_id, actor_id, type, body) VALUES (?, ?, ?, ?)').run(teamId, actorId || null, type, body || null);
}

export function weeklyProgress(teamId, week = weekStart()) {
  return getDb().prepare('SELECT COALESCE(SUM(amount),0) AS xp FROM team_xp_events WHERE team_id = ? AND week = ?').get(teamId, week).xp;
}
function ensureGoal(teamId, week) {
  const d = getDb();
  const existing = d.prepare('SELECT target FROM team_goals WHERE team_id = ? AND week = ?').get(teamId, week);
  if (existing) return existing.target;
  const team = d.prepare('SELECT weekly_goal FROM teams WHERE id = ?').get(teamId);
  const target = team?.weekly_goal || 3000;
  d.prepare('INSERT OR IGNORE INTO team_goals (team_id, week, target) VALUES (?, ?, ?)').run(teamId, week, target);
  return target;
}

/** XP collectif : idempotent via `ref`, jamais piloté par le client. */
export function recordTeamXp(userId, amount, ref) {
  if (!amount || amount <= 0) return;
  const d = getDb();
  const m = membership(userId);
  if (!m) return;
  const week = weekStart();
  const eventRef = ref ? `team:${ref}` : `team:${userId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
  const info = d.prepare('INSERT OR IGNORE INTO team_xp_events (ref, team_id, user_id, amount, week) VALUES (?, ?, ?, ?, ?)')
    .run(eventRef, m.team_id, userId, amount, week);
  if (info.changes === 0) return;
  const target = ensureGoal(m.team_id, week);
  const progress = weeklyProgress(m.team_id, week);
  if (target && progress >= target) {
    const already = d.prepare("SELECT id FROM team_activity WHERE team_id = ? AND type = 'goal_reached' AND body LIKE ?").get(m.team_id, `%${week}%`);
    if (!already) logActivity(m.team_id, null, 'goal_reached', `Objectif hebdomadaire atteint (${week}) 🎯`);
  }
}
onXpGranted((userId, amount, _reason, ref) => recordTeamXp(userId, amount, ref));

/* ------------------------------ création ------------------------------ */

export function createTeam(user, { name, description, avatar, weeklyGoal } = {}) {
  const d = getDb();
  if (membership(user.id)) return fail(409, 'ALREADY_IN_TEAM', 'Tu fais déjà partie d’une équipe.');
  const display = String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (display.length < 3 || display.length > 40) return fail(400, 'BAD_NAME', 'Le nom de l’équipe doit contenir entre 3 et 40 caractères.');
  const norm = normalizeName(display);
  if (d.prepare('SELECT id FROM teams WHERE name_norm = ?').get(norm)) return fail(409, 'NAME_TAKEN', 'Ce nom d’équipe est déjà pris.');
  const goal = Number(weeklyGoal);
  const target = Number.isFinite(goal) && goal >= 100 && goal <= 500000 ? Math.round(goal) : 3000;
  const info = d.prepare('INSERT INTO teams (name, name_norm, description, avatar, owner_id, weekly_goal) VALUES (?, ?, ?, ?, ?, ?)')
    .run(display, norm, String(description || '').slice(0, 300), avatar ? String(avatar).slice(0, 8) : null, user.id, target);
  const teamId = info.lastInsertRowid;
  d.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'admin')").run(teamId, user.id);
  ensureGoal(teamId, weekStart());
  logActivity(teamId, user.id, 'team_created', `Équipe « ${display} » créée`);
  const invite = createInvite(user, teamId);
  return { team: teamPublic(getTeam(teamId), 1), invite };
}

function teamPublic(team, count) {
  if (!team) return null;
  return {
    id: team.id, name: team.name, description: team.description || null, avatar: team.avatar || null,
    weeklyGoal: team.weekly_goal, memberCount: count, league: leagueForSize(count),
    created_at: team.created_at,
  };
}

/* ------------------------------ invitations ------------------------------ */

export function listInvites(teamId) {
  return getDb().prepare('SELECT id, code, expires_at, max_uses, uses, revoked, created_at FROM team_invites WHERE team_id = ? ORDER BY id DESC LIMIT 50').all(teamId);
}

export function createInvite(actor, teamId, { expiresInHours, maxUses } = {}) {
  if (!isTeamAdmin(teamId, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut créer une invitation.');
  const d = getDb();
  const hours = Number(expiresInHours);
  const expires = Number.isFinite(hours) && hours > 0 && hours <= 24 * 90 ? new Date(Date.now() + hours * 3600000).toISOString() : null;
  const max = Number(maxUses);
  const maxUsesValue = Number.isFinite(max) && max > 0 && max <= 500 ? Math.round(max) : null;
  let code;
  for (let i = 0; i < 5; i++) {
    code = genCode();
    if (!d.prepare('SELECT id FROM team_invites WHERE code = ?').get(code)) break;
  }
  const info = d.prepare('INSERT INTO team_invites (team_id, code, created_by, expires_at, max_uses) VALUES (?, ?, ?, ?, ?)')
    .run(teamId, code, actor.id, expires, maxUsesValue);
  return { id: info.lastInsertRowid, code, expiresAt: expires, maxUses: maxUsesValue, uses: 0, link: `/app.html#friends?join=${code}` };
}

export function revokeInvite(actor, inviteId) {
  const d = getDb();
  const invite = d.prepare('SELECT * FROM team_invites WHERE id = ?').get(inviteId);
  if (!invite) return fail(404, 'NOT_FOUND', 'Invitation introuvable.');
  if (!isTeamAdmin(invite.team_id, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut révoquer une invitation.');
  d.prepare('UPDATE team_invites SET revoked = 1 WHERE id = ?').run(inviteId);
  return { ok: true, id: inviteId, revoked: true };
}

const joinAttempts = new Map();
function joinRateLimited(userId) {
  const now = Date.now();
  const entry = joinAttempts.get(userId) || { count: 0, reset: now + 600000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 600000; }
  entry.count += 1;
  joinAttempts.set(userId, entry);
  return entry.count > 10;
}

export function joinByCode(user, code) {
  const d = getDb();
  if (joinRateLimited(user.id)) return fail(429, 'RATE_LIMITED', 'Trop de tentatives. Réessaie plus tard.');
  if (membership(user.id)) return fail(409, 'ALREADY_IN_TEAM', 'Tu fais déjà partie d’une équipe.');
  const invite = d.prepare('SELECT * FROM team_invites WHERE code = ?').get(String(code || '').trim());
  if (!invite || invite.revoked) return fail(404, 'INVALID_INVITE', 'Invitation invalide ou révoquée.');
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return fail(410, 'EXPIRED_INVITE', 'Cette invitation a expiré.');
  if (invite.max_uses && invite.uses >= invite.max_uses) return fail(410, 'INVITE_EXHAUSTED', 'Cette invitation a atteint sa limite d’utilisations.');
  const team = getTeam(invite.team_id);
  if (!team) return fail(404, 'INVALID_INVITE', 'Invitation invalide.');
  d.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, \'member\')').run(team.id, user.id);
  d.prepare('UPDATE team_invites SET uses = uses + 1 WHERE id = ?').run(invite.id);
  logActivity(team.id, user.id, 'member_joined', `${user.first_name || 'Un élève'} a rejoint l’équipe`);
  return { ok: true, team: teamPublic(team, memberCount(team.id)) };
}

/* ------------------------------ membres / rôles ------------------------------ */

export function removeMember(actor, teamId, targetUserId) {
  const d = getDb();
  if (!isTeamAdmin(teamId, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut exclure un membre.');
  const target = d.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, targetUserId);
  if (!target) return fail(404, 'NOT_FOUND', 'Membre introuvable.');
  if (target.role === 'admin' && adminCount(teamId) <= 1) return fail(400, 'LAST_ADMIN', 'Impossible de retirer le dernier administrateur sans transfert.');
  d.prepare('DELETE FROM team_members WHERE id = ?').run(target.id);
  logActivity(teamId, actor.id, 'member_removed', 'Un membre a été exclu');
  return { ok: true };
}

export function setRole(actor, teamId, targetUserId, role) {
  const d = getDb();
  if (!['admin', 'member'].includes(role)) return fail(400, 'BAD_ROLE', 'Rôle inconnu.');
  if (!isTeamAdmin(teamId, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut changer un rôle.');
  const target = d.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, targetUserId);
  if (!target) return fail(404, 'NOT_FOUND', 'Membre introuvable.');
  if (role === 'member' && target.role === 'admin' && adminCount(teamId) <= 1) {
    return fail(400, 'LAST_ADMIN', 'Impossible de rétrograder le dernier administrateur.');
  }
  d.prepare('UPDATE team_members SET role = ? WHERE id = ?').run(role, target.id);
  logActivity(teamId, actor.id, role === 'admin' ? 'member_promoted' : 'member_demoted', role === 'admin' ? 'Un membre est devenu administrateur' : 'Un administrateur est redevenu membre');
  return { ok: true, role };
}

export function leaveTeam(user) {
  const d = getDb();
  const m = membership(user.id);
  if (!m) return fail(404, 'NOT_FOUND', 'Tu n’es dans aucune équipe.');
  if (m.role === 'admin' && adminCount(m.team_id) <= 1) {
    return fail(400, 'LAST_ADMIN', 'Transfère le rôle d’administrateur à un autre membre avant de quitter.');
  }
  d.prepare('DELETE FROM team_members WHERE id = ?').run(m.id);
  logActivity(m.team_id, user.id, 'member_left', `${user.first_name || 'Un élève'} a quitté l’équipe`);
  return { ok: true };
}

export function updateTeam(actor, teamId, patch = {}) {
  const d = getDb();
  if (!isTeamAdmin(teamId, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut modifier l’équipe.');
  const goalRaw = Number(patch.weeklyGoal);
  const goal = Number.isFinite(goalRaw) && goalRaw >= 100 && goalRaw <= 500000 ? Math.round(goalRaw) : null;
  d.prepare(`UPDATE teams SET description = COALESCE(?, description), avatar = COALESCE(?, avatar), weekly_goal = COALESCE(?, weekly_goal) WHERE id = ?`)
    .run(patch.description !== undefined ? String(patch.description).slice(0, 300) : null,
      patch.avatar !== undefined ? String(patch.avatar).slice(0, 8) : null, goal, teamId);
  if (goal) d.prepare('INSERT OR IGNORE INTO team_goals (team_id, week, target) VALUES (?, ?, ?)').run(teamId, weekStart(), goal);
  logActivity(teamId, actor.id, 'team_updated', 'Les paramètres de l’équipe ont été mis à jour');
  return { ok: true };
}

export function deleteTeam(actor, teamId) {
  const d = getDb();
  const team = getTeam(teamId);
  if (!team) return fail(404, 'NOT_FOUND', 'Équipe introuvable.');
  if (team.owner_id !== actor.id) return fail(403, 'FORBIDDEN', 'Seul le créateur de l’équipe peut la supprimer.');
  d.prepare('UPDATE teams SET archived = 1 WHERE id = ?').run(teamId);
  d.prepare('DELETE FROM team_members WHERE team_id = ?').run(teamId);
  return { ok: true, archived: true };
}

/* ------------------------------ lecture ------------------------------ */

export function teamDetail(user, teamId) {
  const d = getDb();
  const m = membership(user.id);
  if (!m || m.team_id !== Number(teamId)) return fail(403, 'FORBIDDEN', 'Tu n’es pas membre de cette équipe.');
  const team = getTeam(m.team_id);
  if (!team) return fail(404, 'NOT_FOUND', 'Équipe introuvable.');
  const week = weekStart();
  const target = ensureGoal(team.id, week);
  const progress = weeklyProgress(team.id, week);
  const members = d.prepare(`SELECT u.id, u.first_name AS name, u.username, u.avatar, u.xp, tm.role, tm.joined_at
    FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? ORDER BY u.xp DESC, u.id ASC`).all(team.id);
  const activity = d.prepare('SELECT id, actor_id, type, body, created_at FROM team_activity WHERE team_id = ? ORDER BY id DESC LIMIT 30').all(team.id);
  return {
    team: teamPublic(team, members.length),
    myRole: m.role,
    week,
    goal: { target, progress, percent: target ? Math.min(100, Math.round((progress / target) * 100)) : 0 },
    members: members.map((x, i) => ({ id: x.id, name: x.name, username: x.username || null, avatar: x.avatar, xp: x.xp, role: x.role, rank: i + 1 })),
    activity,
  };
}

export function goalHistory(user, teamId, weeks = 8) {
  const m = membership(user.id);
  if (!m || m.team_id !== Number(teamId)) return fail(403, 'FORBIDDEN', 'Tu n’es pas membre de cette équipe.');
  const d = getDb();
  const rows = d.prepare('SELECT week, target FROM team_goals WHERE team_id = ? ORDER BY week DESC LIMIT ?').all(m.team_id, Math.min(52, Math.max(1, weeks)));
  return { history: rows.map((r) => ({ week: r.week, target: r.target, progress: weeklyProgress(m.team_id, r.week) })) };
}

export function activityFeed(user, teamId, limit = 30) {
  const m = membership(user.id);
  if (!m || m.team_id !== Number(teamId)) return fail(403, 'FORBIDDEN', 'Tu n’es pas membre de cette équipe.');
  const rows = getDb().prepare('SELECT id, actor_id, type, body, created_at FROM team_activity WHERE team_id = ? ORDER BY id DESC LIMIT ?').all(m.team_id, Math.min(50, Math.max(1, limit)));
  return { activity: rows };
}

/* ------------------------------ classement & ligue ------------------------------ */

export function teamsLeaderboard({ league = null, page = 1, limit = 20 } = {}) {
  const d = getDb();
  const week = weekStart();
  const rows = d.prepare(`SELECT t.id, t.name, t.avatar, t.weekly_goal,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS memberCount,
      COALESCE((SELECT SUM(e.amount) FROM team_xp_events e WHERE e.team_id = t.id AND e.week = ?), 0) AS weeklyXp
    FROM teams t WHERE t.archived = 0`).all(week);
  const enriched = rows.map((r) => {
    const count = r.memberCount || 0;
    return {
      id: r.id, name: r.name, avatar: r.avatar || null, memberCount: count,
      weeklyXp: Number(r.weeklyXp) || 0,
      // Score normalisé : évite l'avantage mécanique des grandes équipes.
      perMember: count ? Math.round((Number(r.weeklyXp) || 0) / count) : 0,
      league: leagueForSize(count),
      weeklyGoal: r.weekly_goal,
    };
  });
  const filtered = league ? enriched.filter((t) => t.league === league) : enriched;
  // Départage déterministe : XP hebdo, puis score par membre, puis id.
  filtered.sort((a, b) => b.weeklyXp - a.weeklyXp || b.perMember - a.perMember || a.id - b.id);
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * l;
  const slice = filtered.slice(offset, offset + l).map((t, i) => ({ ...t, rank: offset + i + 1 }));
  return {
    week, metric: 'weeklyXp (total) et perMember (normalisé)', league: league || null, leagues: LEAGUES,
    page: p, limit: l, pages: Math.max(1, Math.ceil(filtered.length / l)), total: filtered.length,
    leaderboard: slice,
  };
}

/* ------------------------------ défis entre équipes ------------------------------ */

export function proposeChallenge(actor, { opponentTeamId, subjectId, difficulty, questions, deadlineHours } = {}) {
  const d = getDb();
  const m = membership(actor.id);
  if (!m) return fail(403, 'FORBIDDEN', 'Tu dois être dans une équipe pour lancer un défi.');
  if (!isTeamAdmin(m.team_id, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut lancer un défi.');
  const opponent = Number(opponentTeamId);
  if (!opponent || opponent === m.team_id) return fail(400, 'BAD_OPPONENT', 'Choisis une autre équipe.');
  if (!getTeam(opponent)) return fail(404, 'NOT_FOUND', 'Équipe adverse introuvable.');
  const hours = Number(deadlineHours);
  const deadline = Number.isFinite(hours) && hours > 0 && hours <= 24 * 30 ? sqlDatetime(hours * 3600000) : sqlDatetime(24 * 3600000);
  const q = Math.min(20, Math.max(3, Number(questions) || 5));
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const info = d.prepare(`INSERT INTO team_challenges (challenger_team_id, opponent_team_id, subject_id, difficulty, questions, deadline, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(m.team_id, opponent, Number(subjectId) || null, diff, q, deadline, actor.id);
  logActivity(m.team_id, actor.id, 'challenge_sent', 'Un défi a été lancé à une autre équipe ⚔️');
  logActivity(opponent, actor.id, 'challenge_received', 'Une équipe vous a défiés ⚔️');
  return { ok: true, id: info.lastInsertRowid, deadline, status: 'pending' };
}

export function respondChallenge(actor, challengeId, action) {
  const d = getDb();
  const ch = d.prepare('SELECT * FROM team_challenges WHERE id = ?').get(challengeId);
  if (!ch) return fail(404, 'NOT_FOUND', 'Défi introuvable.');
  const m = membership(actor.id);
  if (!m || m.team_id !== ch.opponent_team_id) return fail(403, 'FORBIDDEN', 'Seule l’équipe défiée peut répondre.');
  if (!isTeamAdmin(m.team_id, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut répondre.');
  if (ch.status !== 'pending') return fail(409, 'BAD_STATUS', 'Ce défi n’est plus en attente.');
  if (!['accept', 'decline'].includes(action)) return fail(400, 'BAD_ACTION', 'Action inconnue.');
  const status = action === 'accept' ? 'accepted' : 'declined';
  // Le duel ne compte les XP qu'à partir de son acceptation (fenêtre sans ambiguïté).
  d.prepare(`UPDATE team_challenges SET status = ?,
    accepted_at = CASE WHEN ? = 'accepted' THEN datetime('now') ELSE accepted_at END,
    accepted_seq = CASE WHEN ? = 'accepted' THEN (SELECT COALESCE(MAX(rowid),0) FROM team_xp_events) ELSE accepted_seq END
    WHERE id = ?`).run(status, status, status, ch.id);
  logActivity(ch.opponent_team_id, actor.id, `challenge_${status}`, action === 'accept' ? 'Défi accepté ⚔️' : 'Défi refusé');
  logActivity(ch.challenger_team_id, actor.id, `challenge_${status}`, action === 'accept' ? 'Votre défi a été accepté ⚔️' : 'Votre défi a été refusé');
  return { ok: true, status };
}

function challengeScores(ch) {
  const d = getDb();
  // Frontière monotone : seuls les événements créés APRÈS l'acceptation comptent.
  const seq = Number(ch.accepted_seq || 0);
  const score = (teamId) => d.prepare(`SELECT COALESCE(SUM(amount),0) AS xp FROM team_xp_events
    WHERE team_id = ? AND rowid > ? AND created_at <= ?`).get(teamId, seq, ch.deadline || sqlDatetime()).xp;
  return { challenger: score(ch.challenger_team_id), opponent: score(ch.opponent_team_id) };
}

export function finalizeChallenge(actor, challengeId) {
  const d = getDb();
  const ch = d.prepare('SELECT * FROM team_challenges WHERE id = ?').get(challengeId);
  if (!ch) return fail(404, 'NOT_FOUND', 'Défi introuvable.');
  const m = membership(actor.id);
  if (!m || (m.team_id !== ch.challenger_team_id && m.team_id !== ch.opponent_team_id)) return fail(403, 'FORBIDDEN', 'Tu n’es pas concerné par ce défi.');
  if (!isTeamAdmin(m.team_id, actor.id)) return fail(403, 'FORBIDDEN', 'Seul un administrateur d’équipe peut clôturer un défi.');
  if (ch.status === 'completed') {
    return { ok: true, idempotent: true, status: 'completed', challengerScore: ch.challenger_score, opponentScore: ch.opponent_score, winnerTeamId: ch.winner_team_id, tie: ch.winner_team_id == null };
  }
  if (!['accepted', 'pending'].includes(ch.status)) return fail(409, 'BAD_STATUS', 'Ce défi ne peut pas être clôturé.');
  if (ch.status === 'pending') return fail(409, 'NOT_ACCEPTED', 'Le défi doit être accepté avant d’être clôturé.');
  if (ch.deadline && parseSql(ch.deadline) > Date.now()) return fail(409, 'TOO_EARLY', 'Le défi n’est pas encore terminé.');
  const scores = challengeScores(ch);
  // Égalité => match nul (règle déterministe, documentée).
  const tie = scores.challenger === scores.opponent;
  const winner = tie ? null : (scores.challenger > scores.opponent ? ch.challenger_team_id : ch.opponent_team_id);
  d.prepare("UPDATE team_challenges SET status = 'completed', challenger_score = ?, opponent_score = ?, winner_team_id = ?, finalized_at = datetime('now') WHERE id = ? AND status = 'accepted'")
    .run(scores.challenger, scores.opponent, winner, ch.id);
  if (winner) logActivity(winner, actor.id, 'challenge_won', 'Défi remporté 🏆');
  else { logActivity(ch.challenger_team_id, actor.id, 'challenge_draw', 'Défi terminé sur un match nul'); logActivity(ch.opponent_team_id, actor.id, 'challenge_draw', 'Défi terminé sur un match nul'); }
  return { ok: true, status: 'completed', challengerScore: scores.challenger, opponentScore: scores.opponent, winnerTeamId: winner, tie };
}

export function listChallenges(user) {
  const m = membership(user.id);
  if (!m) return { challenges: [] };
  const rows = getDb().prepare(`SELECT c.*, ct.name AS challengerName, ot.name AS opponentName
    FROM team_challenges c JOIN teams ct ON ct.id = c.challenger_team_id JOIN teams ot ON ot.id = c.opponent_team_id
    WHERE c.challenger_team_id = ? OR c.opponent_team_id = ? ORDER BY c.id DESC LIMIT 30`).all(m.team_id, m.team_id);
  return { challenges: rows };
}
