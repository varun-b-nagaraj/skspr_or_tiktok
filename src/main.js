import './styles.css';
import { createClient } from '@supabase/supabase-js';

const app = document.getElementById('app');
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
const HOST_CODE = import.meta.env.VITE_HOST_CODE || '4321';
const MAX_POINTS_PER_QUESTION = 1000;
const QUESTION_SECONDS = 10;
const APP_NAME = 'skspr or tiktok';

const state = {
  mode: 'home',
  party: null,
  player: null,
  questions: [],
  partyPlayers: [],
  partyAnswers: [],
  optimisticAnswers: new Map(),
  optimisticScores: new Map(),
  previousRanks: new Map(),
  previousScores: new Map(),
  animatedLeaderboardKeys: new Set(),
  message: null,
  partyChannel: null,
  playersChannel: null,
  answersChannel: null,
  tickInterval: null,
  pollInterval: null,
};

window.addEventListener('load', async () => {
  await loadQuestions();
  await restoreSession();
  startTimerTick();
  startPolling();
  render();
});

function setMessage(message, type = 'info') {
  state.message = { text: message, type };
  render();
  setTimeout(() => {
    state.message = null;
    render();
  }, 4000);
}

function render() {
  if (!supabase || !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    app.innerHTML = `
      <section class="screen error-screen">
        <h1>${APP_NAME}</h1>
        <p class="error-text">Missing Supabase environment variables. Copy <code>.env.example</code> to <code>.env</code> and add your values.</p>
      </section>`;
    return;
  }

  const messageHtml = state.message
    ? `<div class="toast ${state.message.type}">${escapeHtml(state.message.text)}</div>`
    : '';

  if (state.mode === 'host') {
    app.innerHTML = `${messageHtml}${renderHostView()}`;
    attachHostHandlers();
    return;
  }

  if (state.mode === 'join') {
    app.innerHTML = `${messageHtml}${renderJoinView()}`;
    attachJoinHandlers();
    return;
  }

  if (state.mode === 'inParty') {
    app.innerHTML = `${messageHtml}${renderPlayerView()}`;
    attachPlayerHandlers();
    return;
  }

  app.innerHTML = `${messageHtml}${renderHomeView()}`;
  attachHomeHandlers();
}

function renderHomeView() {
  return `
    <section class="screen welcome-screen">
      <div class="home-shell">
        <div>
          <p class="game-label">Live quiz</p>
          <h1>${APP_NAME}</h1>
          <p class="info-text">Create a party, share the code, and run each leaderboard break manually.</p>
        </div>
        <div class="choices-grid">
          <div class="card">
            <h2>Host</h2>
            <label>
              Host code
              <input type="password" id="host-code-input" placeholder="4321" />
            </label>
            <button id="host-mode-btn">Enter host mode</button>
          </div>
          <div class="card">
            <h2>Player</h2>
            <label>
              Party code
              <input type="text" id="join-code-input" placeholder="AB12" maxlength="6" />
            </label>
            <label>
              Your name
              <input type="text" id="join-name-input" placeholder="Player 1" />
            </label>
            <button id="join-party-btn">Join party</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderHostView() {
  const party = state.party;
  const questions = extractQuestions(party);
  const currentQuestion = party ? questions[party.current_question] : null;
  const currentNumber = party ? party.current_question + 1 : 0;
  const isAnswering = isAnsweringPhase(party);
  const isReview = isReviewPhase(party);
  const timeLeft = getTimeRemaining(party);
  const isQuestionActive = party?.status === 'active' && !isReview;
  const isFullWidth = isQuestionActive || isReview || party?.status === 'finished';

  const mainContent = party?.status === 'lobby'
    ? renderLobbySection(party)
    : isReview
      ? renderLeaderboardSection()
      : `
      <div class="question-stage">
        <div class="question-header">
          <div>
            <span>${party ? `Question ${currentNumber} / ${questions.length}` : 'No active party'}</span>
            <p>${isAnswering ? 'Answer now' : 'Ready'}</p>
          </div>
          ${renderQuestionTimer(timeLeft)}
        </div>
        <div class="question-box">
          ${renderQuestionPrompt(currentQuestion, 'Create a party to begin.')}
        </div>
        <div class="tile-row">
          <button class="tile tile-red" disabled>${escapeHtml(currentQuestion?.choices?.[0] ?? 'Skspr')}</button>
          <button class="tile tile-blue" disabled>${escapeHtml(currentQuestion?.choices?.[1] ?? 'TikTok')}</button>
        </div>
      </div>
    `;

  return `
    <section class="screen kahoot-screen ${isQuestionActive ? 'question-active' : ''}">
      <div class="kahoot-grid ${isFullWidth ? 'single-panel-grid' : ''}">
        <section class="stage-card">
          ${renderTopbar('Host view', party?.join_code, party?.status === 'lobby' ? state.partyPlayers.length : currentNumber, party?.status === 'lobby' ? 'Players' : 'Question', isQuestionActive)}
          ${mainContent}
          ${renderHostActions(party, isReview)}
        </section>

        ${isFullWidth ? '' : `<aside class="participant-panel">
          <div class="panel-header">
            <div>
              <h2>Players</h2>
              <p>${state.partyPlayers.length} joined</p>
            </div>
          </div>
          <ul class="player-list">${renderCompactPlayerRows() || '<li>No players yet</li>'}</ul>
        </aside>`}
      </div>
      <button class="leave-icon ${party ? '' : 'hidden-control'}" id="back-home-btn" title="Leave party" aria-label="Leave party">×</button>
    </section>
  `;
}

function renderLobbySection(party) {
  return `
    <div class="lobby-stage">
      <div>
        <div class="section-kicker">Game PIN</div>
        <div class="lobby-code">${escapeHtml(party.join_code)}</div>
      </div>
      <div class="lobby-players">
        <div class="question-header">
          <span>Players joined</span>
          <p>${state.partyPlayers.length}</p>
        </div>
        <ul class="lobby-player-grid">
          ${state.partyPlayers.map((player) => `<li>${escapeHtml(player.name)}</li>`).join('') || '<li class="empty-player">Waiting for players...</li>'}
        </ul>
      </div>
    </div>
  `;
}

function renderJoinView() {
  return `
    <section class="screen join-screen">
      <div class="card small-card">
        <h1>Join a party</h1>
        <label>
          Party code
          <input type="text" id="join-code-input" placeholder="AB12" maxlength="6" />
        </label>
        <label>
          Your name
          <input type="text" id="join-name-input" placeholder="Player 1" />
        </label>
        <button id="join-party-btn">Join party</button>
        <button id="back-home-btn" class="secondary">Back</button>
      </div>
    </section>
  `;
}

function renderPlayerView() {
  const party = state.party;
  const player = state.player;
  const questions = extractQuestions(party);
  const currentIndex = party.current_question;
  const currentQuestion = questions[currentIndex];
  const selectedAnswer = state.partyAnswers.find(
    (answer) => answer.player_id === player.id && answer.question_index === currentIndex
  );
  const hasAnswered = Boolean(selectedAnswer);
  const isAnswering = isAnsweringPhase(party);
  const isReview = isReviewPhase(party);
  const timeLeft = getTimeRemaining(party);
  const isQuestionActive = party?.status === 'active' && !isReview;
  const isFullWidth = isQuestionActive || isReview || party.status === 'finished';

  const statusMessage = party.status === 'lobby'
    ? 'Waiting for the host to start'
    : isAnswering
      ? `Question ${currentIndex + 1} of ${questions.length}`
      : isReview
        ? 'Leaderboard'
        : 'Game complete';

  const leaderboardContent = isReview
    ? renderLeaderboardSection(player)
    : party.status === 'finished'
      ? `<div class="end-screen player-leaderboard-screen">${renderPlayerRankSummary(player)}<h2>Quiz complete</h2>${renderLeaderboardChart()}</div>`
      : '';

  const questionContent = `
        <div class="question-box question-box-player">
          ${renderQuestionPrompt(isAnswering ? currentQuestion : null, party.status === 'lobby' ? 'Waiting to start...' : 'Game over')}
        </div>
        ${isAnswering ? `
          <div class="answer-column question-answer-row">
            <button class="tile tile-red ${hasAnswered ? 'disabled' : ''} ${selectedAnswer?.choice_index === 0 ? 'selected' : ''}" data-choice="0">${escapeHtml(currentQuestion?.choices?.[0] ?? 'Skspr')}</button>
            <button class="tile tile-blue ${hasAnswered ? 'disabled' : ''} ${selectedAnswer?.choice_index === 1 ? 'selected' : ''}" data-choice="1">${escapeHtml(currentQuestion?.choices?.[1] ?? 'TikTok')}</button>
          </div>
        ` : ''}
      `;

  return `
    <section class="screen kahoot-screen ${isQuestionActive ? 'question-active' : ''}">
      <div class="kahoot-grid player-grid ${isFullWidth ? 'single-panel-grid' : ''}">
        <section class="stage-card">
          ${renderTopbar('Player view', party?.join_code, player.name, 'Connected', isQuestionActive)}
          ${leaderboardContent || `
            <div class="question-stage">
              <div class="question-header">
                <span>${escapeHtml(statusMessage)}</span>
                ${isAnswering ? renderQuestionTimer(timeLeft) : ''}
              </div>
              ${questionContent}
            </div>
          `}
        </section>

        ${isFullWidth ? '' : `<aside class="participant-panel">
          <div class="panel-header participant-header">
            <div>
              <span class="participant-count">${state.partyPlayers.length}</span>
              <h2>Quiz</h2>
            </div>
          </div>
          <div class="scoreboard-panel">
            <h3>Leaderboard</h3>
            <ul class="player-list">${renderCompactPlayerRows() || '<li>No scores yet</li>'}</ul>
          </div>
        </aside>`}
      </div>
      <button class="leave-icon" id="exit-party-icon" title="Leave party" aria-label="Leave party">×</button>
    </section>
  `;
}

function renderQuestionPrompt(question, fallbackText) {
  const imageHtml = question?.image
    ? `<img class="question-image" src="${escapeHtml(question.image)}" alt="" />`
    : '';

  return `
    <div class="question-prompt ${imageHtml ? 'with-image' : ''}">
      <h2>${escapeHtml(question?.question || fallbackText)}</h2>
      ${imageHtml}
    </div>
  `;
}

function renderTopbar(title, code, stat, label, compact = false) {
  return `
    <div class="kahoot-topbar">
      <div class="chip game-pin"><span>${escapeHtml(code || '----')}</span><small>PIN</small></div>
      <div class="title-group">
        <span class="game-label">Quiz</span>
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${compact ? '' : `<div class="chip answer-chip"><span>${escapeHtml(stat ?? 0)}</span><small>${escapeHtml(label)}</small></div>`}
    </div>
  `;
}

function renderHostActions(party, isReview) {
  const buttons = [
    !party ? '<button id="create-party-btn">Create party</button>' : '',
    party?.status === 'lobby' ? '<button id="start-game-btn">Next</button>' : '',
    party?.status === 'active' && isReview ? '<button id="next-question-btn">Next</button>' : '',
    party?.status === 'finished' ? '<button id="restart-party-btn">Restart party</button>' : '',
  ].filter(Boolean).join('');

  return buttons ? `<div class="kahoot-actions">${buttons}</div>` : '';
}

function renderQuestionTimer(timeLeft) {
  return `
    <div class="question-timer" aria-label="${timeLeft} seconds left">
      <span>${timeLeft}</span>
      <small>sec</small>
    </div>
  `;
}

function renderLeaderboardSection(player = null) {
  const leaderboardKey = getLeaderboardKey();
  const shouldAnimate = Boolean(leaderboardKey && !state.animatedLeaderboardKeys.has(leaderboardKey));
  if (shouldAnimate) {
    state.animatedLeaderboardKeys.add(leaderboardKey);
  }

  return `
    <div class="leaderboard-section ${shouldAnimate ? 'slide-in' : ''}">
      <div class="section-kicker">Leaderboard</div>
      ${player ? renderPlayerRankSummary(player) : ''}
      <h2>Top performers</h2>
      ${renderLeaderboardChart(shouldAnimate)}
    </div>
  `;
}

function renderPlayerRankSummary(player) {
  const players = getSortedPlayers();
  const rank = players.findIndex((item) => item.id === player?.id) + 1;
  const total = players.length;
  const score = Number(player?.score || 0).toLocaleString();

  if (!rank) return '';

  return `
    <div class="rank-summary">
      <span>Your rank</span>
      <strong>#${rank}</strong>
      <small>${score} points · ${total} player${total === 1 ? '' : 's'}</small>
    </div>
  `;
}

function renderCompactPlayerRows() {
  return getSortedPlayers()
    .map((p, idx) => `<li><span class="rank">#${idx + 1}</span><span>${escapeHtml(p.name)}</span><strong>${Number(p.score || 0).toLocaleString()}</strong></li>`)
    .join('');
}

function renderLeaderboardChart(shouldAnimate = false) {
  const players = getSortedPlayers();
  if (!players.length) return '<div class="empty-state">No players yet</div>';

  const maxScore = Math.max(...players.map((p) => Number(p.score || 0)), 1);
  const rows = players.slice(0, 8).map((player, index) => {
    const score = Number(player.score || 0);
    const previousRank = state.previousRanks.get(player.id);
    const previousScore = state.previousScores.get(player.id) ?? score;
    const currentAnswer = state.partyAnswers.find(
      (answer) => answer.player_id === player.id && answer.question_index === state.party?.current_question
    );
    const moved = previousRank === undefined ? 'new' : previousRank > index ? 'up' : previousRank < index ? 'down' : 'same';
    const questionGain = currentAnswer
      ? calculatePointsAwarded(state.party, currentAnswer.is_correct, new Date(currentAnswer.answered_at).getTime())
      : 0;
    const gained = shouldAnimate
      ? Math.max(0, score - previousScore, questionGain)
      : 0;
    const width = Math.max(7, Math.round((score / maxScore) * 100));

    return `
      <li class="leaderboard-row ${shouldAnimate ? `animate move-${moved}` : ''}" style="--bar-width:${width}%">
        <span class="leaderboard-rank">${index + 1}</span>
        <div class="leaderboard-player">
          <div class="leaderboard-name">${escapeHtml(player.name)}</div>
          <div class="leaderboard-bar"><span class="${shouldAnimate ? 'animate' : ''}"></span></div>
        </div>
        <div class="leaderboard-score">
          ${gained ? `<span class="score-gain">+${gained.toLocaleString()}</span>` : ''}
          <strong>${score.toLocaleString()}</strong>
          <small>points</small>
        </div>
      </li>
    `;
  }).join('');

  players.forEach((player, index) => {
    state.previousRanks.set(player.id, index);
    state.previousScores.set(player.id, Number(player.score || 0));
  });

  return `<ol class="leaderboard-chart">${rows}</ol>`;
}

function getLeaderboardKey() {
  if (!state.party) return null;
  return `${state.party.id}:${state.party.current_question}`;
}

function getSortedPlayers() {
  return [...state.partyPlayers].sort((a, b) => {
    const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDelta) return scoreDelta;
    return String(a.name).localeCompare(String(b.name));
  });
}

function attachHomeHandlers() {
  document.getElementById('host-mode-btn').addEventListener('click', () => {
    const code = document.getElementById('host-code-input').value.trim();
    if (code === HOST_CODE) {
      state.mode = 'host';
      render();
    } else {
      setMessage(`Invalid host code. Try ${HOST_CODE}.`, 'error');
    }
  });

  document.getElementById('join-party-btn').addEventListener('click', async () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    const name = document.getElementById('join-name-input').value.trim();
    if (!code || !name) {
      setMessage('Enter a party code and your name.', 'error');
      return;
    }
    await joinParty(code, name);
  });
}

function attachHostHandlers() {
  const exitBtn = document.getElementById('back-home-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      state.mode = 'home';
      cleanupSubscriptions();
      state.party = null;
      state.partyPlayers = [];
      state.partyAnswers = [];
      state.optimisticAnswers.clear();
      state.optimisticScores.clear();
      state.previousRanks.clear();
      state.previousScores.clear();
      state.animatedLeaderboardKeys.clear();
      localStorage.removeItem('party_id');
      render();
    });
  }

  const createBtn = document.getElementById('create-party-btn');
  if (createBtn) createBtn.addEventListener('click', createParty);

  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) startBtn.addEventListener('click', startGame);

  const nextBtn = document.getElementById('next-question-btn');
  if (nextBtn) nextBtn.addEventListener('click', nextQuestion);

  const restartBtn = document.getElementById('restart-party-btn');
  if (restartBtn) restartBtn.addEventListener('click', restartParty);
}

function attachJoinHandlers() {
  document.getElementById('back-home-btn').addEventListener('click', () => {
    state.mode = 'home';
    render();
  });

  document.getElementById('join-party-btn').addEventListener('click', async () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    const name = document.getElementById('join-name-input').value.trim();
    if (!code || !name) {
      setMessage('Enter the party code and your display name.', 'error');
      return;
    }
    await joinParty(code, name);
  });
}

function attachPlayerHandlers() {
  const exitIcon = document.getElementById('exit-party-icon');
  if (exitIcon) {
    exitIcon.addEventListener('click', () => {
      localStorage.removeItem('player_id');
      localStorage.removeItem('player_name');
      localStorage.removeItem('party_id');
      state.mode = 'home';
      cleanupSubscriptions();
      state.party = null;
      state.player = null;
      state.partyPlayers = [];
      state.partyAnswers = [];
      state.optimisticAnswers.clear();
      state.optimisticScores.clear();
      state.previousRanks.clear();
      state.previousScores.clear();
      state.animatedLeaderboardKeys.clear();
      render();
    });
  }

  document.querySelectorAll('.tile[data-choice]').forEach((button) => {
    if (button.classList.contains('disabled')) return;
    button.addEventListener('click', async () => {
      button.classList.add('disabled');
      await submitAnswer(Number(button.dataset.choice));
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractQuestions(party) {
  if (!party?.questions) return state.questions;
  return Array.isArray(party.questions) ? party.questions : [];
}

async function loadQuestions() {
  try {
    const response = await fetch('/questions.json');
    state.questions = await response.json();
  } catch (error) {
    console.warn('Failed to load questions.json', error);
    state.questions = [];
  }
}

function isAnsweringPhase(party) {
  return party?.status === 'active' && !party.review_started_at && getTimeRemaining(party) > 0;
}

function isReviewPhase(party) {
  return party?.status === 'active' && (Boolean(party.review_started_at) || getTimeRemaining(party) <= 0);
}

function getTimeRemaining(party) {
  if (!party?.question_started_at || party.status !== 'active' || party.review_started_at) {
    return 0;
  }

  const start = new Date(party.question_started_at).getTime();
  const elapsed = Math.floor((Date.now() - start) / 1000);
  return Math.max(0, QUESTION_SECONDS - elapsed);
}

function calculatePointsAwarded(party, isCorrect, answeredAt = Date.now()) {
  if (!isCorrect || !party?.question_started_at) return 0;

  const startedAt = new Date(party.question_started_at).getTime();
  const elapsedSeconds = Math.max(0, (answeredAt - startedAt) / 1000);
  const remainingRatio = Math.max(0, (QUESTION_SECONDS - elapsedSeconds) / QUESTION_SECONDS);
  return Math.floor(MAX_POINTS_PER_QUESTION * remainingRatio);
}

function startTimerTick() {
  if (state.tickInterval) return;
  state.tickInterval = setInterval(() => {
    if (state.party?.status === 'active') {
      if (!isAnsweringPhase(state.party)) return;
      render();
    }
  }, 250);
}

function startPolling() {
  if (state.pollInterval) return;
  state.pollInterval = setInterval(async () => {
    if (!state.party?.id) return;
    await refreshPartyData(state.party.id);
    if (state.mode === 'host') {
      await maybeAdvanceReviewState();
    }
    render();
  }, 500);
}

async function refreshPartyData(partyId) {
  await Promise.all([loadParty(partyId), loadPlayers(partyId), loadAnswers(partyId)]);
}

async function maybeAdvanceReviewState() {
  if (!state.party || state.mode !== 'host') return;
  if (state.party.status !== 'active' || state.party.review_started_at) return;
  if (getTimeRemaining(state.party) > 0) return;

  const { data, error } = await supabase
    .from('parties')
    .update({ review_started_at: new Date().toISOString() })
    .eq('id', state.party.id)
    .select()
    .single();

  if (!error) {
    state.party = data;
    const leaderboardKey = getLeaderboardKey();
    if (leaderboardKey) {
      state.animatedLeaderboardKeys.delete(leaderboardKey);
    }
  }
}

function randomCode(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createParty() {
  if (!state.questions.length) {
    setMessage('No questions loaded from questions.json.', 'error');
    return;
  }

  const joinCode = randomCode(4);
  const { data, error } = await supabase
    .from('parties')
    .insert([{ join_code: joinCode, status: 'lobby', questions: state.questions }])
    .select()
    .single();

  if (error) {
    console.error(error);
    setMessage('Failed to create party. Try again.', 'error');
    return;
  }

  state.party = data;
  state.mode = 'host';
  state.previousRanks.clear();
  state.previousScores.clear();
  state.animatedLeaderboardKeys.clear();
  localStorage.setItem('party_id', String(data.id));
  await refreshPartyRelatedData(data.id);
  setMessage(`Party created. Share code ${data.join_code}.`, 'success');
  render();
}

async function refreshPartyRelatedData(partyId) {
  await refreshPartyData(partyId);
  await subscribeToParty(partyId);
}

async function loadParty(partyId) {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('id', partyId)
    .single();

  if (error) {
    console.warn('loadParty error', error);
    return;
  }

  state.party = data;
}

async function loadPlayers(partyId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('party_id', partyId);

  if (error) {
    console.warn('loadPlayers error', error);
    return;
  }

  state.partyPlayers = (data || []).map((player) => {
    const optimisticScore = state.optimisticScores.get(player.id);
    return optimisticScore === undefined ? player : { ...player, score: optimisticScore };
  });
  if (state.player) {
    const refreshedPlayer = state.partyPlayers.find((player) => player.id === state.player.id);
    if (refreshedPlayer) state.player = refreshedPlayer;
  }
}

async function loadAnswers(partyId) {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('party_id', partyId);

  if (error) {
    console.warn('loadAnswers error', error);
    return;
  }

  const serverAnswers = data || [];
  const serverKeys = new Set(serverAnswers.map((answer) => getAnswerKey(answer.player_id, answer.question_index, answer.party_id)));
  const pendingAnswers = [...state.optimisticAnswers.entries()]
    .filter(([key]) => !serverKeys.has(key))
    .map(([, answer]) => answer);

  state.partyAnswers = [...serverAnswers, ...pendingAnswers];
}

async function joinParty(code, name) {
  const { data: party, error: partyError } = await supabase
    .from('parties')
    .select('*')
    .ilike('join_code', code)
    .single();

  if (partyError || !party) {
    setMessage('Party not found. Check the join code.', 'error');
    return;
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert([{ party_id: party.id, name: name.trim(), score: 0 }])
    .select()
    .single();

  if (playerError || !player) {
    console.error(playerError);
    setMessage('Unable to join party. Try a different name or try again.', 'error');
    return;
  }

  state.party = party;
  state.player = player;
  state.optimisticAnswers.clear();
  state.optimisticScores.clear();
  state.previousRanks.clear();
  state.previousScores.clear();
  state.animatedLeaderboardKeys.clear();
  localStorage.setItem('party_id', String(party.id));
  localStorage.setItem('player_id', String(player.id));
  localStorage.setItem('player_name', player.name);
  state.mode = 'inParty';
  await refreshPartyRelatedData(party.id);
  setMessage(`Joined party ${party.join_code} as ${player.name}.`, 'success');
  render();
}

async function startGame() {
  if (!state.party) return;
  const { data, error } = await supabase
    .from('parties')
    .update({
      status: 'active',
      current_question: 0,
      question_started_at: new Date().toISOString(),
      review_started_at: null,
    })
    .eq('id', state.party.id)
    .select()
    .single();

  if (error) {
    console.error('startGame error:', error);
    setMessage(`Unable to start game: ${error.message}`, 'error');
    return;
  }

  state.party = data;
  setMessage('Game started. Players can answer now.', 'success');
  render();
}

async function nextQuestion() {
  if (!state.party) return;
  const questions = extractQuestions(state.party);
  const nextIndex = state.party.current_question + 1;

  if (nextIndex >= questions.length) {
    const { data, error } = await supabase
      .from('parties')
      .update({ status: 'finished', question_started_at: null, review_started_at: null })
      .eq('id', state.party.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      setMessage('Unable to finish the party.', 'error');
      return;
    }

    state.party = data;
    setMessage('Quiz finished.', 'success');
    render();
    return;
  }

  const { data, error } = await supabase
    .from('parties')
    .update({
      current_question: nextIndex,
      status: 'active',
      question_started_at: new Date().toISOString(),
      review_started_at: null,
    })
    .eq('id', state.party.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    setMessage('Unable to move to the next question.', 'error');
    return;
  }

  state.party = data;
  setMessage(`Question ${nextIndex + 1} is live.`, 'success');
  render();
}

async function restartParty() {
  if (!state.party) return;
  const { data, error } = await supabase
    .from('parties')
    .update({ status: 'lobby', current_question: 0, question_started_at: null, review_started_at: null })
    .eq('id', state.party.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    setMessage('Unable to reset party.', 'error');
    return;
  }

  state.party = data;
  setMessage('Party reset to lobby. Players can join again.', 'success');
  render();
}

async function submitAnswer(choiceIndex) {
  if (!state.party || !state.player) return;
  const questions = extractQuestions(state.party);
  const questionIndex = state.party.current_question;
  const question = questions[questionIndex];
  if (!question) return;

  const already = state.partyAnswers.find(
    (item) => item.player_id === state.player.id && item.question_index === questionIndex
  );
  if (already) {
    setMessage('You have already answered this question.', 'error');
    return;
  }

  if (!isAnsweringPhase(state.party)) {
    setMessage('The host has closed answers for this question.', 'error');
    return;
  }

  const isCorrect = question.answer === choiceIndex;
  const answeredAt = new Date();
  const pointsAwarded = calculatePointsAwarded(state.party, isCorrect, answeredAt.getTime());
  const answerKey = getAnswerKey(state.player.id, questionIndex, state.party.id);
  const currentScore = Number(state.player.score || 0);
  const optimisticScore = currentScore + pointsAwarded;
  const optimisticAnswer = {
    id: `optimistic-${answerKey}`,
    party_id: state.party.id,
    player_id: state.player.id,
    question_index: questionIndex,
    choice_index: choiceIndex,
    is_correct: isCorrect,
    answered_at: answeredAt.toISOString(),
    optimistic: true,
  };

  state.optimisticAnswers.set(answerKey, optimisticAnswer);
  state.partyAnswers.push(optimisticAnswer);
  state.optimisticScores.set(state.player.id, optimisticScore);
  state.player = { ...state.player, score: optimisticScore };
  state.partyPlayers = state.partyPlayers.map((player) =>
    player.id === state.player.id ? { ...player, score: optimisticScore } : player
  );
  render();

  const { data: answer, error: answerError } = await supabase
    .from('answers')
    .insert([
      {
        party_id: state.party.id,
        player_id: state.player.id,
        question_index: questionIndex,
        choice_index: choiceIndex,
        is_correct: isCorrect,
        answered_at: answeredAt.toISOString(),
      },
    ])
    .select()
    .single();

  if (answerError) {
    console.error(answerError);
    rollbackOptimisticAnswer(answerKey, state.player.id, currentScore);
    setMessage(answerError.code === '23505' ? 'You have already answered this question.' : 'Failed to submit answer.', 'error');
    await refreshPartyData(state.party.id);
    render();
    return;
  }

  state.optimisticAnswers.delete(answerKey);
  state.partyAnswers = state.partyAnswers
    .filter((item) => item.id !== optimisticAnswer.id)
    .concat(answer);

  if (isCorrect) {
    const { error: playerUpdateError } = await supabase
      .from('players')
      .update({ score: optimisticScore })
      .eq('id', state.player.id);

    if (!playerUpdateError) {
      state.optimisticScores.delete(state.player.id);
      state.player.score = optimisticScore;
      state.partyPlayers = state.partyPlayers.map((player) =>
        player.id === state.player.id ? { ...player, score: optimisticScore } : player
      );
      setMessage(`Correct. +${pointsAwarded} points.`, 'success');
    } else {
      console.warn(playerUpdateError);
      rollbackOptimisticAnswer(answerKey, state.player.id, currentScore, false);
      setMessage('Answer submitted. Score update failed.', 'warning');
    }
  } else {
    state.optimisticScores.delete(state.player.id);
    setMessage('Incorrect answer. Keep going.', 'info');
  }

  render();
}

function getAnswerKey(playerId, questionIndex, partyId = state.party?.id) {
  return `${partyId}:${playerId}:${questionIndex}`;
}

function rollbackOptimisticAnswer(answerKey, playerId, previousScore, removeAnswer = true) {
  state.optimisticAnswers.delete(answerKey);
  state.optimisticScores.delete(playerId);
  if (removeAnswer) {
    state.partyAnswers = state.partyAnswers.filter((answer) => getAnswerKey(answer.player_id, answer.question_index, answer.party_id) !== answerKey);
  }
  state.player = state.player?.id === playerId ? { ...state.player, score: previousScore } : state.player;
  state.partyPlayers = state.partyPlayers.map((player) =>
    player.id === playerId ? { ...player, score: previousScore } : player
  );
}

async function restoreSession() {
  const partyId = localStorage.getItem('party_id');
  const playerId = localStorage.getItem('player_id');
  const playerName = localStorage.getItem('player_name');

  if (!partyId) return;

  const { data: party, error: partyError } = await supabase
    .from('parties')
    .select('*')
    .eq('id', Number(partyId))
    .single();

  if (partyError || !party) {
    localStorage.removeItem('party_id');
    return;
  }

  state.party = party;
  await Promise.all([loadPlayers(party.id), loadAnswers(party.id)]);

  if (playerId && playerName) {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', Number(playerId))
      .single();

    if (!playerError && player) {
      state.player = player;
      state.mode = 'inParty';
      await subscribeToParty(party.id);
      return;
    }
  }

  state.mode = 'host';
  await subscribeToParty(party.id);
}

async function subscribeToParty(partyId) {
  cleanupSubscriptions();

  const partyChannel = supabase.channel(`party-${partyId}`);
  partyChannel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'parties', filter: `id=eq.${partyId}` },
    async () => {
      await loadParty(partyId);
      render();
    }
  );
  await partyChannel.subscribe();
  state.partyChannel = partyChannel;

  const playersChannel = supabase.channel(`players-${partyId}`);
  playersChannel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'players', filter: `party_id=eq.${partyId}` },
    async () => {
      await loadPlayers(partyId);
      render();
    }
  );
  await playersChannel.subscribe();
  state.playersChannel = playersChannel;

  const answersChannel = supabase.channel(`answers-${partyId}`);
  answersChannel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'answers', filter: `party_id=eq.${partyId}` },
    async () => {
      await loadAnswers(partyId);
      render();
    }
  );
  await answersChannel.subscribe();
  state.answersChannel = answersChannel;
}

function cleanupSubscriptions() {
  [state.partyChannel, state.playersChannel, state.answersChannel].forEach((channel) => {
    if (channel && channel.unsubscribe) {
      channel.unsubscribe().catch(() => {});
    }
  });
  state.partyChannel = null;
  state.playersChannel = null;
  state.answersChannel = null;
}
