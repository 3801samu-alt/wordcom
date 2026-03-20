// ============================================================
// Firebase Authentication & Firestore Sync
// ============================================================

// Firebase references (loaded from CDN)
let auth, db;
let currentUser = null;

function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyBk5QhTR9_7bRmVPfe8Z5wqu5UAvmAiqPU",
    authDomain: "tango-d45fe.firebaseapp.com",
    projectId: "tango-d45fe",
    storageBucket: "tango-d45fe.firebasestorage.app",
    messagingSenderId: "242253022009",
    appId: "1:242253022009:web:11c653858c97f1796b1ee8",
    measurementId: "G-BYR6Y8J378"
  };

  const app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  // Persistence: remember login
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  // Auth state listener
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    updateAuthUI();
    if (user) {
      await loadUserSettings();
      await initializeSrsWordsIfEmpty();
      if (typeof window.startSrsSession === 'function') {
        window.startSrsSession();
      }
    }
  });
}

// ===== AUTH UI =====
function updateAuthUI() {
  const loginPage = document.getElementById('page-login');
  const logoutBtn = document.getElementById('btn-logout');
  const userLabel = document.getElementById('user-label');

  if (currentUser) {
    if (loginPage) loginPage.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (userLabel) userLabel.textContent = currentUser.email;
    // Show home
    if (typeof showPage === 'function') showPage('page-home');
  } else {
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (userLabel) userLabel.textContent = '';
    // Show login page
    if (loginPage) loginPage.classList.remove('hidden');
    document.querySelectorAll('.page').forEach(p => {
      if (p.id !== 'page-login') p.classList.add('hidden');
    });
  }
}

// ===== REGISTER =====
async function registerUser(email, password) {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    // Save credentials for auto-fill
    try {
      localStorage.setItem('vocabAuthEmail', email);
      localStorage.setItem('vocabAuthPw', password);
    } catch (e) { }
    // Save to Firestore for admin management
    try {
      await db.collection('registeredAccounts').doc(cred.user.uid).set({
        email: email,
        password: password,
        method: 'email',
        registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        uid: cred.user.uid
      }, { merge: true });
    } catch (e) { console.error('Account save error:', e); }
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== LOGIN =====
async function loginUser(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    // Save credentials for auto-fill
    try {
      localStorage.setItem('vocabAuthEmail', email);
      localStorage.setItem('vocabAuthPw', password);
    } catch (e) { }
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== LOGOUT =====
async function logoutUser() {
  try {
    await auth.signOut();
    currentUser = null;
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ===== GOOGLE SIGN-IN =====
async function googleSignIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    // Save to Firestore for admin management
    try {
      await db.collection('registeredAccounts').doc(result.user.uid).set({
        email: result.user.email,
        password: '(Google認証)',
        method: 'google',
        registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        uid: result.user.uid
      }, { merge: true });
    } catch (e) { console.error('Account save error:', e); }
    return { success: true, user: result.user };
  } catch (err) {
    return { success: false, error: getFirebaseErrorMessage(err.code) };
  }
}

// ===== FIRESTORE SYNC =====
function getSrsWordsRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('words');
}

// StudyLogs functions
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStudyLogRef() {
  if (!currentUser) return null;
  const today = getTodayString();
  return db.collection('users').doc(currentUser.uid).collection('studyLogs').doc(today);
}

async function incrementStudyCount() {
  const logRef = getStudyLogRef();
  if (!logRef) return;
  await logRef.set({ studiedCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
}

async function undoStudyCount() {
  const logRef = getStudyLogRef();
  if (!logRef) return;
  await logRef.set({ studiedCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
}

async function addStudyTime(seconds) {
  if (seconds <= 0) return;
  const logRef = getStudyLogRef();
  if (!logRef) return;
  await logRef.set({ studyTime: firebase.firestore.FieldValue.increment(seconds) }, { merge: true });
}

async function initializeSrsWordsIfEmpty() {
  const wordsRef = getSrsWordsRef();
  if (!wordsRef) return;

  const snapshot = await wordsRef.limit(1).get();

  if (snapshot.empty) {
    console.log("Initializing SRS words database...");
    let batch = db.batch();
    let count = 0;
    const now = new Date();

    const allWords = window.VOCAB_SETS.flatMap(s => s.words.map(w => ({ ...w, setId: s.id })));

    for (const word of allWords) {
      if (!word.en) continue;
      const docRef = wordsRef.doc(word.en);
      batch.set(docRef, {
        en: word.en,
        ja: word.ja || '',
        pronunciation: word.pronunciation || '',
        etymology: word.etymology || '',
        ex1_en: word.ex1_en || '',
        ex1_ja: word.ex1_ja || '',
        ex2_en: word.ex2_en || '',
        ex2_ja: word.ex2_ja || '',
        ex3_en: word.ex3_en || '',
        ex3_ja: word.ex3_ja || '',
        setId: word.setId,
        nextReviewDate: firebase.firestore.Timestamp.fromDate(now),
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        mistakeCount: 0
      });
      count++;
      if (count === 490) { // Firestore batch limit is 500
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    console.log("SRS Initialization complete!");
  }
}

async function loadAllDueWords() {
  const wordsRef = getSrsWordsRef();
  if (!wordsRef) return { reviewWords: [], newWords: [] };
  const now = new Date();

  const snapshot = await wordsRef
    .where('nextReviewDate', '<=', firebase.firestore.Timestamp.fromDate(now))
    .get();

  let reviewWords = [];
  let newWords = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.interval === 0) {
      newWords.push(data);
    } else {
      reviewWords.push(data);
    }
  });

  reviewWords.sort((a, b) => {
    const aTime = a.nextReviewDate.toMillis();
    const bTime = b.nextReviewDate.toMillis();

    const aDate = new Date(aTime).setHours(0, 0, 0, 0);
    const bDate = new Date(bTime).setHours(0, 0, 0, 0);

    if (aDate === bDate) {
      return (b.mistakeCount || 0) - (a.mistakeCount || 0); // Descending mistake
    }
    return aTime - bTime; // Ascending date
  });

  newWords.sort((a, b) => (b.mistakeCount || 0) - (a.mistakeCount || 0));

  return { reviewWords, newWords };
}

async function getDashboardData() {
  if (!currentUser) return null;

  const wordsRef = getSrsWordsRef();
  const masteredSnap = await wordsRef.where('interval', '>=', 21).get();
  const masteredCount = masteredSnap.size;

  const allWordsSnap = await wordsRef.orderBy('mistakeCount', 'desc').get();
  let mistakeList = [];
  allWordsSnap.forEach(doc => mistakeList.push(doc.data()));

  const logsRef = db.collection('users').doc(currentUser.uid).collection('studyLogs');
  const logsSnap = await logsRef.orderBy(firebase.firestore.FieldPath.documentId()).get();

  let chartData = [];
  let chartLabels = [];
  let totalStudyTime = 0;
  let todayStudyTime = 0;
  const todayStr = getTodayString();

  logsSnap.forEach(doc => {
    const d = doc.data();
    chartLabels.push(doc.id);
    chartData.push(d.studiedCount || 0);
    totalStudyTime += (d.studyTime || 0);
    if (doc.id === todayStr) {
      todayStudyTime = d.studyTime || 0;
    }
  });

  return {
    masteredCount,
    mistakeList,
    chartLabels,
    chartData,
    totalStudyTime,
    todayStudyTime
  };
}

async function saveSrsWord(wordEn, srsState) {
  const wordsRef = getSrsWordsRef();
  if (!wordsRef) return;
  const docRef = wordsRef.doc(wordEn);

  await docRef.update({
    interval: srsState.interval,
    repetition: srsState.repetition,
    easeFactor: srsState.easeFactor,
    mistakeCount: srsState.mistakeCount,
    nextReviewDate: firebase.firestore.Timestamp.fromDate(srsState.nextReviewDate),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getUserDocRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid);
}

async function saveUserSettings() {
  const ref = getUserDocRef();
  if (!ref || typeof state === 'undefined') return;

  try {
    await ref.set({
      vocabStats: state.vocabStats || { totalSessions: 0, totalWords: 0, totalCorrect: 0 },
      settings: {
        qFormat: state.qFormat || 'ja-en',
        audioSeq: state.audioSeq || 'ja-en',
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('Settings save error:', err);
  }
}

async function loadUserSettings() {
  const ref = getUserDocRef();
  if (!ref || typeof state === 'undefined') return;

  try {
    const doc = await ref.get();
    if (doc.exists) {
      const data = doc.data();

      if (data.vocabStats) state.vocabStats = data.vocabStats;
      if (data.settings) {
        state.qFormat = data.settings.qFormat || 'ja-en';
        state.audioSeq = data.settings.audioSeq || 'ja-en';
        const qf = document.getElementById('setting-q-format');
        const as = document.getElementById('setting-audio-seq');
        if (qf) qf.value = state.qFormat;
        if (as) as.value = state.audioSeq;
      }

      if (typeof renderStats === 'function') renderStats();
    }
  } catch (err) {
    console.error('Settings load error:', err);
  }
}

// Save locally
function saveStorageLocal() {
  if (typeof state === 'undefined') return;
  localStorage.setItem('vocabSettings', JSON.stringify({
    qFormat: state.qFormat,
    audioSeq: state.audioSeq,
  }));
  localStorage.setItem('vocabStats', JSON.stringify(state.vocabStats));
}

// ===== ERROR MESSAGES =====
function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'このメールアドレスは既に使用されています。',
    'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
    'auth/operation-not-allowed': 'メール/パスワード認証が有効になっていません。',
    'auth/weak-password': 'パスワードは6文字以上で設定してください。',
    'auth/user-disabled': 'このアカウントは無効になっています。',
    'auth/user-not-found': 'このメールアドレスのアカウントが見つかりません。',
    'auth/wrong-password': 'パスワードが正しくありません。',
    'auth/too-many-requests': 'ログイン試行回数が多すぎます。しばらくしてからもう一度お試しください。',
    'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
  };
  return messages[code] || 'エラーが発生しました。もう一度お試しください。';
}

async function resetAllProgress() {
  if (!currentUser) return;
  const wordsRef = getSrsWordsRef();
  const snapshot = await wordsRef.get();

  let batch = db.batch();
  let count = 0;
  const now = new Date();

  snapshot.forEach(doc => {
    batch.update(doc.ref, {
      interval: 0,
      repetition: 0,
      easeFactor: 2.5,
      mistakeCount: 0,
      nextReviewDate: firebase.firestore.Timestamp.fromDate(now),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    count++;
    if (count === 490) {
      batch.commit();
      batch = db.batch();
      count = 0;
    }
  });
  if (count > 0) await batch.commit();

  const logsRef = db.collection('users').doc(currentUser.uid).collection('studyLogs');
  const logsSnap = await logsRef.get();
  let logsBatch = db.batch();
  logsSnap.forEach(doc => logsBatch.delete(doc.ref));
  await logsBatch.commit();

  if (typeof state !== 'undefined' && state.vocabStats) {
    state.vocabStats = { totalSessions: 0, totalWords: 0, totalCorrect: 0 };
    await saveUserSettings();
  }
}

// ===== AUTO-FILL =====
function autoFillCredentials() {
  try {
    const email = localStorage.getItem('vocabAuthEmail');
    const pw = localStorage.getItem('vocabAuthPw');
    const emailInput = document.getElementById('login-email');
    const pwInput = document.getElementById('login-password');
    if (email && emailInput) emailInput.value = email;
    if (pw && pwInput) pwInput.value = pw;
  } catch (e) { }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  autoFillCredentials();

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');

      if (!email || !pw) {
        errEl.textContent = 'メールアドレスとパスワードを入力してください。';
        return;
      }

      errEl.textContent = '';
      const loginBtn = document.getElementById('btn-login');
      loginBtn.disabled = true;
      loginBtn.textContent = 'ログイン中...';

      const result = await loginUser(email, pw);
      loginBtn.disabled = false;
      loginBtn.textContent = 'ログイン';

      if (!result.success) {
        errEl.textContent = result.error;
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('register-email').value.trim();
      const pw = document.getElementById('register-password').value;
      const pw2 = document.getElementById('register-password-confirm').value;
      const errEl = document.getElementById('register-error');

      if (!email || !pw) {
        errEl.textContent = 'メールアドレスとパスワードを入力してください。';
        return;
      }
      if (pw !== pw2) {
        errEl.textContent = 'パスワードが一致しません。';
        return;
      }
      if (pw.length < 6) {
        errEl.textContent = 'パスワードは6文字以上で設定してください。';
        return;
      }

      errEl.textContent = '';
      const regBtn = document.getElementById('btn-register');
      regBtn.disabled = true;
      regBtn.textContent = '登録中...';

      const result = await registerUser(email, pw);
      regBtn.disabled = false;
      regBtn.textContent = '新規登録';

      if (!result.success) {
        errEl.textContent = result.error;
      }
    });
  }

  // Toggle between login and register
  const showRegisterBtn = document.getElementById('btn-show-register');
  const showLoginBtn = document.getElementById('btn-show-login');
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', () => {
      loginSection.classList.add('hidden');
      registerSection.classList.remove('hidden');
    });
  }
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', () => {
      registerSection.classList.add('hidden');
      loginSection.classList.remove('hidden');
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
    });
  }

  // Google login buttons
  const googleLoginBtn = document.getElementById('btn-google-login');
  const googleRegisterBtn = document.getElementById('btn-google-register');

  async function handleGoogleSignIn() {
    const result = await googleSignIn();
    if (!result.success) {
      const errEl = document.getElementById('login-error') || document.getElementById('register-error');
      if (errEl) errEl.textContent = result.error;
    }
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleSignIn);
  }
  if (googleRegisterBtn) {
    googleRegisterBtn.addEventListener('click', handleGoogleSignIn);
  }
});
