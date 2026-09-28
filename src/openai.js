/**
 * Client OpenAI côté serveur (API « chat completions »).
 * La clé ne quitte jamais le serveur ; le frontend passe par /api/ai/*.
 *
 * Erreurs renvoyées de façon utile et exploitable par l'interface :
 *  - KEY_MISSING   : aucune clé configurée
 *  - INVALID_KEY   : clé refusée (401)
 *  - QUOTA         : quota dépassé (429)
 *  - BAD_MODEL     : modèle/paramètres refusés (400)
 *  - UNAVAILABLE   : fournisseur injoignable / délai dépassé
 *  - BAD_RESPONSE  : réponse illisible ou vide
 *  - PROVIDER_ERROR: autre erreur HTTP
 */
import { config } from './config.js';

const MESSAGES = {
  KEY_MISSING: 'Aucune clé IA n’est configurée côté serveur.',
  INVALID_KEY: 'La clé IA du serveur est refusée par le fournisseur.',
  QUOTA: 'Le quota du fournisseur IA est dépassé. Réessaie plus tard.',
  BAD_MODEL: 'Le modèle IA configuré est refusé par le fournisseur.',
  UNAVAILABLE: 'Le fournisseur IA est momentanément injoignable.',
  BAD_RESPONSE: 'Le fournisseur IA a renvoyé une réponse inexploitable.',
  PROVIDER_ERROR: 'Le fournisseur IA a renvoyé une erreur.',
};

export function aiError(code, detail) {
  return { ok: false, error: { code, message: MESSAGES[code] || MESSAGES.PROVIDER_ERROR, detail: detail || null } };
}

export async function chatCompletion({ messages, model, maxTokens = 1024, temperature = 0.4, json = false, timeoutMs = 25000 } = {}) {
  if (!config.ai.configured) return aiError('KEY_MISSING');
  const base = config.ai.baseUrl;
  if (!/^https?:\/\//.test(base)) return aiError('KEY_MISSING', 'Base API IA invalide ou absente.');
  const body = { model: model || config.ai.model, messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return aiError('UNAVAILABLE');
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) return aiError('INVALID_KEY');
  if (res.status === 429) return aiError('QUOTA');
  if (res.status === 400 || res.status === 404) return aiError('BAD_MODEL');
  if (!res.ok) return aiError('PROVIDER_ERROR', `HTTP ${res.status}`);

  let data;
  try { data = await res.json(); } catch { return aiError('BAD_RESPONSE', 'JSON invalide'); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return aiError('BAD_RESPONSE', 'Contenu vide');
  return { ok: true, content, model: data.model || body.model, usage: data.usage || null };
}

/** Equivalent JSON : renvoie l'objet parsé ou une erreur explicite. */
export async function chatCompletionJson(options) {
  const result = await chatCompletion({ ...options, json: true });
  if (!result.ok) return result;
  try {
    return { ok: true, data: JSON.parse(result.content), model: result.model };
  } catch {
    return aiError('BAD_RESPONSE', 'JSON attendu, reçu autre chose');
  }
}
