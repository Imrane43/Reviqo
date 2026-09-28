import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { EXTRA_QUIZZES, FLASHCARD_DECKS } from './seed-content.js';
import { listCurricula } from './programs.js';
import { GRADED_QUIZZES, GRADED_DECKS } from './content-library.js';

export const LEVELS = [
  { level: 1, xp: 0 },
  { level: 2, xp: 250 },
  { level: 3, xp: 600 },
  { level: 4, xp: 1000 },
  { level: 5, xp: 1500 },
  { level: 6, xp: 2100 },
  { level: 7, xp: 2550 },
  { level: 8, xp: 3000 },
  { level: 9, xp: 3700 },
  { level: 10, xp: 4500 },
  { level: 12, xp: 6200 },
  { level: 15, xp: 9000 },
  { level: 20, xp: 15000 },
  { level: 25, xp: 23000 },
  { level: 30, xp: 34000 },
];

export function levelForXp(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || { level: LEVELS[i].level + 1, xp: LEVELS[i].xp + 5000 };
    }
  }
  return { level: current.level, currentXp: xp, levelStart: current.xp, nextXp: next.xp, nextLevel: next.level };
}

let db = null;

export function getDb() {
  if (!db) throw new Error('Database not initialised. Call initDb() first.');
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'free',
  is_guest INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  google_id TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  first_name TEXT,
  school_level TEXT,
  country TEXT,
  subjects TEXT,
  goal TEXT,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  avatar TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  study_time INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  reset_token TEXT,
  reset_expires TEXT,
  verify_token TEXT,
  notify_prefs TEXT DEFAULT '{"daily":true,"streak":true,"friend":true,"achievement":true,"news":true,"billing":true,"ads":false}',
  ad_consent INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  trial_ends_at TEXT,
  current_period_end TEXT,
  payment_issue INTEGER NOT NULL DEFAULT 0,
  coach_provider TEXT,
  coach_api_key TEXT,
  coach_model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'qcm',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  is_premium INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL DEFAULT '[]',
  plays INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quiz_id INTEGER,
  subject_id INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  accuracy REAL NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'quiz',
  weak_topics TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER,
  input_type TEXT NOT NULL DEFAULT 'text',
  input TEXT,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  target INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 50,
  metric TEXT NOT NULL DEFAULT 'quiz',
  is_premium INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  deck TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  is_premium INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  challenge_id INTEGER NOT NULL REFERENCES challenges(id),
  day TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  xp INTEGER NOT NULL DEFAULT 100,
  rule TEXT NOT NULL DEFAULT '{}',
  is_premium INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_id INTEGER NOT NULL REFERENCES users(id),
  opponent_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER,
  difficulty TEXT,
  questions INTEGER NOT NULL DEFAULT 5,
  challenger_score INTEGER,
  opponent_score INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'stripe',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending',
  plan TEXT,
  stripe_session_id TEXT,
  stripe_invoice_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'house',
  enabled INTEGER NOT NULL DEFAULT 1,
  code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_games_user ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_study_user ON study_sessions(user_id);

-- Référentiel des programmes scolaires (par pays / système / niveau / classe / voie / domaine).
CREATE TABLE IF NOT EXISTS curricula (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  country_label TEXT NOT NULL,
  system TEXT NOT NULL,
  level TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  track TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  subjects TEXT NOT NULL DEFAULT '[]',
  exam_code TEXT,
  exam_label TEXT,
  exam_subjects TEXT NOT NULL DEFAULT '[]',
  exam_options TEXT NOT NULL DEFAULT '[]',
  series TEXT NOT NULL DEFAULT '[]',
  content_status TEXT NOT NULL DEFAULT 'unavailable',
  needs_detail INTEGER NOT NULL DEFAULT 0,
  school_year TEXT,
  session TEXT,
  source_url TEXT,
  source_checked_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(country_code, level, grade, track, domain)
);
CREATE INDEX IF NOT EXISTS idx_curricula_lookup ON curricula(country_code, level, grade, track, domain);

-- Idempotence des webhooks Stripe : un event.id n'est traité qu'une seule fois.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed INTEGER NOT NULL DEFAULT 0,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);

-- Quota quotidien du Coach IA (maîtrise des coûts).
CREATE TABLE IF NOT EXISTS coach_usage (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Vidéo IA : cache contextualisé de la recherche YouTube + quota quotidien.
CREATE TABLE IF NOT EXISTS video_cache (
  key TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS video_usage (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Équipes de révision : équipes, membres, invitations, activité, XP collectif, objectifs, défis.
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  weekly_goal INTEGER NOT NULL DEFAULT 3000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, user_id)
);
-- Un utilisateur appartient à une seule équipe à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_member_single ON team_members(user_id);
CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  code TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS team_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  actor_id INTEGER,
  type TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Événements d'XP collectifs : ref unique => aucun double comptage.
CREATE TABLE IF NOT EXISTS team_xp_events (
  ref TEXT PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  week TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_xp_week ON team_xp_events(team_id, week);
CREATE TABLE IF NOT EXISTS team_goals (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  week TEXT NOT NULL,
  target INTEGER NOT NULL,
  PRIMARY KEY (team_id, week)
);
CREATE TABLE IF NOT EXISTS team_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_team_id INTEGER NOT NULL REFERENCES teams(id),
  opponent_team_id INTEGER NOT NULL REFERENCES teams(id),
  subject_id INTEGER,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  questions INTEGER NOT NULL DEFAULT 5,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  challenger_score INTEGER,
  opponent_score INTEGER,
  winner_team_id INTEGER,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);
`;

const SUBJECTS = [
  ['maths', 'Mathématiques', '∑', '#6366f1', 'Algèbre, fonctions, géométrie et analyse.'],
  ['francais', 'Français', '✍', '#ec4899', 'Grammaire, littérature et expression.'],
  ['anglais', 'Anglais', '🌍', '#0ea5e9', 'Vocabulary, grammar and comprehension.'],
  ['histoire', 'Histoire', '🏛', '#f59e0b', 'Dates, événements et grandes figures.'],
  ['geographie', 'Géographie', '🗺', '#14b8a6', 'Territoires, cartes et enjeux.'],
  ['physique', 'Physique', '⚛', '#8b5cf6', 'Mécanique, énergie et électricité.'],
  ['chimie', 'Chimie', '⚗', '#ef4444', 'Atomes, réactions et solutions.'],
  ['biologie', 'Biologie', '🧬', '#22c55e', 'Cellules, corps humain et écosystèmes.'],
  ['philosophie', 'Philosophie', '💭', '#a855f7', 'Concepts, auteurs et argumentation.'],
  ['informatique', 'Informatique', '💻', '#3b82f6', 'Algorithmes, code et logique.'],
  ['culture', 'Culture générale', '🧠', '#eab308', 'Un peu de tout, pour tout le monde.'],
];

function q(text, options, answer, explanation) {
  return { text, options, answer, explanation };
}

const QUIZZES = [
  {
    subject: 'maths', title: 'Dérivées et fonctions', difficulty: 'medium', questions: [
      q('Quelle est la dérivée de x² ?', ['x', '2x', 'x²', '2'], 1, 'La dérivée de xⁿ est n·xⁿ⁻¹, donc (x²)′ = 2x.'),
      q('Quelle est la dérivée de sin(x) ?', ['cos(x)', '-cos(x)', '-sin(x)', 'tan(x)'], 0, 'La dérivée de sin(x) est cos(x).'),
      q('Résoudre 2x + 4 = 0', ['x = 2', 'x = -2', 'x = 4', 'x = -4'], 1, '2x = -4 donc x = -2.'),
      q('La dérivée d’une constante est :', ['1', '0', 'la constante', 'infinie'], 1, 'Une constante ne varie pas, sa dérivée est 0.'),
      q('Quelle est la valeur de cos(0) ?', ['0', '1', '-1', '1/2'], 1, 'cos(0) = 1.'),
    ],
  },
  {
    subject: 'maths', title: 'Équations du second degré', difficulty: 'hard', isPremium: 1, questions: [
      q('Discriminant de x² − 5x + 6 = 0 ?', ['1', '-1', '25', '49'], 0, 'Δ = b² − 4ac = 25 − 24 = 1.'),
      q('Les solutions de x² − 5x + 6 = 0 sont :', ['2 et 3', '-2 et -3', '1 et 6', '0 et 5'], 0, 'x² − 5x + 6 = (x−2)(x−3).'),
      q('Si Δ < 0, l’équation admet :', ['2 solutions', '1 solution', 'aucune solution réelle', 'infinité'], 2, 'Un discriminant négatif n’a pas de racine réelle.'),
    ],
  },
  {
    subject: 'francais', title: 'Les Misérables', difficulty: 'easy', questions: [
      q('Qui a écrit Les Misérables ?', ['Émile Zola', 'Victor Hugo', 'Molière', 'Albert Camus'], 1, 'Les Misérables (1862) est de Victor Hugo.'),
      q('Quel personnage est un ancien bagnard ?', ['Marius', 'Jean Valjean', 'Gavroche', 'Javert'], 1, 'Jean Valjean est l’ancien bagnard au cœur du roman.'),
      q('En quelle année Les Misérables est-il publié ?', ['1848', '1862', '1870', '1885'], 1, 'Le roman paraît en 1862.'),
    ],
  },
  {
    subject: 'francais', title: 'Grammaire essentielle', difficulty: 'medium', questions: [
      q('Quel est le pluriel de « cheval » ?', ['chevals', 'chevaux', 'chevaus', 'chevales'], 1, 'Les mots en -al font leur pluriel en -aux.'),
      q('« Il court vite » : quelle est la fonction de « vite » ?', ['adjectif', 'adverbe', 'verbe', 'préposition'], 1, '« Vite » modifie le verbe : c’est un adverbe.'),
    ],
  },
  {
    subject: 'histoire', title: 'La Révolution française', difficulty: 'medium', questions: [
      q('Quand débute la Révolution française ?', ['1776', '1789', '1799', '1815'], 1, 'Elle débute en 1789 avec la prise de la Bastille le 14 juillet.'),
      q('Quelle est la devise de la République ?', ['Liberté, Égalité, Fraternité', 'Paix, Amour, Travail', 'Un pour tous', 'Dieu et Patrie'], 0, 'La devise républicaine est « Liberté, Égalité, Fraternité ».'),
      q('Qui est guillotiné en janvier 1793 ?', ['Robespierre', 'Louis XVI', 'Danton', 'Marat'], 1, 'Louis XVI est exécuté le 21 janvier 1793.'),
    ],
  },
  {
    subject: 'anglais', title: 'English Basics', difficulty: 'easy', questions: [
      q('What is the past of "to go"?', ['goed', 'went', 'gone', 'going'], 1, 'The simple past of "go" is "went".'),
      q('Choose the correct sentence.', ['She don’t like tea.', 'She doesn’t likes tea.', 'She doesn’t like tea.', 'She not like tea.'], 2, 'Third person singular: doesn’t + base verb.'),
      q('"Beautiful" is a …?', ['noun', 'verb', 'adjective', 'adverb'], 2, 'It describes a noun, so it is an adjective.'),
    ],
  },
  {
    subject: 'physique', title: 'Énergie et électricité', difficulty: 'medium', questions: [
      q('Unité de la puissance en physique ?', ['joule', 'watt', 'volt', 'ampère'], 1, 'La puissance se mesure en watts (W).'),
      q('Loi d’Ohm ?', ['U = R/I', 'U = R·I', 'U = I/R', 'R = U·I'], 1, 'U = R × I.'),
      q('L’énergie cinétique s’écrit :', ['½mv²', 'mgh', 'mc²', 'mv'], 0, 'Ec = ½ m v².'),
    ],
  },
  {
    subject: 'biologie', title: 'Vivant et cellules', difficulty: 'easy', questions: [
      q('Qu’est-ce que la photosynthèse ?', ['La respiration des animaux', 'La production de matière organique grâce à la lumière', 'La digestion', 'La fécondation'], 1, 'Les plantes produisent de la matière organique grâce à la lumière.'),
      q('Où se trouve l’ADN dans la cellule ?', ['cytoplasme', 'noyau', 'membrane', 'vacuole'], 1, 'L’ADN est contenu dans le noyau.'),
    ],
  },
  {
    subject: 'culture', title: 'Capitales du monde', difficulty: 'easy', questions: [
      q('Quelle est la capitale du Canada ?', ['Toronto', 'Ottawa', 'Montréal', 'Vancouver'], 1, 'Ottawa est la capitale fédérale du Canada.'),
      q('Capitale de l’Australie ?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 2, 'Canberra est la capitale australienne.'),
      q('Capitale du Brésil ?', ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], 2, 'Brasília est la capitale depuis 1960.'),
    ],
  },
  {
    subject: 'informatique', title: 'Bases de la programmation', difficulty: 'medium', questions: [
      q('Que fait une boucle « for » ?', ['Répète des instructions', 'Déclare une variable', 'Arrête le programme', 'Crée un fichier'], 0, 'Elle répète un bloc un nombre de fois donné.'),
      q('Combien de valeurs peut contenir un booléen ?', ['1', '2', '10', 'illimité'], 1, 'Un booléen vaut vrai ou faux.'),
    ],
  },
];

const ACHIEVEMENTS = [
  ['streak7', '🔥 Série de 7 jours', '🔥', '7 jours d’activité consécutifs', 150],
  ['quizmaster', '🧠 Quiz Master', '🧠', 'Terminer 10 quiz', 250],
  ['speed', '⚡ Speed Demon', '⚡', 'Terminer un quiz en moins de 60 s', 150],
  ['bookworm', '📚 Rat de bibliothèque', '📚', '10 sessions d’étude', 200],
  ['perfect', '🏆 Score parfait', '🏆', 'Obtenir 100 % à un quiz', 250],
  ['q100', '🎯 100 questions', '🎯', 'Répondre à 100 questions', 300],
  ['xp10k', '💎 10 000 XP', '💎', 'Atteindre 10 000 XP', 500],
  ['earlybird', '🚀 Lève-tôt', '🚀', 'Étudier avant 8 h', 100],
  ['top10', '👑 Top 10', '👑', 'Entrer dans le top 10 du classement', 400],
  ['first', '🌱 Premier pas', '🌱', 'Terminer sa première activité', 50],
  ['games25', '🎮 Gamer', '🎮', 'Jouer 25 mini-jeux', 200],
  ['level5', '⭐ Niveau 5', '⭐', 'Atteindre le niveau 5', 200],
];

const CHALLENGES = [
  ['daily_quiz', 'Termine 1 quiz', '📝', 1, 50, 'quiz'],
  ['daily_q20', 'Réponds à 20 questions', '⚡', 20, 100, 'questions'],
  ['daily_80', 'Obtiens 80 % ou plus', '🏆', 1, 150, 'accuracy80'],
  ['daily_game', 'Joue à un mini-jeu', '🎮', 1, 40, 'game'],
];

export const DEMO_ACCOUNTS = [
  { email: 'lea@reviqo.app', password: 'demo1234', first_name: 'Léa', xp: 2640, streak: 9 },
  { email: 'youssef@reviqo.app', password: 'demo1234', first_name: 'Youssef', xp: 1980, streak: 4 },
  { email: 'emma@reviqo.app', password: 'demo1234', first_name: 'Emma', xp: 3210, streak: 12 },
  { email: 'noah@reviqo.app', password: 'demo1234', first_name: 'Noah', xp: 1120, streak: 2 },
  { email: 'ines@reviqo.app', password: 'demo1234', first_name: 'Inès', xp: 870, streak: 6 },
];

export function initDb(dbPath) {
  const file = dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'reviqo.db');
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  ensureColumn('users', 'coach_provider', 'TEXT');
  ensureColumn('users', 'coach_api_key', 'TEXT');
  ensureColumn('users', 'coach_model', 'TEXT');
  runMigrations();
  seedBase();
  seedCurricula();
  seedContentLibrary();
  cleanupUnverified();
  if (file !== ':memory:') {
    const timer = setInterval(cleanupUnverified, 3600 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
  }
  return db;
}

/**
 * Non-destructive, idempotent migrations. Existing rows are preserved.
 * Adds the identity / verification / revocation columns used by the auth flow.
 */
function runMigrations() {
  ensureColumn('users', 'username', 'TEXT');
  ensureColumn('users', 'username_norm', 'TEXT');
  ensureColumn('users', 'email_canon', 'TEXT');
  ensureColumn('users', 'verify_hash', 'TEXT');
  ensureColumn('users', 'verify_expires', 'TEXT');
  ensureColumn('users', 'verify_attempts', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'verify_last_sent', 'TEXT');
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'reset_hash', 'TEXT');
  ensureColumn('users', 'verify_deadline', 'TEXT');
  // Étape 4 — profil scolaire et référentiel des programmes.
  ensureColumn('users', 'system', 'TEXT');
  ensureColumn('users', 'system_level', 'TEXT');
  ensureColumn('users', 'grade', 'TEXT');
  ensureColumn('users', 'track', 'TEXT');
  ensureColumn('users', 'domain', 'TEXT');
  ensureColumn('users', 'domain_detail', 'TEXT');
  ensureColumn('users', 'specialties', 'TEXT');
  ensureColumn('users', 'learning_language', 'TEXT');
  ensureColumn('users', 'exam_session', 'TEXT');
  ensureColumn('users', 'school_year', 'TEXT');
  ensureColumn('users', 'exam_date', 'TEXT');
  ensureColumn('users', 'curriculum_id', 'INTEGER');
  ensureColumn('quiz_attempts', 'curriculum_id', 'INTEGER');
  // Étape 5 — bibliothèque pédagogique : métadonnées + statuts de publication.
  const contentCols = [
    ['curriculum_id', 'INTEGER'],
    ['status', "TEXT NOT NULL DEFAULT 'published'"],
    ['language', "TEXT NOT NULL DEFAULT 'fr'"],
    ['chapter', 'TEXT'],
    ['objectives', "TEXT NOT NULL DEFAULT '[]'"],
    ['prerequisites', "TEXT NOT NULL DEFAULT '[]'"],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['sources', "TEXT NOT NULL DEFAULT '[]'"],
    ['country_code', 'TEXT'],
    ['level', 'TEXT'],
    ['grade', 'TEXT'],
    ['content_type', "TEXT NOT NULL DEFAULT 'original'"],
    ['updated_at', 'TEXT'],
  ];
  for (const [col, type] of contentCols) ensureColumn('quizzes', col, type);
  for (const [col, type] of contentCols) ensureColumn('flashcards', col, type);
  ensureColumn('flashcards', 'difficulty', "TEXT NOT NULL DEFAULT 'easy'");
  ensureColumn('reports', 'content_version', 'INTEGER');
  // Étape 6 — abonnement Stripe : ordre des événements + idempotence des factures.
  ensureColumn('users', 'stripe_last_event_at', 'INTEGER');
  // Étape 9 — XP idempotent : clé de référence unique par événement.
  ensureColumn('xp_transactions', 'ref', 'TEXT');
  ensureColumn('team_challenges', 'accepted_at', 'TEXT');
  ensureColumn('team_challenges', 'accepted_seq', 'INTEGER');
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_ref ON xp_transactions(ref) WHERE ref IS NOT NULL'); }
  catch (e) { console.warn('[db] index XP ref non créé:', e.message); }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_invoice ON payments(stripe_invoice_id)'); }
  catch (e) { console.warn('[db] index factures non créé:', e.message); }
  db.exec('CREATE INDEX IF NOT EXISTS idx_quizzes_curriculum ON quizzes(curriculum_id, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_flashcards_curriculum ON flashcards(curriculum_id, status)');
  // Canonical email for every existing row.
  try {
    db.exec("UPDATE users SET email_canon = lower(trim(email)) WHERE email_canon IS NULL OR email_canon = ''");
  } catch { /* ignore */ }
  // Unique constraints are guaranteed by the database, not just the app.
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_canon ON users(email_canon)'); }
  catch (e) { console.warn('[db] could not create email_canon index:', e.message); }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_norm ON users(username_norm) WHERE username_norm IS NOT NULL'); }
  catch (e) { console.warn('[db] could not create username_norm index:', e.message); }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_verify ON users(verify_expires)');
}

/**
 * Remove unverified signups older than a grace period so they never block an
 * address indefinitely. Guests, admins and verified accounts are never touched.
 */
export function cleanupUnverified(maxAgeHours = Number(process.env.UNVERIFIED_TTL_HOURS || 48)) {
  if (!db) return 0;
  try {
    const info = db.prepare(`DELETE FROM users WHERE is_guest = 0 AND email_verified = 0 AND role != 'admin'
      AND created_at < datetime('now', ?)`).run(`-${Math.max(1, maxAgeHours)} hours`);
    return info.changes || 0;
  } catch { return 0; }
}

/** Add a column to an existing table if it is missing (safe migration). */
function ensureColumn(table, column, type) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch { /* table may not exist yet */ }
}

/**
 * Attribue de l'XP côté serveur. Si `ref` est fourni, l'attribution est
 * IDEMPOTENTE : rejouer le même événement ne crédite pas deux fois.
 */
const xpHooks = [];
/** Permet à d'autres modules (équipes) d'être notifiés d'un gain d'XP effectif. */
export function onXpGranted(fn) { xpHooks.push(fn); }

export function addXp(userId, amount, reason, ref = null) {
  const d = getDb();
  if (!amount || amount <= 0) return { granted: false, amount: 0 };
  if (ref) {
    const info = d.prepare('INSERT OR IGNORE INTO xp_transactions (user_id, amount, reason, ref) VALUES (?, ?, ?, ?)')
      .run(userId, amount, reason, ref);
    if (info.changes === 0) return { granted: false, amount: 0, duplicate: true };
  } else {
    d.prepare('INSERT INTO xp_transactions (user_id, amount, reason) VALUES (?, ?, ?)').run(userId, amount, reason);
  }
  d.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(amount, userId);
  for (const hook of xpHooks) { try { hook(userId, amount, reason, ref); } catch { /* un hook ne doit jamais casser un gain d'XP */ } }
  return { granted: true, amount };
}

function seedBase() {
  const d = getDb();
  const subCount = d.prepare('SELECT COUNT(*) AS c FROM subjects').get().c;
  if (!subCount) {
    const ins = d.prepare('INSERT INTO subjects (slug, name, icon, color, description) VALUES (?, ?, ?, ?, ?)');
    for (const s of SUBJECTS) ins.run(...s);
  }
  const achCount = d.prepare('SELECT COUNT(*) AS c FROM achievements').get().c;
  if (!achCount) {
    const ins = d.prepare('INSERT INTO achievements (code, label, icon, description, xp) VALUES (?, ?, ?, ?, ?)');
    for (const a of ACHIEVEMENTS) ins.run(...a);
  }
  const chCount = d.prepare('SELECT COUNT(*) AS c FROM challenges').get().c;
  if (!chCount) {
    const ins = d.prepare('INSERT INTO challenges (code, label, icon, target, xp, metric) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of CHALLENGES) ins.run(...c);
  }
  // Idempotent quiz seeding: new quizzes are added on restart without duplicating.
  const getSub = d.prepare('SELECT id FROM subjects WHERE slug = ?');
  const quizExists = d.prepare('SELECT id FROM quizzes WHERE subject_id = ? AND title = ?');
  const insQuiz = d.prepare('INSERT INTO quizzes (subject_id, title, description, type, difficulty, is_premium, questions) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const quiz of [...QUIZZES, ...EXTRA_QUIZZES]) {
    const sub = getSub.get(quiz.subject);
    if (!sub) continue;
    if (quizExists.get(sub.id, quiz.title)) continue;
    insQuiz.run(sub.id, quiz.title, quiz.description || '', quiz.type || 'qcm', quiz.difficulty, quiz.isPremium || 0, JSON.stringify(quiz.questions));
  }
  const deckExists = d.prepare('SELECT id FROM flashcards WHERE subject_id = ? AND deck = ? LIMIT 1');
  const insCard = d.prepare('INSERT INTO flashcards (subject_id, deck, front, back, is_premium) VALUES (?, ?, ?, ?, ?)');
  for (const deck of FLASHCARD_DECKS) {
    const sub = getSub.get(deck.subject);
    if (!sub) continue;
    if (deckExists.get(sub.id, deck.deck)) continue;
    for (const [front, back] of deck.cards) insCard.run(sub.id, deck.deck, front, back, deck.isPremium ? 1 : 0);
  }
  const adsCount = d.prepare('SELECT COUNT(*) AS c FROM ad_settings').get().c;
  if (!adsCount) {
    const ins = d.prepare('INSERT INTO ad_settings (slot, provider, enabled) VALUES (?, ?, ?)');
    for (const slot of ['dashboard-top', 'explore-inline', 'quiz-results', 'games-inline', 'sidebar']) ins.run(slot, 'house', 1);
  }
  const adminEmail = process.env.ADMIN_EMAIL || 'imraneanbar39@gmail.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'jsusuuzuzzis.2003@!';
  const existing = d.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    d.prepare(`INSERT INTO users (email, email_canon, password_hash, role, plan, email_verified, username, username_norm, first_name, onboarding_done, xp, streak, longest_streak, subjects, country, school_level, subscription_status)
      VALUES (?, lower(trim(?)), ?, 'admin', 'premium', 1, 'Admin', 'admin', 'Admin', 1, 5200, 15, 15, '["maths","francais","histoire"]', 'France', 'Étudiant', 'active')`).run(adminEmail, adminEmail, hash);
  } else {
    d.prepare('UPDATE users SET role = ?, email_verified = 1, email_canon = lower(trim(email)) WHERE email = ?').run('admin', adminEmail);
  }
  const demoCount = d.prepare("SELECT COUNT(*) AS c FROM users WHERE email LIKE '%@reviqo.app'").get().c;
  if (!demoCount) {
    const hash = bcrypt.hashSync('demo1234', 10);
    const ins = d.prepare(`INSERT INTO users (email, email_canon, password_hash, role, plan, email_verified, username, username_norm, first_name, onboarding_done, xp, streak, longest_streak, subjects, country, school_level, subscription_status, ad_consent)
      VALUES (?, lower(trim(?)), ?, 'user', ?, 1, ?, lower(?), ?, 1, ?, ?, ?, '["maths","francais","anglais"]', 'France', 'Lycée', ?, 1)`);
    for (const a of DEMO_ACCOUNTS) {
      ins.run(a.email, a.email, hash, a.email === 'emma@reviqo.app' ? 'premium' : 'free', a.first_name, a.first_name, a.first_name, a.xp, a.streak, Math.max(a.streak, 5), 'active');
    }
    seedDemoActivity();
  }
}

/**
 * Remplit / met à jour la table `curricula` depuis le référentiel `programs.js`.
 * Idempotent : on peut relancer l'application sans dupliquer ni casser l'existant.
 */
function seedCurricula() {
  const d = getDb();
  const rows = listCurricula();
  const ins = d.prepare(`INSERT INTO curricula
    (country_code, country_label, system, level, grade, track, domain, label, subjects, exam_code, exam_label, exam_subjects, exam_options, series, content_status, needs_detail, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(country_code, level, grade, track, domain) DO UPDATE SET
      country_label = excluded.country_label,
      system = excluded.system,
      label = excluded.label,
      subjects = excluded.subjects,
      exam_code = excluded.exam_code,
      exam_label = excluded.exam_label,
      exam_subjects = excluded.exam_subjects,
      exam_options = excluded.exam_options,
      series = excluded.series,
      content_status = excluded.content_status,
      needs_detail = excluded.needs_detail,
      sort_order = excluded.sort_order`);
  for (const r of rows) {
    ins.run(
      r.country_code, r.country_label, r.system, r.level, r.grade, r.track, r.domain, r.label,
      JSON.stringify(r.subjects), r.exam_code, r.exam_label, JSON.stringify(r.exam_subjects),
      JSON.stringify(r.exam_options), JSON.stringify(r.series), r.content_status, r.needs_detail ? 1 : 0, r.sort_order,
    );
  }
}

export function findCurriculum({ countryCode, level, grade = '', track = '', domain = '' }) {
  if (!countryCode || !level) return null;
  return getDb().prepare('SELECT * FROM curricula WHERE country_code = ? AND level = ? AND grade = ? AND track = ? AND domain = ?')
    .get(countryCode, level, grade || '', track || '', domain || '') || null;
}

export function getCurriculumById(id) {
  if (!id) return null;
  return getDb().prepare('SELECT * FROM curricula WHERE id = ?').get(id) || null;
}

function seedDemoActivity() {
  const d = getDb();
  const users = d.prepare("SELECT id FROM users WHERE email LIKE '%@reviqo.app'").all();
  const quizzes = d.prepare('SELECT id, subject_id, questions FROM quizzes').all();
  if (!users.length || !quizzes.length) return;
  const ins = d.prepare('INSERT INTO quiz_attempts (user_id, quiz_id, subject_id, score, total, xp, accuracy, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\', ?))');
  for (const u of users) {
    for (let i = 0; i < 14; i++) {
      const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
      const total = JSON.parse(quiz.questions).length;
      const score = Math.min(total, Math.max(1, Math.round(total * (0.55 + Math.random() * 0.45))));
      ins.run(u.id, quiz.id, quiz.subject_id, score, total, 10 + score * 5, Math.round((score / total) * 100), 40 + Math.floor(Math.random() * 90), `-${i * 3} days`);
    }
    for (let i = 0; i < 6; i++) {
      d.prepare("INSERT INTO xp_transactions (user_id, amount, reason, created_at) VALUES (?, ?, 'quiz', datetime('now', ?))").run(u.id, 30 + Math.floor(Math.random() * 70), `-${i * 2} days`);
    }
  }
  const ach = d.prepare('SELECT id, code FROM achievements').all();
  const byCode = Object.fromEntries(ach.map((a) => [a.code, a.id]));
  for (const u of users) {
    if (byCode.first) d.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(u.id, byCode.first);
    if (byCode.streak7) d.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(u.id, byCode.streak7);
    if (byCode.quizmaster && Math.random() > 0.4) d.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(u.id, byCode.quizmaster);
  }
  d.prepare('INSERT INTO friendships (user_id, friend_id, status) SELECT a.id, b.id, \'accepted\' FROM users a, users b WHERE a.email = \'lea@reviqo.app\' AND b.email = \'emma@reviqo.app\'').run();
}

/**
 * Seed idempotent de la bibliothèque contextualisée (contenus par classe).
 * Les ressources existantes sont préservées : on n'insère que ce qui manque.
 */
function seedContentLibrary() {
  const d = getDb();
  const getSub = d.prepare('SELECT id FROM subjects WHERE slug = ?');
  const quizExists = d.prepare('SELECT id FROM quizzes WHERE curriculum_id = ? AND title = ?');
  const insQuiz = d.prepare(`INSERT INTO quizzes
    (subject_id, title, description, type, difficulty, is_premium, questions, curriculum_id, status, language, chapter, objectives, prerequisites, version, sources, country_code, level, grade, content_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of GRADED_QUIZZES) {
    const sub = getSub.get(r.subject);
    if (!sub) continue;
    const cur = findCurriculum({ countryCode: r.countryCode, level: r.level, grade: r.grade });
    const curId = cur?.id || null;
    if (curId && quizExists.get(curId, r.title)) continue;
    insQuiz.run(sub.id, r.title, r.description || '', r.type || 'qcm', r.difficulty || 'medium', r.isPremium ? 1 : 0,
      JSON.stringify(r.questions), curId, 'published', r.language || 'fr', r.chapter || '',
      JSON.stringify(r.objectives || []), JSON.stringify(r.prerequisites || []), r.version || 1,
      JSON.stringify(r.sources || []), r.countryCode || null, r.level || null, r.grade || null, r.contentType || 'original');
  }
  const deckExists = d.prepare('SELECT id FROM flashcards WHERE curriculum_id = ? AND deck = ? LIMIT 1');
  const insCard = d.prepare(`INSERT INTO flashcards
    (subject_id, deck, front, back, is_premium, curriculum_id, status, language, chapter, objectives, prerequisites, version, sources, country_code, level, grade, content_type, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const deck of GRADED_DECKS) {
    const sub = getSub.get(deck.subject);
    if (!sub) continue;
    const cur = findCurriculum({ countryCode: deck.countryCode, level: deck.level, grade: deck.grade });
    const curId = cur?.id || null;
    if (curId && deckExists.get(curId, deck.deck)) continue;
    for (const [front, back] of deck.cards) {
      insCard.run(sub.id, deck.deck, front, back, deck.isPremium ? 1 : 0, curId, 'published', deck.language || 'fr',
        deck.chapter || '', JSON.stringify(deck.objectives || []), JSON.stringify(deck.prerequisites || []),
        deck.version || 1, JSON.stringify(deck.sources || []), deck.countryCode || null, deck.level || null,
        deck.grade || null, deck.contentType || 'original', deck.difficulty || 'easy');
    }
  }
}

export function uid() {
  return crypto.randomUUID();
}
