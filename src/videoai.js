/**
 * Vidéo IA — file de génération (jobs) côté serveur.
 *
 * IMPORTANT (honnêteté) : le fournisseur de génération vidéo n'est pas identifié
 * dans le projet. On n'en invente pas. Si aucune clé/URL de fournisseur n'est
 * configurée, le job est marqué `failed` avec un message explicite et l'on
 * oriente vers la recherche YouTube (qui, elle, est réelle).
 *
 * Adapter générique compatible OpenAI si `VIDEO_AI_API_KEY` + `VIDEO_AI_API_URL`
 * sont fournis (endpoint `{base}/videos`, modèle `VIDEO_AI_MODEL`). À ajuster
 * selon le fournisseur réellement retenu.
 */
import { getDb } from './db.js';
import { config } from './config.js';

export const VIDEO_STATES = ['pending', 'processing', 'completed', 'failed'];

function serialize(row) {
  if (!row) return null;
  let result = null;
  try { result = row.result ? JSON.parse(row.result) : null; } catch { result = null; }
  let error = null;
  try { error = row.error ? JSON.parse(row.error) : null; } catch { error = null; }
  return {
    id: row.id, query: row.query, provider: row.provider, status: row.status,
    curriculumId: row.curriculum_id, providerJobId: row.provider_job_id || null,
    result, error, createdAt: row.created_at, updatedAt: row.updated_at || null,
  };
}

export function getVideoJob(user, id) {
  const row = getDb().prepare('SELECT * FROM video_jobs WHERE id = ? AND user_id = ?').get(Number(id), user.id);
  return serialize(row);
}

export function listVideoJobs(user, limit = 20) {
  return getDb().prepare('SELECT * FROM video_jobs WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(user.id, Math.min(50, Math.max(1, limit))).map(serialize);
}

/** Crée un job. Sans fournisseur configuré, le job échoue immédiatement et honnêtement. */
export function createVideoJob(user, { query, curriculumId = null }) {
  const d = getDb();
  const provider = config.video.configured ? 'openai-compatible' : 'none';
  const status = config.video.configured ? 'pending' : 'failed';
  const error = config.video.configured ? null : JSON.stringify({ code: 'VIDEO_PROVIDER_MISSING', message: 'Aucun fournisseur de génération vidéo n’est configuré. Utilise la recherche YouTube (réelle) ou la vidéo générée à partir de ton cours.' });
  const info = d.prepare('INSERT INTO video_jobs (user_id, curriculum_id, query, provider, status, error) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, curriculumId, String(query).slice(0, 300), provider, status, error);
  return getVideoJob(user, info.lastInsertRowid);
}

function updateJob(id, patch) {
  const d = getDb();
  d.prepare(`UPDATE video_jobs SET status = COALESCE(?, status), provider_job_id = COALESCE(?, provider_job_id),
    result = COALESCE(?, result), error = COALESCE(?, error), updated_at = datetime('now') WHERE id = ?`)
    .run(patch.status ?? null, patch.providerJobId ?? null, patch.result ? JSON.stringify(patch.result) : null,
      patch.error ? JSON.stringify(patch.error) : null, id);
}

/** Soumet le job au fournisseur (si configuré) ; met à jour l'état. */
export async function submitVideoJob(user, job) {
  if (!config.video.configured) return getVideoJob(user, job.id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${config.video.aiBaseUrl}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.video.aiKey}` },
      body: JSON.stringify({ model: config.video.aiModel, prompt: job.query }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      updateJob(job.id, { status: 'failed', error: { code: 'PROVIDER_ERROR', message: `Fournisseur vidéo HTTP ${res.status}` } });
      return getVideoJob(user, job.id);
    }
    const data = await res.json().catch(() => ({}));
    updateJob(job.id, { status: 'processing', providerJobId: data.id || data.job_id || null });
  } catch {
    clearTimeout(timer);
    updateJob(job.id, { status: 'failed', error: { code: 'UNAVAILABLE', message: 'Fournisseur vidéo injoignable.' } });
  }
  return getVideoJob(user, job.id);
}

/** Rafraîchit l'état d'un job auprès du fournisseur (polling). */
export async function refreshVideoJob(user, id) {
  const job = getVideoJob(user, id);
  if (!job) return null;
  if (!config.video.configured || job.status === 'completed' || job.status === 'failed' || !job.providerJobId) return job;
  try {
    const res = await fetch(`${config.video.aiBaseUrl}/videos/${encodeURIComponent(job.providerJobId)}`, {
      headers: { Authorization: `Bearer ${config.video.aiKey}` },
    });
    if (!res.ok) return job;
    const data = await res.json().catch(() => ({}));
    const status = ['pending', 'processing', 'completed', 'failed'].includes(data.status) ? data.status : job.status;
    updateJob(job.id, { status, result: status === 'completed' ? { url: data.url || data.output?.url || null, raw: data } : null, error: status === 'failed' ? { code: 'PROVIDER_ERROR', message: data.error?.message || 'Échec du fournisseur' } : null });
    return getVideoJob(user, id);
  } catch {
    return job;
  }
}
