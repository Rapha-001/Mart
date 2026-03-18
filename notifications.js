// ── notifications.js — In-App & Push Notifications ────
// Depends on: firebase.js, app.js
// Exposes: window.notify, window.startNotifListener

const VAPID_KEY = ''; // Add from Firebase Console → Project Settings → Cloud Messaging when on Blaze

// ══════════════════════════════════════════════════════
// NOTIFICATION WRITERS
// ══════════════════════════════════════════════════════

window.notify = async function(uid, data) {
  if (!uid) return;
  try {
    await db.collection('notifications').doc(uid)
      .collection('items').add({
        ...data,
        read:      false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch(e) { console.warn('Notification write failed:', e.message); }
};

window.notifyNewRequest = (sellerUid, data) => window.notify(sellerUid, {
  type:'request', icon:'🛍️', title:'New Request',
  body:`${data.buyerName} requested "${data.itemTitle}"`,
  itemId:data.itemId, fromUid:data.buyerId, fromName:data.buyerName,
});

window.notifyRequestAccepted = (buyerUid, data) => window.notify(buyerUid, {
  type:'accepted', icon:'✅', title:'Request Accepted!',
  body:`${data.sellerName} accepted your request for "${data.itemTitle}"`,
  itemId:data.itemId, fromUid:data.sellerId, fromName:data.sellerName,
  conversationId:data.conversationId,
});

window.notifyRequestRejected = (buyerUid, data) => window.notify(buyerUid, {
  type:'rejected', icon:'❌', title:'Request Declined',
  body:`${data.sellerName} declined your request for "${data.itemTitle}"`,
  itemId:data.itemId, fromUid:data.sellerId, fromName:data.sellerName,
});

window.notifyNewMessage = (recipientUid, data) => window.notify(recipientUid, {
  type:'message', icon:'💬', title:`Message from ${data.senderName}`,
  body:data.text.length > 60 ? data.text.slice(0,57)+'…' : data.text,
  conversationId:data.conversationId, fromUid:data.senderId, fromName:data.senderName,
});

window.notifyItemSold = (buyerUid, data) => window.notify(buyerUid, {
  type:'sold', icon:'📦', title:'Item Confirmed Sold',
  body:`"${data.itemTitle}" has been confirmed sold by ${data.sellerName}`,
  itemId:data.itemId, fromUid:data.sellerUid, fromName:data.sellerName,
});

// ══════════════════════════════════════════════════════
// REAL-TIME LISTENER + BADGE
// ══════════════════════════════════════════════════════

let _notifUnsub = null;

window.startNotifListener = function() {
  if (!window.currentUser) return;
  const uid = window.currentUser.uid;
  if (_notifUnsub) _notifUnsub();

  _notifUnsub = db.collection('notifications').doc(uid)
    .collection('items')
    .where('read', '==', false)
    .onSnapshot(snap => {
      updateNotifBadge(snap.size);
      if (!snap.metadata.hasPendingWrites) {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d  = change.doc.data();
            const ts = d.createdAt?.toDate?.();
            if (ts && (Date.now() - ts.getTime()) < 10000) {
              showInAppToast(d);
            }
          }
        });
      }
    }, err => console.warn('Notif listener:', err.message));
};

function updateNotifBadge(count) {
  ['notifBellBtnH','notifBellBtnB','notifBellBtnG'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    let badge = btn.querySelector('.notif-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'notif-count-badge';
      btn.appendChild(badge);
    }
    badge.textContent  = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
  ['notifDotH','notifDotB','notifDotG','notifDotS'].forEach(id => {
    const d = document.getElementById(id);
    if (d) d.classList.toggle('hidden', count === 0);
  });
}

// ══════════════════════════════════════════════════════
// IN-APP TOAST
// ══════════════════════════════════════════════════════

function showInAppToast(notif) {
  const overlay = document.getElementById('notifOverlay');
  if (overlay && !overlay.classList.contains('hidden')) return;
  const existing = document.getElementById('inAppNotifToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'inAppNotifToast';
  toast.className = 'in-app-toast';
  toast.innerHTML = `
    <div class="in-app-toast-icon">${notif.icon||'🔔'}</div>
    <div class="in-app-toast-body">
      <p class="in-app-toast-title">${notif.title}</p>
      <p class="in-app-toast-msg">${notif.body}</p>
    </div>
    <button class="in-app-toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  toast.addEventListener('click', e => {
    if (e.target.classList.contains('in-app-toast-close')) return;
    toast.remove();
    window.openNotifOverlay?.();
  });
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
  requestAnimationFrame(() => toast.classList.add('show'));
}

// ══════════════════════════════════════════════════════
// NOTIFICATION OVERLAY
// ══════════════════════════════════════════════════════

window.openNotifOverlay = function() {
  if (!window.currentUser) return;
  const overlay = document.getElementById('notifOverlay');
  if (!overlay) return;
  switchNotifTab('mine');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    overlay.querySelector('.overlay-sheet')?.classList.add('open')
  );
  feather.replace();
};

async function loadUserNotifications() {
  if (!window.currentUser) return;
  const uid  = window.currentUser.uid;
  const list = document.getElementById('notifUserList');
  if (!list) return;
  list.innerHTML = '<p class="notif-empty">Loading…</p>';

  try {
    const snap = await db.collection('notifications').doc(uid)
      .collection('items')
      .orderBy('createdAt','desc')
      .limit(30).get();

    // Mark all read
    const batch = db.batch();
    snap.docs.forEach(doc => { if (!doc.data().read) batch.update(doc.ref, { read:true }); });
    await batch.commit().catch(()=>{});
    updateNotifBadge(0);

    if (snap.empty) {
      list.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
      return;
    }

    list.innerHTML = '';
    snap.forEach(doc => {
      const n    = doc.data();
      const time = n.createdAt
        ? n.createdAt.toDate().toLocaleDateString('en-NG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
        : '';
      const card = document.createElement('div');
      card.className = `notif-card ${!n.read ? 'notif-unread' : ''}`;
      card.innerHTML = `
        <div class="notif-card-icon-wrap">${n.icon||'🔔'}</div>
        <div class="notif-card-body">
          <p class="notif-card-title">${n.title}</p>
          <p class="notif-card-msg">${n.body}</p>
          <p class="notif-card-time">${time}</p>
        </div>
      `;
      if (n.conversationId) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          const s = document.getElementById('notifOverlay')?.querySelector('.overlay-sheet');
          s?.classList.remove('open');
          setTimeout(() => {
            document.getElementById('notifOverlay')?.classList.add('hidden');
            document.body.style.overflow = '';
            window.openInbox?.('messages');
          }, 320);
        });
      }
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = '<p class="notif-empty">Could not load.</p>';
  }
}

window.switchNotifTab = function(tab) {
  document.getElementById('notifTabMine')?.classList.toggle('active', tab === 'mine');
  document.getElementById('notifTabAnnounce')?.classList.toggle('active', tab === 'announce');
  document.getElementById('notifUserList')?.classList.toggle('hidden', tab !== 'mine');
  document.getElementById('notifAnnounceList')?.classList.toggle('hidden', tab !== 'announce');
  if (tab === 'mine') loadUserNotifications();
  else loadAnnouncementsTab();
};

async function loadAnnouncementsTab() {
  const list = document.getElementById('notifAnnounceList');
  if (!list) return;
  list.innerHTML = '<p class="notif-empty">Loading…</p>';
  try {
    const snap = await db.collection('announcements').orderBy('createdAt','desc').limit(10).get();
    if (snap.empty) { list.innerHTML = '<p class="notif-empty">No announcements yet.</p>'; return; }
    list.innerHTML = '';
    snap.forEach(doc => {
      const d    = doc.data();
      const date = d.createdAt
        ? d.createdAt.toDate().toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})
        : '';
      const card = document.createElement('div');
      card.className = 'notif-card';
      card.innerHTML = `
        <div class="notif-card-icon-wrap">📢</div>
        <div class="notif-card-body">
          <p class="notif-card-title">${d.title||'Announcement'}</p>
          <p class="notif-card-msg">${d.message||''}</p>
          <p class="notif-card-time">${date}</p>
        </div>
      `;
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = '<p class="notif-empty">Could not load.</p>';
  }
}

// ══════════════════════════════════════════════════════
// PUSH PERMISSION GROUNDWORK (ready for Blaze)
// ══════════════════════════════════════════════════════

window.initPush = async function() {
  if (!window.currentUser) return;
  if (!('Notification' in window) || Notification.permission === 'denied') return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    // Store permission granted flag — FCM token added when Blaze enabled
    await db.collection('users').doc(window.currentUser.uid)
      .update({ pushPermission:'granted' });
    console.log('Push permission granted — ready for Blaze upgrade');
  } catch(e) { console.warn('Push init:', e.message); }
};

// ══════════════════════════════════════════════════════
// DOM INIT
// ══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // The notifOverlay is now a two-tab panel
  // We replace its inner list with tabbed content
  const notifOverlay = document.getElementById('notifOverlay');
  if (!notifOverlay) return;
  const sheet = notifOverlay.querySelector('.overlay-sheet');
  if (!sheet) return;

  // Rebuild inner content with tabs
  const header = sheet.querySelector('.notif-header');
  if (header && !document.getElementById('notifTabMine')) {
    // Insert tabs after header
    const tabs = document.createElement('div');
    tabs.className = 'notif-tabs';
    tabs.innerHTML = `
      <button class="notif-tab active" id="notifTabMine" onclick="window.switchNotifTab('mine')">My Notifications</button>
      <button class="notif-tab" id="notifTabAnnounce" onclick="window.switchNotifTab('announce')">Announcements</button>
    `;
    header.after(tabs);

    // Replace single list with two panels
    const oldList = sheet.querySelector('#notifList');
    if (oldList) {
      const userList = document.createElement('div');
      userList.id = 'notifUserList';
      userList.className = 'notif-list';

      const announceList = document.createElement('div');
      announceList.id = 'notifAnnounceList';
      announceList.className = 'notif-list hidden';

      oldList.replaceWith(userList, announceList);
    }
  }
});
