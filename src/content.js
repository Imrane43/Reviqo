import { getDb, addXp } from './db.js';

const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'est', 'sont', 'que', 'qui', 'dans', 'pour', 'avec', 'sur', 'par', 'au', 'aux', 'en', 'ce', 'cette', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'a', 'the', 'of', 'to', 'and', 'is', 'are', 'in', 'for', 'with', 'on', 'as', 'at', 'be']);

function sentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function keywords(text, n = 8) {
  const words = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deterministic offline "AI" study generator.
 * Produces a summary, flashcards, a QCM and a practice test from any input
 * without external providers. A real LLM can be plugged in via generateWithLLM().
 */
export function generateStudy({ input, subject = 'Général', difficulty = 'medium' }) {
  const text = String(input || '').trim();
  const sents = sentences(text);
  const keys = keywords(text, 8);

  const summary = sents.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n') ||
    `Voici une fiche de révision sur « ${text || subject} ». Retiens les idées clés et entraîne-toi avec les flashcards.`;

  const flashcards = keys.map((k) => {
    const sent = sents.find((s) => s.toLowerCase().includes(k)) || `Notion importante en ${subject}.`;
    return { front: k.charAt(0).toUpperCase() + k.slice(1), back: sent };
  });

  const quiz = keys.slice(0, 5).map((k) => {
    const correct = k.charAt(0).toUpperCase() + k.slice(1);
    const distractors = shuffle(keys.filter((x) => x !== k)).slice(0, 3).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
    const options = shuffle([correct, ...distractors]);
    return {
      text: `Quel terme est associé à : « ${(sents.find((s) => s.toLowerCase().includes(k)) || text).slice(0, 90)}… » ?`,
      options: options.length >= 2 ? options : [correct, 'Aucune de ces réponses'],
      answer: options.indexOf(correct),
      explanation: `« ${correct} » apparaît parmi les notions clés de ce cours.`,
      difficulty,
      subject,
    };
  });

  const trueFalse = keys.slice(0, 3).map((k) => {
    const correct = k.charAt(0).toUpperCase() + k.slice(1);
    const isTrue = Math.random() > 0.5;
    return {
      text: `« ${correct} » fait partie des notions clés de ce contenu.`,
      answer: isTrue ? 1 : 0,
      options: ['Vrai', 'Faux'],
      explanation: isTrue ? 'Oui, ce terme fait partie des notions importantes.' : 'Non, ce terme est un intrus.',
    };
  });

  const practice = keys.slice(0, 4).map((k) => ({
    question: `Explique avec tes mots le rôle de « ${k} » dans ce cours.`,
    hint: (sents.find((s) => s.toLowerCase().includes(k)) || '').slice(0, 120) || 'Appuie-toi sur ta fiche.',
  }));

  return {
    summary,
    keyPoints: keys.map((k) => k),
    flashcards: flashcards.length ? flashcards : [{ front: subject, back: summary }],
    quiz: quiz.length ? quiz : [{ text: 'Question de démonstration ?', options: ['Oui', 'Non'], answer: 0, explanation: 'Ajoute davantage de texte pour générer un vrai quiz.' }],
    trueFalse: trueFalse.length ? trueFalse : [{ text: 'Ce contenu est prêt à réviser.', answer: 1, options: ['Vrai', 'Faux'], explanation: 'Oui.' }],
    practice: practice.length ? practice : [{ question: 'Résume ce cours en 3 phrases.', hint: 'Utilise tes propres mots.' }],
    generatedAt: new Date().toISOString(),
    subject,
    difficulty,
    provider: process.env.LLM_PROVIDER || 'reviqo-local',
  };
}

export async function generateWithLLM(args) {
  // Optional adapter: set LLM_API_URL + LLM_API_KEY to plug a real provider.
  if (!process.env.LLM_API_URL || !process.env.LLM_API_KEY) return generateStudy(args);
  try {
    const res = await fetch(process.env.LLM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error('LLM error');
    return await res.json();
  } catch {
    return generateStudy(args);
  }
}

export function gradeAnswers(quiz, answers) {
  const questions = quiz.questions;
  const details = questions.map((question, i) => {
    const given = answers[i];
    const correct = question.answer;
    return { index: i, text: question.text, given, correct, isCorrect: given === correct, explanation: question.explanation };
  });
  const score = details.filter((d) => d.isCorrect).length;
  const accuracy = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const baseXp = score * 10;
  const bonus = accuracy === 100 ? 50 : 0;
  const xp = baseXp + bonus;
  const weak = [...new Set(details.filter((d) => !d.isCorrect).map((d) => d.text.slice(0, 40)))];
  return { score, total: questions.length, accuracy, xp, bonus, weak, details };
}

export function checkAchievements(user) {
  const d = getDb();
  const unlocked = [];
  const all = d.prepare('SELECT * FROM achievements').all();
  const have = new Set(d.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(user.id).map((r) => r.achievement_id));
  const attempts = d.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS q, COALESCE(MAX(accuracy),0) AS best, COALESCE(MIN(duration),99999) AS fastest FROM quiz_attempts WHERE user_id = ?').get(user.id);
  const studies = d.prepare('SELECT COUNT(*) AS c FROM study_sessions WHERE user_id = ?').get(user.id).c;
  const games = d.prepare('SELECT COUNT(*) AS c FROM game_sessions WHERE user_id = ?').get(user.id).c;

  const rules = {
    first: () => attempts.c >= 1 || studies >= 1,
    streak7: () => (user.longest_streak || 0) >= 7,
    quizmaster: () => attempts.c >= 10,
    speed: () => attempts.fastest < 60,
    bookworm: () => studies >= 10,
    perfect: () => attempts.best >= 100,
    q100: () => attempts.q >= 100,
    xp10k: () => user.xp >= 10000,
    games25: () => games >= 25,
    level5: () => user.xp >= 1500,
    earlybird: () => new Date().getHours() < 8,
    top10: () => {
      const rank = d.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE xp > ?').get(user.xp).r;
      return rank <= 10;
    },
  };
  for (const a of all) {
    if (have.has(a.id)) continue;
    const fn = rules[a.code];
    if (fn && fn()) {
      d.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(user.id, a.id);
      addXp(user.id, a.xp, `achievement:${a.code}`, `achievement:${user.id}:${a.code}`);
      d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'achievement', ?, ?)")
        .run(user.id, `Badge débloqué : ${a.label}`, `+${a.xp} XP — ${a.description || ''}`);
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function progressDailyChallenge(userId, metric, value = 1) {
  const d = getDb();
  const day = new Date().toISOString().slice(0, 10);
  const challenges = d.prepare('SELECT * FROM challenges').all();
  const done = [];
  for (const c of challenges) {
    if (c.metric !== metric) continue;
    let row = d.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ? AND day = ?').get(userId, c.id, day);
    if (!row) {
      const info = d.prepare('INSERT INTO user_challenges (user_id, challenge_id, day, progress) VALUES (?, ?, ?, 0)').run(userId, c.id, day);
      row = { id: info.lastInsertRowid, progress: 0, completed: 0 };
    }
    if (row.completed) continue;
    const progress = metric === 'accuracy80' ? Math.max(row.progress, value >= 80 ? 1 : 0) : row.progress + value;
    if (progress >= c.target) {
      d.prepare('UPDATE user_challenges SET progress = ?, completed = 1, completed_at = datetime(\'now\') WHERE id = ?').run(progress, row.id);
      addXp(userId, c.xp, `challenge:${c.code}`, `challenge:${userId}:${c.code}:${day}`);
      d.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'challenge', ?, ?)").run(userId, 'Défi du jour terminé ✅', `${c.label} — +${c.xp} XP`);
      done.push(c);
    } else {
      d.prepare('UPDATE user_challenges SET progress = ? WHERE id = ?').run(progress, row.id);
    }
  }
  return done;
}

export function getDailyBoard(userId) {
  const d = getDb();
  const day = new Date().toISOString().slice(0, 10);
  const challenges = d.prepare('SELECT * FROM challenges ORDER BY id').all();
  return challenges.map((c) => {
    const uc = d.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ? AND day = ?').get(userId, c.id, day);
    return {
      id: c.id,
      code: c.code,
      label: c.label,
      icon: c.icon,
      target: c.target,
      xp: c.xp,
      progress: uc?.progress || 0,
      completed: !!uc?.completed,
    };
  });
}
