import './env.js'; // must run first so process.env is populated before other imports read it
import { createApp } from './app.js';
import { initDb } from './db.js';
import { validateConfig, safeSummary } from './config.js';

const PORT = process.env.PORT || 3000;

const { errors, warnings } = validateConfig();
for (const w of warnings) console.warn(`[config] avertissement : ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[config] erreur : ${e}`);
  if (process.env.NODE_ENV === 'production') {
    console.error('[config] configuration invalide en production — arrêt.');
    process.exit(1);
  }
}

initDb();
const app = createApp();

app.listen(PORT, () => {
  const s = safeSummary();
  console.log(`REVIQO prêt sur http://localhost:${PORT}`);
  console.log(`  env=${s.env} | origine=${s.originConfigured ? 'configurée' : 'déduite'} | IA=${s.ai.configured ? s.ai.model : 'locale'} | e-mail=${s.email.provider || 'démo'} | Google=${s.google.configured ? 'ON' : 'off'} | Stripe=${s.stripe.configured ? 'ON' : 'démo'} | YouTube=${s.video.youtubeConfigured ? 'ON' : 'off'}`);
});
