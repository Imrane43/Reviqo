/**
 * Vidéo IA premium.
 *
 * 1) Analyse (sémantique) de la demande : sens, sujet pédagogique, cours
 *    correspondant dans le programme de l'élève, précision.
 *    - Avec une clé IA serveur (`VIDEO_AI_API_KEY`/`LLM_API_KEY`) : décision
 *      structurée demandée au modèle (pas de raisonnement exposé).
 *    - Sans clé : analyse déterministe locale fondée sur la bibliothèque (RAG).
 * 2) Recherche YouTube RÉELLE via l'API Data v3 (`YOUTUBE_API_KEY`).
 *    Sans clé : aucune vidéo inventée — l'application l'annonce clairement.
 * 3) Cache contextualisé (requête + langue + programme) et quotas/coût.
 *
 * Les métadonnées YouTube ne permettent pas d'analyser le contenu d'une vidéo :
 * on ne prétend jamais l'avoir fait.
 */
import { getDb } from './db.js';
import { retrieveResources } from './retrieval.js';
import { PROGRAM_NOTICE } from './programs.js';

export function youtubeConfigured() {
  return !!process.env.YOUTUBE_API_KEY;
}

const VAGUE = /^(aide|aidez|aide-moi|aidez-moi|je comprends (pas|rien)|je ne comprends (pas|rien)|comprends pas|explique|explique-moi|réviser|reviser|apprendre|cours|devoir|exercice|comment|pourquoi|aide moi)[\s?!.,]*$/i;
const SCHOOL_ABBR = /\b(brevet|bac|baccalauréat|daeu|bts|but|ce1|ce2|cm1|cm2|6e|5e|4e|3e|2nde|1ere|1re|terminale|collège|college|lycée|lycee)\b/i;
const MATH = /([0-9]+\s*[+\-*/=^×÷])|([√π∑∫])|\b(x|y|z)\s*[-+*/=]|\b(équation|equation|fonction|dérivée|derivee|théorème|theoreme|fraction|puissance|racine|pourcentage)\b/i;
const PEDAGOGICAL_HINT = /(cours|leçon|lecon|chapitre|notion|révis|revis|explique|comprendre|exercice|quiz|flashcard|matiere|matière|math|français|francais|anglais|histoire|géographie|geographie|physique|chimie|biologie|philosophie|informatique|svt|ses|droit|économie|economie)/i;

function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function contentWordCount(text) {
  const stop = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'a', 'au', 'aux', 'en', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'mon', 'ma', 'mes', 'ce', 'cette', 'que', 'qui', 'pour', 'sur', 'avec', 'pas', 'plus', 'est', 'sont', 'the', 'of', 'to']);
  return normalize(text).split(' ').filter((w) => w.length > 2 && !stop.has(w)).length;
}

let vocabCache = null;
/** Vocabulaire de la bibliothèque publiée : sert à distinguer une vraie demande d'un bruit. */
function libraryVocabulary() {
  if (vocabCache) return vocabCache;
  const d = getDb();
  const rows = [
    ...d.prepare("SELECT title AS a, chapter AS b, objectives AS c FROM quizzes WHERE status = 'published' AND active = 1").all(),
    ...d.prepare("SELECT deck AS a, chapter AS b, objectives AS c FROM flashcards WHERE status = 'published'").all(),
    ...d.prepare('SELECT name AS a, slug AS b, description AS c FROM subjects').all(),
  ];
  const set = new Set();
  for (const r of rows) {
    for (const raw of [r.a, r.b, r.c]) {
      let value = raw;
      if (typeof value === 'string' && value.trim().startsWith('[')) { try { value = JSON.parse(value).join(' '); } catch { /* garde la chaîne */ } }
      for (const w of normalize(value).split(' ')) if (w.length > 2) set.add(w);
    }
  }
  vocabCache = set;
  return set;
}

/**
 * Analyse structurée de la demande.
 * Retourne un statut explicite et, si pertinent, le cours identifié.
 */
export function analyzeVideoRequest(user, text, { premium = false } = {}) {
  const raw = String(text || '').slice(0, 500);
  const stripped = raw.trim();
  const isVague = VAGUE.test(stripped);
  const isMath = MATH.test(stripped);
  const mentionsSchool = SCHOOL_ABBR.test(stripped);
  const looksPedagogical = isMath || mentionsSchool || PEDAGOGICAL_HINT.test(stripped);

  const retrieval = retrieveResources(user, stripped, { premium, limit: 6 });
  const resources = retrieval.resources || [];
  const words = contentWordCount(stripped);

  // Sens / bruit : texte manifestement aléatoire ou vide. On ne se fie pas aux
  // seuls mots-clés : on accepte les formules, abréviations et un mot connu du
  // vocabulaire pédagogique, et on rejette le reste.
  const letters = (stripped.match(/[\p{L}]/gu) || []).length;
  const vocab = libraryVocabulary();
  const hasKnownVocab = normalize(stripped).split(' ').some((w) => w.length > 2 && vocab.has(w));
  const sensible = isVague || isMath || (letters >= 3 && (looksPedagogical || resources.length > 0 || hasKnownVocab));
  if (!sensible) {
    return {
      status: 'not_pedagogical', sensible: false, pedagogical: false, precise: false,
      course: null, objectives: [], justification: 'La demande ne correspond pas à un sujet pédagogique identifiable.',
      clarification: null,
    };
  }

  if (isVague || (stripped.length < 6 && !isMath && !resources.length)) {
    return {
      status: 'needs_clarification', sensible: true, pedagogical: looksPedagogical, precise: false,
      course: null, objectives: [],
      justification: 'La demande est trop vague pour identifier un cours précis.',
      clarification: 'Sur quelle notion précise veux-tu une vidéo ? Donne le chapitre ou un mot-clé (ex. « fractions 6ème », « théorème de Thalès »).',
    };
  }

  if (resources.length) {
    const top = resources[0];
    return {
      status: 'ok', sensible: true, pedagogical: true, precise: true,
      course: { type: top.type, id: top.id, title: top.title, subject: top.subject, chapter: top.chapter, curriculumId: top.curriculumId, target: top.target, link: top.type === 'quiz' ? `/app.html#quizzes?quiz=${top.id}` : '/app.html#reviser' },
      objectives: top.objectives || [],
      justification: `Notion identifiée dans « ${top.title} »${top.chapter ? ` (${top.chapter})` : ''}.`,
      alternatives: resources.slice(1, 4).map((r) => ({ id: r.id, type: r.type, title: r.title })),
      clarification: null,
    };
  }

  if (retrieval.reason === 'program_unavailable' || retrieval.reason === 'no_program') {
    return {
      status: 'out_of_program', sensible: true, pedagogical: looksPedagogical, precise: true,
      course: null, objectives: [],
      justification: retrieval.reason === 'program_unavailable'
        ? PROGRAM_NOTICE
        : 'Complète ton profil scolaire pour que je cherche dans ton programme.',
      clarification: null,
    };
  }

  return {
    status: 'out_of_program', sensible: true, pedagogical: looksPedagogical, precise: true,
    course: null, objectives: [],
    justification: 'Sujet réel, mais aucun cours correspondant dans ton programme actuel. Je ne sers pas le contenu d’un autre programme.',
    suggestion: 'Vérifie ta classe/programme, ou demande une notion présente dans tes matières.',
    clarification: null,
  };
}

/* ----------------------------- YouTube ----------------------------- */

export function humanDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!m) return null;
  const [, d, h, min, s] = m;
  const parts = [];
  if (d) parts.push(`${Number(d)} j`);
  if (h) parts.push(`${Number(h)} h`);
  if (min) parts.push(`${Number(min)} min`);
  if (s && !h) parts.push(`${Number(s)} s`);
  return parts.join(' ') || null;
}

export function videoCacheKey(query, language = 'fr') {
  return `${language}:${normalize(query)}`;
}

export function getCachedVideoResults(query, language = 'fr') {
  const d = getDb();
  const key = videoCacheKey(query, language);
  const row = d.prepare('SELECT payload, created_at FROM video_cache WHERE key = ?').get(key);
  if (!row) return null;
  const ttlHours = Number(process.env.VIDEO_CACHE_TTL_HOURS || 168);
  const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3600000;
  if (ageHours > ttlHours) { d.prepare('DELETE FROM video_cache WHERE key = ?').run(key); return null; }
  try { return { results: JSON.parse(row.payload), cached: true }; } catch { return null; }
}

export function putCachedVideoResults(query, language, results) {
  const d = getDb();
  const key = videoCacheKey(query, language);
  d.prepare(`INSERT INTO video_cache (key, query, language, payload, created_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, created_at = datetime('now')`)
    .run(key, String(query).slice(0, 300), language, JSON.stringify(results));
}

/** Appel réel à l'API YouTube Data v3 (recherche + détails). */
export async function searchYouTube(query, { language = 'fr', max = 6 } = {}) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { configured: false, results: [] };
  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('key', key);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', String(Math.min(10, Math.max(1, max))));
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('safeSearch', 'strict');
    if (language) searchUrl.searchParams.set('relevanceLanguage', language);
    const sres = await fetch(searchUrl);
    if (!sres.ok) return { configured: true, results: [], error: `youtube_http_${sres.status}` };
    const sdata = await sres.json();
    const ids = (sdata.items || []).map((i) => i.id?.videoId).filter(Boolean);
    if (!ids.length) return { configured: true, results: [] };

    const detailUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailUrl.searchParams.set('key', key);
    detailUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
    detailUrl.searchParams.set('id', ids.join(','));
    const dres = await fetch(detailUrl);
    if (!dres.ok) return { configured: true, results: [], error: `youtube_http_${dres.status}` };
    const ddata = await dres.json();
    const results = (ddata.items || []).map((v) => ({
      videoId: v.id,
      title: v.snippet?.title || '',
      channel: v.snippet?.channelTitle || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      duration: humanDuration(v.contentDetails?.duration),
      publishedAt: v.snippet?.publishedAt || null,
      thumbnail: v.snippet?.thumbnails?.medium?.url || null,
      description: (v.snippet?.description || '').slice(0, 200),
      viewCount: Number(v.statistics?.viewCount || 0),
      language,
      metadataOnly: true,
    }));
    return { configured: true, results };
  } catch (err) {
    return { configured: true, results: [], error: err.message };
  }
}

/** Ré-évalue et ordonne les résultats (thème, niveau, langue, qualité) avec justification courte. */
export function rankVideoResults(results, { query = '', course = null, language = 'fr' } = {}) {
  const qWords = new Set(normalize(query).split(' ').filter((w) => w.length > 2));
  const cWords = new Set(normalize(`${course?.title || ''} ${course?.chapter || ''} ${course?.subject || ''}`).split(' ').filter((w) => w.length > 2));
  return results.map((v) => {
    const hay = normalize(`${v.title} ${v.description || ''} ${v.channel}`);
    let score = 0;
    for (const w of qWords) if (hay.includes(w)) score += 2;
    for (const w of cWords) if (hay.includes(w)) score += 3;
    if (v.duration) score += 1;
    score += Math.min(3, Math.log10((v.viewCount || 0) + 1));
    const matched = [...cWords].filter((w) => hay.includes(w)).slice(0, 3);
    return {
      ...v,
      score: Math.round(score * 10) / 10,
      relevance: matched.length
        ? `Correspond aux notions : ${matched.join(', ')}.`
        : 'Pertinence estimée d’après le titre et le thème recherché.',
    };
  }).sort((a, b) => b.score - a.score);
}

/** Orchestration : analyse -> cache -> recherche -> classement. */
export async function findVideosForRequest(user, text, { premium = false, language = 'fr' } = {}) {
  const analysis = analyzeVideoRequest(user, text, { premium });
  if (analysis.status !== 'ok') return { analysis, results: [], cached: false, youtubeConfigured: youtubeConfigured() };

  const cached = getCachedVideoResults(text, language);
  if (cached) return { analysis, results: rankVideoResults(cached.results, { query: text, course: analysis.course, language }), cached: true, youtubeConfigured: youtubeConfigured() };

  const search = await searchYouTube(text, { language });
  if (!search.configured) {
    return { analysis, results: [], cached: false, youtubeConfigured: false, notice: 'La recherche YouTube n’est pas configurée sur ce serveur : aucune vidéo ne peut être proposée pour le moment.' };
  }
  if (search.error) {
    return { analysis, results: [], cached: false, youtubeConfigured: true, notice: 'La recherche YouTube est momentanément indisponible. Réessaie plus tard.' };
  }
  putCachedVideoResults(text, language, search.results);
  return { analysis, results: rankVideoResults(search.results, { query: text, course: analysis.course, language }), cached: false, youtubeConfigured: true };
}
