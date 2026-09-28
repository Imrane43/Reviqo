import './env.js'; // must run first so process.env is populated before other imports read it
import { createApp } from './app.js';
import { initDb } from './db.js';

const PORT = process.env.PORT || 3000;
initDb();
const app = createApp();

app.listen(PORT, () => {
  const stripe = process.env.STRIPE_SECRET_KEY ? 'ON' : 'off (démo)';
  const google = process.env.GOOGLE_OAUTH_CLIENT_JSON || (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ? 'ON' : 'off';
  console.log(`REVIQO prêt sur http://localhost:${PORT}  | Stripe: ${stripe} | Google: ${google}`);
});
