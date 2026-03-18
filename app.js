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
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg  => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW failed:', err));
  });
}
