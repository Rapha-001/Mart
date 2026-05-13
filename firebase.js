// firebase.js

// Make sure you have the Firebase Messaging SDK included in your HTML
// e.g., <script src="https://www.gstatic.com/firebasejs/8.x.x/firebase-messaging.js"></script>
// or if using modules, ensure 'firebase/messaging' is imported at the top of this file.

const firebaseConfig = {
  apiKey: "AIzaSyCn3zA6AuF4K25gAPPopl1rN3zglw6V9mQ",
  authDomain: "mart-b581e.firebaseapp.com",
  projectId: "mart-b581e",
  storageBucket: "mart-b581e.firebasestorage.app",
  messagingSenderId: "227151575294",
  appId: "1:227151575294:web:c4162c3d05dbac5a264daf"
};

let app; // Declare a variable to hold the initialized app
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app(); // Get the default app if already initialized
}

var db   = firebase.firestore();
var auth = firebase.auth();

// === ADD THIS LINE FOR FIREBASE CLOUD MESSAGING ===
var messaging = firebase.messaging(); // Initialize Firebase Cloud Messaging service

// Optional: Request permission for notifications and get token
// This part typically goes where you want to prompt the user for notifications.
// It's not usually placed directly in firebase.js, but rather in your main app logic.
/*
messaging.requestPermission().then(function() {
  console.log('Notification permission granted.');
  return messaging.getToken();
}).then(function(token) {
  console.log('FCM registration token:', token);
  // Send the token to your server to send messages to this device
}).catch(function(err) {
  console.log('Unable to get permission to notify.', err);
});
*/

// ── Enable Firestore offline cache ────────────────────
// Items load from cache instantly on repeat visits
// while fresh data loads in background
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  // Fails silently in private browsing — not critical
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence: browser not supported');
  }
});

// ── Signal app ready immediately ──────────────────────
// Auth starts RIGHT AWAY — don't block it on maintenance check.
// Maintenance check runs in parallel and overlays if needed.
window._appReady = true;
document.dispatchEvent(new Event('appReady'));

// ── Maintenance check — runs in parallel ──────────────
// Short 3s timeout — if slow network, skip and let app load.
// To turn ON:  Firestore → config → maintenance → active: true
// To turn OFF: set active: false
(async function checkMaintenance() {
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([
      db.collection('config').doc('maintenance').get(),
      timeout
    ]);
    if (snap.exists && snap.data().active === true) {
      const msg = snap.data().message || "We're making improvements. Check back soon.";
      showMaintenancePage(msg);
    }
  } catch(e) {
    // Timeout or network error — proceed normally
  }
})();

function showMaintenancePage(message) {
  // Hide everything and show maintenance screen
  document.querySelectorAll('body > *:not(#maintenanceScreen)').forEach(el => {
    el.style.display = 'none';
  });
  let el = document.getElementById('maintenanceScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'maintenanceScreen';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="maintenance-content">' +
      '<div class="maintenance-icon">🔧</div>' +
      '<h1 class="maintenance-title"><span class="uni">Uni</span><span class="mart">Mart</span></h1>' +
      '<p class="maintenance-heading">Under Maintenance</p>' +
      '<p class="maintenance-msg">' + message + '</p>' +
      '<p class="maintenance-footer">We\'ll be back shortly 🎓</p>' +
    '</div>';
  el.style.display = 'flex';
}
