// ── auth.js — Firebase Authentication ─────────────────
// Handles sign-up, login, logout, and auth state changes.
// Stores user profile (name + WhatsApp) in Firestore users/{uid}.
// Sets window.currentUser = { uid, name, email, phone } or null.

window.currentUser = null;

// auth is declared in firebase.js

// ── Splash screen helpers ─────────────────────────────
function setSplashStatus(msg) {
  const el = document.getElementById('splashStatus');
  if (el) el.textContent = msg;
}

let splashDismissed = false;
function hideSplash() {
  if (splashDismissed) return;
  splashDismissed = true;
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 600);
  }, 400);
}

// Safety net — dismiss splash after 8s no matter what
setTimeout(() => {
  setSplashStatus('Taking longer than usual…');
  hideSplash();
}, 8000);

// ── Auth state observer ───────────────────────────────
// Fires immediately on load (cached session) and on every change.
auth.onAuthStateChanged(async (user) => {
  if (user) {
    setSplashStatus('Loading your profile…');
    // Fetch extended profile from Firestore
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const profile = snap.exists ? snap.data() : {};

      window.currentUser = {
        uid:      user.uid,
        name:     profile.name  || user.displayName || 'User',
        email:    user.email,
        phone:    profile.phone || '',
        photoURL: profile.photoURL || null
      };
    } catch (e) {
      // Offline fallback — use whatever Firebase Auth cached
      window.currentUser = {
        uid:      user.uid,
        name:     user.displayName || 'User',
        email:    user.email,
        phone:    '',
        photoURL: null
      };
    }

    setSplashStatus(`Welcome back, ${window.currentUser.name.split(' ')[0]}!`);
    onUserLoggedIn(window.currentUser);
    if (typeof window.loadItems === 'function') window.loadItems();
    hideSplash();

  } else {
    window.currentUser = null;
    setSplashStatus('Ready');
    onUserLoggedOut();
    if (typeof window.loadItems === 'function') window.loadItems();
    hideSplash();
  }
});

// ── Called when a user is confirmed logged in ─────────
function onUserLoggedIn(user) {
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Header avatar — show photo or initials
  const btn = document.getElementById('userAvatarBtn');
  if (btn) {
    if (user.photoURL) {
      btn.style.backgroundImage = `url('${user.photoURL}')`;
      btn.style.backgroundSize  = 'cover';
      btn.style.backgroundPosition = 'center';
      btn.textContent = '';
    } else {
      btn.style.backgroundImage = '';
      btn.textContent = initials;
    }
    btn.classList.add('logged-in');
    btn.title = user.name;
  }

  // Show logout in dropdown, hide login prompt
  const menuLogout = document.getElementById('menuLogout');
  if (menuLogout) menuLogout.classList.remove('hidden');

  // Close auth modal if open
  document.getElementById('authModal').classList.add('hidden');
  document.body.style.overflow = '';

  // Show guide modal on very first login (one-time)
  const seenGuide = localStorage.getItem('unimart_guide_seen');
  if (!seenGuide) {
    document.getElementById('guideModal').classList.remove('hidden');
    localStorage.setItem('unimart_guide_seen', '1');
  }
}

// ── Called when logged out ────────────────────────────
function onUserLoggedOut() {
  const btn = document.getElementById('userAvatarBtn');
  if (btn) {
    btn.innerHTML = '<i data-feather="user"></i>';
    btn.classList.remove('logged-in');
    btn.title = 'Log in';
    feather.replace();
  }

  const menuLogout = document.getElementById('menuLogout');
  if (menuLogout) menuLogout.classList.add('hidden');

  const seenGuide = localStorage.getItem('unimart_guide_seen');
  if (!seenGuide) {
    document.getElementById('guideModal').classList.remove('hidden');
    localStorage.setItem('unimart_guide_seen', '1');
  }
}

// ── Sign Up ───────────────────────────────────────────
async function handleSignup() {
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const phone    = document.getElementById('signupPhone').value.trim();
  const errEl    = document.getElementById('signupError');

  if (!name || !email || !password || !phone) {
    return showAuthError(errEl, 'Please fill in all fields including your WhatsApp number.');
  }
  if (password.length < 6) {
    return showAuthError(errEl, 'Password must be at least 6 characters.');
  }
  // Validate phone — must be digits only, 10-15 chars (handles 08012345678 and 2348012345678)
  if (!/^\d{10,15}$/.test(phone)) {
    return showAuthError(errEl, 'Enter a valid WhatsApp number (digits only, e.g. 08012345678 or 2348012345678).');
  }

  const btn = document.getElementById('signupBtn');
  btn.textContent = 'Creating account…';
  btn.disabled    = true;
  errEl.classList.add('hidden');

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    // Update Firebase Auth display name
    await cred.user.updateProfile({ displayName: name });

    // Save full profile to Firestore — credits: 10 free on signup
    await db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      phone,
      credits:   10,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Auth state observer will handle the rest

  } catch (err) {
    showAuthError(errEl, friendlyAuthError(err.code));
  } finally {
    btn.textContent = 'Create Account';
    btn.disabled    = false;
  }
}

// ── Log In ────────────────────────────────────────────
async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');

  if (!email || !password) {
    return showAuthError(errEl, 'Please enter your email and password.');
  }

  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Logging in…';
  btn.disabled    = true;
  errEl.classList.add('hidden');

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // Auth state observer handles the rest
  } catch (err) {
    showAuthError(errEl, friendlyAuthError(err.code));
  } finally {
    btn.textContent = 'Log In';
    btn.disabled    = false;
  }
}

// ── Log Out ───────────────────────────────────────────
async function handleLogout() {
  await auth.signOut();
  // sidebar is closed by ui.js before calling handleLogout
}

// ── Auth modal helpers ────────────────────────────────
function showAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
  // Clear fields & errors
  ['loginEmail','loginPassword','signupName','signupEmail','signupPassword','signupPhone']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  ['loginError','signupError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
  });
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
  document.getElementById('panelLogin').classList.toggle('hidden', !isLogin);
  document.getElementById('panelSignup').classList.toggle('hidden', isLogin);
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':   'This email is already registered.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/weak-password':          'Password is too weak.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Try again.',
    'auth/invalid-credential':     'Incorrect email or password. Try again.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'No internet connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── Wire up auth form buttons ─────────────────────────
// All other button handlers (dropdown, nav, profile) live in ui.js
document.addEventListener('DOMContentLoaded', () => {

  // Tab switching
  document.getElementById('tabLogin').addEventListener('click',  () => switchAuthTab('login'));
  document.getElementById('tabSignup').addEventListener('click', () => switchAuthTab('signup'));

  // Submit buttons
  document.getElementById('loginBtn').addEventListener('click',  handleLogin);
  document.getElementById('signupBtn').addEventListener('click', handleSignup);

  // Enter key support
  document.getElementById('panelLogin').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('panelSignup').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignup();
  });

  // Guest close
  document.getElementById('authClose').addEventListener('click', () => {
    document.getElementById('authModal').classList.add('hidden');
    document.body.style.overflow = '';
  });

  // Expose for ui.js
  window.showAuthModal  = showAuthModal;
  window.handleLogout   = handleLogout;
});
