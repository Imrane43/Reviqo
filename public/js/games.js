// Reviqo Play — 7 educational mini-games (1-5 min sessions).
import { api, esc, toast, confetti, xpPop, progressBar } from './api.js';

const GAMES = [
  { id: 'quiz-rush', name: 'Quiz Rush', icon: '🚀', desc: 'Un max de questions avant la fin du chrono.', color: '#6c5ce7', time: true },
  { id: 'memory-match', name: 'Memory Match', icon: '🧩', desc: 'Associe concepts et définitions.', color: '#22d3ee' },
  { id: 'true-false', name: 'Vrai ou Faux', icon: '✅', desc: 'Questions éclair, réponses instantanées.', color: '#a3e635' },
  { id: 'word-scramble', name: 'Word Scramble', icon: '🔤', desc: 'Remets les lettres dans le bon ordre.', color: '#f472b6' },
  { id: 'speed-math', name: 'Speed Math', icon: '➗', desc: 'Calculs simples contre le chrono.', color: '#fbbf24' },
  { id: 'concept-match', name: 'Concept Match', icon: '🔗', desc: 'Relie chaque concept à sa définition.', color: '#34d399' },
  { id: 'streak-challenge', name: 'Streak Challenge', icon: '🔥', desc: 'Enchaîne les bonnes réponses.', color: '#fb7185' },
];
export { GAMES };

export function gamesGridHtml() {
  return `<div class="grid g3">${GAMES.map((g) => `
    <a class="card card-lift game-tile" href="#game?name=${g.id}">
      <div class="em">${g.icon}</div>
      <b>${esc(g.name)}</b>
      <p class="faint" style="font-size:.84rem;margin:6px 0 12px">${esc(g.desc)}</p>
      <div class="row" style="gap:6px"><span class="pill pill-violet">+XP à chaque partie</span>${g.time ? '<span class="pill pill-amber">⏱ Chrono</span>' : ''}</div>
    </a>`).join('')}</div>`;
}

let pool = [];
async function getQuestions(count = 10, subject) {
  const data = await api(`/api/games/questions?count=${count}${subject ? `&subject=${subject}` : ''}`);
  return data.questions;
}

function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

async function finish(ctx, view, game, score, combo, duration, extra = '') {
  clearInterval(view._timer);
  try {
    const r = await api('/api/games/score', { method: 'POST', body: { game, score, combo, duration } });
    ctx.setUser(r.user);
    if (score > 40 || combo > 4) confetti();
    view.innerHTML = `
      <div class="card center" style="padding:34px">
        <div style="font-size:3rem">${r.rank === 1 ? '🥇' : '🎮'}</div>
        <h2 style="font-size:2.4rem;margin:8px 0">${score} pts</h2>
        <p>${esc(extra || 'Bien joué !')}</p>
        <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
          <span class="pill pill-lime">+${r.xp} XP</span>
          <span class="pill pill-cyan">Classement #${r.rank}</span>
          ${combo ? `<span class="pill pill-amber">Combo max ${combo}</span>` : ''}
        </div>
        ${r.unlocked?.length ? `<p class="mt2">🏅 ${r.unlocked.length} badge(s) débloqué(s) !</p>` : ''}
        <div class="row mt3" style="justify-content:center;flex-wrap:wrap">
          <a class="btn btn-primary" href="#play">Rejouer</a>
          <a class="btn btn-outline" href="#home">Tableau de bord</a>
        </div>
      </div>
      <div class="ad-slot mt2" data-ad="games-inline">Publicité — réservé aux comptes gratuits</div>`;
    ctx.mountAds(view);
  } catch (ex) { toast(ex.message, 'error'); }
}

function header(game, ctx, rightHtml = '') {
  return `<div class="between" style="margin-bottom:16px">
    <a class="btn btn-ghost btn-sm" href="#play">← Jeux</a>
    <b>${game.icon} ${esc(game.name)}</b>
    <div>${rightHtml}</div>
  </div>`;
}

export async function renderGame(view, name, ctx) {
  const game = GAMES.find((g) => g.id === name);
  if (!game) { view.innerHTML = `<div class="empty"><div class="em">🎮</div><b>Jeu introuvable.</b><p><a href="#play">Retour aux jeux</a></p></div>`; return; }
  view.innerHTML = `<div class="skeleton"></div>`;
  try { pool = await getQuestions(24); } catch { pool = []; }
  if (!pool.length && name !== 'speed-math') {
    view.innerHTML = `<div class="empty"><div class="em">🎮</div><b>Aucune question disponible.</b><p><a href="#play">Retour</a></p></div>`;
    return;
  }
  view._timer = null;
  if (name === 'quiz-rush' || name === 'streak-challenge') return quizRush(view, game, name, ctx);
  if (name === 'true-false') return trueFalse(view, game, ctx);
  if (name === 'speed-math') return speedMath(view, game, ctx);
  if (name === 'word-scramble') return wordScramble(view, game, ctx);
  if (name === 'memory-match' || name === 'concept-match') return memoryMatch(view, game, ctx);
  return quizRush(view, game, name, ctx);
}

// ---------- Quiz Rush / Streak Challenge ----------
function quizRush(view, game, name, ctx) {
  const isStreak = name === 'streak-challenge';
  const limit = isStreak ? 60 : 60;
  const state = { i: 0, score: 0, combo: 0, bestCombo: 0, streak: 0, left: limit, start: Date.now(), locked: false };
  const qs = shuffle(pool).slice(0, 40);

  function hud() {
    return header(game, ctx, `<span class="pill pill-amber timer" id="timer">${state.left}s</span> <span class="pill pill-lime">${state.score} pts</span> <span class="pill">🔥 ${state.combo}</span>`);
  }
  function draw() {
    if (state.i >= qs.length) return end('Toutes les questions terminées !');
    const q = qs[state.i];
    state.locked = false;
    view.innerHTML = `${hud()}
      <div class="card">
        <div class="faint" style="font-size:.78rem;margin-bottom:4px">${esc(q.subject || '')}</div>
        <h3>${esc(q.text)}</h3>
        <div class="stack mt2" id="opts">${q.options.map((o, i) => `<div class="quiz-option" data-i="${i}"><span class="key">${String.fromCharCode(65 + i)}</span>${esc(o)}</div>`).join('')}</div>
        ${isStreak ? `<p class="center mt2"><span class="pill pill-red">Une erreur = fin de la série</span></p>` : ''}
      </div>`;
    view.querySelectorAll('.quiz-option').forEach((node) => node.addEventListener('click', () => {
      if (state.locked) return;
      state.locked = true;
      const i = Number(node.dataset.i);
      const ok = i === q.answer;
      view.querySelectorAll('.quiz-option').forEach((n) => { if (Number(n.dataset.i) === q.answer) n.classList.add('correct'); });
      if (ok) {
        state.combo += 1; state.bestCombo = Math.max(state.bestCombo, state.combo); state.streak += 1;
        state.score += 10 + Math.min(20, state.combo * 2);
        node.classList.add('correct');
        xpPop(10, node);
      } else {
        node.classList.add('wrong');
        state.combo = 0;
        if (isStreak) return setTimeout(() => end('Série brisée !'), 550);
      }
      state.i += 1;
      setTimeout(draw, 420);
    }));
  }
  function end(msg) { finish(ctx, view, name, state.score, state.bestCombo, Math.round((Date.now() - state.start) / 1000), msg); }

  draw();
  clearInterval(view._timer);
  view._timer = setInterval(() => {
    state.left -= 1;
    const t = view.querySelector('#timer');
    if (t) { t.textContent = `${state.left}s`; t.classList.toggle('low', state.left <= 10); }
    if (state.left <= 0) end(`Temps écoulé ! ${state.score} points`);
  }, 1000);
}

// ---------- True or False ----------
function trueFalse(view, game, ctx) {
  const state = { i: 0, score: 0, combo: 0, bestCombo: 0, left: 45, start: Date.now(), locked: false };
  const qs = shuffle(pool).slice(0, 40).map((q) => {
    const truthy = Math.random() > 0.45;
    const correctOption = q.options[q.answer];
    const wrongOption = q.options.find((o, i) => i !== q.answer) || '—';
    return { statement: `« ${truthy ? correctOption : wrongOption} » est la bonne réponse pour : ${q.text}`, answer: truthy ? 1 : 0 };
  });
  function draw() {
    if (state.i >= qs.length) return end();
    const q = qs[state.i];
    state.locked = false;
    view.innerHTML = `${header(game, ctx, `<span class="pill pill-amber timer" id="timer">${state.left}s</span> <span class="pill pill-lime">${state.score} pts</span>`)}
      <div class="card center" style="padding:30px">
        <p class="faint" style="font-size:.78rem">Vrai ou faux ?</p>
        <h3 style="font-size:1.25rem">${esc(q.statement)}</h3>
        <div class="grid g2 mt3">
          <button class="btn btn-lime btn-lg" data-v="1">✅ Vrai</button>
          <button class="btn btn-danger btn-lg" data-v="0">❌ Faux</button>
        </div>
      </div>`;
    view.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      if (state.locked) return;
      state.locked = true;
      const ok = Number(b.dataset.v) === q.answer;
      if (ok) { state.score += 15; state.combo += 1; state.bestCombo = Math.max(state.bestCombo, state.combo); xpPop(15, b); }
      else state.combo = 0;
      state.i += 1;
      setTimeout(draw, 260);
    }));
  }
  function end() { finish(ctx, view, 'true-false', state.score, state.bestCombo, Math.round((Date.now() - state.start) / 1000), 'Réflexes de champion !'); }
  draw();
  clearInterval(view._timer);
  view._timer = setInterval(() => { state.left -= 1; const t = view.querySelector('#timer'); if (t) t.textContent = `${state.left}s`; if (state.left <= 0) end(); }, 1000);
}

// ---------- Speed Math ----------
function speedMath(view, game, ctx) {
  const state = { score: 0, combo: 0, bestCombo: 0, left: 45, start: Date.now(), locked: false };
  function newProblem() {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a = 2 + Math.floor(Math.random() * 12);
    let b = 2 + Math.floor(Math.random() * 12);
    if (op === '×') { a = 2 + Math.floor(Math.random() * 9); b = 2 + Math.floor(Math.random() * 9); }
    if (op === '-' && b > a) [a, b] = [b, a];
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    const options = shuffle([answer, answer + 1 + Math.floor(Math.random() * 4), Math.max(0, answer - 1 - Math.floor(Math.random() * 4)), answer + 6]).slice(0, 4);
    if (!options.includes(answer)) options[0] = answer;
    return { text: `${a} ${op} ${b}`, answer, options: shuffle(options) };
  }
  function draw() {
    const p = newProblem();
    state.locked = false;
    view.innerHTML = `${header(game, ctx, `<span class="pill pill-amber timer" id="timer">${state.left}s</span> <span class="pill pill-lime">${state.score} pts</span>`)}
      <div class="card center" style="padding:30px">
        <h2 style="font-size:2.6rem;letter-spacing:-0.02em">${p.text} = ?</h2>
        <div class="grid g2 mt3">${p.options.map((o) => `<button class="btn btn-outline btn-lg" data-v="${o}">${o}</button>`).join('')}</div>
      </div>`;
    view.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      if (state.locked) return; state.locked = true;
      if (Number(b.dataset.v) === p.answer) { state.score += 12; state.combo += 1; state.bestCombo = Math.max(state.bestCombo, state.combo); xpPop(12, b); }
      else state.combo = 0;
      setTimeout(draw, 200);
    }));
  }
  function end() { finish(ctx, view, 'speed-math', state.score, state.bestCombo, Math.round((Date.now() - state.start) / 1000), 'Cerveau en surchauffe !'); }
  draw();
  clearInterval(view._timer);
  view._timer = setInterval(() => { state.left -= 1; const t = view.querySelector('#timer'); if (t) t.textContent = `${state.left}s`; if (state.left <= 0) end(); }, 1000);
}

// ---------- Word Scramble ----------
function wordScramble(view, game, ctx) {
  const words = [...new Set(pool.map((q) => q.options[q.answer]).filter((w) => w && w.length >= 4 && w.length <= 14))].slice(0, 12);
  if (!words.length) return finish(ctx, view, 'word-scramble', 0, 0, 2, 'Pas assez de mots disponibles.');
  const rounds = shuffle(words).slice(0, 6);
  const state = { i: 0, score: 0, start: Date.now() };
  function scramble(word) {
    if (word.length < 4) return word.split('').reverse().join('');
    const s = shuffle([...word]);
    return s.join('') === word ? scramble(word) : s.join('');
  }
  function draw() {
    if (state.i >= rounds.length) return finish(ctx, view, 'word-scramble', state.score, 0, Math.round((Date.now() - state.start) / 1000), 'Vocabulaire maîtrisé !');
    const word = rounds[state.i];
    const sc = scramble(word);
    view.innerHTML = `${header(game, ctx, `<span class="pill pill-lime">${state.score} pts</span>`)}
      <div class="card center">
        <p class="faint" style="font-size:.78rem">Mot ${state.i + 1}/${rounds.length}</p>
        <h2 style="font-size:2.2rem;letter-spacing:.28em;text-transform:uppercase">${esc(sc)}</h2>
        <div class="field" style="max-width:320px;margin:16px auto 0"><input class="input center" id="guess" placeholder="Ta réponse…" autocomplete="off" /></div>
        <button class="btn btn-primary" id="okBtn">Valider</button>
        <p class="mt2"><button class="btn btn-ghost btn-sm" id="hint">💡 Indice : ${word[0]}…</button></p>
      </div>`;
    const input = view.querySelector('#guess');
    input.focus();
    const submit = () => {
      const guess = input.value.trim().toLowerCase();
      if (guess === word.toLowerCase()) { state.score += 20; toast('Correct ! 🎯', 'success'); }
      else toast(`Raté, c’était « ${word} »`, 'error');
      state.i += 1;
      draw();
    };
    view.querySelector('#okBtn').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    view.querySelector('#hint').addEventListener('click', () => { view.querySelector('#hint').textContent = `💡 ${word.slice(0, Math.ceil(word.length / 2))}…`; });
  }
  draw();
}

// ---------- Memory Match / Concept Match ----------
function memoryMatch(view, game, ctx) {
  const pairsCount = game.id === 'concept-match' ? 6 : 6;
  const picks = shuffle(pool).slice(0, pairsCount).map((q) => ({
    concept: q.text.length > 46 ? q.text.slice(0, 44) + '…' : q.text,
    definition: q.options[q.answer],
  }));
  const cards = shuffle(picks.flatMap((p, i) => [{ id: i, type: 'concept', text: p.concept }, { id: i, type: 'definition', text: p.definition }]))
    .map((c, idx) => ({ ...c, idx, flipped: false, matched: false }));
  const state = { first: null, score: 0, combo: 0, bestCombo: 0, matched: 0, start: Date.now(), moves: 0, locked: false };

  function draw() {
    view.innerHTML = `${header(game, ctx, `<span class="pill pill-lime">${state.score} pts</span> <span class="pill">${state.matched}/${pairsCount} paires</span>`)}
      <div class="card">
        <div class="memory-grid" id="board">
          ${cards.map((c) => `<div class="memory-card ${c.flipped || c.matched ? 'flipped' : ''} ${c.matched ? 'matched' : ''}" data-idx="${c.idx}">${c.flipped || c.matched ? esc(c.text) : '<span style="font-size:1.5rem;opacity:.45">?</span>'}</div>`).join('')}
        </div>
        <p class="center faint mt2" style="font-size:.8rem">Associe chaque concept à sa bonne définition.</p>
      </div>`;
    view.querySelectorAll('.memory-card').forEach((node) => node.addEventListener('click', () => flip(Number(node.dataset.idx))));
  }
  function flip(idx) {
    const card = cards[idx];
    if (state.locked || card.matched || card.flipped) return;
    card.flipped = true;
    if (state.first === null) { state.first = card; draw(); return; }
    state.locked = true;
    state.moves += 1;
    draw();
    const second = card;
    if (state.first.id === second.id && state.first.type !== second.type) {
      state.first.matched = true; second.matched = true; state.matched += 1; state.combo += 1; state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.score += 25 + state.combo * 3; state.first = null; state.locked = false;
      setTimeout(() => {
        if (state.matched >= pairsCount) finish(ctx, view, game.id, state.score, state.bestCombo, Math.round((Date.now() - state.start) / 1000), 'Toutes les paires trouvées !');
        else draw();
      }, 420);
    } else {
      state.combo = 0;
      setTimeout(() => { state.first.flipped = false; second.flipped = false; state.first = null; state.locked = false; draw(); }, 620);
    }
  }
  draw();
}
