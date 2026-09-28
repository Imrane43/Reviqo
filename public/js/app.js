import { api, esc, toast, initTheme, toggleTheme, xpPop, timeAgo, progressBar, skeleton, confetti, SUBJECT_ICONS } from './api.js';
import { renderQuiz } from './quiz.js';
import { renderGame, gamesGridHtml, GAMES } from './games.js';

initTheme();

const NAV = [
  { id: 'home', label: 'Accueil', icon: '🏠', bottom: true },
  { id: 'study', label: 'Étudier', icon: '✨', bottom: true },
  { id: 'reviser', label: 'Flashcards', icon: '🃏' },
  { id: 'quizzes', label: 'Quiz', icon: '📝' },
  { id: 'video', label: 'Vidéo IA', icon: '🎬', premium: true },
  { id: 'coach', label: 'Coach IA', icon: '🧠', premium: true },
  { id: 'play', label: 'Reviqo Play', icon: '🎮', bottom: true },
  { id: 'progress', label: 'Progression', icon: '📈', bottom: true },
  { id: 'achievements', label: 'Badges', icon: '🏅' },
  { id: 'leaderboard', label: 'Classement', icon: '🏆' },
  { id: 'friends', label: 'Amis', icon: '👥' },
  { id: 'teams', label: 'Équipes', icon: '🛡️' },
  { id: 'search', label: 'Recherche', icon: '🔎' },
  { id: 'profile', label: 'Profil', icon: '👤', bottom: true },
  { id: 'billing', label: 'Abonnement', icon: '💎' },
];

const ctx = {
  user: null,
  subjects: [],
  config: null,
  setUser(u) {
    this.user = u;
    renderChrome();
  },
  go(hash) { location.hash = hash; },
  async refresh() { try { const d = await api('/api/me'); this.user = d.user; renderChrome(); } catch {} },
  mountAds(view) {
    if (!this.user || this.user.plan === 'premium') {
      view.querySelectorAll('[data-ad]').forEach((n) => n.remove());
    } else {
      view.querySelectorAll('[data-ad]').forEach((n) => {
        n.innerHTML = `<span class="ad-badge">PUBLICITÉ</span><div style="padding:8px">Espace publicitaire — non personnalisé${this.user.adConsent ? '' : ' (consentement requis)'}<br><span style="font-size:.72rem">Espace réservé à un fournisseur type Google AdSense</span></div>`;
      });
    }
  },
};

const view = document.getElementById('view');

const eurFmt = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const priceCfg = () => ctx.config?.prices || { monthly: { amount: 499 }, yearly: { amount: 3999 } };

function renderChrome() {
  const u = ctx.user;
  if (!u) return;
  document.getElementById('sideNav').innerHTML = NAV.map((n) => `<a href="#${n.id}" data-nav="${n.id}"><span class="em">${n.icon}</span>${esc(n.label)}${n.id === 'billing' && u.plan !== 'premium' ? '<span class="pill pill-violet" style="margin-left:auto;padding:2px 8px">Premium</span>' : ''}</a>`).join('')
    + (u.role === 'admin' ? '<a href="/admin.html" data-nav="admin"><span class="em">🛡</span>Admin</a>' : '');
  document.getElementById('bottomNav').innerHTML = NAV.filter((n) => n.bottom).map((n) => `<a href="#${n.id}" data-nav="${n.id}"><span class="em">${n.icon}</span>${esc(n.label)}</a>`).join('');
  document.getElementById('miniUser').innerHTML = `<div class="avatar sm">${esc(u.avatar || 'R')}</div><div style="min-width:0"><div style="font-weight:700;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.firstName || 'Étudiant')}</div><div class="faint" style="font-size:.72rem">Niv. ${u.level} · ${u.xp.toLocaleString('fr-FR')} XP</div></div>`;
  document.getElementById('topAvatar').textContent = u.avatar || 'R';
  const themeBtn = document.getElementById('themeBtn');
  const t = document.documentElement.dataset.theme;
  if (themeBtn) themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
}

// ---------- router ----------
async function route() {
  const raw = location.hash.replace('#', '') || 'home';
  const [name, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (!ctx.subjects.length) { try { ctx.subjects = (await api('/api/subjects')).subjects; } catch {} }
  if (!ctx.config) { try { ctx.config = await api('/api/config'); } catch {} }

  const titles = {
    home: ['Tableau de bord', 'Tout ce dont tu as besoin'],
    study: ['Étudier', 'Étude IA'], quizzes: ['Quiz', 'Choisis ton défi'], play: ['Reviqo Play', 'Apprendre en jouant'],
    reviser: ['Flashcards', 'Mémorise plus vite'],
    video: ['Vidéo IA', 'Ton cours en vidéo'], coach: ['Coach IA', 'Ton tuteur personnel'],
    progress: ['Ma progression', 'Tes statistiques'], profile: ['Profil', 'Ton espace'], achievements: ['Badges', 'Tes accomplissements'],
    leaderboard: ['Classement', 'Compare-toi'], friends: ['Amis', 'Apprends en équipe'], teams: ['Équipes', 'Apprends en équipe'], search: ['Recherche', 'Cours, quiz, flashcards'], billing: ['Abonnement', 'Gère ton plan'],
    pricing: ['Premium', 'Passe au niveau supérieur'], notifications: ['Notifications', 'Tes alertes'], quiz: ['Quiz', 'À toi de jouer'], game: ['Reviqo Play', 'Mini-jeu'],
  };
  const [title, eyebrow] = titles[name] || ['REVIQO', 'Learn. Play. Master.'];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageEyebrow').textContent = eyebrow;

  const views = { home: vHome, study: vStudy, reviser: vReviser, quizzes: vQuizzes, video: vVideo, coach: vCoach, play: vPlay, progress: vProgress, profile: vProfile, achievements: vAchievements, leaderboard: vLeaderboard, friends: vFriends, teams: vTeams, search: vSearch, billing: vBilling, pricing: vPricing, notifications: vNotifications };
  // Libère les ressources de la vue précédente (ex. flux temps réel du classement).
  if (typeof window.__cleanup === 'function') { try { window.__cleanup(); } catch { /* ignore */ } window.__cleanup = null; }
  try {
    if (name === 'quiz') return await renderQuiz(view, params.get('id'), params, ctx);
    if (name === 'game') return await renderGame(view, params.get('name'), ctx);
    const fn = views[name] || vHome;
    await fn(params);
  } catch (ex) {
    if (ex.status === 401) return location.replace('/auth.html#login');
    view.innerHTML = `<div class="card center"><div class="em" style="font-size:2.4rem">😕</div><b>${esc(ex.message)}</b><p><button class="btn btn-primary mt2" onclick="location.reload()">Réessayer</button></p></div>`;
  }
}

// ---------- Home / Dashboard ----------
async function vHome() {
  view.innerHTML = skeleton(4);
  const [stats, daily, lb, subjects, dash, ads] = await Promise.all([
    api('/api/me/stats'), api('/api/daily'), api('/api/leaderboard?scope=global'), Promise.resolve(ctx.subjects),
    api('/api/dashboard').catch(() => null), api('/api/ads/config').catch(() => null),
  ]);
  const u = ctx.user;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const done = daily.challenges.filter((c) => c.completed).length;
  const goalPct = Math.round((done / daily.challenges.length) * 100);
  const nextXp = u.nextXp - u.levelStart;
  const intoXp = u.xp - u.levelStart;
  const levelPct = nextXp > 0 ? Math.round((intoXp / nextXp) * 100) : 0;
  const chosen = subjects.filter((s) => u.subjects.includes(s.id));
  const toShow = (chosen.length ? chosen : subjects).slice(0, 5);

  view.innerHTML = `
    <div class="grid g4">
      <div class="card"><div class="stat"><span>🔥 Série</span><b>${u.streak} j</b></div></div>
      <div class="card"><div class="stat"><span>⚡ XP</span><b>${u.xp.toLocaleString('fr-FR')}</b></div></div>
      <div class="card"><div class="stat"><span>⭐ Niveau</span><b>${u.level}</b></div></div>
      <div class="card"><div class="stat"><span>🎯 Objectif du jour</span><b>${goalPct}%</b>${progressBar(goalPct)}</div></div>
    </div>

    <div class="card mt2" style="background:linear-gradient(150deg,var(--surface),rgba(108,92,231,.14))">
      <div class="between" style="margin-bottom:10px">
        <div><div class="faint" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.08em">${greet},</div><h2 style="margin:2px 0 0">${esc(u.firstName || 'Étudiant')} 👋</h2></div>
        <span class="pill pill-violet">${u.plan === 'premium' ? '💎 Premium' : 'Gratuit'}</span>
      </div>
      <div class="between" style="font-size:.85rem"><b>Niveau ${u.level}</b><span class="muted">${intoXp} / ${nextXp} XP</span></div>
      ${progressBar(levelPct)}
      <p class="mt2" style="margin:0;font-size:.9rem">${u.plan === 'premium' ? 'Profite de l’illimité et brille.' : 'Continue régulièrement — la régularité paie.'}</p>
    </div>

    ${dash ? `<div class="card mt2"><div class="between"><b>📅 Révisions du jour</b><a class="btn btn-ghost btn-sm" href="#reviser">Réviser →</a></div>
      <div class="row wrap mt2" style="gap:8px">
        <span class="pill ${dash.revisions.due > 0 ? 'pill-amber' : 'pill-lime'}">🃏 ${dash.revisions.due} carte(s) due(s)</span>
        <span class="pill ${dash.notebook.unresolved > 0 ? 'pill-red' : ''}">📝 ${dash.notebook.unresolved} notion(s) à reprendre</span>
        <span class="pill">📊 Précision ${dash.mastery.avgAccuracy}%</span>
        ${dash.teamGoal ? `<span class="pill pill-violet">🛡️ ${dash.teamGoal.progress}/${dash.teamGoal.target} XP d’équipe</span>` : ''}
      </div>
      ${(dash.mastery.mastered.length || dash.mastery.toRework.length) ? `<p class="form-note mt1">${dash.mastery.mastered.length ? `Maîtrisé : ${dash.mastery.mastered.slice(0, 3).map((m) => esc(m.name)).join(', ')}. ` : ''}${dash.mastery.toRework.length ? `À retravailler : ${dash.mastery.toRework.slice(0, 3).map((m) => esc(m.name)).join(', ')}.` : ''}</p>` : ''}
    </div>` : ''}
    ${adSlotHtml(ads, 'dashboard-top')}

    <div class="between mt3"><h2 style="margin:0">Reprendre l’apprentissage</h2><a class="btn btn-ghost btn-sm" href="#quizzes">Tout voir →</a></div>
    <div class="grid g2 mt2">
      ${toShow.map((s) => `
        <a class="card card-lift subject-card" href="#quizzes?subject=${s.slug}">
          <div class="subject-ico" style="background:${s.color}22;color:${s.color}">${s.icon}</div>
          <div style="flex:1">
            <div class="between"><b>${esc(s.name)}</b><span class="faint" style="font-size:.78rem">${s.progress || 0}%</span></div>
            ${progressBar(s.progress || 0)}
            <div class="faint" style="font-size:.74rem;margin-top:6px">${s.attempts ? s.attempts + ' tentative(s)' : 'Commence maintenant'}</div>
          </div>
        </a>`).join('')}
    </div>

    <div class="ad-slot mt2" data-ad="dashboard-top">Publicité</div>

    <div class="between mt3"><h2 style="margin:0">Défi du jour</h2><span class="pill pill-lime">${done}/${daily.challenges.length} terminés</span></div>
    <div class="grid g3 mt2">
      ${daily.challenges.map((c) => `
        <div class="card ${c.completed ? 'card-lift' : ''}" style="${c.completed ? 'border-color:rgba(52,211,153,.5)' : ''}">
          <div class="between"><span style="font-size:1.6rem">${c.icon}</span><span class="pill ${c.completed ? 'pill-lime' : 'pill-amber'}">${c.completed ? '✅ Terminé' : `+${c.xp} XP`}</span></div>
          <b style="display:block;margin:8px 0 6px">${esc(c.label)}</b>
          ${progressBar(Math.min(100, (c.progress / c.target) * 100))}
          <div class="faint" style="font-size:.74rem;margin-top:6px">${Math.min(c.progress, c.target)}/${c.target}</div>
        </div>`).join('')}
    </div>

    <div class="between mt3"><h2 style="margin:0">Quick play</h2><a class="btn btn-ghost btn-sm" href="#play">Tous les jeux →</a></div>
    <div class="grid g3 mt2">
      ${GAMES.slice(0, 3).map((g) => `<a class="card card-lift" href="#game?name=${g.id}" style="text-align:center"><div style="font-size:2.2rem">${g.icon}</div><b>${esc(g.name)}</b><p class="faint" style="font-size:.8rem;margin:6px 0 0">${esc(g.desc)}</p></a>`).join('')}
    </div>

    <div class="between mt3"><h2 style="margin:0">Classement</h2><a class="btn btn-ghost btn-sm" href="#leaderboard">Voir tout →</a></div>
    <div class="card mt2">
      ${lb.leaderboard.slice(0, 5).map((r) => lbRow(r, lb.me?.id)).join('')}
    </div>`;
  ctx.mountAds(view);
}

function lbRow(r, meId) {
  const cls = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
  return `<div class="lb-row ${r.id === meId ? 'me' : ''}">
    <div class="lb-rank ${cls}">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank}</div>
    <div class="avatar sm">${esc((r.name || 'R')[0].toUpperCase())}</div>
    <div style="flex:1"><b style="font-size:.9rem">${esc(r.name || 'Élève')}${r.id === meId ? ' (toi)' : ''}</b><div class="faint" style="font-size:.72rem">Niveau ${r.level}</div></div>
    <b style="font-size:.88rem">${(r.xp || 0).toLocaleString('fr-FR')} XP</b>
  </div>`;
}

// ---------- Study ----------
async function vStudy() {
  view.innerHTML = `
    <div class="grid g2" style="grid-template-columns:1.15fr .85fr">
      <div class="card">
        <h3>Que veux-tu étudier ?</h3>
        <div class="field"><textarea class="textarea" id="studyInput" placeholder="Colle ton cours ici… (ou utilise un sujet ci-dessous)"></textarea></div>
        <div class="row wrap">
          <button class="btn btn-outline btn-sm" id="uploadBtn">📎 Importer un fichier</button>
          <input type="file" id="fileInput" class="hidden" accept=".txt,.md,.csv,.pdf,image/*" />
          <span class="faint" id="fileInfo" style="font-size:.8rem"></span>
        </div>
        <div class="grid g2 mt2">
          <div class="field"><label>Matière</label><select class="select" id="studySubject"><option value="">Général</option>${ctx.subjects.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Difficulté</label><select class="select" id="studyDiff"><option value="easy">Facile</option><option value="medium" selected>Moyen</option><option value="hard">Difficile</option></select></div>
        </div>
        <button class="btn btn-primary btn-block" id="generateBtn">⚡ Générer ma révision</button>
        <p class="form-note center" style="margin-top:10px" id="quotaNote">${ctx.user.plan === 'premium' ? '💎 Générations illimitées' : `Gratuit : ${ctx.config?.freeAiPerDay ?? 3} générations/jour`}</p>
      </div>
      <div class="stack">
        <div class="card">
          <h3>💡 Conseils</h3>
          <div class="stack" style="gap:10px;font-size:.88rem">
            <div class="row"><span class="pill pill-violet">1</span><span class="muted">Colle 1 à 3 pages de cours.</span></div>
            <div class="row"><span class="pill pill-cyan">2</span><span class="muted">Choisis la matière et la difficulté.</span></div>
            <div class="row"><span class="pill pill-lime">3</span><span class="muted">Révise avec les flashcards puis le quiz.</span></div>
          </div>
        </div>
        <div class="card" id="historyCard"><h3>Révisions récentes</h3><div id="historyList"><div class="skeleton" style="height:60px"></div></div></div>
      </div>
    </div>
    <div id="studyResult" class="mt3"></div>
    <div class="ad-slot mt2" data-ad="dashboard-top">Publicité</div>`;
  ctx.mountAds(view);

  document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const info = document.getElementById('fileInfo');
    if (/text|json|csv|markdown/.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)) {
      const text = await file.text();
      document.getElementById('studyInput').value = text;
      info.textContent = `✅ ${file.name} importé`;
    } else {
      info.textContent = `📎 ${file.name} — l’extraction PDF/image sera traitée côté serveur`;
      document.getElementById('studyInput').value = `Contenu du fichier : ${file.name}`;
    }
  });

  document.getElementById('generateBtn').addEventListener('click', async () => {
    const input = document.getElementById('studyInput').value.trim();
    if (input.length < 20) return toast('Ajoute un peu plus de contenu à étudier.', 'error');
    const btn = document.getElementById('generateBtn');
    btn.disabled = true; btn.textContent = 'Génération en cours…';
    document.getElementById('studyResult').innerHTML = '<div class="grid g2">' + skeleton(2) + '</div>';
    try {
      const data = await api('/api/study/generate', { method: 'POST', body: { input, subjectId: document.getElementById('studySubject').value || null, difficulty: document.getElementById('studyDiff').value } });
      renderStudyResult(data.result);
      loadHistory();
      await ctx.refresh();
    } catch (ex) {
      if (ex.code === 'QUOTA_REACHED') {
        document.getElementById('studyResult').innerHTML = `<div class="card center"><div style="font-size:2.4rem">💎</div><b>${esc(ex.message)}</b><p class="mt2"><a class="btn btn-primary" href="#pricing">Passer Premium</a></p></div>`;
      } else document.getElementById('studyResult').innerHTML = `<div class="card center"><div style="font-size:2.2rem">😕</div><b>${esc(ex.message)}</b></div>`;
    } finally { btn.disabled = false; btn.textContent = '⚡ Générer ma révision'; }
  });

  loadHistory();
}

function renderStudyResult(result) {
  const tabs = ['Résumé', 'Flashcards', 'Quiz', 'Test d’entraînement'];
  document.getElementById('studyResult').innerHTML = `
    <div class="card">
      <div class="row wrap" id="studyTabs">${tabs.map((t, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-tab="${i}">${t}</button>`).join('')}</div>
      <div id="tabBody" class="mt2"></div>
    </div>`;
  const body = document.getElementById('tabBody');
  const draw = (i) => {
    if (i === 0) body.innerHTML = `<div style="white-space:pre-line;line-height:1.7">${esc(result.summary)}</div>
      <div class="row wrap mt2">${(result.keyPoints || []).map((k) => `<span class="pill pill-violet">${esc(k)}</span>`).join('')}</div>`;
    if (i === 1) body.innerHTML = `<div class="grid g3">${result.flashcards.map((f) => `<div class="card flashcard card-lift"><div><b>${esc(f.front)}</b><p class="faint mt1" style="font-size:.82rem">Clique pour révéler</p></div></div>`).join('')}</div>`;
    if (i === 2) {
      body.innerHTML = `<div class="stack">${result.quiz.map((q, qi) => `<div class="card" data-q="${qi}"><b>${qi + 1}. ${esc(q.text)}</b><div class="stack mt1" style="gap:8px">${q.options.map((o, oi) => `<div class="quiz-option" data-oi="${oi}"><span class="key">${String.fromCharCode(65 + oi)}</span>${esc(o)}</div>`).join('')}</div><div class="faint mt1" style="font-size:.82rem" data-fb></div></div>`).join('')}</div>`;
      body.querySelectorAll('[data-q]').forEach((card) => {
        const qi = Number(card.dataset.q);
        card.querySelectorAll('.quiz-option').forEach((opt) => opt.addEventListener('click', () => {
          const oi = Number(opt.dataset.oi);
          card.querySelectorAll('.quiz-option').forEach((n) => { n.classList.remove('correct', 'wrong'); if (Number(n.dataset.oi) === result.quiz[qi].answer) n.classList.add('correct'); });
          if (oi !== result.quiz[qi].answer) opt.classList.add('wrong');
          card.querySelector('[data-fb]').textContent = result.quiz[qi].explanation || '';
        }));
      });
    }
    if (i === 3) body.innerHTML = `<div class="stack">${result.practice.map((p, pi) => `<div class="card"><b>${pi + 1}. ${esc(p.question)}</b><details class="mt1"><summary class="muted" style="cursor:pointer;font-size:.85rem">Voir l’indice</summary><p style="font-size:.85rem;margin-top:6px">${esc(p.hint)}</p></details></div>`).join('')}</div>`;
  };
  draw(0);
  document.getElementById('studyTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    document.querySelectorAll('#studyTabs .chip').forEach((c) => c.classList.toggle('active', c === btn));
    draw(Number(btn.dataset.tab));
  });
}

async function loadHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  try {
    const data = await api('/api/study/history');
    list.innerHTML = data.sessions.length
      ? data.sessions.slice(0, 5).map((s) => `<div class="between" style="font-size:.82rem;padding:7px 0;border-bottom:1px solid var(--border)"><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${esc(s.preview)}…</span><span class="faint">${timeAgo(s.created_at)}</span></div>`).join('')
      : '<div class="empty" style="padding:18px"><div class="em" style="font-size:1.8rem">📚</div><span class="faint" style="font-size:.82rem">Ta première révision t’attend.</span></div>';
  } catch {}
}

// ---------- Quizzes ----------
async function vQuizzes(params) {
  const subject = params.get('subject') || '';
  view.innerHTML = `<div class="row wrap" id="filters"></div><div id="list" class="grid g2 mt2">${skeleton(4)}</div>`;
  const filters = document.getElementById('filters');
  filters.innerHTML = `<a class="chip ${!subject ? 'active' : ''}" href="#quizzes">Tout</a>` + ctx.subjects.map((s) => `<a class="chip ${subject === s.slug ? 'active' : ''}" href="#quizzes?subject=${s.slug}">${s.icon} ${esc(s.name)}</a>`).join('');
  const data = await api(`/api/quizzes${subject ? `?subject=${subject}` : ''}`);
  const list = document.getElementById('list');
  if (!data.quizzes.length) { list.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">📝</div><b>Ton premier défi t’attend.</b><p><a class="btn btn-primary mt2" href="#study">Générer une révision</a></p></div>`; return; }
  list.innerHTML = data.quizzes.map((q) => `
    <div class="card card-lift">
      <div class="between">
        <div class="row"><div class="subject-ico" style="background:${q.subject.color}22;color:${q.subject.color}">${q.subject.icon}</div>
          <div><b>${esc(q.title)}</b><div class="faint" style="font-size:.76rem">${esc(q.subject.name)} · ${q.questionCount} questions</div></div></div>
        <span class="pill ${q.difficulty === 'hard' ? 'pill-red' : q.difficulty === 'medium' ? 'pill-amber' : 'pill-lime'}">${q.difficulty === 'hard' ? 'Difficile' : q.difficulty === 'medium' ? 'Moyen' : 'Facile'}</span>
      </div>
      ${q.description ? `<p class="muted mt1" style="font-size:.85rem">${esc(q.description)}</p>` : ''}
      <div class="between mt2">
        <span class="faint" style="font-size:.76rem">${q.plays} partie(s)</span>
        ${q.locked ? `<a class="btn btn-primary btn-sm" href="#pricing">💎 Débloquer</a>` : `<a class="btn btn-primary btn-sm" href="#quiz?id=${q.id}">Jouer</a>`}
        ${q.isPremium && !q.locked ? '<span class="pill pill-violet">💎 Premium</span>' : ''}
      </div>
    </div>`).join('');
}

// ---------- Play ----------
async function vPlay() {
  view.innerHTML = `<div class="card" style="background:linear-gradient(150deg,var(--surface),rgba(163,230,53,.12))"><div class="between"><div><h3>🎮 Reviqo Play</h3><p style="margin:0;font-size:.9rem">1 à 5 minutes par partie. Gagne de l’XP, garde ta série.</p></div><span class="pill pill-lime">✨ ${GAMES.length} jeux</span></div></div>
    <div class="mt3">${gamesGridHtml()}</div>
    <div class="ad-slot mt2" data-ad="games-inline">Publicité</div>`;
  ctx.mountAds(view);
}

// ---------- Progress ----------
async function vProgress() {
  view.innerHTML = skeleton(3);
  const s = await api('/api/me/stats');
  const maxXp = Math.max(100, ...s.xpByDay.map((d) => d.xp));
  view.innerHTML = `
    <div class="grid g4">
      <div class="card"><div class="stat"><span>Quiz terminés</span><b>${s.quizzes}</b></div></div>
      <div class="card"><div class="stat"><span>Questions</span><b>${s.questions}</b></div></div>
      <div class="card"><div class="stat"><span>Précision moy.</span><b>${s.avgAccuracy}%</b></div></div>
      <div class="card"><div class="stat"><span>Meilleur score</span><b>${s.best}%</b></div></div>
    </div>
    <div class="grid g2 mt2" style="grid-template-columns:1.3fr .7fr">
      <div class="card">
        <b>XP des 14 derniers jours</b>
        <div class="chart mt2">${s.xpByDay.length ? s.xpByDay.map((d) => `<div class="col" style="height:${Math.round((d.xp / maxXp) * 100)}%" title="${d.xp} XP"></div>`).join('') : '<span class="faint">Pas encore de données.</span>'}</div>
        <div class="chart-x">${s.xpByDay.map((d) => `<span>${d.day.slice(8)}</span>`).join('')}</div>
      </div>
      <div class="card">
        <b>Tes séries</b>
        <div class="grid g2 mt2">
          <div class="stat"><span>Série actuelle</span><b>${s.streak} 🔥</b></div>
          <div class="stat"><span>Record</span><b>${s.longestStreak} 🏆</b></div>
        </div>
        <p class="faint mt2" style="font-size:.8rem">Temps d’étude cumulé : ${Math.round(s.duration / 60)} min</p>
      </div>
    </div>
    <div class="card mt2">
      <b>Par matière</b>
      <div class="stack mt2">
        ${s.bySubject.length ? s.bySubject.map((b) => `<div><div class="between" style="font-size:.88rem"><span>${b.icon} ${esc(b.name)}</span><b>${b.accuracy}%</b></div>${progressBar(b.accuracy)}</div>`).join('') : '<div class="empty"><div class="em">📊</div><span class="muted">Termine un quiz pour voir tes stats.</span></div>'}
      </div>
    </div>
    <div class="card mt2">
      <b>Activité récente</b>
      <div class="stack mt2">
        ${s.recent.length ? s.recent.map((r) => `<div class="between" style="font-size:.85rem;padding:8px 0;border-bottom:1px solid var(--border)"><span>${esc(r.quiz_title || 'Quiz')} <span class="faint">· ${esc(r.subject_name || '')}</span></span><span class="pill ${r.accuracy >= 80 ? 'pill-lime' : 'pill-amber'}">${r.accuracy}%</span></div>`).join('') : '<div class="faint">Aucune activité.</div>'}
      </div>
    </div>`;
}

// ---------- Achievements ----------
async function vAchievements() {
  view.innerHTML = skeleton(3);
  const data = await api('/api/me/achievements');
  const unlocked = data.achievements.filter((a) => a.unlocked);
  view.innerHTML = `
    <div class="between"><div><b>${unlocked.length}/${data.achievements.length} débloqués</b></div><span class="pill pill-lime">${unlocked.reduce((s, a) => s + a.xp, 0)} XP gagnés</span></div>
    <div class="mt2">${progressBar((unlocked.length / data.achievements.length) * 100)}</div>
    <div class="badge-grid mt3">
      ${data.achievements.map((a) => `<div class="achievement ${a.unlocked ? 'unlocked' : 'locked'}"><span class="em">${a.icon}</span><b style="font-size:.86rem">${esc(a.label)}</b><p class="faint" style="font-size:.74rem;margin:6px 0 0">${esc(a.description || '')}</p>${a.unlocked ? `<span class="pill pill-lime" style="margin-top:8px">+${a.xp} XP</span>` : '<span class="pill" style="margin-top:8px">🔒 Verrouillé</span>'}</div>`).join('')}
    </div>`;
  if (unlocked.length) confetti();
}

// ---------- Leaderboard ----------
async function vLeaderboard(params) {
  const scope = params.get('scope') || 'global';
  let page = Math.max(1, Number(params.get('page')) || 1);
  view.innerHTML = `<div class="row wrap" id="scopes"></div><div id="lbBody" class="card mt2">${skeleton(1)}</div>`;
  const scopes = [['global', '🌍 Global'], ['weekly', '📅 Semaine'], ['monthly', '🗓 Mois'], ['friends', '👥 Amis']];
  document.getElementById('scopes').innerHTML = scopes.map(([k, l]) => `<a class="chip ${scope === k ? 'active' : ''}" href="#leaderboard?scope=${k}&page=1">${l}</a>`).join('') + '<span class="pill pill-cyan" style="margin-left:auto">🔴 Temps réel</span>';

  async function load() {
    const data = await api(`/api/leaderboard?scope=${scope}&page=${page}&limit=15`);
    const me = data.me;
    document.getElementById('lbBody').innerHTML = `
      <div class="between" style="margin-bottom:10px"><b>${data.total} élève(s)</b><span class="pill pill-violet">Ta place : #${me.rank}</span></div>
      ${data.leaderboard.length ? data.leaderboard.map((r) => lbRow(r, ctx.user.id)).join('') : '<div class="empty"><div class="em">👥</div><b>Invite un ami et comparez-vous.</b></div>'}
      <div class="row mt2" style="justify-content:space-between">
        <button class="btn btn-ghost btn-sm" id="lbPrev" ${page <= 1 ? 'disabled' : ''}>← Précédent</button>
        <span class="faint" style="font-size:.82rem">Page ${data.page} / ${data.pages}</span>
        <button class="btn btn-ghost btn-sm" id="lbNext" ${page >= data.pages ? 'disabled' : ''}>Suivant →</button>
      </div>
      <div class="card mt2" style="background:var(--surface-2)">
        <div class="between" style="font-size:.85rem"><span>Toi — ${esc(me.firstName || 'Étudiant')}${me.username ? ` (@${esc(me.username)})` : ''}</span><b>${Number(me.xp || 0).toLocaleString('fr-FR')} XP · Niv. ${me.level}</b></div>
      </div>`;
    document.getElementById('lbPrev')?.addEventListener('click', () => { page = Math.max(1, page - 1); load(); });
    document.getElementById('lbNext')?.addEventListener('click', () => { page = Math.min(data.pages, page + 1); load(); });
  }

  await load();

  // Temps réel : SSE avec repli sur un rafraîchissement périodique.
  let stream = null;
  let poll = null;
  const stop = () => { if (stream) { try { stream.close(); } catch { /* ignore */ } stream = null; } if (poll) { clearInterval(poll); poll = null; } };
  if (typeof EventSource !== 'undefined') {
    try {
      stream = new EventSource(`/api/leaderboard/stream?scope=${encodeURIComponent(scope)}`);
      stream.addEventListener('leaderboard', () => { load().catch(() => {}); });
      stream.addEventListener('ready', () => { if (poll) { clearInterval(poll); poll = null; } });
      stream.addEventListener('error', () => { if (!poll) poll = setInterval(() => { load().catch(() => {}); }, 20000); });
    } catch { poll = setInterval(() => { load().catch(() => {}); }, 20000); }
  } else {
    poll = setInterval(() => { load().catch(() => {}); }, 20000);
  }
  window.__cleanup = stop;
}

// ---------- Friends ----------
async function vFriends() {
  view.innerHTML = skeleton(2);
  const data = await api('/api/friends');
  view.innerHTML = `
    <div class="grid g2" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <h3>Ajouter un ami</h3>
        <div class="row"><input class="input" id="friendEmail" type="email" placeholder="email@exemple.com" /><button class="btn btn-primary" id="addFriendBtn">Inviter</button></div>
        <p class="form-note mt1">Tu peux aussi partager ton profil pour qu’on t’ajoute.</p>
      </div>
      <div class="card">
        <h3>Mes stats sociales</h3>
        <div class="row" style="gap:24px"><div class="stat"><span>Amis</span><b>${data.friends.length}</b></div><div class="stat"><span>Demandes</span><b>${data.incoming.length}</b></div><div class="stat"><span>Défis</span><b>${data.challenges.length}</b></div></div>
      </div>
    </div>

    ${data.incoming.length ? `<div class="card mt2"><h3>Demandes reçues</h3><div class="stack">${data.incoming.map((f) => `<div class="between"><div class="row"><div class="avatar sm">${esc((f.name || 'R')[0])}</div><b>${esc(f.name)}</b></div><div class="row"><button class="btn btn-primary btn-sm" data-accept="${f.id}">Accepter</button><button class="btn btn-ghost btn-sm" data-remove="${f.id}">Refuser</button></div></div>`).join('')}</div></div>` : ''}

    <h2 class="mt3">Tes amis</h2>
    <div class="grid g3 mt2">
      ${data.friends.length ? data.friends.map((f) => `<div class="card card-lift"><div class="between"><div class="row"><div class="avatar">${esc((f.name || 'R')[0])}</div><div><b>${esc(f.name)}</b><div class="faint" style="font-size:.74rem">Niv. ${f.level} · 🔥 ${f.streak}</div></div></div></div>
        <div class="row mt2"><button class="btn btn-primary btn-sm" data-challenge="${f.id}">⚔️ Défier</button><button class="btn btn-ghost btn-sm" data-remove="${f.id}">Retirer</button></div></div>`).join('') : '<div class="empty" style="grid-column:1/-1"><div class="em">👥</div><b>Invite un ami et compete.</b></div>'}
    </div>

    ${data.challenges.length ? `<h2 class="mt3">Défis</h2><div class="stack mt2">${data.challenges.map((c) => `<div class="card between"><div><b>${esc(c.challenger_name)}</b> <span class="faint">→ ${c.questions} questions · ${esc(c.difficulty)}</span></div><span class="pill ${c.status === 'pending' ? 'pill-amber' : 'pill-lime'}">${c.status}</span></div>`).join('')}</div>` : ''}
    <div class="ad-slot mt2" data-ad="dashboard-top">Publicité</div>`;
  ctx.mountAds(view);

  document.getElementById('addFriendBtn').addEventListener('click', async () => {
    const email = document.getElementById('friendEmail').value.trim();
    if (!email) return;
    try { await api('/api/friends/request', { method: 'POST', body: { email } }); toast('Demande envoyée ✅', 'success'); vFriends(); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  view.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', async () => { await api('/api/friends/accept', { method: 'POST', body: { id: Number(b.dataset.accept) } }); toast('Ami ajouté 🎉', 'success'); vFriends(); }));
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/friends/${b.dataset.remove}`, { method: 'DELETE' }); vFriends(); }));
  view.querySelectorAll('[data-challenge]').forEach((b) => b.addEventListener('click', () => challengeModal(Number(b.dataset.challenge))));
}

function challengeModal(friendId) {
  const host = document.getElementById('modalHost');
  host.innerHTML = `<div class="modal-backdrop"><div class="card modal">
    <div class="between"><b>⚔️ Défier un ami</b><button class="icon-btn" id="closeModal">✕</button></div>
    <div class="field mt2"><label>Matière</label><select class="select" id="chSubject">${ctx.subjects.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.name)}</option>`).join('')}</select></div>
    <div class="grid g2">
      <div class="field"><label>Difficulté</label><select class="select" id="chDiff"><option value="easy">Facile</option><option value="medium" selected>Moyen</option><option value="hard">Difficile</option></select></div>
      <div class="field"><label>Questions</label><select class="select" id="chCount">${[3, 5, 10, 15].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <button class="btn btn-primary btn-block" id="sendChallenge">Envoyer le défi</button>
  </div></div>`;
  host.querySelector('#closeModal').addEventListener('click', () => { host.innerHTML = ''; });
  host.querySelector('#sendChallenge').addEventListener('click', async () => {
    try {
      const r = await api('/api/friends/challenge', { method: 'POST', body: { friendId, subjectId: Number(host.querySelector('#chSubject').value), difficulty: host.querySelector('#chDiff').value, questions: Number(host.querySelector('#chCount').value) } });
      host.innerHTML = '';
      toast('Défi envoyé ! ⚔️', 'success');
      navigator.clipboard?.writeText(location.origin + r.link).catch(() => {});
    } catch (ex) { toast(ex.message, 'error'); }
  });
}

// ---------- Profile ----------
async function vProfile() {
  const [stats, ach, curriculum] = await Promise.all([api('/api/me/stats'), api('/api/me/achievements'), api('/api/curriculum').catch(() => null)]);
  const u = ctx.user;
  const unlocked = ach.achievements.filter((a) => a.unlocked);
  view.innerHTML = `
    <div class="card">
      <div class="row" style="gap:20px;flex-wrap:wrap">
        <div class="avatar lg">${esc(u.avatar || 'R')}</div>
        <div style="flex:1;min-width:200px">
          <div class="row"><h2 style="margin:0">${esc(u.firstName || 'Étudiant')}</h2>${u.plan === 'premium' ? '<span class="pill pill-violet">💎 Premium</span>' : '<span class="pill">Gratuit</span>'}${u.isGuest ? '<span class="pill pill-amber">Invité</span>' : ''}</div>
          <p class="muted" style="margin:6px 0">${esc(u.email)} · ${esc(u.schoolLevel || 'Niveau non défini')}${u.grade ? ' · ' + esc(u.grade) : ''}${u.track ? ' · ' + esc(u.track) : ''}${u.domain ? ' · ' + esc(u.domain) : ''} · ${esc(u.country || '')}</p>
          <div class="row wrap" style="gap:8px">
            <span class="pill pill-cyan">⭐ Niveau ${u.level}</span><span class="pill pill-lime">⚡ ${u.xp.toLocaleString('fr-FR')} XP</span>
            <span class="pill pill-amber">🔥 ${u.streak} j</span><span class="pill">🏆 Record ${u.longestStreak} j</span>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" id="editProfile">✏️ Modifier</button>
      </div>
    </div>

    <div class="grid g4 mt2">
      <div class="card"><div class="stat"><span>Quiz</span><b>${stats.quizzes}</b></div></div>
      <div class="card"><div class="stat"><span>Précision</span><b>${stats.avgAccuracy}%</b></div></div>
      <div class="card"><div class="stat"><span>Badges</span><b>${unlocked.length}</b></div></div>
      <div class="card"><div class="stat"><span>Mini-jeux</span><b>${stats.games}</b></div></div>
    </div>

    ${programCard(curriculum)}

    <div class="card mt2">
      <div class="between"><b>Mes matières</b><a class="btn btn-ghost btn-sm" href="#quizzes">Voir les quiz</a></div>
      <div class="row wrap mt2">${(u.subjects.length ? ctx.subjects.filter((s) => u.subjects.includes(s.id)) : ctx.subjects.slice(0, 4)).map((s) => `<span class="pill">${s.icon} ${esc(s.name)}</span>`).join('')}</div>
    </div>

    <div class="card mt2">
      <div class="between"><b>Badges récents</b><a class="btn btn-ghost btn-sm" href="#achievements">Tous →</a></div>
      <div class="row wrap mt2">${unlocked.slice(0, 8).map((a) => `<span class="pill pill-lime">${a.icon} ${esc(a.label)}</span>`).join('') || '<span class="faint" style="font-size:.85rem">Continue d’apprendre pour débloquer ton premier badge.</span>'}</div>
    </div>

    <div class="card mt2">
      <b>Paramètres</b>
      <div class="grid g2 mt2">
        <div>
          <label class="muted" style="font-size:.82rem">Notifications</label>
          <div class="stack mt1" style="gap:8px">
            ${[['daily', 'Défi du jour'], ['streak', 'Rappel de série'], ['friend', 'Défis d’amis'], ['achievement', 'Badges'], ['billing', 'Abonnement']].map(([k, l]) => `<label class="row" style="font-size:.85rem;gap:8px"><input type="checkbox" data-notif="${k}" ${u.notifyPrefs?.[k] !== false ? 'checked' : ''} /> ${l}</label>`).join('')}
          </div>
        </div>
        <div>
          <label class="muted" style="font-size:.82rem">Publicité</label>
          <label class="row mt1" style="font-size:.85rem;gap:8px"><input type="checkbox" id="adConsent" ${u.adConsent ? 'checked' : ''} /> J’accepte des publicités non personnalisées</label>
          <p class="form-note mt1">Les comptes Premium ne voient aucune publicité. Contenu publicitaire adapté selon l’âge et le consentement.</p>
        </div>
      </div>
      <div class="row wrap mt2">
        <button class="btn btn-primary btn-sm" id="savePrefs">Enregistrer</button>
        <button class="btn btn-outline btn-sm" id="changePassword">Changer de mot de passe</button>
        <button class="btn btn-danger btn-sm" id="logoutBtn">Se déconnecter</button>
      </div>
      ${u.isGuest ? '<p class="form-note mt2">👤 Tu es en mode invité. Crée un compte (mot de passe) pour sécuriser ta progression.</p>' : ''}
    </div>`;

  document.getElementById('savePrefs').addEventListener('click', async () => {
    const notifyPrefs = {};
    view.querySelectorAll('[data-notif]').forEach((c) => { notifyPrefs[c.dataset.notif] = c.checked; });
    await api('/api/me', { method: 'PATCH', body: { notifyPrefs, adConsent: document.getElementById('adConsent').checked } });
    toast('Préférences enregistrées ✅', 'success');
    await ctx.refresh();
  });
  document.getElementById('changePassword').addEventListener('click', async () => {
    const pw = prompt('Nouveau mot de passe (6 caractères minimum) :');
    if (!pw) return;
    try { await api('/api/me', { method: 'PATCH', body: { password: pw } }); toast('Mot de passe mis à jour ✅', 'success'); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.replace('/'); });
  document.getElementById('editProfile').addEventListener('click', editProfileModal);
  document.getElementById('fixProgram')?.addEventListener('click', editProfileModal);
}

/** Carte « Mon programme » : programme résolu, onglets d'examen et statut du contenu. */
function programCard(state) {
  if (!state) return '';
  const cur = state.curriculum;
  const tabs = state.examTabs || [];
  const needs = state.needs || [];
  if (!cur) {
    return `<div class="card mt2" id="programCard"><b>Mon programme</b><p class="muted mt1" style="font-size:.9rem">${esc(state.notice || 'Complète ton profil scolaire pour adapter ton contenu.')}</p><button class="btn btn-ghost btn-sm mt1" id="fixProgram">Compléter mon profil</button></div>`;
  }
  const pill = cur.contentStatus === 'partial' ? '<span class="pill pill-amber">Contenu générique</span>'
    : cur.contentStatus === 'unavailable' ? '<span class="pill">Indisponible</span>' : '<span class="pill pill-lime">À jour</span>';
  return `<div class="card mt2" id="programCard">
    <div class="between"><b>Mon programme 🎓</b>${pill}</div>
    <p class="muted mt1" style="font-size:.9rem">${esc(cur.countryLabel)} · ${esc(cur.label)}</p>
    ${tabs.length ? `<div class="row wrap mt2" style="gap:8px">${tabs.map((t) => `<span class="pill pill-violet">🎯 ${esc(t.label)}</span>`).join('')}</div>` : ''}
    ${state.notice ? `<p class="form-note mt1">${esc(state.notice)}</p>` : ''}
    ${state.genericNote ? `<p class="form-note mt1">${esc(state.genericNote)}</p>` : ''}
    ${needs.length ? `<p class="form-note mt1">À préciser : ${esc(needs.join(', '))}</p>` : ''}
  </div>`;
}

function programEditorSection(catalog, u) {
  if (!catalog) return '';
  const country = catalog.countries.find((c) => c.label === u.country);
  const sys = country && catalog.systems[country.system];
  if (!sys) return '';
  const generic = u.schoolLevel === 'Collège' ? 'college' : u.schoolLevel === 'Lycée' ? 'lycee' : u.schoolLevel === 'Étudiant' ? 'etudiant' : null;
  const levelDef = sys.levels.find((l) => l.level === generic) || sys.levels[0];
  if (!levelDef) return '';
  if (levelDef.domains) {
    return `<div class="field"><label>Domaine</label><select class="select" id="ep-domain"><option value="">—</option>${levelDef.domains.map((d) => `<option value="${esc(d.domain)}" ${u.domain === d.domain ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>`;
  }
  let html = `<div class="field"><label>Classe</label><select class="select" id="ep-grade"><option value="">—</option>${levelDef.grades.map((g) => `<option value="${esc(g.grade)}" ${u.grade === g.grade ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></div>`;
  const gradeDef = levelDef.grades.find((g) => g.grade === u.grade);
  if (gradeDef?.tracks?.length) {
    html += `<div class="field"><label>Voie</label><select class="select" id="ep-track"><option value="">—</option>${gradeDef.tracks.map((t) => `<option value="${esc(t.track)}" ${u.track === t.track ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>`;
  }
  return html;
}

async function editProfileModal() {
  const u = ctx.user;
  let catalog = null;
  try { catalog = await api('/api/programs'); } catch { catalog = null; }
  const host = document.getElementById('modalHost');
  host.innerHTML = `<div class="modal-backdrop"><div class="card modal">
    <div class="between"><b>Modifier mon profil</b><button class="icon-btn" id="closeModal">✕</button></div>
    <div class="field mt2"><label>Prénom / pseudo</label><input class="input" id="ep-name" value="${esc(u.firstName || '')}" /></div>
    <div class="field"><label>Niveau scolaire</label><select class="select" id="ep-level"><option value="">—</option>${['Collège', 'Lycée', 'Étudiant', 'Autre'].map((l) => `<option ${u.schoolLevel === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>Pays</label><input class="input" id="ep-country" value="${esc(u.country || '')}" /></div>
    ${programEditorSection(catalog, u)}
    <div class="field"><label>Mes matières</label><div class="row wrap" id="ep-subjects">${ctx.subjects.map((s) => `<button class="chip ${u.subjects.includes(s.id) ? 'active' : ''}" data-sub="${s.id}">${s.icon} ${esc(s.name)}</button>`).join('')}</div></div>
    <button class="btn btn-primary btn-block" id="saveProfile">Enregistrer</button>
  </div></div>`;
  const selected = new Set(u.subjects);
  host.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.sub);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    b.classList.toggle('active');
  }));
  host.querySelector('#closeModal').addEventListener('click', () => { host.innerHTML = ''; });
  host.querySelector('#saveProfile').addEventListener('click', async () => {
    const body = { firstName: host.querySelector('#ep-name').value, schoolLevel: host.querySelector('#ep-level').value, country: host.querySelector('#ep-country').value, subjects: [...selected] };
    if (host.querySelector('#ep-grade')) body.grade = host.querySelector('#ep-grade').value;
    if (host.querySelector('#ep-track')) body.track = host.querySelector('#ep-track').value;
    if (host.querySelector('#ep-domain')) body.domain = host.querySelector('#ep-domain').value;
    await api('/api/me', { method: 'PATCH', body });
    host.innerHTML = '';
    toast('Profil mis à jour ✅', 'success');
    await ctx.refresh();
    vProfile();
  });
}

// ---------- Recherche globale ----------
async function vSearch(params) {
  const q = params.get('q') || '';
  view.innerHTML = `<div class="card"><div class="row" style="gap:8px;flex-wrap:wrap"><input class="input" id="searchInput" style="flex:1;min-width:200px" placeholder="Rechercher un cours, un quiz, une flashcard…" value="${esc(q)}" /><button class="btn btn-primary" id="searchBtn">Rechercher</button></div><p class="form-note mt1">Recherche dans ta bibliothèque, selon ton programme et tes droits d’accès.</p><div id="searchResults" class="mt2"></div></div>`;
  const run = async () => {
    const query = document.getElementById('searchInput').value.trim();
    const host = document.getElementById('searchResults');
    if (query.length < 2) { host.innerHTML = '<p class="faint mt2" style="font-size:.85rem">Saisis au moins 2 caractères.</p>'; return; }
    host.innerHTML = skeleton(2);
    try {
      const r = await api(`/api/search?q=${encodeURIComponent(query)}`);
      host.innerHTML = r.results.length ? r.results.map((x) => `<a class="card card-lift mt2" href="${esc(x.link)}"><div class="between"><b style="font-size:.92rem">${esc(x.title)}</b><span class="pill">${x.type === 'quiz' ? '📝 Quiz' : '🃏 Carte'}${x.isPremium ? ' · 💎' : ''}</span></div><p class="muted" style="font-size:.84rem;margin:6px 0 0">${esc((x.description || '').slice(0, 140))}</p><p class="faint" style="font-size:.74rem;margin:6px 0 0">${esc(x.subject?.icon || '')} ${esc(x.subject?.name || '')}${x.chapter ? ' · ' + esc(x.chapter) : ''}</p></a>`).join('') : '<div class="empty"><div class="em">🔎</div><b>Aucun résultat.</b></div>';
    } catch (ex) { host.innerHTML = `<div class="empty"><div class="em">😕</div><b>${esc(ex.message)}</b></div>`; }
  };
  document.getElementById('searchBtn').addEventListener('click', run);
  document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  if (q) run();
}

// ---------- Publicités (comptes gratuits uniquement) ----------
function adSlotHtml(config, slotName) {
  if (!config || !config.show) return '';
  const slot = (config.slots || []).find((s) => s.slot === slotName) || (config.slots || [])[0];
  if (!slot) return '';
  const w = slot.width || 320;
  const h = slot.height || 100;
  return `<div class="card mt2" style="display:flex;align-items:center;justify-content:center;border-style:dashed"><div class="center"><span class="faint" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em">Publicité</span><div style="width:${w}px;max-width:100%;height:${h}px;display:grid;place-items:center;background:var(--surface-2);border-radius:8px"><span class="faint" style="font-size:.8rem">${esc(slot.label || 'Emplacement publicitaire')}</span></div></div></div>`;
}

// ---------- Teams ----------
async function vTeams() {
  view.innerHTML = skeleton(2);
  const me = await api('/api/teams/me');
  const lb = await api('/api/teams/leaderboard?limit=10');
  const lbHtml = `<div class="card mt2"><b>🏆 Classement des équipes</b><p class="form-note mt1">${esc(lb.metric)}</p>
    ${lb.leaderboard.length ? lb.leaderboard.map((x) => `<div class="lb-row"><div class="lb-rank">${x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : '#' + x.rank}</div><div style="flex:1"><b style="font-size:.9rem">${esc(x.name)}</b><div class="faint" style="font-size:.72rem">#${x.id} · ${x.memberCount} membre(s) · ligue ${esc(x.league)} · ${x.perMember} XP/membre</div></div><b style="font-size:.88rem">${x.weeklyXp.toLocaleString('fr-FR')} XP</b></div>`).join('') : '<p class="faint mt1" style="font-size:.85rem">Aucune équipe pour l’instant.</p>'}</div>`;

  if (!me.team) {
    view.innerHTML = `
      <div class="grid g2">
        <div class="card"><h3>Créer une équipe</h3>
          <div class="field mt2"><label>Nom</label><input class="input" id="teamName" maxlength="40" placeholder="Les Révisards" /></div>
          <div class="field"><label>Description (optionnel)</label><input class="input" id="teamDesc" maxlength="120" /></div>
          <div class="field"><label>Objectif hebdo (XP)</label><input class="input" id="teamGoal" type="number" min="100" value="3000" /></div>
          <button class="btn btn-primary btn-block" id="createTeamBtn">Créer mon équipe</button>
        </div>
        <div class="card"><h3>Rejoindre avec un code</h3>
          <div class="field mt2"><label>Code d’invitation</label><input class="input" id="joinCode" placeholder="Code reçu" /></div>
          <button class="btn btn-outline btn-block" id="joinTeamBtn">Rejoindre</button>
          <p class="form-note mt1">Les invitations sont révocables et peuvent expirer.</p>
        </div>
      </div>
      ${lbHtml}`;
    document.getElementById('createTeamBtn').addEventListener('click', async () => {
      try {
        const r = await api('/api/teams', { method: 'POST', body: { name: document.getElementById('teamName').value, description: document.getElementById('teamDesc').value, weeklyGoal: Number(document.getElementById('teamGoal').value) } });
        toast('Équipe créée 🛡️', 'success');
        if (r.invite?.code) { navigator.clipboard?.writeText(r.invite.code).catch(() => {}); toast(`Code d’invitation : ${r.invite.code}`, 'info', 6000); }
        vTeams();
      } catch (ex) { toast(ex.message, 'error'); }
    });
    document.getElementById('joinTeamBtn').addEventListener('click', async () => {
      try { await api('/api/teams/join', { method: 'POST', body: { code: document.getElementById('joinCode').value } }); toast('Équipe rejointe 🎉', 'success'); vTeams(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
    return;
  }

  const t = me.team;
  const isAdmin = me.myRole === 'admin';
  const goal = me.goal;
  const members = me.members.map((m) => `<div class="lb-row"><div class="avatar sm">${esc((m.name || 'R')[0].toUpperCase())}</div><div style="flex:1"><b style="font-size:.9rem">${esc(m.name)}${m.role === 'admin' ? ' 👑' : ''}${m.id === ctx.user.id ? ' (toi)' : ''}</b><div class="faint" style="font-size:.72rem">${m.xp} XP</div></div>${isAdmin && m.id !== ctx.user.id ? `<button class="btn btn-ghost btn-sm" data-promote="${m.id}">Promouvoir</button><button class="btn btn-ghost btn-sm" data-remove="${m.id}">Exclure</button>` : ''}</div>`).join('');
  const feed = me.activity.map((a) => `<div class="between" style="font-size:.82rem;padding:4px 0"><span>${esc(a.body || a.type)}</span><span class="faint">${timeAgo(a.created_at)}</span></div>`).join('') || '<p class="faint" style="font-size:.85rem">Aucune activité.</p>';
  const challenges = (await api('/api/teams/challenges/list')).challenges;
  const chHtml = challenges.length ? challenges.map((c) => {
    const opp = c.opponent_team_id === t.id;
    const other = opp ? c.challengerName : c.opponentName;
    const label = { pending: opp ? 'En attente de ta réponse' : 'En attente', accepted: 'En cours', declined: 'Refusé', completed: 'Terminé', expired: 'Expiré' }[c.status] || c.status;
    const actions = opp && c.status === 'pending' && isAdmin ? `<button class="btn btn-primary btn-sm" data-accept="${c.id}">Accepter</button><button class="btn btn-ghost btn-sm" data-decline="${c.id}">Refuser</button>` : '';
    const score = c.status === 'completed' ? ` · ${c.challenger_score}–${c.opponent_score}` : '';
    return `<div class="between" style="font-size:.85rem;padding:5px 0"><span>vs ${esc(other)} · ${esc(label)}${score}</span><span>${actions}</span></div>`;
  }).join('') : '<p class="faint" style="font-size:.85rem">Aucun défi.</p>';

  view.innerHTML = `
    <div class="card" style="background:linear-gradient(150deg,var(--surface),rgba(108,92,231,.14))">
      <div class="between"><div><h2 style="margin:4px 0">🛡️ ${esc(t.name)}</h2><span class="pill">${t.memberCount} membre(s) · ligue ${esc(t.league)}</span> ${me.myRole === 'admin' ? '<span class="pill pill-violet">Admin</span>' : ''}</div>
      <div class="stat"><span>Objectif hebdo</span><b>${goal.progress.toLocaleString('fr-FR')} / ${goal.target.toLocaleString('fr-FR')}</b></div></div>
      ${progressBar(goal.percent)}
      <div class="row wrap mt2">
        <button class="btn btn-outline btn-sm" id="inviteBtn">Créer une invitation</button>
        ${isAdmin ? '<button class="btn btn-ghost btn-sm" id="editTeamBtn">Paramètres</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="leaveTeamBtn">Quitter l’équipe</button>
      </div>
      <div id="inviteResult" class="form-note mt1"></div>
    </div>
    <div class="grid g2 mt2">
      <div class="card"><b>Membres</b>${members}</div>
      <div class="card"><b>Activité</b>${feed}</div>
    </div>
    <div class="card mt2"><div class="between"><b>Défis</b>${isAdmin ? '<button class="btn btn-outline btn-sm" id="proposeBtn">Lancer un défi</button>' : ''}</div>${chHtml}</div>
    ${lbHtml}`;
  document.getElementById('inviteBtn').addEventListener('click', async () => {
    try { const r = await api(`/api/teams/${t.id}/invites`, { method: 'POST', body: {} }); document.getElementById('inviteResult').innerHTML = `Code : <b>${esc(r.code)}</b>${r.expiresAt ? ` (expire le ${new Date(r.expiresAt).toLocaleDateString('fr-FR')})` : ''}`; navigator.clipboard?.writeText(r.code).catch(() => {}); toast('Code copié', 'success'); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  document.getElementById('editTeamBtn')?.addEventListener('click', async () => {
    const g = prompt('Nouvel objectif hebdo (XP) :', String(goal.target)); if (!g) return;
    try { await api(`/api/teams/${t.id}`, { method: 'PATCH', body: { weeklyGoal: Number(g) } }); toast('Objectif mis à jour', 'success'); vTeams(); } catch (ex) { toast(ex.message, 'error'); }
  });
  document.getElementById('leaveTeamBtn').addEventListener('click', async () => {
    if (!confirm('Quitter l’équipe ?')) return;
    try { await api('/api/teams/leave', { method: 'POST' }); toast('Tu as quitté l’équipe', 'info'); vTeams(); } catch (ex) { toast(ex.message, 'error'); }
  });
  document.getElementById('proposeBtn')?.addEventListener('click', async () => {
    const id = prompt('Identifiant de l’équipe adverse (visible dans le classement) :'); if (!id) return;
    try { await api('/api/teams/challenges', { method: 'POST', body: { opponentTeamId: Number(id), questions: 5, deadlineHours: 24 } }); toast('Défi envoyé ⚔️', 'success'); vTeams(); } catch (ex) { toast(ex.message, 'error'); }
  });
  view.querySelectorAll('[data-promote]').forEach((b) => b.addEventListener('click', async () => { try { await api(`/api/teams/members/${b.dataset.promote}/role`, { method: 'POST', body: { role: 'admin' } }); toast('Membre promu', 'success'); vTeams(); } catch (ex) { toast(ex.message, 'error'); } }));
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Exclure ce membre ?')) return; try { await api(`/api/teams/members/${b.dataset.remove}/remove`, { method: 'POST' }); toast('Membre exclu', 'info'); vTeams(); } catch (ex) { toast(ex.message, 'error'); } }));
  view.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/teams/challenges/${b.dataset.accept}/respond`, { method: 'POST', body: { action: 'accept' } }); toast('Défi accepté', 'success'); vTeams(); }));
  view.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/teams/challenges/${b.dataset.decline}/respond`, { method: 'POST', body: { action: 'decline' } }); toast('Défi refusé', 'info'); vTeams(); }));
}

// ---------- Billing ----------
async function vBilling() {
  view.innerHTML = skeleton(3);
  const s = await api('/api/billing/status');
  const u = ctx.user;
  const statusLabel = { active: 'Actif', trialing: 'Essai gratuit', canceled: 'Résiliation programmée', past_due: 'Paiement en attente', paused: 'En pause', null: 'Aucun abonnement' }[s.status] || s.status || 'Aucun abonnement';
  view.innerHTML = `
    <div class="card" style="background:linear-gradient(150deg,var(--surface),rgba(108,92,231,.14))">
      <div class="between">
        <div><div class="faint" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.08em">Ton abonnement</div>
          <h2 style="margin:4px 0">${u.plan === 'premium' ? '💎 Premium' : 'Gratuit'}</h2>
          <span class="pill ${s.status === 'trialing' ? 'pill-amber' : s.status === 'active' ? 'pill-lime' : 'pill-red'}">${statusLabel}</span></div>
        <div class="stat"><span>Prix</span><b>${u.plan === 'premium' ? eurFmt(priceCfg().monthly.amount) : '0 €'}</b></div>
      </div>
      ${s.status === 'trialing' ? `<p class="mt2" style="margin:0">🎁 Essai gratuit : ${s.trialDaysLeft} jour(s) restant(s). Ensuite, prélèvement automatique de ${eurFmt(priceCfg().monthly.amount)}/mois. Annule à tout moment avant la fin de l'essai pour ne rien payer.</p>` : ''}
      ${s.status === 'canceled' ? `<p class="mt2" style="margin:0">Ton abonnement reste actif jusqu’au ${s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString('fr-FR') : '—'}.</p>` : ''}
      ${s.paymentIssue ? '<p class="mt2 pill pill-red">⚠️ Problème de paiement — mets à jour ton moyen de paiement.</p>' : ''}
      <div class="row wrap mt2">
        ${u.plan !== 'premium' ? '<a class="btn btn-primary" href="#pricing">Passer Premium</a>' : ''}
        ${u.plan === 'premium' && s.status === 'trialing' ? '<button class="btn btn-outline" id="cancelBtn">Annuler l’essai</button>' : ''}
        ${s.status === 'active' ? '<button class="btn btn-outline" id="downgradeBtn">Rétrograder</button>' : ''}
        ${s.status === 'canceled' ? '<button class="btn btn-primary" id="resumeBtn">Réactiver</button>' : ''}
        ${s.stripeConfigured && u.plan === 'premium' ? '<button class="btn btn-ghost" id="portalBtn">Portail de facturation</button>' : ''}
        <button class="btn btn-ghost" id="syncBtn">🔄 Synchroniser</button>
      </div>
      ${s.nextDueDate ? `<p class="form-note mt1">Prochaine échéance : ${new Date(s.nextDueDate).toLocaleDateString('fr-FR')}${s.cancelAtPeriodEnd ? ' (résiliation programmée)' : ''}.</p>` : ''}
    </div>

    <div class="grid g2 mt2">
      <div class="card"><b>Moyens de paiement</b><p class="form-note mt1">Géré de façon sécurisée par Stripe. REVIQO ne stocke jamais tes données bancaires.</p><p class="faint" style="font-size:.8rem">Mode : ${s.stripeConfigured ? 'Stripe live configuré ✅' : 'Démo (aucune clé Stripe fournie)'}</p></div>
      <div class="card"><b>Factures</b>${s.payments.length ? `<div class="stack mt1">${s.payments.map((p) => `<div class="between" style="font-size:.82rem"><span>${new Date(p.created_at).toLocaleDateString('fr-FR')} · ${esc(p.plan || '')}</span><span class="pill ${p.status === 'paid' ? 'pill-lime' : 'pill-amber'}">${p.status}</span></div>`).join('')}</div>` : '<p class="faint mt1" style="font-size:.85rem">Aucun paiement pour l’instant.</p>'}</div>
    </div>
    <div class="grid g2 mt2" id="planCards"></div>`;
  renderPlanCards(document.getElementById('planCards'), s.stripeConfigured);
  document.getElementById('cancelBtn')?.addEventListener('click', async () => { await api('/api/billing/cancel', { method: 'POST' }); toast('Abonnement annulé', 'info'); await ctx.refresh(); vBilling(); });
  document.getElementById('downgradeBtn')?.addEventListener('click', async () => { await api('/api/billing/downgrade', { method: 'POST' }); toast('Rétrogradation programmée', 'info'); vBilling(); });
  document.getElementById('resumeBtn')?.addEventListener('click', async () => { await api('/api/billing/resume', { method: 'POST' }); toast('Abonnement réactivé ✨', 'success'); await ctx.refresh(); vBilling(); });
  document.getElementById('portalBtn')?.addEventListener('click', async () => { try { const r = await api('/api/billing/portal', { method: 'POST' }); if (r.url) location.href = r.url; else toast('Portail indisponible en mode démo.', 'info'); } catch (ex) { toast(ex.message, 'error'); } });
  document.getElementById('syncBtn')?.addEventListener('click', async () => {
    const r = await api('/api/billing/sync', { method: 'POST' });
    toast(r.synced ? 'Abonnement synchronisé ✅' : 'Rien à synchroniser (mode démo).', 'info');
    await ctx.refresh(); vBilling();
  });
}

function renderPlanCards(host, stripeConfigured = false) {
  const P = priceCfg();
  const monthlyEven = eurFmt(Math.round(P.yearly.amount / 12));
  const saving = Math.round((1 - P.yearly.amount / (P.monthly.amount * 12)) * 100);
  const cards = [
    { name: 'Gratuit', price: '0 €', period: '/mois', features: ['3 générations IA/jour', 'Quiz standards', 'Mini-jeux', 'Publicités'], btn: ctx.user.plan === 'premium' ? 'Rétrograder' : 'Plan actuel', primary: false, action: 'free' },
    { name: 'Premium mensuel', price: eurFmt(P.monthly.amount), period: '/mois', features: ['IA illimitée', 'Quiz avancés', 'Zéro pub', 'Analyses'], btn: 'Essai gratuit 7 jours', primary: true, action: 'monthly' },
    { name: 'Premium annuel', price: eurFmt(P.yearly.amount), period: '/an', features: ['Tout Premium', `Économise ${saving} %`, `Soit ~${monthlyEven}/mois`, 'Zéro pub'], btn: 'Essai gratuit 7 jours', primary: true, action: 'yearly' },
  ];
  host.innerHTML = cards.map((c, i) => `<div class="card price-card ${c.primary ? 'featured' : ''}"><h3>${esc(c.name)}</h3><div class="price-tag">${esc(c.price)}<span> ${c.period}</span></div><ul class="price-list">${c.features.map((f) => `<li><b>✓</b> ${esc(f)}</li>`).join('')}</ul><button class="btn ${c.primary ? 'btn-primary' : 'btn-outline'} btn-block" data-plan="${c.action}" ${i === 0 && ctx.user.plan !== 'premium' ? 'disabled' : ''}>${esc(c.btn)}</button></div>`).join('');
  host.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', async () => {
    const plan = b.dataset.plan;
    if (plan === 'free') { await api('/api/billing/downgrade', { method: 'POST' }); toast('Passage au plan gratuit programmé.', 'info'); return vBilling(); }
    b.disabled = true; b.textContent = 'Redirection…';
    try {
      if (stripeConfigured) {
        // Lien buy.stripe.com + clientreferenceid construit depuis la session serveur.
        const r = await api('/api/billing/link', { method: 'POST', body: { plan } });
        if (r.url) { toast('Redirection vers Stripe…', 'info'); location.href = r.url; return; }
      }
      // Stripe non configuré : jamais de vrai paiement sans activation possible.
      const ok = confirm("Stripe n'est pas configuré sur ce serveur.\n\nActiver l'essai en mode DÉMO (aucun paiement réel, aucune carte demandée) ?");
      if (ok) { await api('/api/billing/checkout', { method: 'POST', body: { plan } }); toast('Essai démo activé (aucun paiement réel).', 'info'); await ctx.refresh(); await vBilling(); }
      else { b.disabled = false; b.textContent = 'Essai gratuit 7 jours'; }
    } catch (ex) { toast(ex.message, 'error'); b.disabled = false; b.textContent = 'Essai gratuit 7 jours'; }
  }));
}

// ---------- Pricing (in-app) ----------
async function vPricing() {
  view.innerHTML = `
    <div class="center">
      <span class="eyebrow">Premium</span>
      <h2>Passe au niveau supérieur.</h2>
      <p>Essai gratuit de 7 jours. Ensuite, prélèvement automatique. Annulable à tout moment.</p>
    </div>
    <div class="pricing-grid mt3" id="planCards"></div>
    <p class="center faint mt3" style="font-size:.82rem">Paiement sécurisé par Stripe. Aucune donnée bancaire stockée par REVIQO.</p>
    ${ctx.config && ctx.config.stripeEnabled === false ? '<div class="card mt2" style="border-color:rgba(251,191,36,.5)"><b>⚠️ Stripe non configuré sur ce serveur</b><p class="form-note mt1">Les boutons d’essai n’ouvriront pas la page Stripe ici. Ajoutez <code>STRIPE_SECRET_KEY</code> dans <code>.env</code> puis redémarrez le serveur pour activer le vrai paiement.</p></div>' : ''}`;
  renderPlanCards(document.getElementById('planCards'), !!(ctx.config && ctx.config.stripeEnabled));
}

// ---------- Notifications ----------
async function vNotifications() {
  view.innerHTML = skeleton(2);
  const [data, nprefs] = await Promise.all([api('/api/notifications'), api('/api/notifications/prefs')]);
  view.innerHTML = `
    <div class="between"><b>${data.notifications.length} notification(s)</b>${data.unread ? '<button class="btn btn-outline btn-sm" id="readAll">Tout marquer comme lu</button>' : ''}</div>
    <div class="stack mt2">
      ${data.notifications.length ? data.notifications.map((n) => `<div class="card ${n.read ? '' : 'card-lift'}" style="${n.read ? 'opacity:.7' : 'border-color:rgba(108,92,231,.4)'}"><div class="between"><b style="font-size:.92rem">${esc(n.title)}</b><span class="faint" style="font-size:.74rem">${timeAgo(n.created_at)}</span></div><p class="muted" style="font-size:.85rem;margin:6px 0 0">${esc(n.body || '')}</p></div>`).join('') : '<div class="empty"><div class="em">🔔</div><b>Aucune notification pour l’instant.</b><p class="faint">Tes défis et badges apparaîtront ici.</p></div>'}
    </div>
    <div class="card mt2"><b>⚙️ Préférences de notifications</b>
      <div class="grid g3 mt2">
        <div class="field"><label>Fréquence</label><select class="select" id="nFreq">${['instant', 'daily', 'weekly', 'off'].map((f) => `<option value="${f}" ${nprefs.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Début heures silencieuses</label><input class="input" id="nQs" placeholder="22:00" value="${esc(nprefs.quietStart || '')}" /></div>
        <div class="field"><label>Fin heures silencieuses</label><input class="input" id="nQe" placeholder="07:00" value="${esc(nprefs.quietEnd || '')}" /></div>
      </div>
      <div class="row wrap mt1" style="gap:12px">${[['friend', 'Amis & défis'], ['achievement', 'Badges'], ['streak', 'Rappels de série'], ['daily', 'Défi du jour'], ['billing', 'Abonnement']].map(([k, l]) => `<label class="row" style="font-size:.85rem;gap:6px"><input type="checkbox" data-npref="${k}" ${nprefs.prefs?.[k] !== false ? 'checked' : ''} /> ${l}</label>`).join('')}</div>
      <button class="btn btn-primary btn-sm mt2" id="saveNotifPrefs">Enregistrer</button>
      <p class="form-note mt1">Rappels facultatifs et réglables — aucune mécanique culpabilisante.</p>
    </div>`;
  document.getElementById('readAll')?.addEventListener('click', async () => { await api('/api/notifications/read', { method: 'POST', body: {} }); vNotifications(); refreshNotifDot(); });
  document.getElementById('saveNotifPrefs')?.addEventListener('click', async () => {
    const prefsObj = {};
    view.querySelectorAll('[data-npref]').forEach((c) => { prefsObj[c.dataset.npref] = c.checked; });
    await api('/api/notifications/prefs', { method: 'PATCH', body: { prefs: prefsObj, quietStart: document.getElementById('nQs').value, quietEnd: document.getElementById('nQe').value, frequency: document.getElementById('nFreq').value } });
    toast('Préférences enregistrées ✅', 'success');
  });
}

async function refreshNotifDot() {
  try {
    const data = await api('/api/notifications');
    document.getElementById('notifDot')?.classList.toggle('hidden', !data.unread);
    const btn = document.getElementById('notifBtn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => { location.hash = 'notifications'; });
    }
  } catch {}
}

// ---------- Flashcards (Réviser) ----------
async function vReviser(params) {
  view.innerHTML = skeleton(2);
  const subject = params?.get('subject') || '';
  const data = await api(`/api/flashcards${subject ? `?subject=${subject}` : ''}`);
  view.innerHTML = `
    <div class="row wrap">
      <a class="chip ${!subject ? 'active' : ''}" href="#reviser">Tous</a>
      ${ctx.subjects.map((s) => `<a class="chip ${subject === s.slug ? 'active' : ''}" href="#reviser?subject=${s.slug}">${s.icon} ${esc(s.name)}</a>`).join('')}
    </div>
    <div class="grid g3 mt2" id="deckGrid"></div>`;
  const grid = document.getElementById('deckGrid');
  if (!data.decks.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">🃏</div><b>Aucun paquet pour l’instant.</b></div>`; return; }
  const total = data.decks.reduce((s, d) => s + d.cards.length, 0);
  grid.insertAdjacentHTML('beforebegin', `<p class="muted" style="font-size:.85rem">${data.decks.length} paquets · ${total} cartes. Clique pour réviser.</p>`);
  grid.innerHTML = data.decks.map((deck, di) => `
    <div class="card card-lift deck-card" data-deck="${di}" style="cursor:pointer">
      <div class="between">
        <div class="subject-ico" style="background:${deck.subject.color}22;color:${deck.subject.color}">${deck.subject.icon}</div>
        ${deck.locked ? '<span class="pill pill-violet">💎 Premium</span>' : `<span class="pill pill-lime">${deck.cards.length} cartes</span>`}
      </div>
      <b style="display:block;margin-top:10px">${esc(deck.deck)}</b>
      <div class="faint" style="font-size:.78rem">${esc(deck.subject.name)}</div>
      <div class="faint" style="font-size:.72rem;margin-top:6px">${esc(deck.cards[0]?.front || '')}…</div>
    </div>`).join('');
  grid.querySelectorAll('[data-deck]').forEach((el) => el.addEventListener('click', () => {
    const deck = data.decks[Number(el.dataset.deck)];
    if (deck.locked) { toast('Paquet réservé aux membres Premium 💎', 'info'); ctx.go('#pricing'); return; }
    openDeck(deck);
  }));
}

function openDeck(deck) {
  const cards = [...deck.cards];
  const state = { i: 0, flipped: false, known: new Set(), review: new Set() };
  const draw = () => {
    const c = cards[state.i];
    const pct = Math.round(((state.known.size + state.review.size) / cards.length) * 100);
    view.innerHTML = `
      <div class="between">
        <button class="btn btn-ghost btn-sm" id="deckBack">← Paquets</button>
        <b>${esc(deck.subject.icon)} ${esc(deck.deck)}</b>
        <span class="pill">${state.i + 1}/${cards.length}</span>
      </div>
      ${progressBar(((state.i) / cards.length) * 100)}
      <div class="card flashcard card-lift ${state.flipped ? 'flipped' : ''}" id="flipCard" style="margin-top:16px;min-height:260px">
        <div>
          <div class="faint" style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">${state.flipped ? 'Réponse' : 'Question'}</div>
          <h2 style="font-size:1.5rem;margin:12px 0">${esc(state.flipped ? c.back : c.front)}</h2>
          ${state.flipped ? '' : '<p class="faint">Clique la carte pour révéler</p>'}
        </div>
      </div>
      <div class="row wrap mt2" style="justify-content:center">
        <button class="btn btn-outline btn-sm" id="deckPrev">⏮ Précédent</button>
        <button class="btn btn-primary btn-sm" id="deckFlip">🔄 Retourner</button>
        <button class="btn btn-outline btn-sm" id="deckNext">Suivant ⏭</button>
      </div>
      <div class="row wrap mt2" style="justify-content:center">
        <button class="btn btn-danger btn-sm" id="deckReview">😕 À revoir (${state.review.size})</button>
        <button class="btn btn-lime btn-sm" id="deckKnown">✅ Je sais (${state.known.size})</button>
        <button class="btn btn-ghost btn-sm" id="deckShuffle">🔀 Mélanger</button>
      </div>`;
    view.querySelector('#deckBack').addEventListener('click', () => ctx.go('#reviser'));
    const next = () => { if (state.i < cards.length - 1) { state.i++; state.flipped = false; draw(); } else summary(); };
    view.querySelector('#flipCard').addEventListener('click', () => { state.flipped = !state.flipped; draw(); });
    view.querySelector('#deckFlip').addEventListener('click', () => { state.flipped = !state.flipped; draw(); });
    view.querySelector('#deckNext').addEventListener('click', next);
    view.querySelector('#deckPrev').addEventListener('click', () => { if (state.i > 0) { state.i--; state.flipped = false; draw(); } });
    view.querySelector('#deckKnown').addEventListener('click', () => { state.known.add(c.id); state.review.delete(c.id); next(); });
    view.querySelector('#deckReview').addEventListener('click', () => { state.review.add(c.id); state.known.delete(c.id); next(); });
    view.querySelector('#deckShuffle').addEventListener('click', () => { for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } state.i = 0; state.flipped = false; draw(); });
  };
  const summary = () => {
    if (state.known.size) confetti();
    view.innerHTML = `
      <div class="card center" style="padding:34px">
        <div style="font-size:3rem">🎉</div>
        <h2>Paquet terminé !</h2>
        <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
          <span class="pill pill-lime">✅ Maîtrisées : ${state.known.size}</span>
          <span class="pill pill-red">😕 À revoir : ${state.review.size}</span>
        </div>
        <div class="row mt3" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="reviewAgain">Réviser les cartes ratées</button>
          <a class="btn btn-outline" href="#reviser">Autres paquets</a>
        </div>
      </div>`;
    view.querySelector('#reviewAgain')?.addEventListener('click', () => {
      const missed = cards.filter((x) => state.review.has(x.id));
      if (!missed.length) return toast('Aucune carte à revoir, bravo !', 'success');
      cards.splice(0, cards.length, ...missed);
      state.i = 0; state.flipped = false; state.review.clear(); state.known.clear();
      draw();
    });
  };
  draw();
}

// ---------- AI Video ----------
async function vVideo() {
  view.innerHTML = `
    <div class="card" style="background:linear-gradient(150deg,var(--surface),rgba(34,211,238,.12))">
      <div class="between"><div><h3>🎬 Reviqo Studio — Vidéo IA</h3><p style="margin:0;font-size:.9rem">Colle ton cours, l’IA en fait une vidéo animée avec narration.</p></div><span class="pill pill-cyan">${ctx.user.plan === 'premium' ? '💎 Illimité' : '1 vidéo gratuite / jour'}</span></div>
    </div>
    <div class="card mt2">
      <b>🔎 Trouver une vidéo sur une notion</b>
      <p class="form-note mt1">Décris ce que tu veux réviser : je cherche d’abord le cours correspondant dans ton programme, puis une vidéo réelle.</p>
      <div class="row mt2" style="gap:8px;flex-wrap:wrap"><input class="input" id="videoQuery" style="flex:1;min-width:200px" placeholder="Ex. « théorème de Thalès », « les fractions 6ème »…" /><button class="btn btn-primary" id="videoSearchBtn">Chercher</button></div>
      <div id="videoSearchResult" class="mt2"></div>
    </div>
    <div class="grid g2 mt2" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <div class="field"><label>Ton cours</label><textarea class="textarea" id="videoInput" placeholder="Colle ton cours ici…"></textarea></div>
        <div class="grid g2">
          <div class="field"><label>Matière</label><select class="select" id="videoSubject"><option value="">Général</option>${ctx.subjects.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Difficulté</label><select class="select" id="videoDiff"><option value="easy">Facile</option><option value="medium" selected>Moyen</option><option value="hard">Difficile</option></select></div>
        </div>
        <button class="btn btn-primary btn-block" id="videoGen">🎬 Créer ma vidéo</button>
      </div>
      <div class="card" id="videoPreview"><div class="empty"><div class="em">🎬</div><b>Ta vidéo apparaîtra ici.</b><p class="faint" style="font-size:.85rem">3 à 6 scènes, ~30 secondes.</p></div></div>
    </div>`;
  const vsBtn = document.getElementById('videoSearchBtn');
  vsBtn.addEventListener('click', async () => {
    const q = document.getElementById('videoQuery').value.trim();
    const host = document.getElementById('videoSearchResult');
    if (!q) return toast('Écris ce que tu veux réviser.', 'error');
    vsBtn.disabled = true; vsBtn.textContent = 'Analyse…';
    host.innerHTML = skeleton(1);
    try {
      const r = await api('/api/video/search', { method: 'POST', body: { query: q } });
      host.innerHTML = renderVideoSearch(r);
    } catch (ex) {
      if (ex.code === 'PREMIUM_REQUIRED' || ex.status === 402) host.innerHTML = '<div class="empty"><div class="em">💎</div><b>Vidéo IA réservée aux membres Premium.</b><p class="mt2"><a class="btn btn-primary" href="#pricing">Passer Premium</a></p></div>';
      else host.innerHTML = `<div class="empty"><div class="em">😕</div><b>${esc(ex.message)}</b></div>`;
    } finally { vsBtn.disabled = false; vsBtn.textContent = 'Chercher'; }
  });
  document.getElementById('videoQuery')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') vsBtn.click(); });
  document.getElementById('videoGen').addEventListener('click', async () => {
    const input = document.getElementById('videoInput').value.trim();
    if (input.length < 20) return toast('Ajoute un peu de contenu.', 'error');
    const btn = document.getElementById('videoGen');
    btn.disabled = true; btn.textContent = 'Studio en action…';
    document.getElementById('videoPreview').innerHTML = skeleton(1);
    try {
      const data = await api('/api/video/generate', { method: 'POST', body: { input, subjectId: document.getElementById('videoSubject').value || null, difficulty: document.getElementById('videoDiff').value } });
      ctx.setUser(data.user);
      startVideoPlayer(document.getElementById('videoPreview'), data.script);
    } catch (ex) {
      const premium = ex.code === 'QUOTA_REACHED';
      document.getElementById('videoPreview').innerHTML = `<div class="empty"><div class="em">${premium ? '💎' : '😕'}</div><b>${esc(ex.message)}</b>${premium ? '<p class="mt2"><a class="btn btn-primary" href="#pricing">Passer Premium</a></p>' : ''}</div>`;
    } finally { btn.disabled = false; btn.textContent = '🎬 Créer ma vidéo'; }
  });
}

function renderVideoSearch(r) {
  const a = r.analysis || {};
  if (a.status === 'not_pedagogical') return `<div class="card" style="background:var(--surface-2)"><b>🙅 Aucune notion identifiée</b><p class="form-note mt1">${esc(a.justification || '')}</p></div>`;
  if (a.status === 'needs_clarification') return `<div class="card" style="background:var(--surface-2)"><b>❓ Précise ta demande</b><p class="form-note mt1">${esc(a.clarification || a.justification || '')}</p></div>`;
  const course = a.course ? `<div class="card" style="background:var(--surface-2)"><b>📘 Cours identifié</b><p class="mt1" style="font-size:.9rem">${esc(a.course.title)}${a.course.chapter ? ' — ' + esc(a.course.chapter) : ''}</p>${a.objectives && a.objectives.length ? `<div class="row wrap" style="gap:6px">${a.objectives.slice(0, 4).map((o) => `<span class="pill" style="font-size:.72rem">${esc(o)}</span>`).join('')}</div>` : ''}<p class="form-note mt1">${esc(a.justification || '')}</p></div>` : '';
  if (a.status === 'out_of_program') return course + `<div class="card mt2" style="background:var(--surface-2)"><b>🚧 Hors programme</b><p class="form-note mt1">${esc(a.justification || '')}</p>${a.suggestion ? `<p class="form-note">${esc(a.suggestion)}</p>` : ''}</div>`;
  const vids = (r.results || []).map((v) => `<div class="card mt2"><div class="between"><b style="font-size:.92rem">${esc(v.title)}</b>${v.duration ? `<span class="pill">${esc(v.duration)}</span>` : ''}</div><p class="faint" style="font-size:.8rem;margin:4px 0">${esc(v.channel || '')}</p><p class="form-note">${esc(v.relevance || '')}</p><a class="btn btn-cyan btn-sm mt1" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">▶️ Ouvrir la vidéo</a></div>`).join('');
  const notice = r.notice ? `<div class="card mt2" style="background:var(--surface-2)"><b>ℹ️ Information</b><p class="form-note mt1">${esc(r.notice)}</p></div>` : '';
  const empty = (!r.results || !r.results.length) && !r.notice ? '<div class="card mt2" style="background:var(--surface-2)"><b>Aucune vidéo pertinente trouvée.</b><p class="form-note mt1">Je ne propose pas de résultat inventé.</p></div>' : '';
  return course + vids + notice + empty + (r.disclaimer ? `<p class="form-note mt2">${esc(r.disclaimer)}</p>` : '');
}

function wrapText(ctx2, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = String(text).split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx2.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    if (lines.length >= maxLines) break;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx2.fillText(l, x, y + i * lineHeight));
}

function startVideoPlayer(host, script) {
  host.innerHTML = `
    <canvas id="vidCanvas" width="1280" height="720" style="width:100%;display:block;border-radius:16px;background:#0a0a17"></canvas>
    <div class="row wrap mt2" style="gap:8px;justify-content:space-between">
      <div class="row" style="gap:8px">
        <button class="btn btn-primary btn-sm" id="vPlay">▶ Lire</button>
        <button class="btn btn-outline btn-sm" id="vPrev">⏮</button>
        <button class="btn btn-outline btn-sm" id="vNext">⏭</button>
        <button class="btn btn-outline btn-sm" id="vNarr">🔊 Narration</button>
      </div>
      <button class="btn btn-cyan btn-sm" id="vRecord">⏺ Enregistrer</button>
    </div>
    <div class="bar mt2"><i id="vBar" style="width:0%"></i></div>
    <p class="center faint mt1" style="font-size:.76rem"><span id="vScene">Scène 1</span> · ${script.scenes.length} scènes · ~${script.totalDuration}s</p>`;
  const canvas = host.querySelector('#vidCanvas');
  const c = canvas.getContext('2d');
  const W = 1280, H = 720;
  const palette = ['#6c5ce7', '#22d3ee', '#a3e635', '#f472b6', '#fbbf24', '#34d399'];
  let sceneIdx = 0, sceneStart = performance.now(), t0 = performance.now(), playing = false, narrate = true, raf = null, recorder = null, chunks = [];

  const narrateScene = (s) => {
    if (!narrate || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(s.narration || ''); u.lang = 'fr-FR'; u.rate = 1.02; speechSynthesis.speak(u); } catch {}
  };

  function draw(scene, p, t) {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0a0a17'); g.addColorStop(1, '#151538'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      const col = palette[(sceneIdx + i) % palette.length];
      const x = W * (0.2 + 0.3 * i) + Math.sin(t * 0.6 + i) * 80, y = H * (0.3 + 0.2 * (i % 2)) + Math.cos(t * 0.5 + i) * 60, r = 170 + i * 40;
      const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col + '44'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    const accent = palette[sceneIdx % palette.length];
    c.textAlign = 'center'; c.fillStyle = '#fff';
    const ease = Math.min(1, p * 3);
    const rise = (1 - ease) * 40;
    if (scene.type === 'title' || scene.type === 'outro') {
      c.font = '800 74px sans-serif'; c.fillStyle = '#fff';
      wrapText(c, scene.title, W / 2, H / 2 - 30 + rise, W - 200, 84, 2);
      c.font = '400 34px sans-serif'; c.fillStyle = accent;
      c.fillText(scene.subtitle || scene.body || '', W / 2, H / 2 + 70 + rise);
    } else if (scene.type === 'points') {
      c.fillStyle = accent; c.font = '800 20px sans-serif'; c.fillText('À RETENIR', W / 2, 110);
      c.font = '700 46px sans-serif'; c.fillStyle = '#fff'; c.fillText(scene.title, W / 2, 175);
      c.textAlign = 'left'; c.font = '600 38px sans-serif';
      scene.points.forEach((pt, i) => {
        const ap = Math.max(0, Math.min(1, (p - i * 0.12) * 4));
        c.fillStyle = palette[i % palette.length]; c.beginPath(); c.arc(190, 290 + i * 62, 12, 0, 7); c.fill();
        c.fillStyle = `rgba(255,255,255,${0.15 + ap * 0.85})`;
        wrapText(c, pt, 220, 302 + i * 62, W - 420, 44, 1);
      });
    } else if (scene.type === 'quiz') {
      c.fillStyle = accent; c.font = '800 20px sans-serif'; c.fillText('PETIT TEST', W / 2, 100);
      c.fillStyle = '#fff'; c.font = '700 40px sans-serif';
      wrapText(c, scene.question, W / 2, 190, W - 240, 52, 3);
      c.font = '600 30px sans-serif';
      (scene.options || []).slice(0, 4).forEach((o, i) => {
        const correct = (p > 0.6 && i === scene.answer);
        c.fillStyle = correct ? 'rgba(163,230,53,.9)' : 'rgba(255,255,255,.14)';
        const y = 340 + i * 68; c.beginPath(); c.roundRect(300, y - 32, W - 600, 54, 16); c.fill();
        c.fillStyle = correct ? '#14260a' : '#fff'; c.fillText(String.fromCharCode(65 + i) + '. ' + o, W / 2, y + 4);
      });
    } else if (scene.type === 'flash') {
      c.fillStyle = accent; c.font = '800 20px sans-serif'; c.fillText('FLASHCARD', W / 2, 110);
      c.fillStyle = '#fff'; c.font = '800 60px sans-serif';
      wrapText(c, scene.front, W / 2, H / 2 - 40, W - 200, 66, 2);
      c.font = '500 36px sans-serif'; c.fillStyle = 'rgba(255,255,255,.82)';
      wrapText(c, p > 0.45 ? scene.back : '', W / 2, H / 2 + 70, W - 260, 46, 3);
    } else {
      c.fillStyle = accent; c.font = '800 20px sans-serif'; c.fillText('IDÉE CLÉ ' + (scene.index || ''), W / 2, 120);
      c.fillStyle = '#fff'; c.font = '700 52px sans-serif'; c.fillText(scene.title, W / 2, 200);
      c.font = '500 40px sans-serif'; c.fillStyle = 'rgba(255,255,255,.9)';
      wrapText(c, scene.body, W / 2, 300 + rise, W - 260, 54, 5);
    }
    // bottom accent + progress
    c.fillStyle = accent; c.fillRect(0, H - 8, W * p, 8);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.font = '600 22px sans-serif'; c.textAlign = 'center';
    c.fillText('REVIQO', W / 2, H - 34);
  }

  function tick(now) {
    const scene = script.scenes[sceneIdx];
    const elapsed = (now - sceneStart) / 1000;
    const p = Math.min(1, elapsed / scene.duration);
    draw(scene, p, (now - t0) / 1000);
    host.querySelector('#vBar').style.width = `${((sceneIdx + p) / script.scenes.length) * 100}%`;
    host.querySelector('#vScene').textContent = `Scène ${sceneIdx + 1}/${script.scenes.length}`;
    if (p >= 1) { if (sceneIdx < script.scenes.length - 1) { sceneIdx++; sceneStart = now; narrateScene(script.scenes[sceneIdx]); } else { playing = false; host.querySelector('#vPlay').textContent = '▶ Rejouer'; speechSynthesis?.cancel?.(); return; } }
    if (playing) raf = requestAnimationFrame(tick);
  }

  const play = () => {
    if (playing) { playing = false; cancelAnimationFrame(raf); speechSynthesis?.cancel?.(); host.querySelector('#vPlay').textContent = '▶ Lire'; return; }
    playing = true; sceneStart = performance.now() - 0; host.querySelector('#vPlay').textContent = '⏸ Pause'; narrateScene(script.scenes[sceneIdx]); raf = requestAnimationFrame(tick);
  };
  host.querySelector('#vPlay').addEventListener('click', play);
  host.querySelector('#vNext').addEventListener('click', () => { sceneIdx = Math.min(script.scenes.length - 1, sceneIdx + 1); sceneStart = performance.now(); narrateScene(script.scenes[sceneIdx]); draw(script.scenes[sceneIdx], 0, 0); });
  host.querySelector('#vPrev').addEventListener('click', () => { sceneIdx = Math.max(0, sceneIdx - 1); sceneStart = performance.now(); narrateScene(script.scenes[sceneIdx]); draw(script.scenes[sceneIdx], 0, 0); });
  host.querySelector('#vNarr').addEventListener('click', (e) => { narrate = !narrate; if (!narrate) speechSynthesis?.cancel?.(); e.target.textContent = narrate ? '🔊 Narration' : '🔇 Narration'; });
  host.querySelector('#vRecord').addEventListener('click', (e) => {
    if (recorder) { recorder.stop(); recorder = null; e.target.textContent = '⏺ Enregistrer'; return; }
    try {
      const stream = canvas.captureStream(30);
      recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
      chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reviqo-video.webm'; a.click();
        toast('Vidéo téléchargée 🎬', 'success');
      };
      recorder.start();
      e.target.textContent = '⏹ Stop & télécharger';
      if (!playing) play();
      toast('Enregistrement en cours…', 'info');
    } catch { toast('Enregistrement non supporté sur ce navigateur.', 'error'); }
  });
  draw(script.scenes[0], 0, 0);
}

// ---------- AI Coach ----------
async function vCoach() {
  view.innerHTML = skeleton(2);
  const premium = ctx.user.plan === 'premium' || ctx.user.role === 'admin';
  const s = await api('/api/coach/settings');
  if (!premium) {
    view.innerHTML = `
      <div class="card center" style="padding:40px;background:linear-gradient(150deg,var(--surface),rgba(108,92,231,.16))">
        <div style="font-size:3rem">🧠</div>
        <h2>Coach IA — Premium</h2>
        <p>Ton tuteur personnel : pose une question, demande un plan de révision, des fiches ou des quiz. Branche ta propre clé API (OpenAI, Anthropic, Gemini…) pour des réponses puissantes.</p>
        <a class="btn btn-primary btn-lg mt2" href="#pricing">Débloquer le Coach IA</a>
      </div>`;
    return;
  }
  const history = [{ role: 'assistant', content: 'Salut ! Je suis Coach Reviz 🧠 Pose-moi une question sur ton cours, demande un plan de révision ou des flashcards. Tu peux aussi brancher ta clé API dans les réglages.' }];
  view.innerHTML = `
    <div class="grid g2" style="grid-template-columns:1.4fr .6fr">
      <div class="card" style="display:flex;flex-direction:column;min-height:60vh">
        <div class="between"><b>💬 Conversation</b><span class="pill pill-violet">${s.hasKey ? `🔑 ${esc(s.provider || 'clé perso')}` : 'Mode local'}</span></div>
        <div id="coachMessages" class="stack mt2" style="flex:1;overflow-y:auto;max-height:52vh"></div>
        <div class="row mt2"><input class="input" id="coachInput" placeholder="Pose ta question…" /><button class="btn btn-primary" id="coachSend">Envoyer</button></div>
      </div>
      <div class="card">
        <b>⚙️ Réglages du coach</b>
        <div class="field mt2"><label>Fournisseur</label><select class="select" id="coachProvider">
          <option value="">Local (sans clé)</option>
          <option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="anthropic" ${s.provider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
          <option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
          <option value="custom" ${s.provider === 'custom' ? 'selected' : ''}>Personnalisé (compatible OpenAI)</option>
        </select></div>
        <div class="field"><label>Modèle</label><input class="input" id="coachModel" value="${esc(s.model || '')}" placeholder="gpt-4o-mini, claude-3-5-haiku…" /></div>
        <div class="field"><label>Clé API</label><input class="input" id="coachKey" type="password" placeholder="${s.hasKey ? '•••••••• (enregistrée)' : 'sk-…'}" autocomplete="off" /></div>
        <div class="row wrap"><button class="btn btn-primary btn-sm" id="coachSave">Enregistrer</button><button class="btn btn-ghost btn-sm" id="coachClear">Effacer la clé</button></div>
        <p class="form-note mt2">🔒 Ta clé est stockée côté serveur et n’est jamais renvoyée au navigateur. Sans clé, le coach fonctionne en mode local.</p>
      </div>
    </div>`;
  const box = document.getElementById('coachMessages');
  const renderMsgs = () => {
    box.innerHTML = history.map((m) => `<div class="card" style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:88%;background:${m.role === 'user' ? 'rgba(108,92,231,.18)' : 'var(--surface-2)'}"><div style="white-space:pre-line;font-size:.9rem">${esc(m.content)}</div>${m.sources && m.sources.length ? `<div class="row wrap mt1" style="gap:6px">${m.sources.map((x) => `<a class="pill" style="font-size:.72rem" href="${esc(x.link || '#')}" title="${esc(x.chapter || '')}">📚 ${esc(x.title)}</a>`).join('')}</div>` : ''}${m.role === 'assistant' && m.grounded === false ? '<p class="form-note mt1" style="margin:6px 0 0">Réponse générale — aucune source de ta bibliothèque.</p>' : ''}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  };
  renderMsgs();
  const send = async () => {
    const input = document.getElementById('coachInput');
    const text = input.value.trim(); if (!text) return;
    input.value = ''; history.push({ role: 'user', content: text }); renderMsgs();
    history.push({ role: 'assistant', content: '…' }); renderMsgs();
    try {
      const r = await api('/api/coach/chat', { method: 'POST', body: { messages: history.filter((m) => m.content !== '…') } });
      history[history.length - 1] = { role: 'assistant', content: r.reply.content + (r.reply.warning ? `\n\n⚠️ ${r.reply.warning}` : ''), sources: r.reply.sources || [], grounded: r.reply.grounded };
    } catch (ex) { history[history.length - 1] = { role: 'assistant', content: `⚠️ ${ex.message}` }; }
    renderMsgs();
  };
  document.getElementById('coachSend').addEventListener('click', send);
  document.getElementById('coachInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  document.getElementById('coachSave').addEventListener('click', async () => {
    try {
      await api('/api/coach/settings', { method: 'POST', body: { provider: document.getElementById('coachProvider').value, model: document.getElementById('coachModel').value, apiKey: document.getElementById('coachKey').value || null } });
      toast('Réglages enregistrés ✅', 'success'); vCoach();
    } catch (ex) { toast(ex.message, 'error'); }
  });
  document.getElementById('coachClear').addEventListener('click', async () => { await api('/api/coach/settings', { method: 'POST', body: { clear: true } }); toast('Clé effacée', 'info'); vCoach(); });
}

// ---------- boot ----------
document.getElementById('themeBtn')?.addEventListener('click', () => { toggleTheme(); renderChrome(); });
document.getElementById('themeBtn2')?.addEventListener('click', () => { toggleTheme(); renderChrome(); });

async function boot() {
  let session;
  try { session = await api('/api/auth/session'); } catch { session = { user: null }; }
  if (!session.user) return location.replace('/auth.html#login');
  if (!session.user.onboardingDone) return location.replace('/auth.html#onboarding');
  ctx.user = session.user;
  renderChrome();
  await route();
  refreshNotifDot();
}
window.addEventListener('hashchange', route);
boot();
