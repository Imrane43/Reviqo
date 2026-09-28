// Minimal .env loader (no dependency). Imported FIRST so later modules see the values.
// Robuste aux valeurs entre guillemets, aux préfixes `export `, et aux retours
// à la ligne parasites dans une valeur (ex. clé collée sur plusieurs lignes).
import fs from 'node:fs';
import path from 'node:path';

/** Nettoie une valeur : retire guillemets externes puis espaces/retours parasites. */
export function cleanValue(raw) {
  let value = String(raw ?? '').replace(/\r/g, '');
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  // Les secrets ne doivent jamais contenir d'espace ni de saut de ligne.
  return value.replace(/[\r\n\t ]/g, '').trim();
}

export function parseEnv(text) {
  const out = {};
  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    line = line.replace(/^export\s+/, '');
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let raw = line.slice(eq + 1).trim();
    // Valeur entre guillemets répartie sur plusieurs lignes : on recolle.
    if ((raw.startsWith('"') && !raw.endsWith('"')) || (raw.startsWith("'") && !raw.endsWith("'"))) {
      const quote = raw[0];
      while (i + 1 < lines.length && !raw.endsWith(quote)) {
        i += 1;
        raw += lines[i].replace(/\r$/, '');
      }
    }
    out[key] = cleanValue(raw);
  }
  return out;
}

const file = path.join(process.cwd(), '.env');
if (fs.existsSync(file)) {
  try {
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      // Une variable déjà fournie par l'environnement (Render, tests) reste prioritaire.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch { /* ignore malformed .env */ }
}
