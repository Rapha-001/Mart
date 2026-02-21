// ── app.js — Shared state & service worker ────────────
// Load this before marketplace.js and ui.js.

let activeCategory   = 'all';
let activePriceRange = 'all';
let activeSort       = 'newest';
let searchQuery      = '';
let myListingsUid    = null; // set when user taps "My Listings", filters by sellerUid

// ── Service Worker ────────────────────────────────────
// Only register on production (HTTPS) — SW cannot run reliably
// on local dev servers over HTTP
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg  => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW failed:', err));
  });
}
