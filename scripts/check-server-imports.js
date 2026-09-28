#!/usr/bin/env node
/**
 * Garde-fou de déploiement REVIQO.
 *
 * Empêche la cause exacte de l'erreur Render :
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/api.js' imported from '.../src/app.js'
 *
 * Cela se produit quand un fichier du FRONT-END (public/js/app.js, qui importe
 * './api.js' et utilise `document`/`window`) est copié par erreur dans src/.
 * Le serveur Node ne peut pas importer un module navigateur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');
const PUBLIC_JS = path.join(__dirname, '..', 'public', 'js');

const errors = [];
const warn = [];

const browserOnlyModules = new Set(
  fs.readdirSync(PUBLIC_JS).filter((f) => f.endsWith('.js') && !f.includes('node_modules'))
);

// 1) Aucun fichier serveur ne doit importer un module du front.
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
  const full = path.join(SRC, file);
  const code = fs.readFileSync(full, 'utf8');
  const importRe = /(?:import|export)[^'"]*from\s*['"]\.\.?\/api\.js['"]/g;
  if (importRe.test(code)) {
    errors.push(`${path.relative(process.cwd(), full)} importe './api.js' — api.js n'existe que dans public/js/.`);
  }
  if (/\b(document|window|localStorage)\b/.test(code)) {
    errors.push(`${path.relative(process.cwd(), full)} utilise une API navigateur (document/window/localStorage) : c'est probablement un fichier front-end placé dans src/.`);
  }
}

// 2) src/app.js ne doit pas être identique au fichier front-end public/js/app.js.
const serverApp = path.join(SRC, 'app.js');
const clientApp = path.join(PUBLIC_JS, 'app.js');
if (fs.existsSync(serverApp) && fs.existsSync(clientApp)) {
  const a = fs.readFileSync(serverApp, 'utf8');
  const b = fs.readFileSync(clientApp, 'utf8');
  if (a.slice(0, 400) === b.slice(0, 400)) {
    errors.push('src/app.js est identique à public/js/app.js : le fichier front-end a été déployé à la place du backend.');
  }
}

// 3) Vérifie que les modules serveur requis existent bien.
for (const f of ['app.js', 'server.js', 'db.js', 'auth.js', 'billing.js', 'content.js', 'coach.js', 'env.js']) {
  if (!fs.existsSync(path.join(SRC, f))) warn.push(`src/${f} manquant.`);
}

if (warn.length) warn.forEach((w) => console.warn('⚠️  ' + w));

if (errors.length) {
  console.error('\n❌ Vérification des imports serveur échouée :\n');
  errors.forEach((e) => console.error('  - ' + e));
  console.error('\nCorrige src/ avant de déployer sur Render.\n');
  process.exit(1);
}

console.log('✅ Imports serveur OK (aucun module front-end dans src/).');
