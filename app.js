// ── app.js — Shared state & service worker ────────────
// Load this before marketplace.js and ui.js.

let activeCategory   = 'all';
let activePriceRange = 'all';
let activeSort       = 'newest';
let searchQuery      = '';
let myListingsUid    = null;
let activeLocation   = 'all'; // location filter: 'all' | 'main' | 'annex' | 'town'

// Global item cache so inbox.js can find item data without re-querying
window.itemCache = {};

// Global favorites set — populated after login by inbox.js
window.userFavorites = new Set();

// ── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => {
        console.log('SW registered:', reg.scope);
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            });
          }
        });
      })
      .catch(err => console.warn('SW failed:', err));
  });
}

function updateConnectionUi() {
  document.body.classList.toggle('is-offline', !navigator.onLine);
  document.dispatchEvent(new CustomEvent(navigator.onLine ? 'appOnline' : 'appOffline'));
}

window.addEventListener('online', updateConnectionUi);
window.addEventListener('offline', updateConnectionUi);
window.addEventListener('load', updateConnectionUi);

updateConnectionUi();
