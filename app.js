// ============================================================
// 英単語学習アプリ - Complete SRS Engine (Clean Rewrite)
// ============================================================

const DAILY_NEW_LIMIT = 30;
const DAILY_REVIEW_LIMIT = 200;

const state = {
  allReview: [],
  allNew: [],
  queue: [],
  currentIndex: 0,
  undoStack: [],
  currentMode: 1,
  phase: 'question', // 'question' or 'rating'
  isInfiniteMode: false,
  currentIsMode1Wrong: false,
  vocabStats: { totalSessions: 0, totalWords: 0, totalCorrect: 0 },
  qFormat: 'ja-en',
  audioSeq: 'ja-en',
  mode3Timeouts: [],
  studyTimerInterval: null,
  sessionSeconds: 0,
  chartInstance: null,
  dashboardStatsCache: null
};

// ===== DOM CACHE =====
const $ = id => document.getElementById(id);
const dom = {
  btnBack: $('btn-back'),
  btnUndo: $('btn-undo'),
  btnQuit: $('btn-quit'),
  btnSettings: $('btn-settings'),
  btnDashboard: $('btn-dashboard'),
  statDueCount: $('stat-due-count'),
  statReviewCount: $('stat-review-count'),
  statNewCount: $('stat-new-count'),
  btnStartMode1: $('btn-start-mode1'),
  btnStartMode2: $('btn-start-mode2'),
  btnStartMode3: $('btn-start-mode3'),
  settingQFormat: $('setting-q-format'),
  settingAudioSeq: $('setting-audio-seq'),
  studyProgressFill: $('study-progress-fill'),
  studyProgressText: $('study-progress-text'),
  // Unified card elements
  unifiedCard: $('unified-study-card'),
  studyQLabel: $('study-q-label'),
  studyMainWord: $('study-main-word'),
  answerDetails: $('answer-details'),
  mode2Hint: $('mode2-hint'),
  detPron: $('det-pron'),
  detSub: $('det-sub'),
  detEty: $('det-ety'),
  detEx1En: $('det-ex1-en'), detEx1Ja: $('det-ex1-ja'),
  detEx2En: $('det-ex2-en'), detEx2Ja: $('det-ex2-ja'),
  detEx3En: $('det-ex3-en'), detEx3Ja: $('det-ex3-ja'),
  // Input area
  studyInputArea: $('study-input-area'),
  studyForm: $('study-form'),
  studyInput: $('study-input'),
  mobileKbInput: $('mobile-keyboard-input'),
  // Rating panel
  ratingPanel: $('rating-panel'),
  ratingMistakes: $('rating-mistakes'),
  ratingHintText: $('rating-hint-text'),
  previewAgain: $('preview-again'),
  previewHard: $('preview-hard'),
  previewGood: $('preview-good'),
  previewEasy: $('preview-easy'),
  keyAgain: $('key-again'),
  keyHard: $('key-hard'),
  keyGood: $('key-good'),
  keyEasy: $('key-easy'),
  btnRateAgain: $('btn-rate-again'),
  btnRateHard: $('btn-rate-hard'),
  btnRateGood: $('btn-rate-good'),
  btnRateEasy: $('btn-rate-easy'),
  // Mode 3
  btnM3Wrong: $('btn-m3-wrong'),
  btnM3Correct: $('btn-m3-correct'),
  m3ProgressText: $('m3-progress-text'),
  m3ProgressFill: $('m3-progress-fill'),
  m3TouchArea: $('m3-touch-area'),
  // Done page
  btnDoneHome: $('btn-done-home'),
  btnStudyMore: $('btn-study-more'),
  doneTitle: $('done-title'),
  doneSubtitle: $('done-subtitle'),
  // Dashboard
  dashMastered: $('dash-mastered'),
  dashTimeToday: $('dash-time-today'),
  dashTimeTotal: $('dash-time-total'),
  studyChart: $('studyChart'),
  mistakeFilter: $('mistake-filter'),
  mistakeTbody: $('mistake-tbody'),
  // Reset
  btnResetProgress: $('btn-reset-progress'),
};

const pages = document.querySelectorAll('.page');

// ===== UTILITIES =====
function activePage() {
  for (const p of pages) {
    if (!p.classList.contains('hidden')) return p.id;
  }
  return '';
}

function showPage(pageId) {
  pages.forEach(p => p.classList.add('hidden'));
  const target = $(pageId);
  if (target) target.classList.remove('hidden');

  // Header visibility
  const isStudy = (pageId === 'page-study' || pageId === 'page-mode3');
  const isHome = (pageId === 'page-home');
  const isSubPage = (pageId === 'page-dashboard' || pageId === 'page-settings');

  if (dom.btnBack) dom.btnBack.classList.toggle('hidden', !isSubPage);
  if (dom.btnUndo) dom.btnUndo.classList.toggle('hidden', !isStudy);
  if (dom.btnQuit) dom.btnQuit.classList.toggle('hidden', !isStudy);
  if (dom.btnDashboard) dom.btnDashboard.classList.toggle('hidden', !isHome);
  if (dom.btnSettings) dom.btnSettings.classList.toggle('hidden', isStudy);
}

function customConfirm(msg, callback) {
  const modal = $('custom-modal');
  const modalMsg = $('modal-message');
  const btnOk = $('modal-ok');
  const btnCancel = $('modal-cancel');
  if (!modal) { callback(confirm(msg)); return; }
  modalMsg.textContent = msg;
  modal.classList.remove('hidden');
  const cleanup = () => {
    btnOk.removeEventListener('click', onOk);
    btnCancel.removeEventListener('click', onCancel);
    modal.classList.add('hidden');
  };
  const onOk = () => { cleanup(); callback(true); };
  const onCancel = () => { cleanup(); callback(false); };
  btnOk.addEventListener('click', onOk);
  btnCancel.addEventListener('click', onCancel);
}

// ===== SPEECH =====
function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'en' ? 'en-US' : 'ja-JP';
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ===== STUDY TIMER =====
function startStudyTimer() {
  stopStudyTimer();
  state.sessionSeconds = 0;
  state.studyTimerInterval = setInterval(() => { state.sessionSeconds++; }, 1000);
}

function stopStudyTimer() {
  if (state.studyTimerInterval) {
    clearInterval(state.studyTimerInterval);
    state.studyTimerInterval = null;
  }
  if (state.sessionSeconds > 0 && typeof addStudyTime === 'function') {
    addStudyTime(state.sessionSeconds);
    state.sessionSeconds = 0;
  }
}

// ===== MODE 3 TIMERS =====
function clearMode3Timers() {
  state.mode3Timeouts.forEach(t => clearTimeout(t));
  state.mode3Timeouts = [];
}

// ===== DASHBOARD =====
function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

async function renderDashboard() {
  showPage('page-dashboard');
  dom.dashMastered.textContent = '読込中...';
  if (typeof getDashboardData !== 'function') return;
  const data = await getDashboardData();
  if (!data) return;
  state.dashboardStatsCache = data;
  dom.dashMastered.textContent = data.masteredCount;
  dom.dashTimeToday.textContent = formatTime(data.todayStudyTime);
  dom.dashTimeTotal.textContent = formatTime(data.totalStudyTime);

  if (state.chartInstance) state.chartInstance.destroy();
  const ctx = dom.studyChart.getContext('2d');
  state.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.chartLabels,
      datasets: [{
        label: '学習単語数',
        data: data.chartData,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    },
    options: { responsive: true }
  });
  renderMistakeTable();
}

function renderMistakeTable() {
  if (!state.dashboardStatsCache) return;
  const minMistakes = parseInt(dom.mistakeFilter.value, 10);
  const words = state.dashboardStatsCache.mistakeList.filter(w => (w.mistakeCount || 0) >= minMistakes);
  dom.mistakeTbody.innerHTML = '';
  words.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.en}</strong></td>
      <td>${w.ja}</td>
      <td style="color: #ef4444">${w.mistakeCount || 0}回</td>
      <td>${w.repetition || 0}</td>
    `;
    dom.mistakeTbody.appendChild(tr);
  });
}

// ===== SRS SESSION START =====
window.startSrsSession = async function () {
  if (typeof loadAllDueWords !== 'function') return;
  const { reviewWords, newWords } = await loadAllDueWords();
  state.allReview = reviewWords;
  state.allNew = newWords;

  const reviewSlice = reviewWords.slice(0, DAILY_REVIEW_LIMIT);
  const newSlice = newWords.slice(0, DAILY_NEW_LIMIT);
  state.queue = [...reviewSlice, ...newSlice];
  state.currentIndex = 0;
  state.undoStack = [];
  state.isInfiniteMode = false;

  if (dom.statDueCount) dom.statDueCount.textContent = state.queue.length;
  if (dom.statReviewCount) dom.statReviewCount.textContent = reviewSlice.length;
  if (dom.statNewCount) dom.statNewCount.textContent = newSlice.length;
};

// ===== SESSION MANAGEMENT =====
function initStudySession(mode) {
  // Always blur any focused element to prevent keyboard issues
  if (document.activeElement) document.activeElement.blur();

  if (state.queue.length === 0) {
    alert("今日復習する単語はありません！");
    return;
  }

  state.currentMode = mode;
  state.currentIndex = 0;
  state.undoStack = [];
  state.phase = 'question';
  startStudyTimer();

  if (mode === 3) {
    showPage('page-mode3');
    loadMode3Word();
  } else {
    showPage('page-study');
    loadCurrentWord();
  }
}

// ===== LOAD CURRENT WORD (Mode 1 & 2) =====
function loadCurrentWord() {
  if (state.currentIndex >= state.queue.length) {
    stopStudyTimer();
    showPage('page-done');
    return;
  }

  const word = state.queue[state.currentIndex];
  const total = state.queue.length;
  const pct = Math.round((state.currentIndex / total) * 100);
  dom.studyProgressText.textContent = `${state.currentIndex + 1} / ${total}`;
  dom.studyProgressFill.style.width = `${pct}%`;

  const isEnJa = state.qFormat === 'en-ja';

  // Set the question text on the main word element
  state.phase = 'question';
  dom.studyQLabel.textContent = 'Q';
  dom.studyMainWord.textContent = isEnJa ? word.en : word.ja;

  // Pre-fill answer details (hidden until toggled)
  // det-sub shows the QUESTION text (opposite of main word) when answer is revealed
  dom.detSub.textContent = isEnJa ? word.en : word.ja;
  dom.detPron.textContent = '';
  dom.detEty.textContent = '';
  dom.detEx1En.textContent = word.ex1_en || '';
  dom.detEx1Ja.textContent = word.ex1_ja || '';
  dom.detEx2En.textContent = word.ex2_en || '';
  dom.detEx2Ja.textContent = word.ex2_ja || '';
  dom.detEx3En.textContent = word.ex3_en || '';
  dom.detEx3Ja.textContent = word.ex3_ja || '';

  // Hide answer + rating
  dom.answerDetails.classList.add('hidden');
  dom.ratingPanel.classList.add('hidden');

  if (state.currentMode === 1) {
    // Input mode: show text input at top
    dom.studyInputArea.classList.remove('hidden');
    dom.mode2Hint.classList.add('hidden');
    dom.studyInput.value = '';
    // Focus without scrolling (prevents mobile page jump)
    requestAnimationFrame(() => {
      dom.studyInput.focus({ preventScroll: true });
    });
  } else {
    // Flashcard mode: show hint, focus hidden input for mobile keyboard
    dom.studyInputArea.classList.add('hidden');
    dom.mode2Hint.classList.remove('hidden');
    if (dom.mobileKbInput) {
      requestAnimationFrame(() => {
        dom.mobileKbInput.focus({ preventScroll: true });
      });
    }
  }
}

// ===== TOGGLE: Show answer (rating phase) =====
function showRatingPhase(isMode1Wrong = false) {
  state.phase = 'rating';
  state.currentIsMode1Wrong = isMode1Wrong;
  const word = state.queue[state.currentIndex];
  const isEnJa = state.qFormat === 'en-ja';

  // Swap the main word to show the ANSWER in the SAME position
  dom.studyQLabel.textContent = 'A';
  dom.studyMainWord.textContent = isEnJa ? word.ja : word.en;

  // det-sub shows the QUESTION text (so user sees both Q and A)
  dom.detSub.textContent = isEnJa ? word.en : word.ja;

  // Keep input visible for Mode 1 (don't dismiss keyboard)
  dom.mode2Hint.classList.add('hidden');

  // Hide pronunciation & etymology for all modes
  if (dom.detPron) dom.detPron.style.display = 'none';
  if (dom.detEty) dom.detEty.style.display = 'none';

  // Show details + rating below
  dom.answerDetails.classList.remove('hidden');
  dom.ratingPanel.classList.remove('hidden');

  // Set interval previews
  const previews = getIntervalPreviews(word, isMode1Wrong);
  dom.previewAgain.textContent = previews.again;
  dom.previewHard.textContent = previews.hard;
  dom.previewGood.textContent = previews.good;
  dom.previewEasy.textContent = previews.easy;
  dom.ratingMistakes.textContent = word.mistakeCount || 0;

  // Key hints
  if (state.currentMode === 1) {
    dom.keyAgain.textContent = '[D/1/b/き]';
    dom.keyHard.textContent = '[R/2/c/く]';
    dom.keyGood.textContent = '[G/3/f/す]';
    dom.keyEasy.textContent = '[H/4/-/せ]';
  } else {
    dom.keyAgain.textContent = '[D/1/b/き]';
    dom.keyHard.textContent = '[R/2/c/く]';
    dom.keyGood.textContent = '[G/3/f/す]';
    dom.keyEasy.textContent = '[H/4/-/せ]';
  }
  dom.btnRateHard.style.display = '';
  dom.btnRateEasy.style.display = '';
  dom.btnRateAgain.style.display = '';
  dom.btnRateGood.style.display = '';

  if (state.qFormat === 'ja-en') speak(word.en, 'en');
}

// ===== TOGGLE: Back to question =====
function hideRatingPhase() {
  if (state.currentMode !== 2) return;
  state.phase = 'question';
  const word = state.queue[state.currentIndex];
  const isEnJa = state.qFormat === 'en-ja';

  dom.studyQLabel.textContent = 'Q';
  dom.studyMainWord.textContent = isEnJa ? word.en : word.ja;

  dom.answerDetails.classList.add('hidden');
  dom.ratingPanel.classList.add('hidden');
  dom.mode2Hint.classList.remove('hidden');
}

// ===== MODE 1: Auto-rate and show answer, wait for any key =====
function showAnswerThenAdvance(grade) {
  if (state.currentIndex >= state.queue.length) return;
  const word = state.queue[state.currentIndex];
  const isEnJa = state.qFormat === 'en-ja';

  // Perform the rating immediately
  const isM1Typo = (grade === 0); // Again from shortcut = treat as wrong
  const prevState = { ...word };
  state.undoStack.push({ index: state.currentIndex, wordEn: word.en, prevState });

  const newState = calculateSM2(grade, word, isM1Typo);
  if (grade === 0) state.queue.push({ ...word, ...newState });
  Object.assign(word, newState);
  if (typeof saveSrsWord === 'function') saveSrsWord(word.en, newState);
  if (typeof incrementStudyCount === 'function') incrementStudyCount();
  state.vocabStats.totalWords++;
  if (grade >= 2) state.vocabStats.totalCorrect++;

  // Show answer in-place
  state.phase = 'answered';
  dom.studyQLabel.textContent = 'A';
  dom.studyMainWord.textContent = isEnJa ? word.ja : word.en;

  // det-sub shows the QUESTION text
  dom.detSub.textContent = isEnJa ? word.en : word.ja;

  // Keep input area visible (don't dismiss keyboard)
  dom.mode2Hint.classList.add('hidden');
  dom.answerDetails.classList.remove('hidden');
  dom.ratingPanel.classList.add('hidden');

  // Hide pron/ety
  if (dom.detPron) dom.detPron.style.display = 'none';
  if (dom.detEty) dom.detEty.style.display = 'none';

  // Keep mobile keyboard open via hidden input
  if (dom.mobileKbInput) {
    requestAnimationFrame(() => dom.mobileKbInput.focus({ preventScroll: true }));
  }

  if (state.qFormat === 'ja-en') speak(word.en, 'en');
}

// ===== MODE 1: Form submit / auto-detect =====
if (dom.studyForm) {
  dom.studyForm.addEventListener('submit', e => {
    e.preventDefault();
    const word = state.queue[state.currentIndex];
    const user = dom.studyInput.value.trim().toLowerCase();
    const target = word.en.toLowerCase();
    showRatingPhase(user !== target);
  });
}

if (dom.studyInput) {
  dom.studyInput.addEventListener('input', () => {
    if (state.phase !== 'question' || state.currentMode !== 1) return;
    const word = state.queue[state.currentIndex];
    const user = dom.studyInput.value.trim().toLowerCase();
    const target = word.en.toLowerCase();
    if (user === target && user !== '') {
      // Correct input → auto-rate as Easy, show '正解' briefly
      dom.studyQLabel.textContent = '正解';
      dom.studyQLabel.style.color = '#34d399';
      setTimeout(() => { dom.studyQLabel.style.color = ''; }, 800);
      handleRating(3);
    }
  });
}

// ===== MODE 3: Load word =====
function loadMode3Word() {
  clearMode3Timers();
  if (state.currentIndex >= state.queue.length) {
    stopStudyTimer();
    showPage('page-done');
    return;
  }

  const word = state.queue[state.currentIndex];
  const total = state.queue.length;
  const pct = Math.round((state.currentIndex / total) * 100);
  dom.m3ProgressText.textContent = `${state.currentIndex + 1} / ${total}`;
  dom.m3ProgressFill.style.width = `${pct}%`;

  const seq = state.audioSeq;
  if (seq === 'ja-en') {
    speak(word.ja, 'ja');
    const t = setTimeout(() => speak(word.en, 'en'), 2500);
    state.mode3Timeouts.push(t);
  } else if (seq === 'en-ja') {
    speak(word.en, 'en');
    const t = setTimeout(() => speak(word.ja, 'ja'), 2500);
    state.mode3Timeouts.push(t);
  } else {
    speak(word.en, 'en');
  }
}

// ===== RATING HANDLER (all modes) =====
async function handleRating(grade, isMode3Wrong = false) {

  if (state.currentIndex >= state.queue.length) return;
  const word = state.queue[state.currentIndex];

  // Save undo state
  const prevState = { ...word };
  state.undoStack.push({
    index: state.currentIndex,
    wordEn: word.en,
    prevState
  });

  // Calculate new SRS state
  const isM1Typo = state.currentMode === 1 ? !!state.currentIsMode1Wrong : false;
  const newState = calculateSM2(grade, word, isM1Typo);

  // If Again, re-queue at end
  if (grade === 0) {
    state.queue.push({ ...word, ...newState });
  }

  Object.assign(word, newState);

  // Save to Firestore immediately (guarantees persistence even on interrupt)
  if (typeof saveSrsWord === 'function') saveSrsWord(word.en, newState);
  if (typeof incrementStudyCount === 'function') incrementStudyCount();

  state.vocabStats.totalWords++;
  if (grade >= 2) state.vocabStats.totalCorrect++;

  // Advance
  state.currentIndex++;
  if (state.currentMode === 3) {
    loadMode3Word();
  } else {
    loadCurrentWord();
  }
}

// ===== UNDO =====
async function undoLastRating() {
  if (state.undoStack.length === 0) return;
  const lastAction = state.undoStack.pop();
  state.currentIndex = lastAction.index;
  const word = state.queue[state.currentIndex];

  // Remove re-queued Again duplicate if applicable
  if (lastAction.prevState.mistakeCount < word.mistakeCount) {
    for (let i = state.queue.length - 1; i > state.currentIndex; i--) {
      if (state.queue[i].en === word.en) {
        state.queue.splice(i, 1);
        break;
      }
    }
  }

  Object.assign(word, lastAction.prevState);
  if (typeof saveSrsWord === 'function') saveSrsWord(word.en, lastAction.prevState);
  if (typeof undoStudyCount === 'function') undoStudyCount();
  state.vocabStats.totalWords = Math.max(0, state.vocabStats.totalWords - 1);

  if (state.currentMode === 3) {
    loadMode3Word();
  } else {
    loadCurrentWord();
  }
}

// ============================================================
// KEYBOARD SHORTCUTS (IME-safe via e.code)
// ============================================================
document.addEventListener('keydown', e => {
  const page = activePage();
  if (page !== 'page-study' && page !== 'page-mode3') return;

  const mode = state.currentMode;
  const phase = state.phase;
  const code = e.code || '';
  const key = (e.key || '').toLowerCase();
  const isInput = document.activeElement && document.activeElement.tagName === 'INPUT';

  // --- 'answered' phase: any key advances to next word ---
  if (phase === 'answered') {
    e.preventDefault();
    state.currentIndex++;
    loadCurrentWord();
    return;
  }

  // --- Input field active: intercept auto-rating in Mode 1 ---
  if (isInput && mode === 1 && phase === 'question') {
    // Again (ギブアップ) : 1 または b または き または D または ( または （
    if (code === 'Digit1' || code === 'Numpad1' || key === 'b' || key === 'ｂ' || key === 'き' || code === 'KeyD' || key === '(' || key === '（') {
      e.preventDefault();
      showAnswerThenAdvance(0);
      return;
    }
    // Easy (強制スキップ) : 4 または - または せ または H または ) または ）
    if (code === 'Digit4' || code === 'Numpad4' || key === '-' || key === 'ー' || key === 'せ' || code === 'KeyH' || key === ')' || key === '）') {
      e.preventDefault();
      showAnswerThenAdvance(3);
      return;
    }
    return; // Other keys: let the input handle them
  }

  // --- Hidden input (mobile Mode 2): treat as normal keyboard ---
  if (isInput && document.activeElement.id === 'mobile-keyboard-input') {
    // Fall through to handle shortcuts normally below
  } else if (isInput) {
    return; // Unknown input, ignore
  }

  // Space toggles question <-> answer in Mode 2
  if (code === 'Space') {
    e.preventDefault();
    if (mode === 2 && phase === 'question') { showRatingPhase(false); return; }
    if (mode === 2 && phase === 'rating') { hideRatingPhase(); return; }
  }

  // Rating keys
  if (phase === 'rating' || mode === 3) {
    let grade = -1;
    let isWrong = false;

    if (mode === 3) {
      if (key === 'b' || key === 'ｂ' || key === 'き' || code === 'ArrowLeft' || code === 'KeyD') { grade = 0; isWrong = true; }
      else if (key === 'f' || key === 'ｆ' || key === 'す' || code === 'ArrowRight' || code === 'KeyG') grade = 2;
    } else {
      // 全モード共通の評価キー (b/c/f/- または き/く/す/せ) + PC用の(D/R/G/H)
      if (key === 'b' || key === 'ｂ' || key === 'き' || code === 'Digit1' || code === 'Numpad1' || code === 'KeyD') grade = 0;
      else if (key === 'c' || key === 'ｃ' || key === 'く' || code === 'Digit2' || code === 'Numpad2' || code === 'KeyR') grade = 1;
      else if (key === 'f' || key === 'ｆ' || key === 'す' || code === 'Digit3' || code === 'Numpad3' || code === 'KeyG') grade = 2;
      else if (key === '-' || key === 'ー' || key === 'せ' || code === 'Digit4' || code === 'Numpad4' || code === 'KeyH' || code === 'Minus') grade = 3;
    }

    if (grade !== -1) {
      e.preventDefault();
      handleRating(grade, isWrong);
    }
  }
});

// ===== TOUCH SWIPE for Mode 3 =====
let m3StartX = 0;
if (dom.m3TouchArea) {
  dom.m3TouchArea.addEventListener('touchstart', e => {
    m3StartX = e.changedTouches[0].clientX;
  }, { passive: true });

  dom.m3TouchArea.addEventListener('touchend', e => {
    if (activePage() !== 'page-mode3') return;
    const diff = e.changedTouches[0].clientX - m3StartX;
    if (diff > 60) handleRating(2);
    else if (diff < -60) handleRating(0, true);
  });
}

// ============================================================
// EVENT LISTENERS (DOMContentLoaded)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Settings
  if (dom.settingQFormat) {
      dom.settingQFormat.addEventListener('change', e => {
        state.qFormat = e.target.value;
        if (typeof saveUserSettings === 'function') saveUserSettings();
      });
  }
  if (dom.settingAudioSeq) {
      dom.settingAudioSeq.addEventListener('change', e => {
        state.audioSeq = e.target.value;
        if (typeof saveUserSettings === 'function') saveUserSettings();
      });
  }

  // Navigation
  if (dom.btnBack) {
      dom.btnBack.addEventListener('click', () => {
        if (activePage() === 'page-dashboard' || activePage() === 'page-settings') showPage('page-home');
      });
  }
  if (dom.btnSettings) dom.btnSettings.addEventListener('click', () => showPage('page-settings'));
  if (dom.btnDashboard) dom.btnDashboard.addEventListener('click', renderDashboard);
  if (dom.mistakeFilter) dom.mistakeFilter.addEventListener('change', renderMistakeTable);

  // Quit (no confirmation dialog — saves are already persisted)
  if (dom.btnQuit) {
      dom.btnQuit.addEventListener('click', () => {
        stopStudyTimer();
        clearMode3Timers();
        showPage('page-home');
        window.startSrsSession();
      });
  }

  // Reset progress
  if (dom.btnResetProgress) {
    dom.btnResetProgress.addEventListener('click', () => {
      customConfirm('本当にすべての学習進捗をリセットしますか？この操作は取り消せません。', async (confirmed) => {
        if (confirmed) {
          dom.btnResetProgress.disabled = true;
          dom.btnResetProgress.textContent = 'リセット中...';
          if (typeof resetAllProgress === 'function') await resetAllProgress();
          dom.btnResetProgress.disabled = false;
          dom.btnResetProgress.textContent = '学習進捗をすべてリセット';
          alert('進捗をリセットしました。');
          showPage('page-home');
          window.startSrsSession();
        }
      });
    });
  }

  // Mode start buttons
  if (dom.btnStartMode1) dom.btnStartMode1.addEventListener('click', () => initStudySession(1));
  if (dom.btnStartMode2) dom.btnStartMode2.addEventListener('click', () => initStudySession(2));
  if (dom.btnStartMode3) dom.btnStartMode3.addEventListener('click', () => initStudySession(3));

  // Done page
  if (dom.btnDoneHome) {
      dom.btnDoneHome.addEventListener('click', () => {
        showPage('page-home');
        window.startSrsSession();
      });
  }

  if (dom.btnStudyMore) {
      dom.btnStudyMore.addEventListener('click', () => {
        state.isInfiniteMode = true;
        const remainingReviews = state.allReview.slice(DAILY_REVIEW_LIMIT);
        const remainingNew = state.allNew.slice(DAILY_NEW_LIMIT);
        state.queue = [...remainingReviews.slice(0, 50), ...remainingNew.slice(0, 50)];

        if (state.queue.length === 0) {
          alert("全種類の単語をコンプリートしました！");
          return;
        }
        state.allReview = remainingReviews.slice(50);
        state.allNew = remainingNew.slice(50);
        initStudySession(state.currentMode);
      });
  }

  // Undo
  if (dom.btnUndo) dom.btnUndo.addEventListener('click', undoLastRating);

  // Rating buttons
  if (dom.btnRateAgain) dom.btnRateAgain.addEventListener('click', () => handleRating(0));
  if (dom.btnRateHard) dom.btnRateHard.addEventListener('click', () => handleRating(1));
  if (dom.btnRateGood) dom.btnRateGood.addEventListener('click', () => handleRating(2));
  if (dom.btnRateEasy) dom.btnRateEasy.addEventListener('click', () => handleRating(3));

  // Mode 3 buttons
  if (dom.btnM3Correct) dom.btnM3Correct.addEventListener('click', () => handleRating(2));
  if (dom.btnM3Wrong) dom.btnM3Wrong.addEventListener('click', () => handleRating(0, true));

  // Mode 2: Click card to toggle / Mode 1 answered: click to advance
  if (dom.unifiedCard) {
    dom.unifiedCard.addEventListener('click', () => {
      if (state.currentMode === 2) {
        // Focus hidden input to bring up mobile keyboard
        if (dom.mobileKbInput) dom.mobileKbInput.focus({ preventScroll: true });
        if (state.phase === 'question') showRatingPhase(false);
        else if (state.phase === 'rating') hideRatingPhase();
      }
      if (state.phase === 'answered') {
        state.currentIndex++;
        loadCurrentWord();
      }
    });
  }
});

// ============================================================
// スマホ（キーボード入力）用の判定（モード1 ＆ モード2 両対応）
// ============================================================
function checkMobileRating(val, inputElement) {
  if (!val) return;
  const lastChar = val[val.length - 1].toLowerCase();

  if (state.phase === 'rating') {
    let grade = -1;
    // b/き/d/1 対応
    if (lastChar === 'b' || lastChar === 'ｂ' || lastChar === 'き' || lastChar === 'd' || lastChar === 'ｄ' || lastChar === '1' || lastChar === '１') grade = 0;
    // c/く/r/2 対応
    else if (lastChar === 'c' || lastChar === 'ｃ' || lastChar === 'く' || lastChar === 'r' || lastChar === 'ｒ' || lastChar === '2' || lastChar === '２') grade = 1;
    // f/す/g/3 対応
    else if (lastChar === 'f' || lastChar === 'ｆ' || lastChar === 'す' || lastChar === 'g' || lastChar === 'ｇ' || lastChar === '3' || lastChar === '３') grade = 2;
    // -/せ/h/4 対応
    else if (lastChar === '-' || lastChar === 'ー' || lastChar === 'せ' || lastChar === 'h' || lastChar === 'ｈ' || lastChar === '4' || lastChar === '４') grade = 3;

    if (grade !== -1) {
      inputElement.value = ''; 
      handleRating(grade);
    }
  } 
  else if (state.phase === 'question' && state.currentMode === 2) {
    inputElement.value = '';
    showRatingPhase(false);
  }
  else if (state.phase === 'answered') {
    inputElement.value = '';
    state.currentIndex++;
    requestAnimationFrame(() => {
      loadCurrentWord();
    });
  }
  else if (state.phase === 'question' && state.currentMode === 1) {
    if (lastChar === '1' || lastChar === '１' || lastChar === 'b' || lastChar === 'ｂ' || lastChar === 'き' || lastChar === 'd' || lastChar === 'ｄ' || lastChar === '(' || lastChar === '（') {
      inputElement.value = val.slice(0, -1);
      showAnswerThenAdvance(0);
    }
    else if (lastChar === '4' || lastChar === '４' || lastChar === '-' || lastChar === 'ー' || lastChar === 'せ' || lastChar === 'h' || lastChar === 'ｈ' || lastChar === ')' || lastChar === '）') {
      inputElement.value = val.slice(0, -1);
      showAnswerThenAdvance(3);
    }
  }
}

if (dom.mobileKbInput) {
  dom.mobileKbInput.addEventListener('input', (e) => {
    checkMobileRating(e.target.value, e.target);
  });
}

if (dom.studyInput) {
  dom.studyInput.addEventListener('input', (e) => {
    checkMobileRating(e.target.value, e.target);
  });
}
