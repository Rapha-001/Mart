// ── ui.js — UI interactions ────────────────────────────
// Depends on: app.js, marketplace.js, auth.js, cloudinary.js, firebase.js

document.addEventListener('DOMContentLoaded', () => {

  // ── Elements ────────────────────────────────────────
  const addItemForm     = document.getElementById('addItemForm');
  const cancelItemBtn   = document.getElementById('cancelItem');
  const submitItemBtn   = document.getElementById('submitItem');
  const imgInput        = document.getElementById('itemImages');
  const imgPreviewRow   = document.getElementById('imgPreviewRow');
  const searchInput     = document.getElementById('searchInput');
  const searchBtn       = document.getElementById('searchBtn');
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const filterPanel     = document.getElementById('filterPanel');
  const filterBadge     = document.getElementById('filterBadge');
  const activeFiltersBar= document.getElementById('activeFilters');
  const activeFilterText= document.getElementById('activeFilterText');
  const clearFiltersBtn = document.getElementById('clearFilters');
  const sidebar        = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const itemOverlay     = document.getElementById('itemOverlay');
  const overlayClose    = document.getElementById('overlayClose');

  let pendingFiles = [];

  // ── Reset form to clean state ─────────────────────────
  function resetAddForm() {
    document.getElementById('itemName').value      = '';
    document.getElementById('itemPrice').value     = '';
    document.getElementById('itemCategory').value  = '';
    document.getElementById('itemCondition').value = '';
    document.getElementById('itemLocation').value  = '';
    document.getElementById('itemDesc').value      = '';
    imgPreviewRow.innerHTML = '';
    pendingFiles   = [];
    imgInput.value = '';
    submitItemBtn.textContent = 'Post Item';
    submitItemBtn.disabled    = false;
  }

  // ── Open add-item form (auth-gated) ──────────────────
  function openAddForm() {
    if (!window.currentUser) {
      if (window.showAuthModal) window.showAuthModal('login');
      return;
    }

    // Always reset before showing — prevents stale content on reopen
    resetAddForm();

    // Auto-fill seller info banner from logged-in profile
    const user     = window.currentUser;
    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('bannerAvatar').textContent = initials;
    document.getElementById('bannerName').textContent   = user.name;
    document.getElementById('bannerPhone').textContent  = user.phone ? `+${user.phone}` : 'No phone set';

    feather.replace();
    addItemForm.classList.remove('hidden');
  }

  // ── Image preview ─────────────────────────────────────
  imgInput.addEventListener('change', () => {
    pendingFiles = Array.from(imgInput.files).slice(0, 4);
    imgPreviewRow.innerHTML = '';

    pendingFiles.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = e => {
        const thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.style.backgroundImage = `url(${e.target.result})`;

        const del = document.createElement('button');
        del.className    = 'img-thumb-del';
        del.textContent  = '×';
        del.addEventListener('click', () => {
          pendingFiles.splice(i, 1);
          thumb.remove();
        });

        thumb.appendChild(del);
        imgPreviewRow.appendChild(thumb);
      };
      reader.readAsDataURL(file);
    });
  });

  // ── Submit item ────────────────────────────────────────
  submitItemBtn.addEventListener('click', async () => {
    if (!window.currentUser) {
      if (window.showAuthModal) window.showAuthModal('login');
      return;
    }

    const title       = document.getElementById('itemName').value.trim();
    const price       = document.getElementById('itemPrice').value.trim();
    const category    = document.getElementById('itemCategory').value;
    const condition   = document.getElementById('itemCondition').value;
    const location    = document.getElementById('itemLocation').value;
    const description = document.getElementById('itemDesc').value.trim();

    if (!title || !price || !category || !condition || !location) {
      return alert('Please fill in name, price, category, condition and location.');
    }

    submitItemBtn.textContent = 'Uploading…';
    submitItemBtn.disabled    = true;

    try {
      const imageUrls = pendingFiles.length
        ? await uploadToCloudinary(pendingFiles)
        : [];

      await addItem({
        title,
        seller:      window.currentUser.name,
        sellerUid:   window.currentUser.uid,
        price:       Number(price),
        category,
        condition,
        location,
        description,
        phone:       window.currentUser.phone,
        imageUrls,
        likes:       0,
        views:       0,
        sold:        false,
        boosted:     false,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
      });

      // Reset form on success
      resetAddForm();
      addItemForm.classList.add('hidden');

    } catch (err) {
      console.error(err);
      // Show the specific error from cloudinary.js — tells user exactly what's wrong
      alert(err.message || 'Upload failed. Check your Cloudinary preset and try again.');
    } finally {
      submitItemBtn.textContent = 'Post Item';
      submitItemBtn.disabled    = false;
    }
  });

  cancelItemBtn.addEventListener('click', () => {
    resetAddForm();
    addItemForm.classList.add('hidden');
  });

  // ── Empty state CTA ───────────────────────────────────
  document.getElementById('emptyAddBtn').addEventListener('click', openAddForm);

  // ── Search ─────────────────────────────────────────────
  function triggerSearch() {
    myListingsUid = null;
    searchQuery = searchInput.value.trim().toLowerCase();
    window.loadItems();
  }

  searchBtn.addEventListener('click', triggerSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });
  searchInput.addEventListener('input', () => {
    myListingsUid = null;
    searchQuery = searchInput.value.trim().toLowerCase();
    window.loadItems();
  });

  // ── Category chips ──────────────────────────────────────
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      myListingsUid  = null;
      activeCategory = btn.dataset.cat;
      window.loadItems();
    });
  });

  // ── Filter panel ────────────────────────────────────────
  filterToggleBtn.addEventListener('click', () =>
    filterPanel.classList.toggle('hidden'));

  document.querySelectorAll('.price-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.price-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activePriceRange = btn.dataset.price;
      updateFilterBadge();
      window.loadItems();
    });
  });

  document.querySelectorAll('.sort-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activeSort = btn.dataset.sort;
      updateFilterBadge();
      window.loadItems();
    });
  });

  clearFiltersBtn.addEventListener('click', () => {
    myListingsUid    = null;
    activePriceRange = 'all'; activeSort = 'newest';
    searchQuery = ''; searchInput.value = ''; activeCategory = 'all';

    document.querySelector('.chip[data-cat="all"]').click();
    document.querySelectorAll('.price-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.price === 'all'));
    document.querySelectorAll('.sort-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.sort === 'newest'));

    updateFilterBadge();
    window.loadItems();
  });

  function updateFilterBadge() {
    const hasPrice = activePriceRange !== 'all';
    const hasSort  = activeSort !== 'newest';
    const count    = (hasPrice ? 1 : 0) + (hasSort ? 1 : 0);

    filterBadge.textContent = count;
    filterBadge.classList.toggle('hidden', count === 0);

    const parts = [];
    if (hasPrice) parts.push({ all:'All','0-1000':'Under ₦1k','1000-5000':'₦1k–₦5k','5000-20000':'₦5k–₦20k','20000+':'₦20k+' }[activePriceRange]);
    if (hasSort)  parts.push({ newest:'Newest','price-asc':'Price ↑','price-desc':'Price ↓' }[activeSort]);

    if (parts.length) {
      activeFilterText.textContent = parts.join(' · ');
      activeFiltersBar.classList.remove('hidden');
    } else {
      activeFiltersBar.classList.add('hidden');
    }
  }

  // ── Item detail overlay ─────────────────────────────────
  let currentOverlayItemId = null;
  let selectedStarRating   = 0;

  window.openOverlay = function(item, id) {
    currentOverlayItemId = id;
    selectedStarRating   = 0;

    document.getElementById('overlayTitle').textContent  = item.title;
    document.getElementById('overlayPrice').textContent  = `₦${Number(item.price).toLocaleString()}`;
    document.getElementById('overlaySeller').textContent = item.seller || 'Unknown';
    document.getElementById('overlayDesc').textContent   = item.description || 'No description provided.';
    document.getElementById('overlayBadge').textContent  =
      `${catEmoji[item.category] || '📦'} ${item.category}`;

    const initials = (item.seller || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('sellerAvatar').textContent = initials;

    // Reset seller rating — populate async
    const sellerRatingEl = document.getElementById('overlaySellerRating');
    if (sellerRatingEl) sellerRatingEl.textContent = '';

    // Fetch seller's overall rating across all their items
    if (item.sellerUid) {
      db.collection('items').where('sellerUid', '==', item.sellerUid).get()
        .then(async itemsSnap => {
          let total = 0, count = 0;
          await Promise.all(itemsSnap.docs.map(async doc => {
            const rSnap = await db.collection('reviews').doc(doc.id)
              .collection('userReviews').get();
            rSnap.forEach(r => { total += r.data().rating || 0; count++; });
          }));
          if (count > 0 && sellerRatingEl) {
            const avg   = (total / count).toFixed(1);
            const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
            sellerRatingEl.textContent = `${stars} ${avg}`;
            sellerRatingEl.style.display = 'inline';
          }
        }).catch(() => {});
    }

    document.getElementById('overlayWaBtn').onclick = () =>
      window.open(
        `https://wa.me/${item.phone}?text=Hi, I'm interested in your ${item.title}`,
        '_blank'
      );

    // Condition + location in overlay
    const conditionLabel = { 'new': '✨ New', 'fairly-used': '👍 Fairly Used', 'used': '📦 Used' };
    const locationLabel  = { 'main': '🏛️ Main Campus', 'annex': '🏫 Annex', 'town': '🏙️ Town Camp' };
    const overlayMeta    = document.getElementById('overlayMeta');
    if (overlayMeta) {
      overlayMeta.innerHTML = [
        item.condition ? `<span class="overlay-meta-tag">${conditionLabel[item.condition] || item.condition}</span>` : '',
        item.location  ? `<span class="overlay-meta-tag"><i data-feather="map-pin"></i> ${locationLabel[item.location] || item.location}</span>` : '',
        item.sold      ? `<span class="overlay-meta-tag sold-tag">🔴 Sold</span>` : ''
      ].join('');
    }

    // Report button
    const reportBtn = document.getElementById('overlayReportBtn');
    if (reportBtn) {
      // Hide report for own items
      reportBtn.style.display = (window.currentUser && window.currentUser.uid === item.sellerUid)
        ? 'none' : 'flex';
      reportBtn.onclick = async () => {
        if (!window.currentUser) {
          if (window.showAuthModal) window.showAuthModal('login');
          return;
        }
        if (!confirm('Report this listing as inappropriate?')) return;
        try {
          await db.collection('reports').add({
            itemId:     id,
            itemTitle:  item.title,
            sellerUid:  item.sellerUid,
            reporterUid: window.currentUser.uid,
            createdAt:  firebase.firestore.FieldValue.serverTimestamp()
          });
          alert('✓ Reported. We\'ll review this listing.');
        } catch (e) {
          alert('Failed to report. Please try again.');
        }
      };
    }

    buildGallery(item.imageUrls || []);

    // ── Reviews setup ─────────────────────────────────
    const isOwner = window.currentUser && window.currentUser.uid === item.sellerUid;

    // Reset star input
    document.querySelectorAll('.star').forEach(s => s.classList.remove('active', 'hover'));
    const reviewText = document.getElementById('reviewText');
    if (reviewText) reviewText.value = '';

    // Show/hide review form vs login prompt
    const reviewForm        = document.getElementById('reviewForm');
    const reviewLoginPrompt = document.getElementById('reviewLoginPrompt');
    if (window.currentUser && !isOwner) {
      reviewForm.classList.remove('hidden');
      reviewLoginPrompt.classList.add('hidden');
    } else if (!window.currentUser) {
      reviewForm.classList.add('hidden');
      reviewLoginPrompt.classList.remove('hidden');
    } else {
      // Owner — hide both
      reviewForm.classList.add('hidden');
      reviewLoginPrompt.classList.add('hidden');
    }

    // Reset avg display
    document.getElementById('reviewsAvg').style.display = 'none';
    document.getElementById('reviewsList').innerHTML =
      '<p class="reviews-empty" id="reviewsEmpty">Loading reviews…</p>';

    // Load reviews from Firestore
    loadReviews(id);

    itemOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() =>
      itemOverlay.querySelector('.overlay-sheet').classList.add('open')
    );
    feather.replace();
  };

  function closeOverlay() {
    const sheet = itemOverlay.querySelector('.overlay-sheet');
    sheet.classList.remove('open');
    setTimeout(() => {
      itemOverlay.classList.add('hidden');
      document.body.style.overflow = '';
    }, 320);
  }

  overlayClose.addEventListener('click', closeOverlay);
  itemOverlay.addEventListener('click', e => {
    if (e.target === itemOverlay) closeOverlay();
  });

  let touchStartY = 0;
  itemOverlay.querySelector('.overlay-sheet').addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  });
  itemOverlay.querySelector('.overlay-sheet').addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchStartY > 80) closeOverlay();
  });

  // ── Load and render reviews ───────────────────────────
  async function loadReviews(itemId) {
    const list  = document.getElementById('reviewsList');
    const avg   = document.getElementById('reviewsAvg');
    const empty = document.getElementById('reviewsEmpty');

    try {
      const snap = await db.collection('reviews').doc(itemId)
        .collection('userReviews').get();

      list.innerHTML = '';

      if (snap.empty) {
        list.innerHTML = '<p class="reviews-empty">No reviews yet — be the first!</p>';
        avg.style.display = 'none';
        return;
      }

      // Calculate average
      let total = 0;
      snap.forEach(doc => { total += doc.data().rating || 0; });
      const average = (total / snap.size).toFixed(1);
      const stars   = '★'.repeat(Math.round(average)) + '☆'.repeat(5 - Math.round(average));

      document.getElementById('reviewsAvgStars').textContent = stars;
      document.getElementById('reviewsAvgNum').textContent   = `${average} (${snap.size})`;
      avg.style.display = 'flex';

      // Check if current user already reviewed
      let userAlreadyReviewed = false;
      snap.forEach(doc => {
        if (window.currentUser && doc.id === window.currentUser.uid) {
          userAlreadyReviewed = true;
        }
        const d        = doc.data();
        const initials = (d.reviewerName || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        const starStr  = '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating);
        const date     = d.createdAt ? d.createdAt.toDate().toLocaleDateString('en-NG', {
          day: 'numeric', month: 'short', year: 'numeric'
        }) : '';

        const card = document.createElement('div');
        card.className = 'review-card';
        card.innerHTML = `
          <div class="review-card-header">
            <div class="review-card-avatar">${initials}</div>
            <span class="review-card-name">${d.reviewerName || 'User'}</span>
            <span class="review-card-stars">${starStr}</span>
          </div>
          ${d.comment ? `<p class="review-card-text">${d.comment}</p>` : ''}
          <p class="review-card-date">${date}</p>
        `;
        list.appendChild(card);
      });

      // Hide review form if user already reviewed
      if (userAlreadyReviewed) {
        const rf = document.getElementById('reviewForm');
        if (rf) rf.classList.add('hidden');
        // Show a "You reviewed this" note
        const note = document.createElement('p');
        note.className = 'reviews-empty';
        note.style.color = '#6c00ea';
        note.textContent = '✓ You already reviewed this item';
        list.insertBefore(note, list.firstChild);
      }

    } catch (e) {
      console.error('Error loading reviews:', e);
      list.innerHTML = '<p class="reviews-empty">Could not load reviews.</p>';
    }
  }

  // ── Star input interaction ────────────────────────────
  document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.val);
      document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('hover', parseInt(s.dataset.val) <= val);
      });
    });
    star.addEventListener('mouseout', () => {
      document.querySelectorAll('.star').forEach(s => s.classList.remove('hover'));
    });
    star.addEventListener('click', () => {
      selectedStarRating = parseInt(star.dataset.val);
      document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.val) <= selectedStarRating);
      });
    });
  });

  // Touch support for stars on mobile
  document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('touchend', (e) => {
      e.preventDefault();
      selectedStarRating = parseInt(star.dataset.val);
      document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.val) <= selectedStarRating);
      });
    });
  });

  // ── Submit review ─────────────────────────────────────
  const _reviewSubmitBtn = document.getElementById('reviewSubmitBtn');
  if (_reviewSubmitBtn) {
    _reviewSubmitBtn.addEventListener('click', async () => {
      if (!window.currentUser) {
        if (window.showAuthModal) window.showAuthModal('login');
        return;
      }
      if (!selectedStarRating) {
        alert('Please select a star rating first.');
        return;
      }
      if (!currentOverlayItemId) return;

      _reviewSubmitBtn.textContent = 'Posting…';
      _reviewSubmitBtn.disabled    = true;

      try {
        await db.collection('reviews').doc(currentOverlayItemId)
          .collection('userReviews').doc(window.currentUser.uid).set({
            rating:       selectedStarRating,
            comment:      document.getElementById('reviewText').value.trim(),
            reviewerName: window.currentUser.name,
            reviewerUid:  window.currentUser.uid,
            createdAt:    firebase.firestore.FieldValue.serverTimestamp()
          });

        // Reload reviews
        document.getElementById('reviewsList').innerHTML =
          '<p class="reviews-empty">Loading…</p>';
        document.getElementById('reviewForm').classList.add('hidden');
        await loadReviews(currentOverlayItemId);

      } catch (e) {
        console.error(e);
        alert('Failed to post review. Please try again.');
      } finally {
        _reviewSubmitBtn.textContent = 'Post Review';
        _reviewSubmitBtn.disabled    = false;
      }
    });
  }

  // ── Review login prompt button ────────────────────────
  const _reviewLoginBtn = document.getElementById('reviewLoginBtn');
  if (_reviewLoginBtn) {
    _reviewLoginBtn.addEventListener('click', () => {
      closeOverlay();
      if (window.showAuthModal) window.showAuthModal('login');
    });
  }

  function buildGallery(urls) {
    const gallery = document.getElementById('overlayGallery');
    const dots    = document.getElementById('galleryDots');
    gallery.innerHTML = '';
    dots.innerHTML    = '';

    if (!urls || urls.length === 0) {
      gallery.innerHTML = `<div class="gallery-placeholder">
        <i data-feather="image"></i><p>No photos</p></div>`;
      feather.replace();
      return;
    }

    urls.forEach((src, i) => {
      const slide = document.createElement('div');
      slide.className = 'gallery-slide';
      slide.style.backgroundImage = `url('${src}')`;
      gallery.appendChild(slide);

      const dot = document.createElement('span');
      dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () =>
        gallery.scrollTo({ left: i * gallery.offsetWidth, behavior: 'smooth' })
      );
      dots.appendChild(dot);
    });

    gallery.addEventListener('scroll', () => {
      const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
      document.querySelectorAll('.gallery-dot').forEach((d, i) =>
        d.classList.toggle('active', i === idx));
    });
  }

  // ── Sidebar open / close ─────────────────────────────
  function openSidebar() {
    if (!sidebar || !sidebarOverlay) return; // stale cache guard
    // Update user info in sidebar header
    if (window.currentUser) {
      const u = window.currentUser;
      const initials = u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      document.getElementById('sidebarAvatar').textContent = initials;
      document.getElementById('sidebarName').textContent   = u.name;
      document.getElementById('sidebarEmail').textContent  = u.email;
      document.getElementById('menuLogout').classList.remove('hidden');
      document.getElementById('menuLogin').classList.add('hidden');
    } else {
      document.getElementById('sidebarAvatar').innerHTML = '<i data-feather="user"></i>';
      document.getElementById('sidebarName').textContent  = 'Guest';
      document.getElementById('sidebarEmail').textContent = 'Not logged in';
      document.getElementById('menuLogout').classList.add('hidden');
      document.getElementById('menuLogin').classList.remove('hidden');
    }
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    filterPanel.classList.add('hidden'); // close filter panel if open
    feather.replace();
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  // ── Guide modal ───────────────────────────────────────
  document.getElementById('closeGuide').addEventListener('click', () => {
    document.getElementById('guideModal').classList.add('hidden');
  });

  // ── Header avatar button ──────────────────────────────
  document.getElementById('userAvatarBtn').addEventListener('click', () => {
    if (window.currentUser) {
      openSidebar();
    } else {
      if (window.showAuthModal) window.showAuthModal('login');
    }
  });

  // ── Sidebar triggers ──────────────────────────────────
  const sidebarCloseBtn = document.getElementById('sidebarClose');
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarOverlay)  sidebarOverlay.addEventListener('click', closeSidebar);

  // ── Profile sheet ─────────────────────────────────────
  async function openProfile() {
    if (!window.currentUser) {
      if (window.showAuthModal) window.showAuthModal('login');
      return;
    }

    const u        = window.currentUser;
    const initials = u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const avatarEl = document.getElementById('profileAvatarLg');
    const nudgeEl  = document.getElementById('profileTrustNudge');

    // Show photo or initials
    if (u.photoURL) {
      avatarEl.style.backgroundImage = `url('${u.photoURL}')`;
      avatarEl.textContent = '';
      if (nudgeEl) nudgeEl.classList.add('hidden');
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = initials;
      if (nudgeEl) nudgeEl.classList.remove('hidden');
    }

    // Fill static fields
    document.getElementById('profileDisplayName').textContent  = u.name;
    document.getElementById('profileEmail').textContent        = u.email;
    document.getElementById('profileNameInput').value          = u.name;
    document.getElementById('profilePhoneInput').value         = u.phone || '';

    // Reset save message
    const saveMsg = document.getElementById('profileSaveMsg');
    saveMsg.className = 'profile-save-msg hidden';
    saveMsg.textContent = '';

    // Member since
    try {
      const snap = await db.collection('users').doc(u.uid).get();
      const data  = snap.exists ? snap.data() : {};
      if (data.createdAt) {
        const date = data.createdAt.toDate();
        document.getElementById('profileMemberSince').textContent =
          `Member since ${date.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}`;
      }
    } catch(e) {
      document.getElementById('profileMemberSince').textContent = '';
    }

    // Listings count + total views from Firestore
    try {
      const itemsSnap = await db.collection('items')
        .where('sellerUid', '==', u.uid).get();
      document.getElementById('profileListingsCount').textContent = itemsSnap.size;
      let totalViews = 0;
      itemsSnap.forEach(doc => { totalViews += doc.data().views || 0; });
      document.getElementById('profileViews').textContent = totalViews;
    } catch(e) {
      document.getElementById('profileListingsCount').textContent = '—';
      document.getElementById('profileViews').textContent = '—';
    }

    // Show sheet
    const overlay = document.getElementById('profileOverlay');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() =>
      overlay.querySelector('.overlay-sheet').classList.add('open')
    );
    feather.replace();
  }

  // ── Profile picture upload ────────────────────────────
  const _profilePicInput = document.getElementById('profilePicInput');
  if (_profilePicInput) {
    _profilePicInput.addEventListener('change', async () => {
      const file = _profilePicInput.files[0];
      if (!file || !window.currentUser) return;

      const avatarEl = document.getElementById('profileAvatarLg');
      const nudgeEl  = document.getElementById('profileTrustNudge');
      avatarEl.textContent = '⏳';

      try {
        // Upload to Cloudinary
        const urls = await uploadToCloudinary([file]);
        const photoURL = urls[0];

        // Save to Firestore
        await db.collection('users').doc(window.currentUser.uid)
          .update({ photoURL });

        // Update in memory
        window.currentUser.photoURL = photoURL;

        // Update avatar display
        avatarEl.style.backgroundImage = `url('${photoURL}')`;
        avatarEl.textContent = '';
        if (nudgeEl) nudgeEl.classList.add('hidden');

        // Update header avatar if it shows a photo
        const headerAvatarBtn = document.getElementById('userAvatarBtn');
        if (headerAvatarBtn && photoURL) {
          headerAvatarBtn.style.backgroundImage = `url('${photoURL}')`;
          headerAvatarBtn.style.backgroundSize  = 'cover';
          headerAvatarBtn.innerHTML = '';
        }

      } catch (e) {
        console.error('Photo upload failed:', e);
        alert('Photo upload failed. Please try again.');
        const initials = window.currentUser.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = initials;
      }

      _profilePicInput.value = '';
    });
  }

  function closeProfile() {
    const overlay = document.getElementById('profileOverlay');
    const sheet   = overlay.querySelector('.overlay-sheet');
    sheet.classList.remove('open');
    setTimeout(() => {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }, 320);
  }

  // Profile close button
  const _profileClose = document.getElementById('profileClose');
  if (_profileClose) _profileClose.addEventListener('click', closeProfile);

  // Tap backdrop to close
  const _profileOverlay = document.getElementById('profileOverlay');
  if (_profileOverlay) _profileOverlay.addEventListener('click', e => {
    if (e.target === _profileOverlay) closeProfile();
  });

  // Swipe down to close profile sheet
  const _profileSheet = document.querySelector('#profileOverlay .overlay-sheet');
  if (_profileSheet) {
    let profileTouchStartY = 0;
    _profileSheet.addEventListener('touchstart', e => {
      profileTouchStartY = e.touches[0].clientY;
    });
    _profileSheet.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - profileTouchStartY > 80) closeProfile();
    });
  }

  // Save changes
  const _profileSaveBtn = document.getElementById('profileSaveBtn');
  if (_profileSaveBtn) _profileSaveBtn.addEventListener('click', async () => {
    const name  = document.getElementById('profileNameInput').value.trim();
    const phone = document.getElementById('profilePhoneInput').value.trim();
    const msg   = document.getElementById('profileSaveMsg');

    if (!name || !phone) {
      msg.textContent = 'Name and phone cannot be empty.';
      msg.className   = 'profile-save-msg error';
      return;
    }

    _profileSaveBtn.textContent = 'Saving…';
    _profileSaveBtn.disabled    = true;
    msg.className = 'profile-save-msg hidden';

    try {
      await db.collection('users').doc(window.currentUser.uid).update({ name, phone });

      // Update local state
      window.currentUser.name  = name;
      window.currentUser.phone = phone;

      // Update header avatar initials
      const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const avatarBtn = document.getElementById('userAvatarBtn');
      if (avatarBtn) avatarBtn.textContent = initials;

      document.getElementById('profileAvatarLg').textContent   = initials;
      document.getElementById('profileDisplayName').textContent = name;

      msg.textContent = '✓ Profile updated successfully!';
      msg.className   = 'profile-save-msg success';

      // Re-render cards so seller name updates
      if (window.loadItems) window.loadItems();

    } catch(e) {
      msg.textContent = 'Failed to save. Please try again.';
      msg.className   = 'profile-save-msg error';
    } finally {
      _profileSaveBtn.textContent = 'Save Changes';
      _profileSaveBtn.disabled    = false;
    }
  });

  // ── Sidebar menu items ────────────────────────────────
  const _menuProfile = document.getElementById('menuProfile');
  if (_menuProfile) _menuProfile.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    openProfile();
  });

  const _menuAddItem = document.getElementById('menuAddItem');
  if (_menuAddItem) _menuAddItem.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    openAddForm();
  });

  const _menuMyListings = document.getElementById('menuMyListings');
  if (_menuMyListings) _menuMyListings.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    if (!window.currentUser) {
      if (window.showAuthModal) window.showAuthModal('login');
      return;
    }
    myListingsUid    = window.currentUser.uid;
    searchQuery      = '';
    activeCategory   = 'all';
    activePriceRange = 'all';
    activeSort       = 'newest';
    document.getElementById('searchInput').value = '';
    window.loadItems();
  });

  // ── Feedback sheet ────────────────────────────────────
  let selectedFeedbackType = 'suggestion';

  function openFeedback() {
    // Reset form
    selectedFeedbackType = 'suggestion';
    document.querySelectorAll('.feedback-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'suggestion');
    });
    const msg = document.getElementById('feedbackMessage');
    if (msg) msg.value = '';
    const status = document.getElementById('feedbackStatus');
    if (status) { status.className = 'feedback-status hidden'; status.textContent = ''; }
    const btn = document.getElementById('feedbackSubmitBtn');
    if (btn) { btn.textContent = ''; btn.disabled = false; }

    const overlay = document.getElementById('feedbackModal');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() =>
      overlay.querySelector('.overlay-sheet').classList.add('open')
    );
    feather.replace();
  }

  function closeFeedback() {
    const overlay = document.getElementById('feedbackModal');
    const sheet   = overlay.querySelector('.overlay-sheet');
    sheet.classList.remove('open');
    setTimeout(() => {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }, 320);
  }

  const _feedbackClose = document.getElementById('feedbackClose');
  if (_feedbackClose) _feedbackClose.addEventListener('click', closeFeedback);

  const _feedbackModal = document.getElementById('feedbackModal');
  if (_feedbackModal) _feedbackModal.addEventListener('click', e => {
    if (e.target === _feedbackModal) closeFeedback();
  });

  // Swipe to close
  const _feedbackSheet = document.querySelector('#feedbackModal .overlay-sheet');
  if (_feedbackSheet) {
    let fbTouchY = 0;
    _feedbackSheet.addEventListener('touchstart', e => { fbTouchY = e.touches[0].clientY; });
    _feedbackSheet.addEventListener('touchend',   e => {
      if (e.changedTouches[0].clientY - fbTouchY > 80) closeFeedback();
    });
  }

  // Type buttons
  document.querySelectorAll('.feedback-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFeedbackType = btn.dataset.type;
    });
  });

  // Submit feedback
  const _feedbackSubmitBtn = document.getElementById('feedbackSubmitBtn');
  if (_feedbackSubmitBtn) {
    _feedbackSubmitBtn.addEventListener('click', async () => {
      const message = document.getElementById('feedbackMessage').value.trim();
      const status  = document.getElementById('feedbackStatus');

      if (!message) {
        status.textContent = 'Please write a message before sending.';
        status.className   = 'feedback-status error';
        return;
      }

      _feedbackSubmitBtn.disabled    = true;
      _feedbackSubmitBtn.textContent = 'Sending…';
      status.className = 'feedback-status hidden';

      try {
        await db.collection('feedback').add({
          type:      selectedFeedbackType,
          message,
          name:      window.currentUser ? window.currentUser.name  : 'Guest',
          email:     window.currentUser ? window.currentUser.email : 'Guest',
          uid:       window.currentUser ? window.currentUser.uid   : null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        status.textContent = '✓ Thanks! Your feedback has been sent.';
        status.className   = 'feedback-status success';
        document.getElementById('feedbackMessage').value = '';

        // Auto close after 2 seconds
        setTimeout(closeFeedback, 2000);

      } catch (e) {
        console.error(e);
        status.textContent = 'Failed to send. Please try again.';
        status.className   = 'feedback-status error';
      } finally {
        _feedbackSubmitBtn.disabled    = false;
        _feedbackSubmitBtn.innerHTML   = '<i data-feather="send"></i> Send Feedback';
        feather.replace();
      }
    });
  }

  // ── Menu feedback trigger ─────────────────────────────
  const _menuFeedback = document.getElementById('menuFeedback');
  if (_menuFeedback) _menuFeedback.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    openFeedback();
  });

  const _menuLogin = document.getElementById('menuLogin');
  if (_menuLogin) _menuLogin.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    if (window.showAuthModal) window.showAuthModal('login');
  });

  const _menuLogout = document.getElementById('menuLogout');
  if (_menuLogout) _menuLogout.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    if (window.handleLogout) window.handleLogout();
  });

  // ── Bottom nav ────────────────────────────────────────
  document.getElementById('navHome').addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' }));

  document.getElementById('navAdd').addEventListener('click', openAddForm);

  document.getElementById('navMenu').addEventListener('click', openSidebar);

  // Outside-click closes filter panel only (sidebar has its own overlay)
  document.addEventListener('click', e => {
    if (
      !filterPanel.contains(e.target) &&
      !filterToggleBtn.contains(e.target)
    ) {
      filterPanel.classList.add('hidden');
    }
  });

  // ── PWA Install Prompt ────────────────────────────────
  let deferredInstallPrompt = null;
  const installBanner  = document.getElementById('installBanner');
  const installAccept  = document.getElementById('installAccept');
  const installDismiss = document.getElementById('installDismiss');

  // Browser fires this when app is installable (HTTP or HTTPS)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Show immediately if user hasn't dismissed before
    if (!localStorage.getItem('unimart_install_dismissed')) {
      if (installBanner) {
        installBanner.classList.remove('hidden');
        feather.replace();
      }
    }
  });

  if (installAccept) {
    installAccept.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      installBanner.classList.add('hidden');
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === 'accepted') console.log('PWA installed');
    });
  }

  if (installDismiss) {
    installDismiss.addEventListener('click', () => {
      installBanner.classList.add('hidden');
      localStorage.setItem('unimart_install_dismissed', '1');
    });
  }

  // Hide banner once app is installed
  window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.classList.add('hidden');
    deferredInstallPrompt = null;
  });

  // ── Welcome Banner ────────────────────────────────────
  const welcomeBanner      = document.getElementById('welcomeBanner');
  const welcomeBannerClose = document.getElementById('welcomeBannerClose');

  if (welcomeBanner && welcomeBannerClose) {
    // Check if collapsed this session
    if (sessionStorage.getItem('banner_collapsed')) {
      welcomeBanner.classList.add('collapsed');
    }
    welcomeBannerClose.addEventListener('click', () => {
      const isCollapsed = welcomeBanner.classList.toggle('collapsed');
      if (isCollapsed) {
        sessionStorage.setItem('banner_collapsed', '1');
      } else {
        sessionStorage.removeItem('banner_collapsed');
      }
      feather.replace();
    });
  }

  // ── Announcements ─────────────────────────────────────
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifDot     = document.getElementById('notifDot');
  const notifOverlay = document.getElementById('notifOverlay');
  const notifClose   = document.getElementById('notifClose');
  const notifList    = document.getElementById('notifList');

  // Load announcements from Firestore on page load
  async function loadAnnouncements() {
    try {
      const snap = await db.collection('announcements').limit(10).get();

      if (snap.empty) return;

      // Show dot if there are any announcements
      if (notifDot) notifDot.classList.remove('hidden');

      if (notifList) {
        notifList.innerHTML = '';
        snap.forEach(doc => {
          const d    = doc.data();
          const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString('en-NG', {
            day: 'numeric', month: 'short', year: 'numeric'
          }) : '';
          const card = document.createElement('div');
          card.className = 'notif-card';
          card.innerHTML = `
            <p class="notif-card-title">${d.title || 'Announcement'}</p>
            <p class="notif-card-body">${d.message || ''}</p>
            <p class="notif-card-date">${date}</p>
          `;
          notifList.appendChild(card);
        });
      }
    } catch (e) {
      // Silently fail — announcements are not critical
    }
  }

  loadAnnouncements();

  function openNotif() {
    if (!notifOverlay) return;
    // Hide dot once opened
    if (notifDot) notifDot.classList.add('hidden');
    notifOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() =>
      notifOverlay.querySelector('.overlay-sheet').classList.add('open')
    );
    feather.replace();
  }

  function closeNotif() {
    if (!notifOverlay) return;
    const sheet = notifOverlay.querySelector('.overlay-sheet');
    sheet.classList.remove('open');
    setTimeout(() => {
      notifOverlay.classList.add('hidden');
      document.body.style.overflow = '';
    }, 320);
  }

  if (notifBellBtn) notifBellBtn.addEventListener('click', openNotif);
  if (notifClose)   notifClose.addEventListener('click', closeNotif);
  if (notifOverlay) notifOverlay.addEventListener('click', e => {
    if (e.target === notifOverlay) closeNotif();
  });

  // Swipe to close
  const _notifSheet = document.querySelector('#notifOverlay .overlay-sheet');
  if (_notifSheet) {
    let notifTouchY = 0;
    _notifSheet.addEventListener('touchstart', e => { notifTouchY = e.touches[0].clientY; });
    _notifSheet.addEventListener('touchend',   e => {
      if (e.changedTouches[0].clientY - notifTouchY > 80) closeNotif();
    });
  }

  // ── Init ─────────────────────────────────────────────────
  // Note: loadItems() is NOT called here.
  // auth.js onAuthStateChanged always fires on page load (logged in or not)
  // and calls window.loadItems() from there — calling it here too causes
  // a double Firestore listener and double skeleton flash.
  feather.replace();
});
