import { api, esc, toast, initTheme, toggleTheme, progressBar } from './api.js';

initTheme();
const view = document.getElementById('view');
const ADMIN_NAV = [
  { id: 'stats', label: 'Statistiques', icon: '📊' },
  { id: 'users', label: 'Utilisateurs', icon: '👤' },
  { id: 'subs', label: 'Abonnements', icon: '💳' },
  { id: 'quizzes', label: 'Quiz', icon: '📝' },
  { id: 'ads', label: 'Publicités', icon: '📣' },
  { id: 'activity', label: 'Activité', icon: '⚡' },
  { id: 'reports', label: 'Signalements', icon: '🚩' },
  { id: 'curricula', label: 'Programmes', icon: '🎓' },
  { id: 'audit', label: 'Audit', icon: '🧾' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '🩺' },
];
let admin = null;

function chrome() {
  document.getElementById('adminNav').innerHTML = ADMIN_NAV.map((n) => `<a href="#${n.id}" data-nav="${n.id}"><span class="em">${n.icon}</span>${n.label}</a>`).join('');
  document.getElementById('adminUser').innerHTML = `<div class="avatar sm">${esc(admin.avatar || 'A')}</div><div><div style="font-weight:700;font-size:.84rem">${esc(admin.firstName || 'Admin')}</div><div class="faint" style="font-size:.72rem">${esc(admin.email)}</div></div>`;
}

const views = { stats: vStats, users: vUsers, subs: vSubs, quizzes: vQuizzes, ads: vAds, activity: vActivity, reports: vReports, curricula: vCurricula, audit: vAudit, diagnostics: vDiagnostics };

async function route() {
  const name = location.hash.replace('#', '') || 'stats';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  document.getElementById('pageTitle').textContent = ADMIN_NAV.find((n) => n.id === name)?.label || 'Admin';
  try { await (views[name] || vStats)(); }
  catch (ex) { view.innerHTML = `<div class="card center"><div class="em" style="font-size:2.2rem">😕</div><b>${esc(ex.message)}</b></div>`; }
}

async function vStats() {
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const s = await api('/api/admin/stats');
  const maxSignup = Math.max(1, ...s.signups.map((x) => x.count));
  const maxRev = Math.max(1, ...s.revenueByDay.map((x) => x.cents));
  view.innerHTML = `
    <div class="grid g4">
      <div class="card"><div class="stat"><span>Utilisateurs</span><b>${s.totalUsers}</b></div></div>
      <div class="card"><div class="stat"><span>Premium</span><b>${s.premiumUsers}</b></div></div>
      <div class="card"><div class="stat"><span>Gratuits</span><b>${s.freeUsers}</b></div></div>
      <div class="card"><div class="stat"><span>Invités</span><b>${s.guests}</b></div></div>
      <div class="card"><div class="stat"><span>Actifs (24 h)</span><b>${s.dau}</b></div></div>
      <div class="card"><div class="stat"><span>Actifs (30 j)</span><b>${s.mau}</b></div></div>
      <div class="card"><div class="stat"><span>Quiz terminés</span><b>${s.quizCompletions}</b></div></div>
      <div class="card"><div class="stat"><span>Revenus</span><b>${(s.revenueCents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</b></div></div>
      <div class="card"><div class="stat"><span>Conversion</span><b>${s.conversionRate}%</b></div></div>
      <div class="card"><div class="stat"><span>Session moy.</span><b>${s.avgSessionDuration}s</b></div></div>
      <div class="card"><div class="stat"><span>Impressions pub</span><b>${s.adImpressions.toLocaleString('fr-FR')}</b></div></div>
      <div class="card"><div class="stat"><span>Ratio premium</span><b>${s.totalUsers ? Math.round((s.premiumUsers / s.totalUsers) * 100) : 0}%</b></div></div>
    </div>
    <div class="grid g2 mt2">
      <div class="card"><b>Inscriptions (14 j)</b><div class="chart mt2">${s.signups.map((d) => `<div class="col" style="height:${Math.round((d.count / maxSignup) * 100)}%" title="${d.count}"></div>`).join('') || '<span class="faint">—</span>'}</div><div class="chart-x">${s.signups.map((d) => `<span>${d.day.slice(5)}</span>`).join('')}</div></div>
      <div class="card"><b>Revenus (14 j)</b><div class="chart mt2">${s.revenueByDay.map((d) => `<div class="col" style="height:${Math.round((d.cents / maxRev) * 100)}%" title="${(d.cents / 100).toFixed(2)} €"></div>`).join('') || '<span class="faint">—</span>'}</div><div class="chart-x">${s.revenueByDay.map((d) => `<span>${d.day.slice(5)}</span>`).join('')}</div></div>
    </div>`;
}

async function vUsers(params) {
  const q = params?.get?.('q') || '';
  view.innerHTML = `<div class="card"><div class="row"><input class="input" id="userSearch" placeholder="Rechercher par e-mail ou prénom…" value="${esc(q)}" /><button class="btn btn-primary" id="searchBtn">Rechercher</button></div></div><div id="usersBox" class="card mt2"><div class="skeleton" style="height:80px"></div></div>`;
  const load = async (query = '') => {
    const data = await api(`/api/admin/users?q=${encodeURIComponent(query)}`);
    document.getElementById('usersBox').innerHTML = `
      <div class="between"><b>${data.total} utilisateur(s)</b><span class="faint">Page ${data.page}/${data.pages}</span></div>
      <div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>ID</th><th>E-mail</th><th>Nom</th><th>Plan</th><th>Rôle</th><th>XP</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
        ${data.users.map((u) => `<tr>
          <td>${u.id}</td><td>${esc(u.email)} ${u.isGuest ? '<span class="pill">invité</span>' : ''}</td><td>${esc(u.first_name || '')}</td>
          <td><span class="pill ${u.plan === 'premium' ? 'pill-violet' : ''}">${esc(u.plan)}</span></td>
          <td><span class="pill ${u.role === 'admin' ? 'pill-amber' : ''}">${esc(u.role)}</span></td>
          <td>${u.xp}</td>
          <td>${u.isBanned ? '<span class="pill pill-red">Banni</span>' : u.payment_issue ? '<span class="pill pill-amber">Paiement</span>' : '<span class="pill pill-lime">OK</span>'}</td>
          <td><div class="row" style="gap:6px">
            <button class="btn btn-outline btn-sm" data-toggle-ban="${u.id}" data-banned="${u.isBanned ? 1 : 0}">${u.isBanned ? 'Débannir' : 'Bannir'}</button>
            <button class="btn btn-outline btn-sm" data-toggle-plan="${u.id}" data-plan="${u.plan}">${u.plan === 'premium' ? '→ Gratuit' : '→ Premium'}</button>
            <button class="btn btn-ghost btn-sm" data-role="${u.id}" data-role-val="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Retirer admin' : 'Faire admin'}</button>
            <button class="btn btn-danger btn-sm" data-del="${u.id}">Suppr.</button>
          </div></td>
        </tr>`).join('')}
      </tbody></table></div>`;
    view.querySelectorAll('[data-toggle-ban]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/users/${b.dataset.toggleBan}`, { method: 'PATCH', body: { isBanned: b.dataset.banned !== '1' } }); toast('Statut mis à jour', 'success'); load(query); }));
    view.querySelectorAll('[data-toggle-plan]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/users/${b.dataset.togglePlan}`, { method: 'PATCH', body: { plan: b.dataset.plan === 'premium' ? 'free' : 'premium', subscriptionStatus: b.dataset.plan === 'premium' ? 'canceled' : 'active' } }); toast('Plan mis à jour', 'success'); load(query); }));
    view.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/users/${b.dataset.role}`, { method: 'PATCH', body: { role: b.dataset.roleVal } }); toast('Rôle mis à jour', 'success'); load(query); }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Supprimer cet utilisateur ?')) return; try { await api(`/api/admin/users/${b.dataset.del}`, { method: 'DELETE' }); toast('Utilisateur supprimé', 'info'); load(query); } catch (ex) { toast(ex.message, 'error'); } }));
  };
  document.getElementById('searchBtn').addEventListener('click', () => load(document.getElementById('userSearch').value));
  await load(q);
}

async function vSubs() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/subscriptions');
  view.innerHTML = `
    <div class="card"><div class="between"><b>Abonnements Premium</b><span class="pill pill-violet">${data.subscriptions.length}</span></div>
      <div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>E-mail</th><th>Plan</th><th>Statut</th><th>Fin d'essai</th><th>Fin période</th><th>Paiement</th></tr></thead><tbody>
      ${data.subscriptions.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.plan)}</td><td><span class="pill ${s.subscription_status === 'active' ? 'pill-lime' : s.subscription_status === 'trialing' ? 'pill-amber' : 'pill-red'}">${esc(s.subscription_status || '—')}</span></td><td>${s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString('fr-FR') : '—'}</td><td>${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('fr-FR') : '—'}</td><td>${s.payment_issue ? '<span class="pill pill-red">Problème</span>' : '<span class="pill pill-lime">OK</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card mt2"><b>Transactions récentes</b>
      <div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Date</th><th>Utilisateur</th><th>Montant</th><th>Statut</th><th>Provider</th></tr></thead><tbody>
      ${data.payments.map((p) => `<tr><td>${new Date(p.created_at).toLocaleString('fr-FR')}</td><td>#${p.user_id}</td><td>${(p.amount_cents / 100).toFixed(2)} €</td><td>${esc(p.status)}</td><td>${esc(p.provider)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

async function vQuizzes() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/quizzes');
  view.innerHTML = `
    <div class="between"><b>${data.quizzes.length} quiz</b><button class="btn btn-primary btn-sm" id="newQuiz">+ Nouveau quiz</button></div>
    <div class="card mt2" style="overflow-x:auto"><table class="admin-table"><thead><tr><th>ID</th><th>Titre</th><th>Matière</th><th>Questions</th><th>Difficulté</th><th>Premium</th><th>Actif</th><th>Actions</th></tr></thead><tbody>
    ${data.quizzes.map((q) => `<tr><td>${q.id}</td><td>${esc(q.title)}</td><td>${esc(q.subject)}</td><td>${q.questionCount}</td><td>${esc(q.difficulty)}</td><td>${q.is_premium ? '💎' : '—'}</td><td>${q.active ? '<span class="pill pill-lime">Oui</span>' : '<span class="pill pill-red">Non</span>'}</td>
      <td><button class="btn btn-outline btn-sm" data-toggle-active="${q.id}" data-active="${q.active ? 1 : 0}">${q.active ? 'Désactiver' : 'Activer'}</button></td></tr>`).join('')}
    </tbody></table></div>`;
  view.querySelectorAll('[data-toggle-active]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/quizzes/${b.dataset.toggleActive}`, { method: 'PATCH', body: { active: b.dataset.active !== '1' } }); toast('Mis à jour', 'success'); vQuizzes(); }));
  document.getElementById('newQuiz').addEventListener('click', newQuizModal);
}

function newQuizModal() {
  const host = document.getElementById('modalHost');
  host.innerHTML = `<div class="modal-backdrop"><div class="card modal">
    <div class="between"><b>Nouveau quiz</b><button class="icon-btn" id="closeModal">✕</button></div>
    <div class="field mt2"><label>Titre</label><input class="input" id="nq-title" /></div>
    <div class="grid g2">
      <div class="field"><label>Matière</label><select class="select" id="nq-subject"></select></div>
      <div class="field"><label>Difficulté</label><select class="select" id="nq-diff"><option value="easy">Facile</option><option value="medium" selected>Moyen</option><option value="hard">Difficile</option></select></div>
    </div>
    <label class="row" style="gap:8px;font-size:.85rem"><input type="checkbox" id="nq-premium" /> Quiz Premium</label>
    <div class="field mt2"><label>Questions (JSON)</label><textarea class="textarea" id="nq-questions" placeholder='[{"text":"...","options":["A","B"],"answer":0,"explanation":"..."}]'></textarea></div>
    <button class="btn btn-primary btn-block" id="createQuiz">Créer</button>
  </div></div>`;
  const subjectSelect = host.querySelector('#nq-subject');
  api('/api/subjects').then((d) => { subjectSelect.innerHTML = d.subjects.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.name)}</option>`).join(''); });
  host.querySelector('#closeModal').addEventListener('click', () => { host.innerHTML = ''; });
  host.querySelector('#createQuiz').addEventListener('click', async () => {
    try {
      const questions = JSON.parse(host.querySelector('#nq-questions').value || '[]');
      await api('/api/admin/quizzes', { method: 'POST', body: { subjectId: Number(subjectSelect.value), title: host.querySelector('#nq-title').value, difficulty: host.querySelector('#nq-diff').value, isPremium: host.querySelector('#nq-premium').checked, questions } });
      host.innerHTML = '';
      toast('Quiz créé ✅', 'success');
      vQuizzes();
    } catch (ex) { toast('JSON invalide ou champ manquant.', 'error'); }
  });
}

async function vAds() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/ads');
  view.innerHTML = `<div class="card"><b>Emplacements publicitaires</b><p class="form-note mt1">Active/désactive les espaces et branche un fournisseur (ex. Google AdSense) via le script.</p>
    <div class="stack mt2">${data.ads.map((a) => `<div class="between" style="padding:10px 0;border-bottom:1px solid var(--border)"><div><b style="font-size:.9rem">${esc(a.slot)}</b><div class="faint" style="font-size:.75rem">Type : ${esc(a.provider)}</div></div>
      <label class="row" style="gap:8px"><input type="checkbox" data-ad-toggle="${a.id}" ${a.enabled ? 'checked' : ''} /> Actif</label></div>`).join('')}</div></div>
    <div class="card mt2"><b>Rappel conformité</b><p class="form-note mt1">Les mineurs et utilisateurs sans consentement ne doivent pas recevoir de publicité personnalisée. Les comptes Premium ne voient aucune publicité. Aucune pub n’interrompt une question de quiz en cours.</p></div>`;
  view.querySelectorAll('[data-ad-toggle]').forEach((c) => c.addEventListener('change', async () => { await api(`/api/admin/ads/${c.dataset.adToggle}`, { method: 'PATCH', body: { enabled: c.checked } }); toast('Emplacement mis à jour', 'success'); }));
}

async function vActivity() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/activity');
  view.innerHTML = `
    <div class="card"><b>Derniers quiz</b><div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Date</th><th>Utilisateur</th><th>Quiz</th><th>Score</th><th>Précision</th></tr></thead><tbody>
      ${data.attempts.map((a) => `<tr><td>${new Date(a.created_at).toLocaleString('fr-FR')}</td><td>${esc(a.user || '—')}</td><td>${esc(a.quiz || '—')}</td><td>${a.score}/${a.total}</td><td><span class="pill ${a.accuracy >= 80 ? 'pill-lime' : 'pill-amber'}">${a.accuracy}%</span></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card mt2"><b>Mini-jeux</b><div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Date</th><th>Utilisateur</th><th>Jeu</th><th>Score</th></tr></thead><tbody>
      ${data.games.map((g) => `<tr><td>${new Date(g.created_at).toLocaleString('fr-FR')}</td><td>${esc(g.user || '—')}</td><td>${esc(g.game)}</td><td>${g.score}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

async function vReports() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/reports');
  view.innerHTML = `<div class="card"><b>Signalements</b>${data.reports.length ? `<div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Date</th><th>Type</th><th>Cible</th><th>Raison</th><th>Version</th><th>Statut</th><th></th></tr></thead><tbody>
    ${data.reports.map((r) => `<tr><td>${new Date(r.created_at).toLocaleString('fr-FR')}</td><td>${esc(r.target_type)}</td><td>${esc(r.target_id || '')}</td><td>${esc(r.reason || '')}</td><td>${r.content_version || '—'}</td><td><span class="pill pill-amber">${esc(r.status)}</span></td><td>${r.status === 'open' ? `<button class="btn btn-ghost btn-sm" data-resolve="${r.id}">Résoudre</button><button class="btn btn-ghost btn-sm" data-reject="${r.id}">Rejeter</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty"><div class="em">🚩</div><b>Aucun signalement. Tout est calme.</b></div>'}</div>`;
  view.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/reports/${b.dataset.resolve}`, { method: 'PATCH', body: { status: 'resolved' } }); toast('Signalement résolu', 'success'); vReports(); }));
  view.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/reports/${b.dataset.reject}`, { method: 'PATCH', body: { status: 'rejected' } }); toast('Signalement rejeté', 'info'); vReports(); }));
}

async function vCurricula() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/curricula');
  view.innerHTML = `<div class="card"><b>Programmes (${data.curricula.length})</b><p class="form-note mt1">Statut de contenu : published / partial / unavailable.</p><div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Pays</th><th>Niveau</th><th>Classe</th><th>Voie / domaine</th><th>Statut</th><th>Session</th><th></th></tr></thead><tbody>
    ${data.curricula.map((c) => `<tr><td>${esc(c.country_label)}</td><td>${esc(c.level)}</td><td>${esc(c.grade || '—')}</td><td>${esc(`${c.track || ''} ${c.domain || ''}`.trim() || '—')}</td><td><select data-cur="${c.id}" class="select" style="min-width:130px">${['published', 'partial', 'unavailable'].map((s) => `<option value="${s}" ${c.content_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><input class="input" data-session="${c.id}" value="${esc(c.session || '')}" style="width:90px" placeholder="2026" /></td><td><button class="btn btn-ghost btn-sm" data-save-cur="${c.id}">Enregistrer</button></td></tr>`).join('')}
  </tbody></table></div></div>`;
  view.querySelectorAll('[data-save-cur]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.saveCur;
    await api(`/api/admin/curricula/${id}`, { method: 'PATCH', body: { contentStatus: view.querySelector(`[data-cur="${id}"]`).value, session: view.querySelector(`[data-session="${id}"]`).value } });
    toast('Programme mis à jour', 'success');
  }));
}

async function vAudit() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const data = await api('/api/admin/audit');
  view.innerHTML = `<div class="card"><b>Journal d’audit</b>${data.logs.length ? `<div style="overflow-x:auto"><table class="admin-table mt2"><thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead><tbody>
    ${data.logs.map((l) => `<tr><td>${new Date(l.created_at).toLocaleString('fr-FR')}</td><td>${esc(l.actor || '—')}</td><td>${esc(l.action)}</td><td>${esc((l.target_type || '') + ' ' + (l.target_id || ''))}</td><td class="faint" style="font-size:.75rem">${esc(l.meta || '')}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty"><div class="em">🧾</div><b>Aucune action journalisée.</b></div>'}</div>`;
}

async function vDiagnostics() {
  view.innerHTML = '<div class="skeleton" style="height:100px"></div>';
  const d = await api('/api/admin/diagnostics');
  const pill = (ok, label) => `<span class="pill ${ok ? 'pill-lime' : 'pill-red'}">${label}</span>`;
  view.innerHTML = `<div class="grid g2">
    <div class="card"><b>Services externes</b><div class="stack mt2" style="gap:8px">
      <div>${pill(d.mail.configured, 'Email')} ${esc(d.mail.provider || 'non configuré')}</div>
      <div>${pill(d.stripe.secretConfigured, 'Stripe')} secret=${d.stripe.secretConfigured} · webhook=${d.stripe.webhookSecretConfigured} · mode=${esc(d.stripe.mode)}</div>
      <div>${pill(d.youtube.configured, 'YouTube')} ${d.youtube.configured ? 'configuré' : 'non configuré'}</div>
      <div>${pill(d.llm.studyConfigured, 'Étude IA')} · Vidéo IA=${d.llm.videoAiConfigured}</div>
    </div></div>
    <div class="card"><b>Compteurs</b><div class="stack mt2" style="gap:8px">
      <div>Comptes non vérifiés : <b>${d.counts.unverifiedUsers}</b></div>
      <div>Signalements ouverts : <b>${d.counts.pendingReports}</b></div>
      <div>Événements Stripe : <b>${d.counts.stripeEvents}</b> (non traités : ${d.counts.stripeEventsUnprocessed})</div>
      <div>Contenus non publiés : <b>${d.counts.unpublishedContent}</b></div>
    </div></div>
  </div>`;
}

document.getElementById('themeBtn')?.addEventListener('click', () => { toggleTheme(); document.getElementById('themeBtn').textContent = document.documentElement.dataset.theme === 'dark' ? '🌙' : '☀️'; });

async function boot() {
  let session;
  try { session = await api('/api/auth/session'); } catch { session = { user: null }; }
  if (!session.user) return location.replace('/auth.html#login');
  if (session.user.role !== 'admin') { view.innerHTML = '<div class="card center"><div class="em" style="font-size:2.4rem">🔒</div><b>Accès réservé à l’administration.</b><p><a class="btn btn-primary mt2" href="/app.html">Retour à l’app</a></p></div>'; return; }
  admin = session.user;
  chrome();
  await route();
}
window.addEventListener('hashchange', route);
boot();
