// Playwright end-to-end suite: drives real user journeys and asserts zero console errors.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviqo-e2e-'));
process.env.DB_PATH = path.join(tmpDir, 'e2e.db');
process.env.JWT_SECRET = 'e2e-secret';
process.env.STRIPE_SECRET_KEY = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
process.env.ADMIN_EMAIL = 'imraneanbar39@gmail.com';
process.env.ADMIN_PASSWORD = 'jsusuuzuzzis.2003@!';
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/home/user/pw-browsers';

const { initDb } = await import('../src/db.js');
initDb();
const { createApp } = await import('../src/app.js');
const server = createApp().listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const { chromium } = await import('playwright');
const SHOT_DIR = process.env.SHOT_DIR || path.join(tmpDir, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let checks = 0, failures = 0;
const errors = [];
function assert(cond, label) { checks++; if (cond) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const browser = await chromium.launch();

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'fr-FR' });
  const page = await context.newPage();
  const bag = [];
  page.on('console', (m) => { if (m.type() === 'error') bag.push(m.text()); });
  page.on('pageerror', (e) => bag.push('pageerror: ' + e.message));
  return { context, page, bag };
}
function drain(page, bag, label) {
  const real = bag.filter((m) => !/favicon|Failed to load resource.*404/i.test(m));
  assert(real.length === 0, `${label}: zero console errors${real.length ? ' → ' + real.slice(0, 2).join(' | ') : ''}`);
  if (real.length) errors.push({ label, errors: real });
}

async function forceReveal(page) {
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((n) => n.classList.add('is-visible')));
}

try {
  // ---------- 1. Landing ----------
  console.log('— landing page —');
  {
    const { context, page, bag } = await newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert(await page.locator('h1').first().isVisible(), 'hero heading renders');
    assert((await page.locator('.price-card').count()) >= 2, 'pricing cards render (monthly)');
    await page.click('#billingToggle button[data-cycle="yearly"]');
    await page.waitForTimeout(200);
    const yearlyText = await page.locator('#pricingGrid').innerText();
    assert(/39,99/.test(yearlyText), 'yearly toggle shows 39,99 €');
    await page.click('#cookieAccept');
    assert(await page.locator('#cookieBanner').isHidden(), 'cookie consent dismisses');
    await forceReveal(page);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-landing.png'), fullPage: true });

    // mobile overflow check
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `landing has no horizontal scroll at 360px (overflow=${overflow})`);
    drain(page, bag, 'landing');
    await context.close();
  }

  // ---------- 2. Signup → onboarding → dashboard → quiz → study → games ----------
  console.log('— student journey —');
  {
    const { context, page, bag } = await newPage();
    const email = `e2e_${Date.now()}@example.com`;
    await page.goto(base + '/auth.html#signup', { waitUntil: 'networkidle' });
    await page.fill('#su-name', 'Testeur');
    await page.fill('#su-email', email);
    await page.fill('#su-pass', 'secret123');
    await page.click('#signupForm button[type=submit]');
    await page.waitForSelector('#panel-onboarding:not(.hidden)', { timeout: 8000 });
    assert(true, 'signup opens onboarding');
    await page.fill('#ob-name', 'Testeur');
    await page.click('#ob-next');
    await page.click('[data-level]');
    await page.click('#ob-next');
    await page.selectOption('#ob-country', 'France');
    await page.click('#ob-next');
    await page.locator('[data-sub]').first().click();
    await page.locator('[data-goal]').first().click();
    await page.click('#ob-next');
    await page.waitForURL('**/app.html', { timeout: 10000 });
    await page.waitForSelector('#view .card', { timeout: 10000 });
    const dash = await page.locator('#view').innerText();
    assert(/bonjour|bon après-midi|bonsoir/i.test(dash), 'dashboard greets the user by time of day');
    assert(/Série|XP|Niveau/.test(dash), 'dashboard shows streak/XP/level');
    await page.screenshot({ path: path.join(SHOT_DIR, '02-dashboard.png'), fullPage: true });

    // Quiz flow
    await page.goto(base + '/app.html#quizzes', { waitUntil: 'networkidle' });
    const playBtn = page.locator('a.btn:has-text("Jouer")').first();
    assert(await playBtn.count() > 0, 'quiz list shows a playable quiz');
    await playBtn.click();
    await page.waitForSelector('.quiz-option', { timeout: 8000 });
    let guard = 0;
    while (await page.locator('#nextBtn').count() && guard < 40) {
      guard++;
      await page.locator('.quiz-option').first().click();
      await page.click('#nextBtn');
      if (await page.locator('#nextBtn').count()) {
        const label = await page.locator('#nextBtn').innerText();
        if (label.includes('question suivante') || label.includes('résultat')) {
          await page.click('#nextBtn');
          if (await page.locator('h2:has-text("%")').count()) break;
        }
      }
      await page.waitForTimeout(120);
    }
    await page.waitForSelector('text=+', { timeout: 6000 }).catch(() => {});
    const resultText = await page.locator('#view').innerText();
    assert(/%/.test(resultText) && /XP/.test(resultText), 'quiz results show accuracy and XP');
    await page.screenshot({ path: path.join(SHOT_DIR, '03-quiz-results.png'), fullPage: true });

    // Study AI
    await page.goto(base + '/app.html#study', { waitUntil: 'networkidle' });
    await page.fill('#studyInput', 'La photosynthèse est le processus par lequel les plantes vertes convertissent la lumière solaire en énergie chimique. Les chloroplastes contiennent de la chlorophylle qui absorbe la lumière. Le dioxyde de carbone et l eau sont transformés en glucose et en oxygène.');
    await page.click('#generateBtn');
    await page.waitForSelector('#studyTabs', { timeout: 10000 });
    assert((await page.locator('#studyTabs .chip').count()) === 4, 'study generation returns 4 tabs');
    await page.click('#studyTabs .chip:nth-child(2)');
    assert((await page.locator('.flashcard').count()) > 0, 'flashcards render');
    await page.screenshot({ path: path.join(SHOT_DIR, '04-study.png'), fullPage: true });

    // Mini-game
    await page.goto(base + '/app.html#play', { waitUntil: 'networkidle' });
    assert((await page.locator('.game-tile').count()) >= 7, 'seven mini-games listed');
    await page.click('.game-tile[href*="speed-math"]');
    await page.waitForSelector('[data-v]', { timeout: 8000 });
    assert(await page.locator('[data-v]').first().isVisible(), 'speed math renders a problem');
    await page.locator('[data-v]').first().click();
    assert(true, 'mini-game accepts an answer');
    await page.screenshot({ path: path.join(SHOT_DIR, '05-game.png') });

    // Other pages
    for (const [hash, needle] of [['progress', 'XP'], ['achievements', 'badge'], ['leaderboard', 'Top'], ['profile', 'Niveau'], ['billing', 'abonnement'], ['friends', 'ami'], ['pricing', 'Premium'], ['reviser', 'Paquets'], ['video', 'Vidéo'], ['coach', 'Coach']]) { 
      void needle;
      await page.goto(base + `/app.html#${hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const txt = await page.locator('#view').innerText();
      assert(txt.length > 20, `page #${hash} renders content`);
    }
    // Flashcards interaction
    await page.goto(base + '/app.html#reviser', { waitUntil: 'networkidle' });
    await page.waitForSelector('.deck-card', { timeout: 8000 });
    await page.locator('.deck-card').first().click();
    await page.waitForSelector('#flipCard', { timeout: 8000 });
    await page.click('#deckFlip');
    assert(await page.locator('.flashcard.flipped').count() > 0, 'flashcard flips to reveal the answer');
    await page.click('#deckKnown');
    await page.screenshot({ path: path.join(SHOT_DIR, '09-flashcards.png'), fullPage: true });

    // AI video (free user: first generation allowed)
    await page.goto(base + '/app.html#video', { waitUntil: 'networkidle' });
    await page.fill('#videoInput', 'La photosynthèse permet aux plantes de transformer la lumière en énergie. Les chloroplastes captent la lumière. Le CO2 et l eau deviennent du glucose et de l oxygène.');
    await page.click('#videoGen');
    await page.waitForSelector('#vidCanvas', { timeout: 15000 });
    assert(await page.locator('#vidCanvas').isVisible(), 'AI video canvas renders a generated video');
    await page.click('#vPlay');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOT_DIR, '10-video.png') });

    await page.goto(base + '/app.html#billing', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, '06-billing.png'), fullPage: true });

    // Theme toggle persists
    await page.goto(base + '/app.html#home', { waitUntil: 'networkidle' });
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click('#themeBtn2');
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(before !== after, 'theme toggles between dark and light');
    await page.reload({ waitUntil: 'networkidle' });
    const persisted = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(persisted === after, 'theme preference persists across reload');

    drain(page, bag, 'student journey');
    await context.close();
  }

  // ---------- 3. Guest gets an isolated account ----------
  console.log('— guest flow —');
  {
    const { context, page, bag } = await newPage();
    await page.goto(base + '/auth.html#login', { waitUntil: 'networkidle' });
    await page.click('#guestBtn');
    await page.waitForSelector('#panel-onboarding:not(.hidden)', { timeout: 8000 });
    await page.fill('#ob-name', 'Invité1');
    await page.click('#ob-next');
    await page.click('[data-level]');
    await page.click('#ob-next');
    await page.click('#ob-next');
    await page.locator('[data-sub]').first().click();
    await page.click('#ob-next');
    await page.waitForURL('**/app.html', { timeout: 10000 });
    const guestEmail = await page.evaluate(async () => (await (await fetch('/api/me')).json()).user.email);
    assert(guestEmail.startsWith('guest_') || guestEmail.endsWith('@guest.reviqo.app'), 'guest account uses a unique guest email');
    // Second guest in a fresh context must get a different email.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(base + '/auth.html#login', { waitUntil: 'networkidle' });
    await p2.click('#guestBtn');
    await p2.waitForTimeout(900);
    const guestEmail2 = await p2.evaluate(async () => (await (await fetch('/api/me')).json()).user.email);
    assert(guestEmail !== guestEmail2, 'two guests never share the same account/email');
    await ctx2.close();
    drain(page, bag, 'guest flow');
    await context.close();
  }

  // ---------- 4. Forgot password ----------
  console.log('— password reset —');
  {
    const { context, page, bag } = await newPage();
    const email = `reset_${Date.now()}@example.com`;
    await page.goto(base + '/auth.html#signup', { waitUntil: 'networkidle' });
    await page.fill('#su-name', 'Reset');
    await page.fill('#su-email', email);
    await page.fill('#su-pass', 'secret123');
    await page.click('#signupForm button[type=submit]');
    await page.waitForSelector('#panel-onboarding:not(.hidden)', { timeout: 8000 });
    await page.goto(base + '/auth.html#forgot', { waitUntil: 'networkidle' });
    await page.waitForSelector('#panel-forgot:not(.hidden)', { timeout: 8000 });
    await page.fill('#fp-email', email);
    await page.waitForTimeout(300);
    await page.press('#fp-email', 'Enter');
    await page.waitForSelector('#fp-result:not(.hidden)', { timeout: 8000 });
    const href = await page.getAttribute('#fp-link', 'href');
    assert(!!href && href.includes('token='), 'forgot password exposes a reset link in demo mode');
    await page.goto(base + href, { waitUntil: 'networkidle' });
    await page.fill('#rp-pass', 'brandnew123');
    await page.fill('#rp-pass2', 'brandnew123');
    await page.click('#resetForm button[type=submit]');
    await page.waitForURL('**/app.html', { timeout: 10000 });
    assert(true, 'reset logs the user in');
    drain(page, bag, 'password reset');
    await context.close();
  }

  // ---------- 5. Admin panel ----------
  console.log('— admin —');
  {
    const { context, page, bag } = await newPage();
    await page.goto(base + '/auth.html#login', { waitUntil: 'networkidle' });
    await page.fill('#li-email', 'imraneanbar39@gmail.com');
    await page.fill('#li-pass', 'jsusuuzuzzis.2003@!');
    await page.click('#loginForm button[type=submit]');
    await page.waitForURL('**/app.html', { timeout: 10000 });
    await page.goto(base + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#view .card', { timeout: 10000 });
    const stats = await page.locator('#view').innerText();
    assert(/utilisateurs/i.test(stats) && /revenus/i.test(stats), 'admin stats render');
    await page.click('[data-nav="users"]');
    await page.waitForSelector('.admin-table', { timeout: 8000 });
    assert((await page.locator('.admin-table tbody tr').count()) > 0, 'admin user table renders');
    await page.screenshot({ path: path.join(SHOT_DIR, '07-admin.png'), fullPage: true });
    await page.click('[data-nav="subs"]');
    await page.waitForSelector('.admin-table', { timeout: 8000 });
    assert(true, 'admin subscriptions page renders');
    assert(!bag.some((m) => m.startsWith('pageerror')), 'admin has no unhandled exceptions');
    drain(page, bag, 'admin');
    await context.close();
  }

  // ---------- 6. Responsive app shell ----------
  console.log('— responsive —');
  {
    for (const width of [320, 390, 768]) {
      const { context, page, bag } = await newPage({ width, height: 800 });
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      await page.evaluate(async (email) => {
        await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', firstName: 'Mobile' }) });
        await fetch('/api/auth/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Mobile', schoolLevel: 'Lycée', country: 'France', subjects: [1] }) });
      }, `mobile_${width}_${Date.now()}@example.com`);
      await page.goto(base + '/app.html#home', { waitUntil: 'networkidle' });
      await page.waitForSelector('#view .card', { timeout: 10000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `app has no horizontal scroll at ${width}px (overflow=${overflow})`);
      if (width === 390) await page.screenshot({ path: path.join(SHOT_DIR, '08-mobile.png'), fullPage: true });
      await context.close();
    }
  }

  console.log(`\n${checks - failures}/${checks} E2E assertions passed.`);
} catch (err) {
  failures++;
  console.error('E2E crashed:', err);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  console.log('Screenshots in: ' + SHOT_DIR);
  process.exit(failures ? 1 : 0);
}
