// In-process test harness: temp DB, hermetic external keys, no background process.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviqo-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
// Force external providers offline so tests are hermetic.
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
process.env.LLM_API_URL = '';
process.env.LLM_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.OPENAI_BASE_URL = '';
process.env.VIDEO_AI_API_KEY = '';
process.env.VIDEO_AI_API_URL = '';
process.env.ADMIN_EMAIL = 'imraneanbar39@gmail.com';
process.env.ADMIN_PASSWORD = 'jsusuuzuzzis.2003@!';
// Le harnais hermétique partage une seule IP : on désactive les limites de débit
// (elles sont testées explicitement dans la suite).
process.env.RATE_LIMIT_DISABLED = '1';

const { initDb } = await import('../src/db.js');
initDb();
const { createApp } = await import('../src/app.js');
const app = createApp();

const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

let failures = 0;
let checks = 0;
export function assert(condition, label) {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

try {
  const mod = await import('./tests/api.test.js');
  await mod.run({ base, assert, tmpDir });
} catch (err) {
  failures += 1;
  console.error('Test suite crashed:', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log(`\n${checks - failures}/${checks} assertions passed.`);
process.exit(failures ? 1 : 0);
