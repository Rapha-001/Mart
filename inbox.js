// ── inbox.js — Favorites · Requests · Messaging ──────────────────────
// Depends on: firebase.js, app.js
// Exposes: window.toggleFavorite, window.openSavedItems,
//          window.openRequestModal, window.openInbox, window.startInboxBadgeListener

// ══════════════════════════════════════════════
// FAVORITES
// ══════════════════════════════════════════════

async function loadUserFavorites(uid) {
  try {
    const snap = await db.collection('favorites').doc(uid).collection('items').get();
    window.userFavorites = new Set(snap.docs.map(d => d.id));
    refreshFavoriteButtons();
  } catch(e) {
    console.warn('Could not load favorites:', e);
  }
}

function refreshFavoriteButtons() {
  document.querySelectorAll('.card-save-btn').forEach(btn => {
    const id = btn.dataset.id;
    const saved = window.userFavorites.has(id);
    btn.classList.toggle('saved', saved);
    btn.title = saved ? 'Saved' : 'Save';
  });
  // Update overlay save button if open
  const overlayBtn = document.getElementById('overlaySaveBtn');
  if (overlayBtn && overlayBtn.dataset.id) {
    const saved = window.userFavorites.has(overlayBtn.dataset.id);
    overlayBtn.classList.toggle('saved', saved);
    overlayBtn.innerHTML = saved
      ? '<i data-feather="bookmark"></i> Saved'
      : '<i data-feather="bookmark"></i> Save Item';
  }
  feather.replace();
}

window.toggleFavorite = async function(itemId, itemData) {
  if (!window.currentUser) {
    if (window.showAuthModal) window.showAuthModal('login');
    return;
  }
  const isSaved = window.userFavorites.has(itemId);
  const ref = db.collection('favorites').doc(window.currentUser.uid)
    .collection('items').doc(itemId);
  try {
    if (isSaved) {
      await ref.delete();
      window.userFavorites.delete(itemId);
    } else {
      await ref.set({
        itemId,
        title:     itemData.title     || '',
        price:     itemData.price     || 0,
        imageUrl:  (itemData.imageUrls || [])[0] || '',
        seller:    itemData.seller    || '',
        sellerUid: itemData.sellerUid || '',
        category:  itemData.category  || '',
        savedAt:   firebase.firestore.FieldValue.serverTimestamp()
      });
      window.userFavorites.add(itemId);
    }
    refreshFavoriteButtons();
  } catch(e) {
    console.error('Favorite error:', e);
  }
};

// ── Saved Items Overlay ──────────────────────────────────

window.openSavedItems = async function() {
  if (!window.currentUser) {
    if (window.showAuthModal) window.showAuthModal('login');
    return;
  }
  const overlay = document.getElementById('savedOverlay');
  const list    = document.getElementById('savedList');
  if (!overlay) return;

  list.innerHTML = '<p class="reviews-empty">Loading…</p>';
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    overlay.querySelector('.overlay-sheet').classList.add('open')
  );

  try {
    const snap = await db.collection('favorites').doc(window.currentUser.uid)
      .collection('items').get();

    if (snap.empty) {
      list.innerHTML = '<p class="reviews-empty">No saved items yet.<br>Tap the bookmark icon on any listing to save it.</p>';
      return;
    }

    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'saved-item-card';
      card.innerHTML = `
        <div class="saved-item-img" ${d.imageUrl ? `style="background-image:url('${d.imageUrl}')"` : ''}>
          ${!d.imageUrl ? '📦' : ''}
        </div>
        <div class="saved-item-info">
          <p class="saved-item-title">${d.title}</p>
          <p class="saved-item-price">₦${Number(d.price).toLocaleString()}</p>
          <p class="saved-item-seller">${d.seller || 'Unknown'}</p>
        </div>
        <button class="saved-item-remove" title="Remove"><i data-feather="x"></i></button>
      `;

      card.querySelector('.saved-item-remove').addEventListener('click', async e => {
        e.stopPropagation();
        try {
          await db.collection('favorites').doc(window.currentUser.uid)
            .collection('items').doc(doc.id).delete();
          window.userFavorites.delete(doc.id);
          card.remove();
          refreshFavoriteButtons();
          if (!list.querySelector('.saved-item-card')) {
            list.innerHTML = '<p class="reviews-empty">No saved items yet.</p>';
          }
        } catch(e) {}
      });

      card.addEventListener('click', async e => {
        if (e.target.closest('.saved-item-remove')) return;
        try {
          const snap = await db.collection('items').doc(doc.id).get();
          if (snap.exists) {
            closeSavedItems();
            setTimeout(() => {
              if (window.openOverlay) window.openOverlay(snap.data(), doc.id);
            }, 340);
          }
        } catch(e) {}
      });

      list.appendChild(card);
    });
    feather.replace();
  } catch(e) {
    list.innerHTML = '<p class="reviews-empty">Could not load saved items.</p>';
  }
};

function closeSavedItems() {
  const overlay = document.getElementById('savedOverlay');
  if (!overlay) return;
  overlay.querySelector('.overlay-sheet').classList.remove('open');
  setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 320);
}

// ══════════════════════════════════════════════
// REQUESTS
// ══════════════════════════════════════════════

let _pendingRequest = null;

window.openRequestModal = function(itemId, itemData) {
  if (!window.currentUser) {
    if (window.showAuthModal) window.showAuthModal('login');
    return;
  }
  _pendingRequest = { itemId, itemData };

  const overlay = document.getElementById('requestOverlay');
  if (!overlay) return;

  document.getElementById('reqItemTitle').textContent  = itemData.title;
  document.getElementById('reqItemPrice').textContent  = `₦${Number(itemData.price).toLocaleString()}`;
  document.getElementById('reqItemSeller').textContent = `From: ${itemData.seller || 'Seller'}`;
  document.getElementById('reqMessage').value          = '';

  const status = document.getElementById('reqStatus');
  status.textContent  = '';
  status.className    = 'req-status hidden';

  const btn = document.getElementById('reqSubmitBtn');
  btn.textContent = 'Send Request';
  btn.disabled    = false;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    overlay.querySelector('.overlay-sheet').classList.add('open')
  );
  feather.replace();
};

function closeRequestModal() {
  const overlay = document.getElementById('requestOverlay');
  if (!overlay) return;
  overlay.querySelector('.overlay-sheet').classList.remove('open');
  setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 320);
}

async function submitRequest() {
  if (!_pendingRequest || !window.currentUser) return;
  const { itemId, itemData } = _pendingRequest;
  const message = document.getElementById('reqMessage').value.trim();
  const btn     = document.getElementById('reqSubmitBtn');
  const status  = document.getElementById('reqStatus');

  btn.textContent = 'Sending…';
  btn.disabled    = true;

  try {
    await db.collection('requests').add({
      buyerId:   window.currentUser.uid,
      buyerName: window.currentUser.name,
      buyerPhone:window.currentUser.phone || '',
      sellerId:  itemData.sellerUid,
      sellerName:itemData.seller || 'Seller',
      itemId,
      itemTitle: itemData.title,
      itemPrice: itemData.price,
      itemImage: (itemData.imageUrls || [])[0] || '',
      message:   message || '',
      status:    'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Notify seller of new request
    if (window.notifyNewRequest) {
      window.notifyNewRequest(itemData.sellerUid, {
        buyerName: window.currentUser.name,
        buyerId:   window.currentUser.uid,
        itemTitle: itemData.title,
        itemId,
      });
    }

    status.textContent = '✓ Request sent! The seller will respond soon.';
    status.className   = 'req-status success';
    setTimeout(closeRequestModal, 1600);

  } catch(e) {
    console.error('Request error:', e);
    status.textContent = 'Failed to send. Please try again.';
    status.className   = 'req-status error';
    btn.textContent    = 'Send Request';
    btn.disabled       = false;
  }
}

// ══════════════════════════════════════════════
// INBOX
// ══════════════════════════════════════════════

let _inboxTab              = 'messages';
let _conversationsUnsub    = null;
let _messagesUnsub         = null;
let _currentConversation   = null;

window.openInbox = function(defaultTab) {
  if (!window.currentUser) {
    if (window.showAuthModal) window.showAuthModal('login');
    return;
  }
  if (defaultTab) _inboxTab = defaultTab;

  const overlay = document.getElementById('inboxOverlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    overlay.querySelector('.overlay-sheet').classList.add('open')
  );

  switchInboxTab(_inboxTab);
  feather.replace();
};

function closeInbox() {
  const overlay = document.getElementById('inboxOverlay');
  if (!overlay) return;
  overlay.querySelector('.overlay-sheet').classList.remove('open');
  setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 320);
  if (_conversationsUnsub) { _conversationsUnsub(); _conversationsUnsub = null; }
}

function switchInboxTab(tab) {
  _inboxTab = tab;
  document.getElementById('inboxTabMessages').classList.toggle('active', tab === 'messages');
  document.getElementById('inboxTabRequests').classList.toggle('active', tab === 'requests');
  document.getElementById('inboxMessages').classList.toggle('hidden', tab !== 'messages');
  document.getElementById('inboxRequests').classList.toggle('hidden', tab !== 'requests');
  if (tab === 'messages') loadConversations();
  else loadRequests();
}

// ── Conversations ─────────────────────────────────────

function loadConversations() {
  const list = document.getElementById('inboxMessages');
  list.innerHTML = '<p class="reviews-empty">Loading…</p>';
  if (_conversationsUnsub) _conversationsUnsub();

  _conversationsUnsub = db.collection('conversations')
    .where('participants', 'array-contains', window.currentUser.uid)
    .onSnapshot(snap => {
      if (snap.empty) {
        list.innerHTML = '<p class="reviews-empty">No conversations yet.<br>Request an item to start chatting.</p>';
        return;
      }
      // Sort by lastMessageAt client-side
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aT = a.lastMessageAt ? a.lastMessageAt.seconds || 0 : 0;
          const bT = b.lastMessageAt ? b.lastMessageAt.seconds || 0 : 0;
          return bT - aT;
        });

      list.innerHTML = '';
      docs.forEach(d => {
        const isMe     = d.buyerId === window.currentUser.uid;
        const other    = isMe ? d.sellerName : d.buyerName;
        const unreadKey= `unread_${window.currentUser.uid}`;
        const unread   = d[unreadKey] || 0;
        const time     = d.lastMessageAt
          ? d.lastMessageAt.toDate().toLocaleDateString('en-NG', { day:'numeric', month:'short' })
          : '';

        const item = document.createElement('div');
        item.className = 'inbox-item';
        item.innerHTML = `
          <div class="inbox-item-avatar">${(other||'?')[0].toUpperCase()}</div>
          <div class="inbox-item-body">
            <div class="inbox-item-top">
              <span class="inbox-item-name">${other}</span>
              <span class="inbox-item-time">${time}</span>
            </div>
            <p class="inbox-item-sub">${d.itemTitle || ''}</p>
            <p class="inbox-item-last">${d.lastMessage || 'Conversation started'}</p>
          </div>
          ${unread > 0 ? `<span class="inbox-unread-badge">${unread}</span>` : ''}
        `;
        item.addEventListener('click', () => openConversation(d.id, d));
        list.appendChild(item);
      });
      feather.replace();
    }, err => {
      console.error(err);
      list.innerHTML = '<p class="reviews-empty">Could not load conversations.</p>';
    });
}

// ── Requests ─────────────────────────────────────────

function loadRequests() {
  const list = document.getElementById('inboxRequests');
  list.innerHTML = '<p class="reviews-empty">Loading…</p>';

  const uid = window.currentUser.uid;
  let incoming = [], outgoing = [], done = 0;

  function render() {
    const all = [
      ...incoming.map(d => ({ ...d, _type: 'incoming' })),
      ...outgoing.map(d => ({ ...d, _type: 'outgoing' }))
    ].sort((a, b) => {
      const aT = a.createdAt ? a.createdAt.seconds || 0 : 0;
      const bT = b.createdAt ? b.createdAt.seconds || 0 : 0;
      return bT - aT;
    });

    if (all.length === 0) {
      list.innerHTML = '<p class="reviews-empty">No requests yet.</p>';
      return;
    }

    list.innerHTML = '';

    all.forEach(req => {
      const statusLabel = { pending:'⏳ Pending', accepted:'✓ Accepted', rejected:'✗ Declined', cancelled:'✕ Cancelled' }[req.status] || req.status;
      const statusCls   = { pending:'badge-pending', accepted:'badge-accepted', rejected:'badge-rejected', cancelled:'badge-rejected' }[req.status] || '';
      const card = document.createElement('div');
      card.className = 'request-card';
      card.innerHTML = `
        <div class="request-card-top">
          ${req.itemImage ? `<div class="request-card-img" style="background-image:url('${req.itemImage}')"></div>` : '<div class="request-card-img">📦</div>'}
          <div class="request-card-info">
            <p class="request-card-title">${req.itemTitle}</p>
            <p class="request-card-price">₦${Number(req.itemPrice).toLocaleString()}</p>
            <p class="request-card-party">${req._type === 'incoming' ? `From: <strong>${req.buyerName}</strong>` : `To: <strong>${req.sellerName}</strong>`}</p>
            ${req.message ? `<p class="request-card-msg">"${req.message}"</p>` : ''}
          </div>
        </div>
        <div class="request-status-row">
          <span class="request-badge ${statusCls}">${statusLabel}</span>
          ${req._type === 'incoming' && req.status === 'pending' ? `
            <div class="request-actions">
              <button class="req-accept-btn" data-id="${req.id}">✓ Accept</button>
              <button class="req-reject-btn" data-id="${req.id}">✗ Decline</button>
            </div>
          ` : ''}
          ${req._type === 'incoming' && req.status === 'cancel_requested' ? `
            <div class="request-actions">
              <button class="req-accept-btn" data-id="${req.id}" data-action="confirm_cancel">✓ Confirm Cancel</button>
              <button class="req-reject-btn" data-id="${req.id}" data-action="deny_cancel">✗ Keep Order</button>
            </div>
          ` : ''}
          ${req.status === 'accepted' && req.conversationId ? `
            <button class="req-chat-btn" data-cid="${req.conversationId}">💬 Open Chat</button>
          ` : ''}
          ${req._type === 'outgoing' && req.status === 'pending' ? `
            <button class="req-cancel-btn" data-id="${req.id}">✕ Cancel</button>
          ` : ''}
          ${req._type === 'outgoing' && req.status === 'accepted' ? `
            <button class="req-cancel-btn" data-id="${req.id}" data-action="request_cancel">Request Cancel</button>
          ` : ''}
          ${req._type === 'outgoing' && req.status === 'cancel_requested' ? `
            <span style="font-size:12px;color:#f59e0b;font-weight:600;">⏳ Cancellation pending seller</span>
          ` : ''}
        </div>
      `;

      if (req._type === 'incoming' && req.status === 'pending') {
        card.querySelector('.req-accept-btn').addEventListener('click', () => acceptRequest(req.id, req));
        card.querySelector('.req-reject-btn').addEventListener('click', () => rejectRequest(req.id));
      }
      // Seller handling cancel request
      if (req._type === 'incoming' && req.status === 'cancel_requested') {
        const acceptBtn = card.querySelector('.req-accept-btn[data-action="confirm_cancel"]');
        const rejectBtn = card.querySelector('.req-reject-btn[data-action="deny_cancel"]');
        if (acceptBtn) acceptBtn.addEventListener('click', () => confirmCancelRequest(req.id, req));
        if (rejectBtn) rejectBtn.addEventListener('click', () => denyCancelRequest(req.id));
      }
      // Buyer cancel buttons
      const cancelBtn = card.querySelector('.req-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          const action = cancelBtn.dataset.action;
          if (action === 'request_cancel') {
            requestCancellation(req.id, req);
          } else {
            cancelRequest(req.id);
          }
        });
      }
      if (req.status === 'accepted' && req.conversationId) {
        card.querySelector('.req-chat-btn').addEventListener('click', async () => {
          try {
            const s = await db.collection('conversations').doc(req.conversationId).get();
            if (s.exists) openConversation(req.conversationId, s.data());
          } catch(e) {}
        });
      }

      list.appendChild(card);
    });
    feather.replace();
  }

  db.collection('requests').where('sellerId', '==', uid).get()
    .then(snap => { incoming = snap.docs.map(d => ({ id: d.id, ...d.data() })); done++; if (done === 2) render(); })
    .catch(() => { done++; if (done === 2) render(); });

  db.collection('requests').where('buyerId', '==', uid).get()
    .then(snap => { outgoing = snap.docs.map(d => ({ id: d.id, ...d.data() })); done++; if (done === 2) render(); })
    .catch(() => { done++; if (done === 2) render(); });
}

async function acceptRequest(requestId, req) {
  try {
    const convoRef = await db.collection('conversations').add({
      participants: [req.buyerId, req.sellerId],
      buyerId:   req.buyerId,
      buyerName: req.buyerName,
      sellerId:  req.sellerId,
      sellerName:req.sellerName,
      itemId:    req.itemId,
      itemTitle: req.itemTitle,
      requestId,
      lastMessage:   '',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      [`unread_${req.buyerId}`]:  0,
      [`unread_${req.sellerId}`]: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('requests').doc(requestId).update({
      status: 'accepted',
      conversationId: convoRef.id
    });

    // Notify buyer their request was accepted
    if (window.notifyRequestAccepted) {
      window.notifyRequestAccepted(req.buyerId, {
        sellerName: req.sellerName,
        sellerId:   req.sellerId,
        itemTitle:  req.itemTitle,
        itemId:     req.itemId,
        conversationId: convoRef.id,
      });
    }

    const convoSnap = await db.collection('conversations').doc(convoRef.id).get();
    openConversation(convoRef.id, convoSnap.data());
    loadRequests();

  } catch(e) {
    console.error('Accept error:', e);
    alert('Could not accept request. Try again.');
  }
}

async function rejectRequest(requestId) {
  if (!confirm('Decline this request?')) return;
  try {
    // Fetch request data first so we can notify the buyer
    const snap = await db.collection('requests').doc(requestId).get();
    const req  = snap.data();
    await db.collection('requests').doc(requestId).update({ status: 'rejected' });

    // Notify buyer their request was declined
    if (req && window.notifyRequestRejected) {
      window.notifyRequestRejected(req.buyerId, {
        sellerName: req.sellerName,
        sellerId:   req.sellerId,
        itemTitle:  req.itemTitle,
        itemId:     req.itemId,
      });
    }
    loadRequests();
  } catch(e) { console.error(e); }
}

// ── Cancel pending request (buyer) ────────────────────
async function cancelRequest(requestId) {
  if (!confirm('Cancel this request?')) return;
  try {
    await db.collection('requests').doc(requestId).update({ status: 'cancelled' });
    loadRequests();
  } catch(e) { console.error(e); }
}

// ── Request cancellation on accepted order (buyer) ────
async function requestCancellation(requestId, req) {
  if (!confirm('Request cancellation? The seller will need to confirm.')) return;
  try {
    await db.collection('requests').doc(requestId).update({ status: 'cancel_requested' });
    if (window.notify) {
      window.notify(req.sellerId, {
        type:'cancel_request', icon:'⚠️', title:'Cancellation Requested',
        body:`${req.buyerName} wants to cancel their order for "${req.itemTitle}"`,
        fromUid:req.buyerId, fromName:req.buyerName, itemId:req.itemId,
      });
    }
    loadRequests();
  } catch(e) { console.error(e); }
}

// ── Seller confirms cancellation ──────────────────────
async function confirmCancelRequest(requestId, req) {
  if (!confirm('Confirm cancellation? This order will be cancelled.')) return;
  try {
    await db.collection('requests').doc(requestId).update({ status: 'cancelled' });
    if (window.notify) {
      window.notify(req.buyerId, {
        type:'cancelled', icon:'✕', title:'Order Cancelled',
        body:`Your order for "${req.itemTitle}" has been cancelled`,
        fromUid:req.sellerId, fromName:req.sellerName, itemId:req.itemId,
      });
    }
    loadRequests();
  } catch(e) { console.error(e); }
}

// ── Seller denies cancellation ────────────────────────
async function denyCancelRequest(requestId) {
  try {
    await db.collection('requests').doc(requestId).update({ status: 'accepted' });
    loadRequests();
  } catch(e) { console.error(e); }
}

// ── Conversation View ─────────────────────────────────

function openConversation(conversationId, data) {
  _currentConversation = { id: conversationId, ...data };

  const overlay   = document.getElementById('conversationOverlay');
  const otherName = data.buyerId === window.currentUser.uid ? data.sellerName : data.buyerName;

  document.getElementById('convTitle').textContent    = otherName || 'Chat';
  document.getElementById('convSubtitle').textContent = data.itemTitle || '';
  document.getElementById('convMessages').innerHTML   = '<p class="reviews-empty">Loading…</p>';
  document.getElementById('convInput').value          = '';

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    overlay.querySelector('.overlay-sheet').classList.add('open')
  );
  feather.replace();

  // Mark read
  db.collection('conversations').doc(conversationId)
    .update({ [`unread_${window.currentUser.uid}`]: 0 }).catch(() => {});

  // Real-time messages
  if (_messagesUnsub) _messagesUnsub();
  _messagesUnsub = db.collection('conversations').doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const container = document.getElementById('convMessages');
      if (snap.empty) {
        container.innerHTML = '<p class="reviews-empty">No messages yet — say hello!</p>';
        return;
      }
      container.innerHTML = '';
      snap.forEach(doc => {
        const d    = doc.data();
        const isMe = d.senderId === window.currentUser.uid;
        const time = d.createdAt
          ? d.createdAt.toDate().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' })
          : '';
        const bubble = document.createElement('div');
        bubble.className = `msg-bubble ${isMe ? 'msg-mine' : 'msg-theirs'}`;
        bubble.innerHTML = `<p class="msg-text">${d.text}</p><span class="msg-time">${time}</span>`;
        container.appendChild(bubble);
      });
      container.scrollTop = container.scrollHeight;
    }, err => console.error('Messages:', err));
}

function closeConversation() {
  const overlay = document.getElementById('conversationOverlay');
  if (!overlay) return;
  overlay.querySelector('.overlay-sheet').classList.remove('open');
  setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 320);
  if (_messagesUnsub) { _messagesUnsub(); _messagesUnsub = null; }
  _currentConversation = null;
}

async function sendMessage() {
  if (!_currentConversation || !window.currentUser) return;
  const input = document.getElementById('convInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  const otherUid = _currentConversation.buyerId === window.currentUser.uid
    ? _currentConversation.sellerId
    : _currentConversation.buyerId;

  try {
    await db.collection('conversations').doc(_currentConversation.id)
      .collection('messages').add({
        senderId:   window.currentUser.uid,
        senderName: window.currentUser.name,
        text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    await db.collection('conversations').doc(_currentConversation.id).update({
      lastMessage:   text,
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      [`unread_${otherUid}`]: firebase.firestore.FieldValue.increment(1)
    });

    // Notify recipient of new message
    if (window.notifyNewMessage) {
      window.notifyNewMessage(otherUid, {
        senderName:     window.currentUser.name,
        senderId:       window.currentUser.uid,
        text,
        conversationId: _currentConversation.id,
      });
    }
  } catch(e) {
    console.error('Send error:', e);
    input.value = text;
  }
}

// ── Inbox Badge ───────────────────────────────────────

window.startInboxBadgeListener = function() {
  if (!window.currentUser) return;
  const uid = window.currentUser.uid;

  db.collection('conversations')
    .where('participants', 'array-contains', uid)
    .onSnapshot(snap => {
      let unread = 0;
      snap.forEach(doc => { unread += doc.data()[`unread_${uid}`] || 0; });

      db.collection('requests').where('sellerId', '==', uid).get()
        .then(reqSnap => {
          const pending = reqSnap.docs.filter(d => d.data().status === 'pending').length;
          const total   = unread + pending;
          ['inboxNavBadge','menuInboxBadge'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = total;
            el.classList.toggle('hidden', total === 0);
          });
        }).catch(() => {});
    }, err => {
      console.warn('Inbox badge listener error:', err.code || err.message);
    });
};

// ══════════════════════════════════════════════
// DOM INIT
// ══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── Saved items ────────────────────────────
  const savedClose   = document.getElementById('savedClose');
  const savedOverlay = document.getElementById('savedOverlay');
  if (savedClose)   savedClose.addEventListener('click', closeSavedItems);
  if (savedOverlay) savedOverlay.addEventListener('click', e => {
    if (e.target === savedOverlay) closeSavedItems();
  });

  // ── Request modal ──────────────────────────
  const reqClose   = document.getElementById('reqClose');
  const reqOverlay = document.getElementById('requestOverlay');
  const reqSubmit  = document.getElementById('reqSubmitBtn');
  if (reqClose)   reqClose.addEventListener('click', closeRequestModal);
  if (reqOverlay) reqOverlay.addEventListener('click', e => {
    if (e.target === reqOverlay) closeRequestModal();
  });
  if (reqSubmit) reqSubmit.addEventListener('click', submitRequest);

  // ── Inbox ──────────────────────────────────
  const inboxClose    = document.getElementById('inboxClose');
  const inboxOverlay  = document.getElementById('inboxOverlay');
  const tabMessages   = document.getElementById('inboxTabMessages');
  const tabRequests   = document.getElementById('inboxTabRequests');
  if (inboxClose)   inboxClose.addEventListener('click', closeInbox);
  if (inboxOverlay) inboxOverlay.addEventListener('click', e => {
    if (e.target === inboxOverlay) closeInbox();
  });
  if (tabMessages) tabMessages.addEventListener('click', () => switchInboxTab('messages'));
  if (tabRequests) tabRequests.addEventListener('click', () => switchInboxTab('requests'));

  // ── Conversation ───────────────────────────
  const convClose   = document.getElementById('convClose');
  const convOverlay = document.getElementById('conversationOverlay');
  const convBack    = document.getElementById('convBack');
  const convSend    = document.getElementById('convSendBtn');
  const convInput   = document.getElementById('convInput');
  if (convClose)   convClose.addEventListener('click', closeConversation);
  if (convOverlay) convOverlay.addEventListener('click', e => {
    if (e.target === convOverlay) closeConversation();
  });
  if (convBack) convBack.addEventListener('click', () => {
    closeConversation();
    setTimeout(() => { switchInboxTab('requests'); window.openInbox(); }, 350);
  });
  if (convSend)  convSend.addEventListener('click', sendMessage);
  if (convInput) {
    // Auto-resize textarea
    convInput.addEventListener('input', () => {
      convInput.style.height = 'auto';
      convInput.style.height = Math.min(convInput.scrollHeight, 120) + 'px';
    });
    // Shift+Enter = newline, Enter alone = send
    convInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  // Newline button
  const convNewline = document.getElementById('convNewlineBtn');
  if (convNewline) convNewline.addEventListener('click', () => {
    const inp = document.getElementById('convInput');
    if (!inp) return;
    const pos = inp.selectionStart;
    inp.value = inp.value.slice(0, pos) + '\n' + inp.value.slice(pos);
    inp.selectionStart = inp.selectionEnd = pos + 1;
    inp.focus();
    inp.dispatchEvent(new Event('input'));
  });

  // Emoji picker
  const EMOJIS = ['😊','😂','🔥','❤️','👍','😍','🙏','💯','😭','🤔','👏','😎','🎉','💪','😅','🤣','😘','👋','🥳','🙌','😩','💀','✅','⚡','🏃','📦','💰','🛍️','📱','💬','🤝','👀','😮','🤩','🥺'];

  const emojiBtn    = document.getElementById('convEmojiBtn');
  const emojiPicker = document.getElementById('emojiPicker');
  const emojiGrid   = document.getElementById('emojiGrid');

  if (emojiGrid && EMOJIS.length) {
    emojiGrid.innerHTML = '';
    EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.className   = 'emoji-btn';
      btn.textContent = em;
      btn.addEventListener('click', () => {
        const inp = document.getElementById('convInput');
        if (!inp) return;
        const pos = inp.selectionStart || inp.value.length;
        inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
        inp.selectionStart = inp.selectionEnd = pos + em.length;
        inp.focus();
        if (emojiPicker) emojiPicker.classList.add('hidden');
      });
      emojiGrid.appendChild(btn);
    });
  }

  if (emojiBtn && emojiPicker) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add('hidden');
      }
    });
  }

  // ── Bottom nav inbox ───────────────────────
  const navInbox = document.getElementById('navInbox');
  if (navInbox) navInbox.addEventListener('click', () => window.openInbox());

  // ── Sidebar saved ──────────────────────────
  const menuSaved = document.getElementById('menuSaved');
  if (menuSaved) menuSaved.addEventListener('click', e => {
    e.preventDefault();
    ['sidebar','sidebarOverlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('open','show'); }
    });
    document.body.style.overflow = '';
    window.openSavedItems();
  });

  // ── Sidebar inbox ──────────────────────────
  const menuInbox = document.getElementById('menuInbox');
  if (menuInbox) menuInbox.addEventListener('click', e => {
    e.preventDefault();
    ['sidebar','sidebarOverlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('open','show'); }
    });
    document.body.style.overflow = '';
    window.openInbox();
  });

  // ── Swipe to close ─────────────────────────
  [
    ['savedOverlay',       closeSavedItems],
    ['requestOverlay',     closeRequestModal],
    ['inboxOverlay',       closeInbox],
    ['conversationOverlay',closeConversation],
  ].forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sheet = el.querySelector('.overlay-sheet');
    if (!sheet) return;
    let y0 = 0;
    sheet.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; });
    sheet.addEventListener('touchend',   e => {
      if (e.changedTouches[0].clientY - y0 > 160) fn();
    });
  });
});

// Expose for auth.js
window._loadUserFavorites = loadUserFavorites;
