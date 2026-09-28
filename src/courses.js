/**
 * Cours personnalisés + génération IA (priorités 9 à 12).
 *
 * Chaîne : profil → niveau → classe → voie → filière → spécialités → matière →
 * chapitre → cours. Le filtrage est STRICT : un élève de 3ᵉ ne reçoit jamais un
 * cours de Première, et une Première avec NSI ne reçoit pas les cours d'une
 * Première sans NSI.
 *
 * L'IA ne génère jamais le même cours deux fois : avant insertion on compare
 * l'empreinte (fingerprint) et la similarité des titres ; en cas de doublon on
 * demande une variante réellement différente.
 */
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';
import { chatCompletionJson } from './openai.js';
import { effectiveCurriculum } from './retrieval.js';
import { subjectsFromCurriculum } from './programs.js';

export const COURSE_STATUSES = ['draft', 'to_validate', 'published', 'archived'];

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function fingerprint({ title, subjectSlug, curriculumId, chapter }) {
  return crypto.createHash('sha256')
    .update([normalizeText(title), subjectSlug || '', curriculumId ?? '', normalizeText(chapter)].join('|'))
    .digest('hex');
}

export function similarity(a, b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean));
  const B = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** Cherche un cours identique (empreinte) ou très proche (similarité ≥ 0.8). */
export function findSimilarCourse(d, { curriculumId, subjectId, fingerprint: fp, title }) {
  if (fp) {
    const byFp = d.prepare('SELECT id, title FROM courses WHERE fingerprint = ?').get(fp);
    if (byFp) return { ...byFp, reason: 'fingerprint' };
  }
  const rows = d.prepare('SELECT id, title FROM courses WHERE subject_id = ? AND (curriculum_id = ? OR curriculum_id IS NULL)').all(subjectId, curriculumId ?? null);
  for (const r of rows) {
    if (similarity(title, r.title) >= 0.8) return { ...r, reason: 'similar_title' };
  }
  return null;
}

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function serializeCourse(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    subject: { id: row.subject_id, slug: row.subject_slug || null, name: row.subject_name || null },
    curriculumId: row.curriculum_id,
    level: row.level, grade: row.grade, track: row.track,
    specialties: parseArr(row.specialties),
    chapter: row.chapter, difficulty: row.difficulty, language: row.language,
    objective: row.objective,
    prerequisites: parseArr(row.prerequisites),
    sections: parseArr(row.sections),
    examples: parseArr(row.examples),
    method: row.method,
    commonMistakes: parseArr(row.common_mistakes),
    exercise: row.exercise,
    correction: row.correction,
    quiz: parseArr(row.quiz),
    summary: row.summary,
    flashcards: parseArr(row.flashcards),
    source: row.source,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
  };
}

/**
 * Cours personnalisés pour un utilisateur, filtrés STRICTEMENT par programme,
 * spécialités et matière. Ne renvoie jamais le contenu d'un autre programme.
 */
export function getPersonalizedCourses(user, { subjectSlug, chapter, difficulty, limit = 20 } = {}) {
  const d = getDb();
  const cur = effectiveCurriculum(user);
  if (!cur) return { courses: [], notice: 'Complète ton profil scolaire pour voir tes cours.' };
  if (cur.content_status === 'unavailable') {
    return { courses: [], contentStatus: 'unavailable', notice: 'Contenu non encore disponible pour ce programme' };
  }
  const allowedSubjects = new Set(subjectsFromCurriculum(cur));
  const userSpecialties = Array.isArray(user?.specialties) ? user.specialties : parseArr(user?.specialties);
  const params = [cur.id];
  let sql = `SELECT c.*, s.slug AS subject_slug, s.name AS subject_name FROM courses c LEFT JOIN subjects s ON s.id = c.subject_id
    WHERE c.status = 'published' AND c.curriculum_id = ?`;
  if (subjectSlug) { sql += ' AND s.slug = ?'; params.push(subjectSlug); }
  if (chapter) { sql += ' AND lower(c.chapter) LIKE ?'; params.push(`%${String(chapter).toLowerCase()}%`); }
  if (difficulty) { sql += ' AND c.difficulty = ?'; params.push(difficulty); }
  sql += ' ORDER BY c.id DESC LIMIT ?';
  params.push(Math.min(100, Math.max(1, limit)));
  const rows = d.prepare(sql).all(...params);
  // Spécialités : un cours sans spécialité s'applique à tous ; sinon il faut une intersection.
  const courses = rows.filter((r) => {
    const specs = parseArr(r.specialties);
    if (!specs.length) return true;
    return specs.some((s) => userSpecialties.includes(s));
  }).map(serializeCourse);
  return {
    courses,
    curriculum: { id: cur.id, label: cur.label, contentStatus: cur.content_status },
    allowedSubjects: [...allowedSubjects],
    notice: courses.length ? null : 'Aucun cours publié pour ce profil exact. Tu peux en générer un.',
  };
}

function validateGeneratedCourse(course) {
  const errors = [];
  if (!course || typeof course !== 'object') errors.push('Objet attendu.');
  if (!course?.title) errors.push('Titre manquant.');
  if (!Array.isArray(course?.sections) || !course.sections.length) errors.push('Sections manquantes.');
  if (!course?.summary) errors.push('Résumé manquant.');
  return errors;
}

const COURSE_SCHEMA_HINT = `Réponds STRICTEMENT en JSON avec :
{"title":string,"objective":string,"prerequisites":string[],"sections":[{"heading":string,"content":string}],"examples":string[],"method":string,"commonMistakes":string[],"exercise":string,"correction":string,"quiz":[{"text":string,"options":string[],"answer":number,"explanation":string}],"summary":string,"flashcards":[{"front":string,"back":string}]}`;

/**
 * Génère un cours adapté au profil exact via l'IA serveur.
 * Anti-doublon : jusqu'à 3 tentatives pour produire une variante réellement différente.
 */
export async function generateCourse(user, { subjectSlug, chapter, difficulty = 'medium', angle = null } = {}) {
  const d = getDb();
  const cur = effectiveCurriculum(user);
  if (!cur) return { error: 'NO_PROGRAM', message: 'Complète ton profil scolaire avant de générer un cours.' };
  if (cur.content_status === 'unavailable') return { error: 'PROGRAM_UNAVAILABLE', message: 'Contenu non encore disponible pour ce programme' };
  if (!config.ai.configured) {
    return { error: 'AI_NOT_CONFIGURED', message: 'Aucune clé IA n’est configurée côté serveur : la génération de cours est indisponible.' };
  }
  const subject = subjectSlug
    ? d.prepare('SELECT id, slug, name FROM subjects WHERE slug = ?').get(String(subjectSlug))
    : d.prepare('SELECT s.id, s.slug, s.name FROM subjects s WHERE s.slug IN (SELECT value FROM json_each(?)) LIMIT 1').get(JSON.stringify(subjectsFromCurriculum(cur)));
  if (!subject) return { error: 'NO_SUBJECT', message: 'Matière inconnue ou hors programme.' };

  const specialties = Array.isArray(user?.specialties) ? user.specialties : parseArr(user?.specialties);
  const profile = [
    `Niveau : ${cur.level}`,
    `Classe : ${cur.grade || cur.label}`,
    cur.track ? `Voie : ${cur.track}` : null,
    specialties.length ? `Spécialités : ${specialties.join(', ')}` : null,
    `Matière : ${subject.name}`,
    chapter ? `Chapitre : ${chapter}` : null,
    `Difficulté : ${difficulty}`,
  ].filter(Boolean).join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    const variant = attempt === 0 ? '' : `\nVariante n°${attempt + 1} : angle, exemples et exercices RÉELLEMENT différents des versions existantes.${angle ? ` Angle imposé : ${angle}.` : ''}`;
    const result = await chatCompletionJson({
      messages: [
        { role: 'system', content: `Tu es un professeur qui rédige un cours ORIGINAL, rigoureux, adapté au niveau scolaire indiqué. Un élève de 6ᵉ ne doit jamais recevoir un cours de Terminale. ${COURSE_SCHEMA_HINT}` },
        { role: 'user', content: `Rédige un cours pour ce profil :\n${profile}\n${variant}` },
      ],
      maxTokens: 1800,
      temperature: attempt === 0 ? 0.5 : 0.8,
    });
    if (!result.ok) return { error: result.error.code, message: result.error.message };
    const course = result.data;
    const errors = validateGeneratedCourse(course);
    if (errors.length) continue;
    const fp = fingerprint({ title: course.title, subjectSlug: subject.slug, curriculumId: cur.id, chapter: course.chapter || chapter });
    if (findSimilarCourse(d, { curriculumId: cur.id, subjectId: subject.id, fingerprint: fp, title: course.title })) continue;
    const specialtiesOut = specialties.length ? specialties : [];
    const info = d.prepare(`INSERT INTO courses
      (curriculum_id, subject_id, level, grade, track, specialties, chapter, title, objective, prerequisites, sections, examples, method, common_mistakes, exercise, correction, quiz, summary, flashcards, difficulty, language, fingerprint, source, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, 'ai', 'published')`).run(
      cur.id, subject.id, cur.level, cur.grade || '', cur.track || '', JSON.stringify(specialtiesOut), course.chapter || chapter || '',
      course.title, course.objective || '', JSON.stringify(parseArr(course.prerequisites)), JSON.stringify(parseArr(course.sections)),
      JSON.stringify(parseArr(course.examples)), course.method || '', JSON.stringify(parseArr(course.commonMistakes)),
      course.exercise || '', course.correction || '', JSON.stringify(parseArr(course.quiz)), course.summary || '',
      JSON.stringify(parseArr(course.flashcards)), difficulty, fp,
    );
    return { ok: true, course: serializeCourse(d.prepare('SELECT c.*, s.slug AS subject_slug, s.name AS subject_name FROM courses c LEFT JOIN subjects s ON s.id = c.subject_id WHERE c.id = ?').get(info.lastInsertRowid)), attempts: attempt + 1 };
  }
  return { error: 'DUPLICATE', message: 'L’IA a produit un contenu trop proche d’un cours existant après plusieurs tentatives. Réessaie avec un chapitre différent.' };
}

export { serializeCourse };
