import { api, toast, esc, initTheme, toggleTheme, SUBJECT_ICONS } from './api.js';

initTheme();

const PANELS = ['login', 'signup', 'onboarding', 'forgot', 'reset', 'verify', 'convert'];
function showPanel(name) {
  PANELS.forEach((p) => document.getElementById(`panel-${p}`)?.classList.toggle('hidden', p !== name));
  window.scrollTo({ top: 0 });
}
function currentRoute() {
  const hash = location.hash.replace('#', '');
  const [path] = hash.split('?');
  return PANELS.includes(path) ? path : 'login';
}
function route() {
  const target = currentRoute();
  if (target !== 'onboarding') showPanel(target);
  if (target === 'reset') {
    const token = new URLSearchParams(location.hash.split('?')[1] || '').get('token');
    const form = document.getElementById('resetForm');
    form.dataset.token = token || '';
  }
}
window.addEventListener('hashchange', route);

let state = { user: null, subjects: [], programs: null };

async function bootstrap() {
  const target = currentRoute();
  // Password reset/forgot pages must be reachable even while signed in.
  if (target === 'forgot' || target === 'reset') { route(); return; }
  if (target === 'convert') { route(); return; }
  try {
    const data = await api('/api/auth/session');
    state.user = data.user;
    state.verifyRequired = data.verifyRequired;
    if (data.user && data.verifyRequired && !data.user.emailVerified) return startVerification({ user: data.user, resendAfter: 0 });
    if (data.user && !data.user.onboardingDone) return showOnboarding();
    if (data.user) return location.replace('/app.html');
  } catch { /* not signed in */ }
  route();
}

// ---------- login ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('li-error');
  err.textContent = '';
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email: document.getElementById('li-email').value, password: document.getElementById('li-pass').value } });
    toast('Content de te revoir ! 🎉', 'success');
    redirectAfterAuth(data.user);
  } catch (ex) { err.textContent = ex.message; }
});

// ---------- signup ----------
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('su-error');
  err.textContent = '';
  try {
    const pseudo = document.getElementById('su-username').value;
    const data = await api('/api/auth/signup', { method: 'POST', body: { firstName: pseudo, username: pseudo, email: document.getElementById('su-email').value, password: document.getElementById('su-pass').value } });
    toast('Compte créé ! Vérifie ton e-mail.', 'success');
    startVerification(data);
  } catch (ex) { err.textContent = ex.message; }
});

// ---------- email verification ----------
let resendTimer = null;
function startResendCountdown(seconds) {
  const btn = document.getElementById('vf-resend');
  if (!btn) return;
  if (resendTimer) clearInterval(resendTimer);
  let left = Math.max(0, Number(seconds) || 0);
  const label = () => { btn.disabled = left > 0; btn.textContent = left > 0 ? `Renvoyer (${left}s)` : 'Renvoyer le code'; };
  label();
  if (left <= 0) return;
  resendTimer = setInterval(() => { left -= 1; label(); if (left <= 0) clearInterval(resendTimer); }, 1000);
}

function startVerification(data = {}) {
  const user = data.user || state.user || {};
  state.user = user;
  document.getElementById('vf-email').textContent = user.email || state.user?.email || '';
  showPanel('verify');
  document.getElementById('vf-convert').classList.toggle('hidden', !user.isGuest);
  const dev = document.getElementById('vf-dev');
  if (data.devVerificationCode) {
    document.getElementById('vf-code').value = data.devVerificationCode;
    dev.textContent = `${data.devNote || 'Mode démo : code affiché (aucun e-mail envoyé).'} Code : ${data.devVerificationCode}`;
    dev.classList.remove('hidden');
  } else if (user.emailVerified) {
    dev.textContent = 'Ton e-mail est déjà vérifié.';
    dev.classList.remove('hidden');
  } else {
    dev.classList.add('hidden');
  }
  startResendCountdown(data.resendAfter ?? 60);
}

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('vf-error');
  err.textContent = '';
  const code = document.getElementById('vf-code').value.replace(/\D/g, '');
  try {
    const data = await api('/api/auth/verify', { method: 'POST', body: { email: state.user?.email, code } });
    toast('E-mail vérifié ✅', 'success');
    redirectAfterAuth(data.user);
  } catch (ex) { err.textContent = ex.message; }
});

document.getElementById('vf-resend').addEventListener('click', async () => {
  const err = document.getElementById('vf-error');
  err.textContent = '';
  try {
    const data = await api('/api/auth/verify/resend', { method: 'POST', body: { email: state.user?.email } });
    if (data.devVerificationCode) {
      document.getElementById('vf-code').value = data.devVerificationCode;
      document.getElementById('vf-dev').textContent = `Code (démo) : ${data.devVerificationCode}`;
      document.getElementById('vf-dev').classList.remove('hidden');
    }
    toast('Nouveau code envoyé.', 'success');
    startResendCountdown(60);
  } catch (ex) {
    err.textContent = ex.message;
    if (ex.data?.retryAfter) startResendCountdown(ex.data.retryAfter);
  }
});

// ---------- guest -> registered conversion ----------
document.getElementById('convertForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('cv-error');
  err.textContent = '';
  try {
    const data = await api('/api/auth/convert', { method: 'POST', body: {
      username: document.getElementById('cv-username').value,
      email: document.getElementById('cv-email').value,
      password: document.getElementById('cv-pass').value,
    } });
    toast('Compte créé, ta progression est conservée 🎉', 'success');
    startVerification(data);
  } catch (ex) { err.textContent = ex.message; }
});

function redirectAfterAuth(user) {
  if (user.onboardingDone) location.replace('/app.html');
  else { state.user = user; showOnboarding(); }
}

// ---------- guest ----------
async function guest() {
  try {
    const data = await api('/api/auth/guest', { method: 'POST' });
    toast('Mode invité : compte unique créé 👤', 'success');
    state.user = data.user;
    showOnboarding();
  } catch (ex) { toast(ex.message, 'error'); }
}
document.getElementById('guestBtn')?.addEventListener('click', guest);

// ---------- google ----------
document.getElementById('googleBtn')?.addEventListener('click', () => { location.href = '/api/auth/google'; });

// ---------- forgot ----------
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('fp-error');
  err.textContent = '';
  try {
    const data = await api('/api/auth/forgot', { method: 'POST', body: { email: document.getElementById('fp-email').value } });
    document.getElementById('fp-result').classList.remove('hidden');
    document.getElementById('fp-msg').textContent = data.devNote || data.message;
    if (data.devResetUrl) {
      const link = document.getElementById('fp-link');
      link.href = data.devResetUrl;
      link.classList.remove('hidden');
    } else {
      document.getElementById('fp-link').classList.add('hidden');
    }
  } catch (ex) { err.textContent = ex.message; }
});

// ---------- reset ----------
document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('rp-error');
  err.textContent = '';
  const p1 = document.getElementById('rp-pass').value;
  const p2 = document.getElementById('rp-pass2').value;
  if (p1 !== p2) { err.textContent = 'Les mots de passe ne correspondent pas.'; return; }
  try {
    await api('/api/auth/reset', { method: 'POST', body: { token: e.target.dataset.token, password: p1 } });
    toast('Mot de passe mis à jour ✅', 'success');
    location.replace('/app.html');
  } catch (ex) { err.textContent = ex.message; }
});

// ---------- onboarding ----------
const LEVELS = ['Collège', 'Lycée', 'Étudiant', 'Autre'];
const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Canada', 'Maroc', 'Algérie', 'Tunisie', 'Sénégal', 'Autre'];
const ob = { step: 0, firstName: '', schoolLevel: '', country: '', grade: '', track: '', domain: '', domainDetail: '', subjects: [], goal: '' };
const GOALS = ['Améliorer mes notes', 'Préparer un examen', 'Réviser plus efficacement', 'Apprendre en m\'amusant'];

async function loadSubjects() {
  try { const data = await api('/api/subjects'); state.subjects = data.subjects; } catch { state.subjects = []; }
}

function showOnboarding() {
  showPanel('onboarding');
  Promise.all([loadSubjects(), loadPrograms()]).then(renderOb);
}

async function loadPrograms() {
  try { state.programs = await api('/api/programs'); } catch { state.programs = null; }
}

/** Sélecteurs de classe / voie / domaine selon le pays et le niveau choisis. */
function programSection() {
  if (!state.programs || !ob.country || !ob.schoolLevel) return '';
  const country = state.programs.countries.find((c) => c.label === ob.country);
  const sys = country && state.programs.systems[country.system];
  if (!sys) return '';
  const generic = ob.schoolLevel === 'Collège' ? 'college' : ob.schoolLevel === 'Lycée' ? 'lycee' : ob.schoolLevel === 'Étudiant' ? 'etudiant' : null;
  const levelDef = sys.levels.find((l) => l.level === generic) || sys.levels[0];
  if (!levelDef) return '';
  let html = '<h3 style="font-size:1rem;margin-top:14px">Ta classe / ton parcours</h3>';
  if (levelDef.domains) {
    html += `<div class="field"><label>Domaine</label><select class="select" id="ob-domain"><option value="">Choisir…</option>${levelDef.domains.map((d) => `<option value="${esc(d.domain)}" ${ob.domain === d.domain ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>`;
    if (ob.domain === 'autre') html += `<div class="field"><label>Précise ton parcours</label><input class="input" id="ob-domain-detail" value="${esc(ob.domainDetail)}" placeholder="Ex. BUT Informatique 2e année" /></div>`;
  } else {
    html += `<div class="field"><label>Classe</label><select class="select" id="ob-grade"><option value="">Choisir…</option>${levelDef.grades.map((g) => `<option value="${esc(g.grade)}" ${ob.grade === g.grade ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></div>`;
    const gradeDef = levelDef.grades.find((g) => g.grade === ob.grade);
    if (gradeDef?.tracks?.length) {
      html += `<div class="field"><label>Voie</label><select class="select" id="ob-track"><option value="">Choisir…</option>${gradeDef.tracks.map((t) => `<option value="${esc(t.track)}" ${ob.track === t.track ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>`;
    }
  }
  return html;
}
function renderOb() {
  const body = document.getElementById('ob-body');
  document.getElementById('ob-step-pill').textContent = `Étape ${ob.step + 1}/4`;
  document.getElementById('ob-bar').style.width = `${((ob.step + 1) / 4) * 100}%`;
  document.getElementById('ob-back').style.visibility = ob.step === 0 ? 'hidden' : 'visible';
  const sl = state.subjects.length ? state.subjects : SUBJECT_ICONS.map((icon, i) => ({ id: i + 1, icon, name: 'Matière ' + (i + 1) }));

  if (ob.step === 0) {
    body.innerHTML = `<h3>Comment veux-tu qu’on t’appelle ?</h3><p class="muted" style="font-size:.9rem">Un prénom ou un pseudo suffit.</p>
      <div class="field"><input class="input" id="ob-name" maxlength="40" placeholder="Léa" value="${esc(ob.firstName)}" /></div>`;
  } else if (ob.step === 1) {
    body.innerHTML = `<h3>Quel est ton niveau ?</h3><div class="grid g2" style="margin-top:14px">${LEVELS.map((l) => `<button class="chip ${ob.schoolLevel === l ? 'active' : ''}" data-level="${esc(l)}" style="justify-content:center">${esc(l)}</button>`).join('')}</div>`;
    body.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { ob.schoolLevel = b.dataset.level; renderOb(); }));
  } else if (ob.step === 2) {
    body.innerHTML = `<h3>Depuis quel pays ?</h3><p class="muted" style="font-size:.85rem">Pour adapter le contenu et la publicité selon les règles locales.</p>
      <div class="field"><select class="select" id="ob-country">${['', ...COUNTRIES].map((c) => `<option value="${esc(c)}" ${ob.country === c ? 'selected' : ''}>${c || 'Choisir…'}</option>`).join('')}</select></div>`;
    body.querySelector('#ob-country').addEventListener('change', (e) => { ob.country = e.target.value; });
  } else {
    body.innerHTML = `${programSection()}
      <h3 style="font-size:1rem;margin-top:14px">Quelles matières veux-tu travailler ?</h3><p class="muted" style="font-size:.85rem">Choisis-en au moins une.</p>
      <div class="grid g2" style="gap:10px;margin:14px 0">${sl.map((s) => `<button class="chip ${ob.subjects.includes(s.id) ? 'active' : ''}" data-sub="${s.id}" style="justify-content:flex-start">${s.icon} ${esc(s.name)}</button>`).join('')}</div>
      <h3 style="font-size:1rem">Ton objectif</h3>
      <div class="grid g2" style="gap:10px">${GOALS.map((g) => `<button class="chip ${ob.goal === g ? 'active' : ''}" data-goal="${esc(g)}" style="justify-content:center;font-size:.8rem">${esc(g)}</button>`).join('')}</div>`;
    body.querySelector('#ob-domain')?.addEventListener('change', (e) => { ob.domain = e.target.value; renderOb(); });
    body.querySelector('#ob-domain-detail')?.addEventListener('input', (e) => { ob.domainDetail = e.target.value; });
    body.querySelector('#ob-grade')?.addEventListener('change', (e) => { ob.grade = e.target.value; ob.track = ''; renderOb(); });
    body.querySelector('#ob-track')?.addEventListener('change', (e) => { ob.track = e.target.value; });
    body.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.dataset.sub);
      ob.subjects = ob.subjects.includes(id) ? ob.subjects.filter((x) => x !== id) : [...ob.subjects, id];
      renderOb();
    }));
    body.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => { ob.goal = b.dataset.goal; renderOb(); }));
  }
  body.querySelector('#ob-name')?.addEventListener('input', (e) => { ob.firstName = e.target.value; });
}

document.getElementById('ob-back').addEventListener('click', () => { if (ob.step > 0) { ob.step -= 1; renderOb(); } });
document.getElementById('ob-next').addEventListener('click', async () => {
  if (ob.step === 0) { const v = document.getElementById('ob-name')?.value || ''; ob.firstName = v; if (!v.trim()) return toast('Ajoute un prénom ou pseudo.', 'error'); }
  if (ob.step === 1 && !ob.schoolLevel) return toast('Choisis ton niveau.', 'error');
  if (ob.step === 2 && !ob.country) { ob.country = 'Autre'; }
  if (ob.step === 3) {
    if (!ob.subjects.length) return toast('Choisis au moins une matière.', 'error');
    try {
      await api('/api/auth/onboarding', { method: 'POST', body: { firstName: ob.firstName, username: ob.firstName, schoolLevel: ob.schoolLevel, country: ob.country, grade: ob.grade, track: ob.track, domain: ob.domain, domainDetail: ob.domainDetail, subjects: ob.subjects, goal: ob.goal } });
      toast('Profil prêt ! Bienvenue 🎉', 'success');
      location.replace('/app.html');
    } catch (ex) { toast(ex.message, 'error'); }
    return;
  }
  ob.step = Math.min(3, ob.step + 1);
  renderOb();
});

// URL error messages (Google / etc.)
const urlError = new URLSearchParams(location.search).get('error');
if (urlError === 'google_not_configured') toast('La connexion Google n’est pas encore configurée sur ce serveur.', 'error', 5200);
else if (urlError === 'google_denied') toast('Connexion Google annulée.', 'info');
else if (urlError === 'google_failed') toast('La connexion Google a échoué. Réessaie.', 'error');

bootstrap();
