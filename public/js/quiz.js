// Quiz runner: multiple choice / true-false, instant feedback, timer, results.
import { api, esc, toast, xpPop, confetti, progressBar } from './api.js';

export async function renderQuiz(view, id, params, ctx) {
  view.innerHTML = `<div class="skeleton"></div>`;
  let data;
  try { data = await api(`/api/quizzes/${id}`); }
  catch (ex) {
    view.innerHTML = errorCard(ex.message, ex.code);
    view.querySelector('[data-back]')?.addEventListener('click', () => ctx.go('#quizzes'));
    return;
  }
  const quiz = data.quiz;
  const mode = params.get('mode') || 'quiz';
  const state = { index: 0, answers: [], selected: null, revealed: false, start: Date.now(), finished: false };
  const perQuestion = mode === 'timed' ? 30 : null;

  function draw() {
    const q = quiz.questions[state.index];
    const total = quiz.questions.length;
    view.innerHTML = `
      <div class="between" style="margin-bottom:12px">
        <a class="btn btn-ghost btn-sm" href="#quizzes">← Quitter</a>
        <span class="pill pill-violet">${esc(quiz.subject.icon)} ${esc(quiz.subject.name)} · ${esc(quiz.difficulty)}</span>
      </div>
      <div class="quiz-progress">
        <span class="pill">Question ${state.index + 1}/${total}</span>
        <div style="flex:1">${progressBar((state.index / total) * 100)}</div>
        ${perQuestion ? `<span class="timer" id="timer">${perQuestion}s</span>` : `<span class="faint" style="font-size:.8rem">Mode ${esc(mode)}</span>`}
      </div>
      <div class="card">
        <h2 style="font-size:1.3rem">${esc(q.text)}</h2>
        <div class="stack mt2" id="options">
          ${q.options.map((opt, i) => `<div class="quiz-option" data-i="${i}"><span class="key">${String.fromCharCode(65 + i)}</span><span>${esc(opt)}</span></div>`).join('')}
        </div>
        <div id="feedback" class="mt2"></div>
        <button class="btn btn-primary btn-block mt2" id="nextBtn" disabled>Valider</button>
      </div>
      <p class="center faint mt2" style="font-size:.75rem">Contenu généré par IA susceptible de contenir des erreurs. Vérifie les informations importantes avec ton cours.</p>`;
    state.revealed = false;
    state.selected = null;

    const nextBtn = view.querySelector('#nextBtn');
    view.querySelectorAll('.quiz-option').forEach((node) => {
      node.addEventListener('click', () => {
        if (state.revealed) return;
        state.selected = Number(node.dataset.i);
        view.querySelectorAll('.quiz-option').forEach((n) => n.classList.toggle('selected', n === node));
        nextBtn.disabled = false;
      });
    });
    nextBtn.addEventListener('click', () => {
      if (!state.revealed) { reveal(q); return; }
      state.answers[state.index] = state.selected;
      state.index += 1;
      if (state.index >= total) return finish();
      draw();
    });

    if (perQuestion) {
      let left = perQuestion;
      clearInterval(state._timer);
      state._timer = setInterval(() => {
        left -= 1;
        const el = view.querySelector('#timer');
        if (el) { el.textContent = `${left}s`; el.classList.toggle('low', left <= 5); }
        if (left <= 0) { clearInterval(state._timer); if (!state.revealed && state.selected === null) { state.selected = -1; } reveal(q); }
      }, 1000);
    }
  }

  function reveal(q) {
    state.revealed = true;
    view.querySelectorAll('.quiz-option').forEach((n) => {
      const i = Number(n.dataset.i);
      n.classList.remove('selected');
      if (i === q.answer) n.classList.add('correct');
      else if (i === state.selected) n.classList.add('wrong');
    });
    const ok = state.selected === q.answer;
    view.querySelector('#feedback').innerHTML = `
      <div class="card" style="background:var(--surface-2);border-color:${ok ? 'rgba(52,211,153,.5)' : 'rgba(251,113,133,.5)'}">
        <b>${ok ? '✅ Bravo !' : '❌ Presque.'}</b>
        <p style="margin:6px 0 0;font-size:.9rem">${esc(q.explanation || '')}</p>
      </div>`;
    if (ok) xpPop(10, view.querySelector('#feedback'));
    view.querySelector('#nextBtn').textContent = state.index === quiz.questions.length - 1 ? 'Voir le résultat' : 'Question suivante';
  }

  async function finish() {
    clearInterval(state._timer);
    state.finished = true;
    const duration = Math.round((Date.now() - state.start) / 1000);
    view.innerHTML = `<div class="skeleton"></div>`;
    try {
      const result = await api(`/api/quizzes/${id}/attempt`, { method: 'POST', body: { answers: state.answers, mode, duration } });
      ctx.setUser(result.user);
      drawResults(result, quiz);
    } catch (ex) {
      view.innerHTML = errorCard(ex.message, ex.code);
    }
  }

  function drawResults(r, quiz) {
    if (r.accuracy >= 80) confetti();
    view.innerHTML = `
      <div class="card center" style="padding:34px">
        <div style="font-size:3.4rem">${r.accuracy === 100 ? '🏆' : r.accuracy >= 80 ? '🎉' : r.accuracy >= 50 ? '👍' : '💪'}</div>
        <h2 style="font-size:3rem;margin:6px 0">${r.accuracy}%</h2>
        <p>${r.accuracy === 100 ? 'Parfait !' : r.accuracy >= 80 ? 'Excellent travail !' : r.accuracy >= 50 ? 'Bien joué.' : 'Continue, tu progresses.'}</p>
        <div class="row center" style="justify-content:center;gap:10px;flex-wrap:wrap">
          <span class="pill pill-lime">+${r.xp} XP</span>
          <span class="pill">${r.score}/${r.total} bonnes réponses</span>
          ${r.bonus ? '<span class="pill pill-amber">Bonus parfait +50</span>' : ''}
          ${r.unlocked?.length ? `<span class="pill pill-violet">${r.unlocked.length} badge(s) débloqué(s)</span>` : ''}
        </div>
        <div class="grid g3 mt3" style="text-align:left">
          <div class="card"><div class="stat"><span>Précision</span><b>${r.accuracy}%</b></div></div>
          <div class="card"><div class="stat"><span>Bonnes</span><b>${r.score}</b></div></div>
          <div class="card"><div class="stat"><span>Erreurs</span><b>${r.total - r.score}</b></div></div>
        </div>
        ${r.weak?.length ? `<div class="card mt2" style="text-align:left;background:var(--surface-2)"><b>🔍 À revoir</b><div class="stack" style="gap:6px;margin-top:8px">${r.weak.map((w) => `<div class="muted" style="font-size:.88rem">• ${esc(w)}…</div>`).join('')}</div></div>` : ''}
        <div class="card mt2" style="background:linear-gradient(150deg,var(--surface),rgba(108,92,231,.14));text-align:left">
          <b>✨ Recommandé ensuite</b><p style="margin:6px 0 0;font-size:.9rem">${esc(r.recommendation)}</p>
        </div>
        <div class="row mt3" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-outline" id="again">Recommencer</button>
          <button class="btn btn-outline" id="review">Revoir mes erreurs</button>
          <a class="btn btn-primary" href="#home">Tableau de bord</a>
        </div>
      </div>
      <div class="ad-slot mt2" data-ad="quiz-results">Publicité — réservé aux comptes gratuits</div>`;
    ctx.mountAds(view);
    view.querySelector('#again').addEventListener('click', () => { state.index = 0; state.answers = []; state.start = Date.now(); draw(); });
    view.querySelector('#review').addEventListener('click', () => {
      const wrong = r.details.filter((d) => !d.isCorrect);
      view.innerHTML = `<div class="between"><h2>Revoir mes erreurs</h2><a class="btn btn-outline btn-sm" href="#home">Terminer</a></div>
        <div class="stack mt2">${wrong.length ? wrong.map((d) => `<div class="card"><b>${esc(d.text)}</b><p class="faint" style="font-size:.85rem;margin-top:6px">Bonne réponse : <b style="color:var(--green)">${esc(d.text ? '' : '')}${esc((quiz.questions[d.index]?.options?.[d.correct]) || '')}</b></p><p style="font-size:.85rem">${esc(d.explanation || '')}</p></div>`).join('') : '<div class="empty"><div class="em">🎉</div><b>Aucune erreur !</b></div>'}</div>`;
    });
  }

  draw();
}

function errorCard(message, code) {
  const premium = code === 'PREMIUM_REQUIRED';
  return `<div class="card center" style="padding:40px">
    <div class="em" style="font-size:2.6rem">${premium ? '💎' : '🚧'}</div>
    <h3>${esc(message)}</h3>
    <div class="row" style="justify-content:center;margin-top:12px">
      ${premium ? '<a class="btn btn-primary" href="#pricing">Passer Premium</a>' : ''}
      <button class="btn btn-outline" data-back>Retour</button>
    </div>
  </div>`;
}
