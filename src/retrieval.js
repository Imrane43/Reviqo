/**
 * Récupération de contenu pédagogique (RAG) pour le Coach IA.
 *
 * Principes :
 *  - Filtres STRICTS par programme : on ne sert que le contenu de la classe de
 *    l'utilisateur (curriculum_id) ou, à défaut, du contenu générique rattaché
 *    à une matière de son programme. Jamais le contenu d'un autre programme.
 *  - Droits d'accès : le contenu premium n'est jamais récupéré pour un compte gratuit.
 *  - Aucune donnée d'un autre utilisateur : la base interrogée est la bibliothèque
 *    partagée (contenus publiés), pas les données personnelles.
 *  - Le contenu récupéré est une DONNÉE, jamais une instruction : il est nettoyé
 *    (anti-injection) avant d'être présenté au modèle ou au moteur local.
 */
import { getDb, getCurriculumById, findCurriculum } from './db.js';
import { countryByLabel, genericLevelToSystem, subjectsFromCurriculum, PROGRAM_NOTICE } from './programs.js';

const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'est', 'sont', 'que', 'qui', 'dans', 'pour', 'avec', 'sur', 'par', 'au', 'aux', 'en', 'ce', 'cette', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'a', 'the', 'of', 'to', 'and', 'is', 'are', 'in', 'for', 'with', 'on', 'as', 'at', 'be', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'comment', 'pourquoi', 'quoi', 'quel', 'quelle', 'explique', 'moi', 'peux', 'tu', 'je', 'merci']);

const INJECTION_PATTERNS = [
  /ignore[- ]?(toutes?[- ]?)?(les[- ]?)?(instructions?|consignes?|r[eè]gles?)/gi,
  /ignore[- ]?(all[- ]?)?(previous|prior|the above)?[- ]?instructions?/gi,
  /(system|assistant|developer|utilisateur|user)\s*:/gi,
  /\btu es (maintenant|désormais)\b/gi,
  /\byou are now\b/gi,
  /(donne|attribue|accorde|active)[- ]moi[^.\n]*(admin|premium|r[oô]le)/gi,
  /(grant|give|activate)[^.\n]*(admin|premium|role)/gi,
  /(r[eé]v[eè]le|montre|donne)[^.\n]*(cl[eé]|secret|mot de passe|token|api)/gi,
  /(api[_-]?key|secret|password|token)\s*[:=]/gi,
  /<\s*\/?\s*(script|iframe|img|svg)/gi,
  /\[\s*(instruction|system|admin)\s*\]/gi,
];

/** Neutralise les tentatives d'injection ; le contenu reste une donnée inerte. */
export function sanitizeRetrieved(text, maxLen = 1400) {
  let out = String(text ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLen);
  for (const pattern of INJECTION_PATTERNS) out = out.replace(pattern, '[contenu neutralisé]');
  return out.trim();
}

export function containsInjection(text) {
  const value = String(text ?? '');
  return INJECTION_PATTERNS.some((p) => { p.lastIndex = 0; return p.test(value); });
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywords(text, n = 10) {
  const words = normalize(text).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, n);
}

/** Programme effectif de l'utilisateur (par curriculum_id, sinon résolu depuis le profil). */
export function effectiveCurriculum(user) {
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

function toResource(row, type) {
  const snippet = type === 'flashcard' ? `${row.front} — ${row.back}` : (row.description || row.chapter || '');
  return {
    type,
    id: row.id,
    title: sanitizeRetrieved(row.title, 200),
    chapter: sanitizeRetrieved(row.chapter || '', 160),
    objectives: (row.objectives || []).map((o) => sanitizeRetrieved(o, 160)).slice(0, 6),
    subject: row.subjectName || null,
    subjectSlug: row.subjectSlug || null,
    difficulty: row.difficulty || null,
    curriculumId: row.curriculum_id || null,
    target: row.curriculum_id ? 'class' : 'subject',
    isPremium: !!row.is_premium,
    language: row.language || 'fr',
    snippet: sanitizeRetrieved(snippet, 400),
  };
}

function scoreResource(resource, keys) {
  const title = normalize(resource.title);
  const chapter = normalize(resource.chapter);
  const objectives = normalize(resource.objectives.join(' '));
  const subject = normalize(resource.subject);
  const body = normalize(resource.snippet);
  let score = 0;
  for (const k of keys) {
    if (title.includes(k)) score += 4;
    if (chapter.includes(k)) score += 3;
    if (objectives.includes(k)) score += 2;
    if (body.includes(k)) score += 2;
    if (subject.includes(k)) score += 1;
  }
  // Le contenu de classe est plus précis, mais seulement s'il correspond déjà à la question.
  if (resource.curriculumId && score > 0) score += 1;
  return score;
}

/**
 * Récupère les ressources pédagogiques pertinentes pour la question, dans le
 * strict périmètre du programme et des droits d'accès de l'utilisateur.
 */
export function retrieveResources(user, query, { premium = false, limit = 6 } = {}) {
  const d = getDb();
  const cur = effectiveCurriculum(user);
  if (!cur) return { curriculum: null, resources: [], reason: 'no_program' };
  if (cur.content_status === 'unavailable') return { curriculum: cur, resources: [], reason: 'program_unavailable', notice: PROGRAM_NOTICE };

  const allowed = new Set(subjectsFromCurriculum(cur));
  const premiumClause = premium ? '' : ' AND q.is_premium = 0';
  const quizRows = d.prepare(`SELECT q.id, q.title, q.description, q.chapter, q.objectives, q.difficulty, q.is_premium, q.curriculum_id, q.language, s.slug AS subjectSlug, s.name AS subjectName
    FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.active = 1 AND q.status = 'published'${premiumClause}`).all();
  const cardPremiumClause = premium ? '' : ' AND f.is_premium = 0';
  const cardRows = d.prepare(`SELECT f.id, f.deck AS title, f.front, f.back, f.chapter, f.objectives, f.difficulty, f.is_premium, f.curriculum_id, f.language, s.slug AS subjectSlug, s.name AS subjectName
    FROM flashcards f JOIN subjects s ON s.id = f.subject_id WHERE f.status = 'published'${cardPremiumClause}`).all();

  const parseObjectives = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v ? JSON.parse(v) : []));
  const candidates = [
    ...quizRows.map((r) => ({ ...r, objectives: parseObjectives(r.objectives) })),
    ...cardRows.map((r) => ({ ...r, objectives: parseObjectives(r.objectives) })),
  ];

  // Filtre STRICT par programme + droits.
  const scoped = candidates.filter((r) => {
    if (r.curriculum_id === cur.id) return true;
    if (!r.curriculum_id && allowed.has(r.subjectSlug)) return true;
    return false;
  });

  const keys = keywords(query);
  if (!keys.length) return { curriculum: cur, resources: [], reason: 'empty_query' };

  const scored = scoped
    .map((r) => ({ resource: toResource(r, r.front !== undefined ? 'flashcard' : 'quiz'), score: scoreResource(toResource(r, r.front !== undefined ? 'flashcard' : 'quiz'), keys) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.resource.curriculumId ? 1 : 0) - 0 || b.resource.id - a.resource.id)
    .slice(0, limit)
    .map((x) => x.resource);

  return { curriculum: cur, resources: scored, reason: scored.length ? 'matched' : 'no_match' };
}

/** Citations structurées renvoyées au client (aucune clé de réponses). */
export function toCitations(resources) {
  return (resources || []).map((r) => ({
    type: r.type,
    id: r.id,
    title: r.title,
    subject: r.subject,
    chapter: r.chapter || null,
    target: r.target,
    difficulty: r.difficulty || null,
  }));
}

/** Bloc de contexte à insérer dans le prompt : les sources sont balisées comme données non fiables. */
export function buildRetrievalContext(resources) {
  if (!resources || !resources.length) return '';
  return resources.map((r, i) => {
    const parts = [
      `[SOURCE ${i + 1}] (${r.type}) ${r.title}`,
      r.subject ? `Matière : ${r.subject}` : null,
      r.chapter ? `Chapitre : ${r.chapter}` : null,
      r.objectives.length ? `Objectifs : ${r.objectives.join(' ; ')}` : null,
    ].filter(Boolean).join('\n');
    return `${parts}\n<donnee_non_fiable>\n${r.snippet || ''}\n</donnee_non_fiable>`;
  }).join('\n\n');
}
