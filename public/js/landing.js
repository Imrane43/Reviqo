import { initTheme, toggleTheme, esc, api } from './api.js';

initTheme();
const themeBtn = document.getElementById('themeBtn');
const syncThemeBtn = () => { themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '🌙' : '☀️'; };
syncThemeBtn();
themeBtn?.addEventListener('click', () => { toggleTheme(); syncThemeBtn(); });

// Scroll reveal with a safety fallback so content is never hidden.
const revealAll = () => document.querySelectorAll('.reveal').forEach((n) => n.classList.add('is-visible'));
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
  setTimeout(revealAll, 2500);
} else revealAll();

// Prices come from Stripe (via /api/billing/prices) so the page always matches
// what the customer will actually be charged. Fallback: 4,99 € / 39,99 €.
let PRICES = { monthly: { amount: 499 }, yearly: { amount: 3999 } };
const eur = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const perMonth = () => eur(Math.round(PRICES.yearly.amount / 12));

function plans() {
  return {
    free: {
      name: 'Gratuit', price: '0 €', period: 'mois',
      features: ['Générations IA limitées (3/jour)', 'Quiz standards', 'Mini-jeux', 'Défis du jour', 'Progression de base', 'Avec publicités'],
      cta: 'Commencer gratuitement', href: '/auth.html#signup', primary: false,
    },
    monthly: {
      name: 'Premium', price: eur(PRICES.monthly.amount), period: 'mois',
      features: ['Générations IA illimitées', 'Quiz avancés', 'Sessions illimitées', 'Analyses complètes', 'Mini-jeux exclusifs', 'Badges premium', 'Zéro publicité'],
      cta: 'Essai gratuit 7 jours', href: '/auth.html#signup?plan=monthly', primary: true, featured: true,
    },
    yearly: {
      name: 'Premium annuel', price: eur(PRICES.yearly.amount), period: 'an',
      features: ['Tout Premium inclus', 'Économise 33 % vs mensuel', `Soit ~${perMonth()}/mois`, 'Essai gratuit 7 jours', 'Meilleure offre', 'Zéro publicité'],
      cta: 'Essai gratuit 7 jours', href: '/auth.html#signup?plan=yearly', primary: true,
    },
  };
}

let cycle = 'monthly';
function renderPricing() {
  const grid = document.getElementById('pricingGrid');
  if (!grid) return;
  const P = plans();
  const cards = cycle === 'monthly' ? [P.free, P.monthly] : [P.free, P.yearly];
  grid.innerHTML = cards.map((p) => `
    <div class="card price-card ${p.featured ? 'featured' : ''}">
      ${p.featured ? '<span class="pill pill-violet" style="position:absolute;top:-12px;left:20px">⭐ Le plus choisi</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <div class="price-tag">${esc(p.price)}<span> / ${p.period}</span></div>
      <ul class="price-list">${p.features.map((f) => `<li><b>✓</b> ${esc(f)}</li>`).join('')}</ul>
      <a class="btn ${p.primary ? 'btn-primary' : 'btn-outline'} btn-block" href="${p.href}">${esc(p.cta)}</a>
    </div>`).join('');
}
renderPricing();
api('/api/billing/prices').then((p) => {
  if (p && p.monthly && p.yearly) { PRICES = p; renderPricing(); }
}).catch(() => {});

document.querySelectorAll('#billingToggle button').forEach((btn) => {
  btn.addEventListener('click', () => {
    cycle = btn.dataset.cycle;
    document.querySelectorAll('#billingToggle button').forEach((b) => b.classList.toggle('active', b === btn));
    renderPricing();
  });
});

// Cookie consent (GDPR-conscious)
const banner = document.getElementById('cookieBanner');
const CONSENT_KEY = 'reviqo-consent';
if (banner && !localStorage.getItem(CONSENT_KEY)) banner.classList.remove('hidden');
document.getElementById('cookieAccept')?.addEventListener('click', () => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: true, ads: true, at: new Date().toISOString() }));
  banner.classList.add('hidden');
});
document.getElementById('cookieEssentials')?.addEventListener('click', () => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: false, ads: false, at: new Date().toISOString() }));
  banner.classList.add('hidden');
});
