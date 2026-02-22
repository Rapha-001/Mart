// ── marketplace.js — Firestore operations & card rendering ──
// Reads global state from app.js.
// Calls window.openOverlay(item, id) defined in ui.js.

const catEmoji = {
  food: '🍔', books: '📚', electronics: '📱', clothing: '👗',
  beauty: '💄', stationery: '✏️', housing: '🏠', services: '🛠️', other: '📦'
};

// ── Rating cache — avoids re-fetching on every render ──
const ratingCache = {};

async function fetchItemRating(itemId) {
  if (ratingCache[itemId] !== undefined) return ratingCache[itemId];
  try {
    const snap = await db.collection('reviews').doc(itemId)
      .collection('userReviews').get();
    if (snap.empty) { ratingCache[itemId] = null; return null; }
    let total = 0;
    snap.forEach(d => { total += d.data().rating || 0; });
    const avg = total / snap.size;
    ratingCache[itemId] = { avg, count: snap.size };
    return ratingCache[itemId];
  } catch (e) {
    return null;
  }
}
function addItem(data) {
  return db.collection('items').add(data);
}

function deleteItem(id) {
  if (!confirm('Remove this listing?')) return;
  db.collection('items').doc(id).delete();
}

function likeItem(id, currentLikes) {
  db.collection('items').doc(id).update({ likes: currentLikes + 1 });
}

function addView(id, currentViews) {
  const storageKey = 'unimart_viewed';
  let viewed = [];
  try {
    viewed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(viewed)) viewed = [];
  } catch (e) {
    viewed = [];
  }

  if (window.currentUser) {
    const viewKey = `${window.currentUser.uid}_${id}`;
    if (viewed.includes(viewKey)) return;
    viewed.push(viewKey);
    if (viewed.length > 200) viewed.splice(0, viewed.length - 200);
    try { localStorage.setItem(storageKey, JSON.stringify(viewed)); } catch(e) {}
  } else {
    if (viewed.includes(id)) return;
    viewed.push(id);
    if (viewed.length > 200) viewed.splice(0, viewed.length - 200);
    try { localStorage.setItem(storageKey, JSON.stringify(viewed)); } catch(e) {}
  }

  // Use atomic increment — prevents race condition when multiple users view simultaneously
  db.collection('items').doc(id).update({
    views: firebase.firestore.FieldValue.increment(1)
  });
}

// ── Collage builder ───────────────────────────────────
function buildCollage(urls) {
  const imgs  = urls || [];
  const count = imgs.length;

  if (count === 0) {
    return `<div class="collage collage-placeholder"><i data-feather="image"></i></div>`;
  }
  if (count === 1) {
    return `<div class="collage collage-1">
              <div class="col-img" style="background-image:url('${imgs[0]}')"></div>
            </div>`;
  }
  if (count === 2) {
    return `<div class="collage collage-2">
              <div class="col-img" style="background-image:url('${imgs[0]}')"></div>
              <div class="col-img" style="background-image:url('${imgs[1]}')"></div>
            </div>`;
  }
  if (count === 3) {
    return `<div class="collage collage-3">
              <div class="col-img col-big" style="background-image:url('${imgs[0]}')"></div>
              <div class="col-stack">
                <div class="col-img" style="background-image:url('${imgs[1]}')"></div>
                <div class="col-img" style="background-image:url('${imgs[2]}')"></div>
              </div>
            </div>`;
  }
  const extra = count - 4;
  return `<div class="collage collage-4">
            <div class="col-img" style="background-image:url('${imgs[0]}')"></div>
            <div class="col-img" style="background-image:url('${imgs[1]}')"></div>
            <div class="col-img" style="background-image:url('${imgs[2]}')"></div>
            <div class="col-img col-last" style="background-image:url('${imgs[3]}')">
              ${extra > 0 ? `<span class="col-extra">+${extra}</span>` : ''}
            </div>
          </div>`;
}

// ── Filter + sort helper ──────────────────────────────
function applyFilters(docs) {
  let items = [...docs];

  // My Listings mode — filter by exact uid, not name
  if (myListingsUid) {
    items = items.filter(({ data: d }) => d.sellerUid === myListingsUid);
    return items; // skip other filters when viewing own listings
  }

  if (searchQuery) {
    const q = searchQuery;
    items = items.filter(({ data: d }) =>
      (d.title       || '').toLowerCase().includes(q) ||
      (d.seller      || '').toLowerCase().includes(q) ||
      (d.category    || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q)
    );
  }

  if (activeCategory !== 'all') {
    items = items.filter(({ data: d }) => d.category === activeCategory);
  }

  if (activePriceRange !== 'all') {
    items = items.filter(({ data: d }) => {
      const p = Number(d.price);
      if (activePriceRange === '0-1000')     return p < 1000;
      if (activePriceRange === '1000-5000')  return p >= 1000 && p <= 5000;
      if (activePriceRange === '5000-20000') return p > 5000  && p <= 20000;
      if (activePriceRange === '20000+')     return p > 20000;
      return true;
    });
  }

  if (activeSort === 'price-asc')  items.sort((a, b) => a.data.price - b.data.price);
  if (activeSort === 'price-desc') items.sort((a, b) => b.data.price - a.data.price);

  return items;
}

// ── Main Firestore listener ───────────────────────────
let unsubscribeItems = null; // keep reference to detach if needed

function loadItems() {
  const marketplace    = document.getElementById('marketplace');
  const loadingState   = document.getElementById('loadingState');
  const emptyState     = document.getElementById('emptyState');
  const noResultsState = document.getElementById('noResultsState');
  const resultsCount   = document.getElementById('resultsCount');

  // Show skeleton while waiting for first snapshot
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  noResultsState.classList.add('hidden');
  marketplace.innerHTML = '';

  // Detach any previous listener
  if (unsubscribeItems) unsubscribeItems();

  unsubscribeItems = db.collection('items')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {

      // Hide skeleton after first response
      loadingState.classList.add('hidden');

      // Build flat array
      const allDocs = [];
      snapshot.forEach(doc => allDocs.push({ id: doc.id, data: doc.data() }));

      const filtered = applyFilters(allDocs);

      // Results count
      resultsCount.textContent = filtered.length === allDocs.length
        ? `${allDocs.length} item${allDocs.length !== 1 ? 's' : ''}`
        : `${filtered.length} of ${allDocs.length} items`;

      // Clear grid
      marketplace.innerHTML = '';

      // ── Empty state: nothing in DB at all ────────────
      if (allDocs.length === 0) {
        emptyState.classList.remove('hidden');
        noResultsState.classList.add('hidden');
        resultsCount.textContent = '';
        feather.replace();
        return;
      }

      emptyState.classList.add('hidden');

      // ── No results: items exist but filters hide them ─
      if (filtered.length === 0) {
        noResultsState.classList.remove('hidden');
        feather.replace();
        return;
      }

      noResultsState.classList.add('hidden');

      // ── Render cards ──────────────────────────────────
      filtered.forEach(({ id, data: item }, idx) => {
        const isNew = item.createdAt &&
          typeof item.createdAt.toDate === 'function' &&
          (Date.now() - item.createdAt.toDate()) < 86400000;
        const isOwner  = window.currentUser && window.currentUser.uid === item.sellerUid;

        const card = document.createElement('div');
        card.className = 'item-card';
        card.style.animationDelay = `${idx * 0.05}s`;

        const conditionLabel = { 'new': '✨ New', 'fairly-used': '👍 Fairly Used', 'used': '📦 Used' };
        const locationLabel  = { 'main': '🏛️ Main', 'annex': '🏫 Annex', 'town': '🏙️ Town' };

        card.innerHTML = `
          ${item.sold ? '<div class="card-sold-overlay">SOLD</div>' : ''}
          ${buildCollage(item.imageUrls)}
          <div class="card-info">
            <div class="card-top-row">
              <span class="card-badge">${catEmoji[item.category] || '📦'} ${item.category}</span>
              ${isNew        ? '<span class="card-new">NEW</span>'  : ''}
              ${item.boosted ? '<span class="card-boost">⚡</span>' : ''}
              ${isOwner      ? '<span class="card-mine">Mine</span>' : ''}
              ${item.sold    ? '<span class="card-sold-badge">SOLD</span>' : ''}
            </div>
            <h3>${item.title}</h3>
            <p class="card-price ${item.sold ? 'card-price-sold' : ''}">₦${Number(item.price).toLocaleString()}</p>
            <p class="card-seller"><i data-feather="user"></i> ${item.seller || 'Unknown'}</p>
            ${item.condition ? `<span class="card-condition">${conditionLabel[item.condition] || item.condition}</span>` : ''}
            ${item.location  ? `<span class="card-location"><i data-feather="map-pin"></i> ${locationLabel[item.location] || item.location}</span>` : ''}
            <div class="card-rating-row" id="rating-${id}"></div>
            <div class="card-stats">
              <span><i data-feather="eye"></i> ${item.views || 0}</span>
              <span><i data-feather="heart"></i> ${item.likes || 0}</span>
              ${isOwner ? `
                <button class="card-sold-btn ${item.sold ? 'is-sold' : ''}" data-id="${id}" data-sold="${!!item.sold}" title="${item.sold ? 'Mark Available' : 'Mark Sold'}">
                  <i data-feather="${item.sold ? 'refresh-ccw' : 'check-circle'}"></i>
                </button>
                <button class="card-delete-btn" data-id="${id}">
                  <i data-feather="trash-2"></i>
                </button>` : ''}
            </div>
          </div>
        `;

        // Async populate rating
        fetchItemRating(id).then(rating => {
          const ratingEl = document.getElementById(`rating-${id}`);
          if (!ratingEl) return;
          if (rating) {
            const stars = '★'.repeat(Math.round(rating.avg)) + '☆'.repeat(5 - Math.round(rating.avg));
            ratingEl.innerHTML = `
              <span class="card-rating">
                ${stars} <span style="color:#6b7280;font-weight:500">(${rating.count})</span>
              </span>`;
          }
        });

        // Sold toggle — owner only
        if (isOwner) {
          const soldBtn = card.querySelector('.card-sold-btn');
          if (soldBtn) {
            soldBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const newSold = soldBtn.dataset.sold !== 'true';
              db.collection('items').doc(id).update({ sold: newSold });
            });
          }
        }

        // Delete — owner only
        if (isOwner) {
          card.querySelector('.card-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(id);
          });
        }

        // Tap card → open overlay + increment views (skip if owner)
        card.addEventListener('click', () => {
          if (!isOwner) addView(id, item.views || 0);
          if (window.openOverlay) window.openOverlay(item, id);
        });

        marketplace.appendChild(card);
      });

      feather.replace();

    }, err => {
      // Firestore error (e.g. offline, rules)
      console.error('Firestore error:', err);
      loadingState.classList.add('hidden');
      emptyState.classList.remove('hidden');
      feather.replace();
    });
}

// Expose globally so auth.js and ui.js can safely call it
// regardless of script load order
window.loadItems = loadItems;
