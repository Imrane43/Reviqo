/**
 * Empreinte et similarité de contenu (anti-doublon), partagées entre le seed
 * de cours et la génération IA.
 */
import crypto from 'node:crypto';

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Empreinte stable d'un cours (titre + matière + programme + chapitre normalisés). */
export function fingerprint({ title, subjectSlug, curriculumId, chapter }) {
  return crypto.createHash('sha256')
    .update([normalizeText(title), subjectSlug || '', curriculumId ?? '', normalizeText(chapter)].join('|'))
    .digest('hex');
}

/** Similarité de Jaccard sur les mots (0 → 1). */
export function similarity(a, b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean));
  const B = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}
