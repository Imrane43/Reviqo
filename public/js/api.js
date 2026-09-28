// Shared helpers for REVIQO front-end (vanilla ES modules, no build step).

export async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', headers: {}, ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const err = new Error(data.message || 'Une erreur est survenue.');
    err.status = res.status;
    err.code = data.error;
    err.data = data;
    throw err;
  }
  return data;
}

export function h(strings, ...values) {
  return strings.map((s, i) => s + (values[i] ?? '')).join('');
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'info', timeout = 3200) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.innerHTML = `<span>${esc(message)}</span>`;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, timeout);
}

export function xpPop(amount, target) {
  const node = document.createElement('div');
  node.className = 'xp-pop';
  node.textContent = `+${amount} XP`;
  const rect = target?.getBoundingClientRect();
  if (rect) {
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.top + window.scrollY}px`;
  }
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1100);
}

const THEME_KEY = 'reviqo-theme';
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.dataset.theme = saved;
  return saved;
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  return next;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const date = new Date(iso.includes('T') || iso.includes('-') && iso.length > 10 ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - date.getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function progressBar(percent) {
  return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></div>`;
}

export function skeleton(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton card"></div>').join('');
}

export const SUBJECT_ICONS = ['∑', '✍', '🌍', '🏛', '🗺', '⚛', '⚗', '🧬', '💭', '💻', '🧠'];

export function confetti() {
  const colors = ['#6C5CE7', '#22d3ee', '#a3e635', '#f472b6', '#facc15'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}
