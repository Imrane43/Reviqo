/**
 * Apprentissage : répétition espacée, carnet d'erreurs, planning de révision,
 * recherche globale et tableau de bord.
 */
import { getDb } from './db.js';
import { retrieveResources } from './retrieval.js';

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'];

function todayUTC(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------- répétition espacée ------------------------- */

/** Planification SM-2 simplifiée : intervalles croissants, « à revoir » remet à zéro. */
export function applyReview(prev, rating) {
  let ease = Number(prev?.ease ?? 2.5);
  let interval = Number(prev?.interval_days ?? 0);
  let reps = Number(prev?.reps ?? 0);
  let lapses = Number(prev?.lapses ?? 0);
  if (rating === 'again') { ease = Math.max(1.3, ease - 0.2); interval = 1; reps = 0; lapses += 1; }
  else if (rating === 'hard') { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, Math.round((interval || 1) * 1.2)); reps += 1; }
  else if (rating === 'good') { interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round((interval || 1) * ease); reps += 1; }
  else if (rating === 'easy') { interval = reps === 0 ? 4 : Math.round((interval || 1) * ease * 1.3); reps += 1; }
  else return null;
  ease = Math.min(2.8, ease);
  interval = Math.min(365, Math.max(1, interval));
  return { ease: Math.round(ease * 100) / 100, interval_days: interval, reps, lapses };
}

export function scheduleReview(userId, flashcardId, rating) {
  if (!REVIEW_RATINGS.includes(rating)) return { error: 'BAD_RATING' };
  const d = getDb();
  const card = d.prepare("SELECT id FROM flashcards WHERE id = ? AND status = 'published'").get(flashcardId);
  if (!card) return { error: 'NOT_FOUND' };
  const prev = d.prepare('SELECT * FROM flashcard_reviews WHERE user_id = ? AND flashcard_id = ?').get(userId, flashcardId);
  const next = applyReview(prev, rating);
  const due = addDays(todayUTC(), next.interval_days);
  d.prepare(`INSERT INTO flashcard_reviews (user_id, flashcard_id, ease, interval_days, reps, lapses, due_date, last_rating, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, flashcard_id) DO UPDATE SET
      ease = excluded.ease, interval_days = excluded.interval_days, reps = excluded.reps, lapses = excluded.lapses,
      due_date = excluded.due_date, last_rating = excluded.last_rating, updated_at = datetime('now')`)
    .run(userId, flashcardId, next.ease, next.interval_days, next.reps, next.lapses, due, rating);
  return { ok: true, ...next, dueDate: due };
}

export function dueReviews(userId, { limit = 40 } = {}) {
  const d = getDb();
  const today = todayUTC();
  const rows = d.prepare(`SELECT r.flashcard_id, r.due_date, r.interval_days, r.reps, r.ease, r.last_rating,
      f.front, f.back, f.deck, s.slug AS subjectSlug, s.name AS subjectName, s.icon, s.color
    FROM flashcard_reviews r JOIN flashcards f ON f.id = r.flashcard_id JOIN subjects s ON s.id = f.subject_id
    WHERE r.user_id = ? AND r.due_date <= ? AND f.status = 'published'
    ORDER BY r.due_date ASC, r.flashcard_id ASC LIMIT ?`).all(userId, today, Math.min(100, Math.max(1, limit)));
  return {
    today,
    due: rows.map((r) => ({ id: r.flashcard_id, front: r.front, back: r.back, deck: r.deck, dueDate: r.due_date, intervalDays: r.interval_days, reps: r.reps, lastRating: r.last_rating, subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.icon, color: r.color } })),
  };
}

export function reviewStats(userId) {
  const d = getDb();
  const today = todayUTC();
  const total = d.prepare('SELECT COUNT(*) AS c FROM flashcard_reviews WHERE user_id = ?').get(userId).c;
  const due = d.prepare('SELECT COUNT(*) AS c FROM flashcard_reviews r JOIN flashcards f ON f.id = r.flashcard_id WHERE r.user_id = ? AND r.due_date <= ? AND f.status = \'published\'').get(userId, today).c;
  const scheduled = d.prepare('SELECT COUNT(*) AS c FROM flashcard_reviews WHERE user_id = ? AND due_date > ?').get(userId, today).c;
  return { tracked: total, due, scheduled, today };
}

/* ------------------------- carnet d'erreurs ------------------------- */

/** Enregistre les notions ratées (idempotent : une erreur par question et par élève). */
export function recordErrors(userId, quizId, subjectId, details = []) {
  const d = getDb();
  let added = 0;
  for (const det of details) {
    if (!det || det.isCorrect) continue;
    const topic = String(det.text || '').slice(0, 120);
    const info = d.prepare(`INSERT OR IGNORE INTO error_notebook (user_id, quiz_id, subject_id, question_index, topic)
      VALUES (?, ?, ?, ?, ?)`).run(userId, quizId || null, subjectId || null, Number(det.index) || 0, topic);
    added += info.changes;
  }
  return { added };
}

export function errorNotebook(userId) {
  const d = getDb();
  const rows = d.prepare(`SELECT e.id, e.quiz_id, e.question_index, e.topic, e.resolved, e.created_at,
      q.title AS quizTitle, q.difficulty, s.slug AS subjectSlug, s.name AS subjectName, s.icon, s.color
    FROM error_notebook e LEFT JOIN quizzes q ON q.id = e.quiz_id LEFT JOIN subjects s ON s.id = e.subject_id
    WHERE e.user_id = ? AND e.resolved = 0 ORDER BY e.created_at DESC LIMIT 100`).all(userId);
  const bySubject = new Map();
  for (const r of rows) {
    const key = r.subjectSlug || 'autre';
    if (!bySubject.has(key)) bySubject.set(key, { subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.icon, color: r.color }, entries: [] });
    bySubject.get(key).entries.push({ id: r.id, quizId: r.quiz_id, quizTitle: r.quizTitle, topic: r.topic, difficulty: r.difficulty, createdAt: r.created_at });
  }
  // Suggestions : quiz de la même matière pour s'entraîner.
  const groups = [...bySubject.values()].map((g) => {
    const suggestions = g.subject.slug
      ? d.prepare(`SELECT q.id, q.title, q.difficulty FROM quizzes q JOIN subjects s ON s.id = q.subject_id
          WHERE s.slug = ? AND q.status = 'published' AND q.active = 1 AND q.is_premium = 0 ORDER BY q.id LIMIT 3`).all(g.subject.slug)
      : [];
    return { ...g, count: g.entries.length, suggestions };
  });
  return { total: rows.length, groups };
}

export function resolveError(userId, id) {
  const d = getDb();
  const info = d.prepare('UPDATE error_notebook SET resolved = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  if (info.changes === 0) return { error: 'NOT_FOUND' };
  return { ok: true };
}

/* ------------------------- planning de révision ------------------------- */

/**
 * Génère un planning réaliste et recalculable :
 * répartition des matières prioritaires, révision des cartes dues et carnet d'erreurs.
 */
export function generatePlan(userId, { examDate, minutesPerDay, subjects } = {}) {
  const d = getDb();
  const minutes = Math.min(240, Math.max(10, Number(minutesPerDay) || 30));
  const parsed = Array.isArray(subjects) ? subjects.map(Number).filter((n) => Number.isFinite(n)) : [];
  const subjectRows = parsed.length
    ? d.prepare(`SELECT id, name, icon FROM subjects WHERE id IN (${parsed.map(() => '?').join(',')})`).all(...parsed)
    : d.prepare('SELECT id, name, icon FROM subjects ORDER BY id LIMIT 4').all();
  const list = subjectRows.length ? subjectRows : [{ id: null, name: 'Révision générale', icon: '📚' }];
  const start = todayUTC();
  const exam = /^\d{4}-\d{2}-\d{2}$/.test(String(examDate || '')) ? String(examDate) : addDays(start, 14);
  const totalDays = Math.max(1, Math.min(60, Math.round((new Date(`${exam}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000)));
  const dueCount = dueReviews(userId, { limit: 100 }).due.length;
  const errors = errorNotebook(userId).total;
  const days = [];
  for (let i = 1; i <= totalDays; i++) {
    const date = addDays(start, i);
    const primary = list[(i - 1) % list.length];
    const secondary = list[i % list.length];
    const isReviewDay = i % 7 === 0;
    const blocks = [
      { subjectId: primary.id, subjectName: primary.name, icon: primary.icon, minutes: Math.round(minutes * (isReviewDay ? 0.35 : 0.5)), activity: 'Cours et fiches' },
      { subjectId: secondary.id, subjectName: secondary.name, icon: secondary.icon, minutes: Math.round(minutes * 0.3), activity: 'Quiz ciblé' },
      { subjectId: null, subjectName: 'Répétition espacée', icon: '🃏', minutes: Math.round(minutes * 0.2), activity: dueCount ? `Revoir ${dueCount} carte(s) due(s)` : 'Cartes du jour' },
    ];
    if (errors) blocks.push({ subjectId: null, subjectName: 'Carnet d’erreurs', icon: '📝', minutes: Math.max(5, Math.round(minutes * 0.15)), activity: `Reprendre ${errors} notion(s) ratée(s)` });
    days.push({ date, totalMinutes: blocks.reduce((s, b) => s + b.minutes, 0), reviewDay: isReviewDay, blocks });
  }
  const plan = { examDate: exam, minutesPerDay: minutes, generatedAt: new Date().toISOString(), startDate: start, daysCount: totalDays, days };
  const info = d.prepare('INSERT INTO study_plans (user_id, exam_date, minutes_per_day, subjects, plan) VALUES (?, ?, ?, ?, ?)')
    .run(userId, exam, minutes, JSON.stringify(parsed), JSON.stringify(plan));
  return { id: info.lastInsertRowid, plan };
}

export function getPlan(userId) {
  const row = getDb().prepare('SELECT * FROM study_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  if (!row) return { plan: null };
  let plan = null;
  try { plan = JSON.parse(row.plan); } catch { plan = null; }
  return { id: row.id, plan, examDate: row.exam_date, minutesPerDay: row.minutes_per_day, createdAt: row.created_at };
}

/* ------------------------- recherche globale ------------------------- */

export function globalSearch(user, query, { subject, difficulty, type, premium = false, limit = 30 } = {}) {
  const d = getDb();
  const q = String(query || '').trim().slice(0, 80);
  if (q.length < 2) return { results: [], query: q, total: 0 };
  const like = `%${q.toLowerCase()}%`;
  const results = [];
  if (!type || type === 'quiz') {
    let sql = `SELECT q.id, q.title, q.description, q.chapter, q.objectives, q.difficulty, q.is_premium, q.curriculum_id, q.language,
        s.slug AS subjectSlug, s.name AS subjectName, s.icon, s.color
      FROM quizzes q JOIN subjects s ON s.id = q.subject_id
      WHERE q.status = 'published' AND q.active = 1 AND (lower(q.title) LIKE ? OR lower(COALESCE(q.description,'')) LIKE ? OR lower(COALESCE(q.chapter,'')) LIKE ? OR lower(COALESCE(q.objectives,'')) LIKE ?)`;
    const params = [like, like, like, like];
    if (subject) { sql += ' AND s.slug = ?'; params.push(subject); }
    if (difficulty) { sql += ' AND q.difficulty = ?'; params.push(difficulty); }
    sql += ' ORDER BY q.id LIMIT ?';
    params.push(limit);
    for (const r of d.prepare(sql).all(...params)) {
      if (r.is_premium && !premium) continue;
      results.push({ type: 'quiz', id: r.id, title: r.title, description: r.description, chapter: r.chapter, difficulty: r.difficulty, isPremium: !!r.is_premium, language: r.language || 'fr', subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.icon, color: r.color }, link: `/app.html#quizzes?quiz=${r.id}` });
    }
  }
  if (!type || type === 'flashcard') {
    let sql = `SELECT f.id, f.front, f.back, f.deck, f.chapter, f.is_premium, f.difficulty, f.language,
        s.slug AS subjectSlug, s.name AS subjectName, s.icon, s.color
      FROM flashcards f JOIN subjects s ON s.id = f.subject_id
      WHERE f.status = 'published' AND (lower(f.front) LIKE ? OR lower(f.back) LIKE ? OR lower(f.deck) LIKE ? OR lower(COALESCE(f.chapter,'')) LIKE ?)`;
    const params = [like, like, like, like];
    if (subject) { sql += ' AND s.slug = ?'; params.push(subject); }
    if (difficulty) { sql += ' AND f.difficulty = ?'; params.push(difficulty); }
    sql += ' ORDER BY f.id LIMIT ?';
    params.push(limit);
    for (const r of d.prepare(sql).all(...params)) {
      if (r.is_premium && !premium) continue;
      results.push({ type: 'flashcard', id: r.id, title: r.front, description: r.back, deck: r.deck, chapter: r.chapter, difficulty: r.difficulty, isPremium: !!r.is_premium, language: r.language || 'fr', subject: { slug: r.subjectSlug, name: r.subjectName, icon: r.icon, color: r.color }, link: '/app.html#reviser' });
    }
  }
  return { results: results.slice(0, limit), query: q, total: results.length };
}

/* ------------------------- tableau de bord ------------------------- */

export function dashboard(user, { premium = false } = {}) {
  const d = getDb();
  const uid = user.id;
  const stats = d.prepare('SELECT COUNT(*) AS quizzes, COALESCE(AVG(accuracy),0) AS avg FROM quiz_attempts WHERE user_id = ?').get(uid);
  const bySubject = d.prepare(`SELECT s.slug, s.name, s.icon, ROUND(AVG(a.accuracy),0) AS accuracy, COUNT(a.id) AS attempts
    FROM quiz_attempts a JOIN subjects s ON s.id = a.subject_id WHERE a.user_id = ? GROUP BY s.id`).all(uid);
  const mastered = bySubject.filter((s) => s.accuracy >= 80).map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, accuracy: s.accuracy }));
  const toRework = bySubject.filter((s) => s.accuracy < 60 && s.attempts >= 1).map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, accuracy: s.accuracy }));
  const reviews = reviewStats(uid);
  const notebook = d.prepare('SELECT COUNT(*) AS c FROM error_notebook WHERE user_id = ? AND resolved = 0').get(uid).c;
  const team = d.prepare('SELECT t.id, t.name, t.weekly_goal FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ?').get(uid);
  let teamGoal = null;
  if (team) {
    const week = new Date(Date.now() - ((new Date().getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const progress = d.prepare('SELECT COALESCE(SUM(amount),0) AS xp FROM team_xp_events WHERE team_id = ? AND week = ?').get(team.id, week).xp;
    teamGoal = { teamId: team.id, name: team.name, target: team.weekly_goal, progress };
  }
  const todayRevisions = reviews.due;
  return {
    today: todayUTC(),
    revisions: { due: reviews.due, scheduled: reviews.scheduled, tracked: reviews.tracked },
    notebook: { unresolved: notebook },
    mastery: { mastered, toRework, avgAccuracy: Math.round(stats.avg), quizzesDone: stats.quizzes },
    teamGoal,
    objectives: { reviewsDue: reviews.due, errors: notebook },
    premium,
  };
}
