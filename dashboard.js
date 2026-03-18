// ── dashboard.js — Seller & Buyer Dashboards ──────────
// Full-page views, not overlays.

const PAYSTACK_KEY = 'pk_live_08fb59ad0a1e377477bde003b9b4ad62dfbc0784';
const PRO_AMOUNT   = 150000; // ₦1,500 in kobo

// ── Page navigation helper ────────────────────────────
// mainGrid = marketplace, dashPages = full-screen pages
function showPage(pageId) {
  const pages   = ['sellerDashPage','buyerDashPage'];
  const mainGrid = document.getElementById('mainGrid');
  const header   = document.querySelector('header');
  const searchWrap = document.querySelector('.search-wrap');
  const chipsWrap  = document.querySelector('.chips-wrap');
  const filterPanel = document.getElementById('filterPanel');
  const activeFilters = document.getElementById('activeFilters');
  const resultsCount  = document.getElementById('resultsCount');
  const welcomeBanner = document.getElementById('welcomeBanner');

  const marketEls = [mainGrid, header, searchWrap, chipsWrap, filterPanel, activeFilters, resultsCount, welcomeBanner];

  if (pageId === 'market') {
    // Show marketplace
    marketEls.forEach(el => { if (el) el.style.display = ''; });
    pages.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Restore correct nav active state
    updateNavActive('market');
  } else {
    // Hide marketplace, show dash page
    marketEls.forEach(el => { if (el) el.style.display = 'none'; });
    pages.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== pageId);
    });
    updateNavActive(pageId);
    window.scrollTo(0, 0);
  }
}

function updateNavActive(view) {
  // Seller nav
  document.getElementById('navMarket')?.classList.toggle('nav-active', view === 'market');
  document.getElementById('navSellerDash')?.classList.toggle('nav-active', view === 'sellerDashPage');
  // Buyer nav
  document.getElementById('navHome')?.classList.toggle('nav-active', view === 'market');
}

// ══════════════════════════════════════════════════════
// SELLER DASHBOARD
// ══════════════════════════════════════════════════════
let _sellerTab = 'listings';

window.openSellerDashboard = async function() {
  if (!window.currentUser) return;
  showPage('sellerDashPage');

  // Real-time listener on user doc — reflects Pro grant and verification instantly
  if (window._sellerDashUnsub) window._sellerDashUnsub();
  window._sellerDashUnsub = db.collection('users').doc(window.currentUser.uid)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      // Update Pro status
      if (data.sellerPro && !window.currentUser.sellerPro) {
        window.currentUser.sellerPro = true;
        // If on a pro-gated tab, reload it
        if (_sellerTab === 'earnings' || _sellerTab === 'analytics') {
          switchSellerTab(_sellerTab);
        }
      }
      window.currentUser.sellerPro = data.sellerPro || false;
      window.currentUser.verified  = data.verified  || false;

      const isPro    = window.currentUser.sellerPro;
      const verified = window.currentUser.verified;
      const planEl   = document.getElementById('sellerDashPlan');
      const upBtn    = document.getElementById('sellerUpgradeBtn');
      const verBadge = document.getElementById('sellerVerifiedBadge');

      if (planEl) {
        planEl.textContent = isPro ? '⚡ Pro' : 'Free Plan';
        planEl.className   = isPro ? 'dash-plan-badge pro' : 'dash-plan-badge free';
      }
      if (upBtn)    upBtn.classList.toggle('hidden', isPro);
      if (verBadge) {
        verBadge.style.display = verified ? 'inline-flex' : 'none';
      }
    }, () => {});

  document.getElementById('sellerDashName').textContent = window.currentUser.name;
  feather.replace();
  loadSellerStats();
  switchSellerTab(_sellerTab);
};

window.closeSellerDashboard = function() { showPage('market'); };

function switchSellerTab(tab) {
  _sellerTab = tab;
  ['listings','requests','orders','earnings','analytics'].forEach(t => {
    const btn = document.getElementById('dTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });

  const isPro = window.currentUser?.sellerPro;
  if ((tab === 'earnings' || tab === 'analytics') && !isPro) { renderProGate(); return; }

  const content = document.getElementById('sellerDashContent');
  if (content) content.innerHTML = '<p class="reviews-empty">Loading…</p>';

  if (tab === 'listings')  loadSellerListings();
  if (tab === 'requests')  loadSellerRequests();
  if (tab === 'orders')    loadSellerOrders();
  if (tab === 'earnings')  loadSellerEarnings();
  if (tab === 'analytics') loadSellerAnalytics();
}

async function loadSellerStats() {
  const uid = window.currentUser.uid;
  try {
    const [itemsSnap, reqSnap] = await Promise.all([
      db.collection('items').where('sellerUid','==',uid).get(),
      db.collection('requests').where('sellerId','==',uid).get()
    ]);
    let totalViews = 0, sold = 0;
    itemsSnap.forEach(d => { totalViews += d.data().views||0; if(d.data().sold) sold++; });
    const pending = reqSnap.docs.filter(d => d.data().status === 'pending').length;
    document.getElementById('dSListings').textContent = itemsSnap.size;
    document.getElementById('dSSold').textContent     = sold;
    document.getElementById('dSPending').textContent  = pending;
    document.getElementById('dSViews').textContent    = totalViews;

    // Orders badge on nav
    const badge = document.getElementById('ordersNavBadge');
    if (badge) { badge.textContent = pending; badge.classList.toggle('hidden', pending === 0); }
  } catch(e) { console.error(e); }
}

async function loadSellerListings() {
  const content = document.getElementById('sellerDashContent');
  try {
    const snap = await db.collection('items').where('sellerUid','==',window.currentUser.uid).get();
    if (snap.empty) { content.innerHTML = '<p class="reviews-empty">No listings yet.</p>'; return; }
    content.innerHTML = '';
    snap.docs.sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))
      .forEach(doc => {
        const d = doc.data();
        const img = (d.imageUrls||[])[0]||'';
        const card = document.createElement('div');
        card.className = 'dash-item-card';
        card.innerHTML = `
          <div class="dash-item-img" ${img?`style="background-image:url('${img}')"`:''}>${!img?'📦':''}</div>
          <div class="dash-item-info">
            <p class="dash-item-title">${d.title}</p>
            <p class="dash-item-price">₦${Number(d.price).toLocaleString()}</p>
            <div class="dash-item-meta">
              <span class="dash-status-badge ${d.sold?'sold':'active'}">${d.sold?'Sold':'Active'}</span>
              <span style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:3px;"><i data-feather="eye" style="width:12px;height:12px;"></i> ${d.views||0}</span>
            </div>
          </div>
          <button class="dash-item-toggle ${d.sold?'is-sold':''}" data-id="${doc.id}" data-sold="${!!d.sold}">${d.sold?'Relist':'Mark Sold'}</button>
        `;
        card.querySelector('.dash-item-toggle').addEventListener('click', async e => {
          const btn = e.currentTarget;
          const newSold = btn.dataset.sold !== 'true';
          try { await db.collection('items').doc(btn.dataset.id).update({ sold: newSold }); loadSellerListings(); loadSellerStats(); } catch(e){}
        });
        content.appendChild(card);
      });
    feather.replace();
  } catch(e) { content.innerHTML = '<p class="reviews-empty">Could not load listings.</p>'; }
}

async function loadSellerRequests() {
  const content = document.getElementById('sellerDashContent');
  try {
    const snap = await db.collection('requests').where('sellerId','==',window.currentUser.uid).get();
    if (snap.empty) { content.innerHTML = '<p class="reviews-empty">No requests yet.</p>'; return; }
    content.innerHTML = '';
    const pending = snap.docs.filter(d=>d.data().status==='pending');
    const others  = snap.docs.filter(d=>d.data().status!=='pending');
    [...pending,...others].forEach(doc => {
      const req = doc.data();
      const statusMap = {pending:'⏳ Pending',accepted:'✓ Accepted',rejected:'✗ Declined'};
      const statusCls = {pending:'badge-pending',accepted:'badge-accepted',rejected:'badge-rejected'};
      const card = document.createElement('div');
      card.className = 'request-card';
      card.innerHTML = `
        <div class="request-card-top">
          ${req.itemImage?`<div class="request-card-img" style="background-image:url('${req.itemImage}')"></div>`:'<div class="request-card-img">📦</div>'}
          <div class="request-card-info">
            <p class="request-card-title">${req.itemTitle}</p>
            <p class="request-card-price">₦${Number(req.itemPrice).toLocaleString()}</p>
            <p class="request-card-party">From: <strong>${req.buyerName}</strong></p>
            ${req.message?`<p class="request-card-msg">"${req.message}"</p>`:''}
          </div>
        </div>
        <div class="request-status-row">
          <span class="request-badge ${statusCls[req.status]||''}">${statusMap[req.status]||req.status}</span>
          ${req.status==='pending'?`<div class="request-actions"><button class="req-accept-btn" data-id="${doc.id}">✓ Accept</button><button class="req-reject-btn" data-id="${doc.id}">✗ Decline</button></div>`:''}
        </div>
      `;
      if (req.status==='pending') {
        card.querySelector('.req-accept-btn').addEventListener('click', async () => {
          try {
            const convoRef = await db.collection('conversations').add({
              participants:[req.buyerId,req.sellerId],buyerId:req.buyerId,buyerName:req.buyerName,
              sellerId:req.sellerId,sellerName:req.sellerName,itemId:req.itemId,itemTitle:req.itemTitle,
              requestId:doc.id,lastMessage:'',lastMessageAt:firebase.firestore.FieldValue.serverTimestamp(),
              [`unread_${req.buyerId}`]:0,[`unread_${req.sellerId}`]:0,
              createdAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('requests').doc(doc.id).update({status:'accepted',conversationId:convoRef.id});
            loadSellerRequests(); loadSellerStats();
          } catch(e){console.error(e);}
        });
        card.querySelector('.req-reject-btn').addEventListener('click', async () => {
          if (!confirm('Decline this request?')) return;
          await db.collection('requests').doc(doc.id).update({status:'rejected'});
          loadSellerRequests(); loadSellerStats();
        });
      }
      content.appendChild(card);
    });
    feather.replace();
  } catch(e) { content.innerHTML = '<p class="reviews-empty">Could not load requests.</p>'; }
}

async function loadSellerOrders() {
  const content = document.getElementById('sellerDashContent');
  try {
    const snap = await db.collection('requests').where('sellerId','==',window.currentUser.uid).get();
    const orders = snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(r=>['accepted','cancel_requested','cancelled'].includes(r.status))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if (!orders.length) { content.innerHTML = '<p class="reviews-empty">No orders yet.</p>'; return; }
    content.innerHTML = `
      <div class="dash-order-filter" id="sellerOrderFilter">
        <button class="filter-chip active" data-status="all">All</button>
        <button class="filter-chip" data-status="accepted">Active</button>
        <button class="filter-chip" data-status="cancel_requested">Cancel Requests</button>
        <button class="filter-chip" data-status="cancelled">Cancelled</button>
      </div>
      <div id="sellerOrderList"></div>`;
    window._sellerOrders = orders;
    renderSellerOrders(orders);
    document.querySelectorAll('#sellerOrderFilter .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sellerOrderFilter .filter-chip').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const status = btn.dataset.status;
        renderSellerOrders(status==='all' ? window._sellerOrders : window._sellerOrders.filter(r=>r.status===status));
      });
    });
    feather.replace();
  } catch(e) { content.innerHTML = '<p class="reviews-empty">Could not load orders.</p>'; }
}

function renderSellerOrders(orders) {
  const list = document.getElementById('sellerOrderList');
  if (!list) return;
  if (!orders.length) { list.innerHTML = '<p class="reviews-empty">No orders here.</p>'; return; }
  const statusMap = {accepted:'✓ Active',cancel_requested:'⚠️ Cancel Req',cancelled:'✕ Cancelled'};
  const statusCls = {accepted:'badge-accepted',cancel_requested:'badge-pending',cancelled:'badge-rejected'};
  list.innerHTML = '';
  orders.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    const imgHtml = req.itemImage ? `<div class="request-card-img" style="background-image:url('${req.itemImage}')"></div>` : '<div class="request-card-img">📦</div>';
    card.innerHTML = `
      <div class="request-card-top">
        ${imgHtml}
        <div class="request-card-info">
          <p class="request-card-title">${req.itemTitle}</p>
          <p class="request-card-price">₦${Number(req.itemPrice).toLocaleString()}</p>
          <p class="request-card-party">Buyer: <strong>${req.buyerName}</strong></p>
        </div>
      </div>
      <div class="request-status-row">
        <span class="request-badge ${statusCls[req.status]||''}">${statusMap[req.status]||req.status}</span>
        ${req.status==='cancel_requested' ? '<button class="req-accept-btn" data-action="confirm">✓ Confirm Cancel</button><button class="req-reject-btn" data-action="deny">✗ Keep Order</button>' : ''}
        ${req.status==='accepted'&&req.conversationId ? '<button class="req-chat-btn">💬 Chat</button>' : ''}
      </div>`;
    if (req.status==='cancel_requested') {
      card.querySelector('[data-action="confirm"]').addEventListener('click', async()=>{
        if (!confirm('Confirm cancellation?')) return;
        await db.collection('requests').doc(req.id).update({status:'cancelled'});
        if (window.notify) window.notify(req.buyerId,{type:'cancelled',icon:'✕',title:'Order Cancelled',body:`Your order for "${req.itemTitle}" was cancelled`,fromUid:req.sellerId,fromName:req.sellerName,itemId:req.itemId});
        loadSellerOrders();
      });
      card.querySelector('[data-action="deny"]').addEventListener('click', async()=>{
        await db.collection('requests').doc(req.id).update({status:'accepted'});
        loadSellerOrders();
      });
    }
    if (req.status==='accepted'&&req.conversationId) {
      card.querySelector('.req-chat-btn').addEventListener('click',()=>{showPage('market');setTimeout(()=>{if(window.openInbox)window.openInbox('messages');},200);});
    }
    list.appendChild(card);
  });
  feather.replace();
}

function renderProGate() {
  const content = document.getElementById('sellerDashContent');
  content.innerHTML = `
    <div class="pro-gate">
      <div class="pro-gate-icon">⚡</div>
      <h3 class="pro-gate-title">Seller Pro</h3>
      <p class="pro-gate-desc">Unlock earnings tracking and analytics.</p>
      <ul class="pro-gate-list">
        <li>₦ Earnings breakdown per listing</li>
        <li>Views, saves and conversion rate</li>
        <li>Best performing categories</li>
        <li>Weekly performance summary</li>
      </ul>
      <p class="pro-gate-price">₦1,500 / month</p>
      <button class="pro-gate-btn" id="proUpgradeBtn">Upgrade to Pro →</button>
    </div>`;
  document.getElementById('proUpgradeBtn').addEventListener('click', paystackUpgrade);
}

async function loadSellerEarnings() {
  const content = document.getElementById('sellerDashContent');
  try {
    const snap = await db.collection('requests').where('sellerId','==',window.currentUser.uid).where('status','==','accepted').get();
    let total = 0;
    const breakdown = [];
    snap.forEach(doc => { const d=doc.data(); total+=Number(d.itemPrice||0); breakdown.push({title:d.itemTitle,price:Number(d.itemPrice||0),buyer:d.buyerName}); });
    content.innerHTML = `
      <div class="earnings-total"><p class="earnings-label">Total Earnings</p><p class="earnings-amount">₦${total.toLocaleString()}</p></div>
      <p class="dash-section-title">Breakdown</p>
      ${breakdown.length===0?'<p class="reviews-empty">No accepted orders yet.</p>':
        breakdown.map(b=>`<div class="earnings-row"><div class="earnings-row-info"><p class="earnings-row-title">${b.title}</p><p class="earnings-row-buyer">Buyer: ${b.buyer}</p></div><p class="earnings-row-amount">₦${b.price.toLocaleString()}</p></div>`).join('')}`;
  } catch(e) { content.innerHTML = '<p class="reviews-empty">Could not load earnings.</p>'; }
}

async function loadSellerAnalytics() {
  const content = document.getElementById('sellerDashContent');
  try {
    const snap = await db.collection('items').where('sellerUid','==',window.currentUser.uid).get();
    let totalViews=0,totalLikes=0;
    const byCategory={};
    snap.forEach(doc=>{const d=doc.data();totalViews+=d.views||0;totalLikes+=d.likes||0;const cat=d.category||'other';if(!byCategory[cat])byCategory[cat]={views:0,count:0};byCategory[cat].views+=d.views||0;byCategory[cat].count++;});
    const topCat=Object.entries(byCategory).sort((a,b)=>b[1].views-a[1].views)[0];
    content.innerHTML = `
      <div class="analytics-grid">
        <div class="analytics-card"><p class="analytics-num">${totalViews}</p><p class="analytics-label">Total Views</p></div>
        <div class="analytics-card"><p class="analytics-num">${totalLikes}</p><p class="analytics-label">Total Likes</p></div>
        <div class="analytics-card"><p class="analytics-num">${snap.size}</p><p class="analytics-label">Listings</p></div>
        <div class="analytics-card"><p class="analytics-num">${snap.size>0?(totalViews/snap.size).toFixed(1):0}</p><p class="analytics-label">Avg Views</p></div>
      </div>
      <p class="dash-section-title" style="margin-top:16px;">Top Category</p>
      <div class="analytics-card" style="margin:0 16px;">${topCat?`<p class="analytics-num">${topCat[0]}</p><p class="analytics-label">${topCat[1].views} views · ${topCat[1].count} listings</p>`:'<p class="analytics-label">No data yet</p>'}</div>
      <p class="dash-section-title" style="margin-top:16px;">Per Listing</p>
      ${snap.docs.sort((a,b)=>(b.data().views||0)-(a.data().views||0)).map(doc=>{const d=doc.data();return`<div class="earnings-row"><p class="earnings-row-title">${d.title}</p><div style="display:flex;gap:12px;"><span style="font-size:12px;color:#6b7280;">👁 ${d.views||0}</span><span style="font-size:12px;color:#6b7280;">❤️ ${d.likes||0}</span></div></div>`;}).join('')}`;
  } catch(e) { content.innerHTML = '<p class="reviews-empty">Could not load analytics.</p>'; }
}

function paystackUpgrade() {
  if (!window.currentUser) return;

  const btn = document.getElementById('sellerUpgradeBtn') || document.getElementById('proUpgradeBtn');

  if (!window.PaystackPop) {
    if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }
    // Wait up to 3s for Paystack to load
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (window.PaystackPop) {
        clearInterval(poll);
        if (btn) { btn.textContent = '⚡ Go Pro'; btn.disabled = false; }
        paystackUpgrade();
      } else if (attempts > 6) {
        clearInterval(poll);
        if (btn) { btn.textContent = '⚡ Go Pro'; btn.disabled = false; }
        showPaystackError('Payment system unavailable. Check your connection and try again.');
      }
    }, 500);
    return;
  }

  const ref = 'PRO_' + window.currentUser.uid + '_' + Date.now();

  const handler = window.PaystackPop.setup({
    key:      PAYSTACK_KEY,
    email:    window.currentUser.email,
    amount:   PRO_AMOUNT,
    currency: 'NGN',
    ref,
    metadata: {
      uid:      window.currentUser.uid,
      name:     window.currentUser.name,
      plan:     'seller_pro',
      custom_fields: [
        { display_name:'Name', variable_name:'name', value: window.currentUser.name },
        { display_name:'Plan', variable_name:'plan', value: 'Seller Pro' }
      ]
    },
    onSuccess: async (tx) => {
      if (btn) { btn.textContent = 'Activating…'; btn.disabled = true; }
      try {
        await db.collection('users').doc(window.currentUser.uid).update({
          sellerPro:  true,
          proSince:   firebase.firestore.FieldValue.serverTimestamp(),
          proPayRef:  tx.reference,
          proAmount:  PRO_AMOUNT,
        });
        // Log payment in a receipts collection
        await db.collection('payments').add({
          uid:       window.currentUser.uid,
          name:      window.currentUser.name,
          email:     window.currentUser.email,
          ref:       tx.reference,
          amount:    PRO_AMOUNT,
          plan:      'seller_pro',
          status:    'success',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        // UI updated via the real-time onSnapshot listener in openSellerDashboard
        window.currentUser.sellerPro = true;
        // Show success screen
        showProSuccessScreen();
      } catch(e) {
        console.error('Pro activation error:', e);
        showPaystackError('Payment received but activation failed. Contact support with ref: ' + tx.reference);
      }
    },
    onCancel: () => {
      if (btn) { btn.textContent = '⚡ Go Pro'; btn.disabled = false; }
    }
  });
  handler.openIframe();
}

function showProSuccessScreen() {
  const content = document.getElementById('sellerDashContent');
  if (!content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:48px 24px;">
      <div style="font-size:56px;margin-bottom:16px;">🎉</div>
      <h2 style="font-size:22px;font-weight:800;color:#1f2937;margin-bottom:8px;">You're now Pro!</h2>
      <p style="font-size:14px;color:#6b7280;margin-bottom:28px;line-height:1.6;">
        Your Seller Pro plan is active. You now have full access to earnings tracking and analytics.
      </p>
      <button class="pro-gate-btn" onclick="window.openSellerDashboard()">Open Dashboard →</button>
    </div>`;
}

function showPaystackError(msg) {
  const content = document.getElementById('sellerDashContent');
  if (content) {
    content.innerHTML = `
      <div style="text-align:center;padding:40px 24px;">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        <p style="font-size:14px;color:#ef4444;font-weight:600;">${msg}</p>
        <button class="req-cancel-btn" style="margin-top:16px;" onclick="switchSellerTab('listings')">Go Back</button>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════
// BUYER ORDERS PAGE
// ══════════════════════════════════════════════════════
let _buyerTab = 'orders';

window.openBuyerDashboard = function() {
  if (!window.currentUser) return;
  showPage('buyerDashPage');
  document.getElementById('buyerDashName').textContent = window.currentUser.name;
  feather.replace();
  loadBuyerStats();
  switchBuyerTab(_buyerTab);
};

window.closeBuyerDashboard = function() { showPage('market'); };

function switchBuyerTab(tab) {
  _buyerTab = tab;
  ['orders','active','completed','cancelled'].forEach(t => {
    const btn = document.getElementById('bTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if (btn) btn.classList.toggle('active', t===tab);
  });
  loadBuyerOrders(tab);
}

async function loadBuyerStats() {
  const uid = window.currentUser.uid;
  try {
    const [reqSnap, favSnap] = await Promise.all([
      db.collection('requests').where('buyerId','==',uid).get(),
      db.collection('favorites').doc(uid).collection('items').get()
    ]);
    const accepted = reqSnap.docs.filter(d=>d.data().status==='accepted').length;
    document.getElementById('dBOrders').textContent   = reqSnap.size;
    document.getElementById('dBAccepted').textContent = accepted;
    document.getElementById('dBSaved').textContent    = favSnap.size;
  } catch(e){}
}

async function loadBuyerOrders(filter='orders') {
  const content = document.getElementById('buyerDashContent');
  content.innerHTML = '<p class="reviews-empty">Loading…</p>';
  try {
    const snap = await db.collection('requests').where('buyerId','==',window.currentUser.uid).get();
    let docs = snap.docs;
    if (filter==='active')    docs = docs.filter(d=>['pending','cancel_requested'].includes(d.data().status));
    if (filter==='completed') docs = docs.filter(d=>d.data().status==='accepted');
    if (filter==='cancelled') docs = docs.filter(d=>['cancelled','rejected'].includes(d.data().status));
    if (docs.length===0) { content.innerHTML = '<p class="reviews-empty">Nothing here yet.</p>'; return; }
    content.innerHTML = '';
    docs.sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0)).forEach(doc=>{
      const req=doc.data();
      const statusMap={pending:'⏳ Pending',accepted:'✓ Accepted',rejected:'✗ Declined',cancelled:'✕ Cancelled',cancel_requested:'⚠️ Cancel Pending'};
      const statusCls={pending:'badge-pending',accepted:'badge-accepted',rejected:'badge-rejected',cancelled:'badge-rejected',cancel_requested:'badge-pending'};
      const card=document.createElement('div');
      card.className='request-card';
      card.innerHTML=`
        <div class="request-card-top">
          ${req.itemImage?`<div class="request-card-img" style="background-image:url('${req.itemImage}')"></div>`:'<div class="request-card-img">📦</div>'}
          <div class="request-card-info">
            <p class="request-card-title">${req.itemTitle}</p>
            <p class="request-card-price">₦${Number(req.itemPrice).toLocaleString()}</p>
            <p class="request-card-party">Seller: <strong>${req.sellerName}</strong></p>
            ${req.message?`<p class="request-card-msg">"${req.message}"</p>`:''}
          </div>
        </div>
        <div class="request-status-row">
          <span class="request-badge ${statusCls[req.status]||''}">${statusMap[req.status]||req.status}</span>
          ${req.status==='accepted'&&req.conversationId?'<button class="req-chat-btn">💬 Chat</button>':''}
          ${req.status==='pending'?`<button class="req-cancel-btn" data-id="${doc.id}">✕ Cancel</button>`:''}
          ${req.status==='accepted'?`<button class="req-cancel-btn req-cancel-soft" data-id="${doc.id}" data-action="request_cancel">Request Cancel</button>`:''}
          ${req.status==='cancel_requested'?'<span class="badge-pending-text">Awaiting seller</span>':''}
        </div>`;
      if (req.status==='accepted'&&req.conversationId) {
        card.querySelector('.req-chat-btn')?.addEventListener('click',()=>{
          showPage('market'); setTimeout(()=>{if(window.openInbox)window.openInbox('messages');},200);
        });
      }
      const cancelBtn = card.querySelector('.req-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (cancelBtn.dataset.action==='request_cancel') {
            if (!confirm('Request cancellation? Seller must confirm.')) return;
            await db.collection('requests').doc(doc.id).update({status:'cancel_requested'});
            if (window.notify) window.notify(req.sellerId,{type:'cancel_request',icon:'⚠️',title:'Cancellation Requested',body:req.buyerName+' wants to cancel order for "'+req.itemTitle+'"',fromUid:req.buyerId,fromName:req.buyerName,itemId:req.itemId});
          } else {
            if (!confirm('Cancel this request?')) return;
            await db.collection('requests').doc(doc.id).update({status:'cancelled'});
          }
          loadBuyerStats(); loadBuyerOrders(filter);
        });
      }
      content.appendChild(card);
    });
    feather.replace();
  } catch(e) { content.innerHTML='<p class="reviews-empty">Could not load orders.</p>'; }
}

// ══════════════════════════════════════════════════════
// NAV SWITCHER — called from auth.js after login
// ══════════════════════════════════════════════════════
window.switchNav = function(role) {
  const buyerNav  = document.getElementById('buyerNav');
  const sellerNav = document.getElementById('sellerNav');
  const guestNav  = document.getElementById('guestNav');

  buyerNav?.classList.add('hidden');
  sellerNav?.classList.add('hidden');
  guestNav?.classList.add('hidden');

  if (!role) {
    guestNav?.classList.remove('hidden');
  } else if (role === 'seller') {
    sellerNav?.classList.remove('hidden');
  } else {
    buyerNav?.classList.remove('hidden');
  }
  feather.replace();
};

// ══════════════════════════════════════════════════════
// DOM INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Seller dash back + tabs
  document.getElementById('sellerDashBack')?.addEventListener('click', () => showPage('market'));
  ['listings','requests','orders','earnings','analytics'].forEach(t => {
    document.getElementById('dTab'+t.charAt(0).toUpperCase()+t.slice(1))
      ?.addEventListener('click', () => switchSellerTab(t));
  });
  document.getElementById('sellerUpgradeBtn')?.addEventListener('click', paystackUpgrade);

  // Buyer dash back + tabs
  document.getElementById('buyerDashBack')?.addEventListener('click', () => showPage('market'));
  ['orders','active','completed'].forEach(t => {
    document.getElementById('bTab'+t.charAt(0).toUpperCase()+t.slice(1))
      ?.addEventListener('click', () => switchBuyerTab(t));
  });

  // Seller nav buttons
  document.getElementById('navMarket')?.addEventListener('click', () => showPage('market'));
  document.getElementById('navSellerDash')?.addEventListener('click', () => window.openSellerDashboard?.());
  document.getElementById('navAddItem')?.addEventListener('click', () => {
    if (window.openAddForm) window.openAddForm();
    else document.getElementById('navAdd')?.click();
  });
  document.getElementById('navOrders')?.addEventListener('click', () => {
    window.openSellerDashboard?.();
    setTimeout(() => switchSellerTab('requests'), 150);
  });
  document.getElementById('navMenuS')?.addEventListener('click', () => document.getElementById('navMenu')?.click() || document.querySelector('.sidebar-toggle')?.click());

  // Buyer nav buttons
  document.getElementById('navHome')?.addEventListener('click', () => { showPage('market'); window.scrollTo({top:0,behavior:'smooth'}); });
  document.getElementById('navSaved')?.addEventListener('click', () => { if(window.openSavedItems) window.openSavedItems(); });
  document.getElementById('navInbox')?.addEventListener('click', () => { if(window.openInbox) window.openInbox(); });
  document.getElementById('navMenuB')?.addEventListener('click', () => document.getElementById('navMenu')?.click());

  // Guest nav
  document.getElementById('navHomeG')?.addEventListener('click', () => { showPage('market'); window.scrollTo({top:0,behavior:'smooth'}); });
  document.getElementById('navLoginG')?.addEventListener('click', () => { if(window.showAuthModal) window.showAuthModal('login'); });
  document.getElementById('navMenuG')?.addEventListener('click', () => document.getElementById('navMenu')?.click());

  // Bell buttons (all navs)
  ['notifBellBtnB','notifBellBtnG'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => document.getElementById('notifBellBtn')?.click());
  });

  // Menu buttons (all navs) — they all trigger the sidebar
  ['navMenuB','navMenuS','navMenuG'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      e.preventDefault();
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar && !sidebar.classList.contains('open')) {
        const navMenuEl = document.getElementById('navMenu');
        if (navMenuEl) navMenuEl.click();
      }
    });
  });
});

// ── Expose globals ────────────────────────────────────
window.showPage        = showPage;
window.switchSellerTab = switchSellerTab;
window.switchBuyerTab  = switchBuyerTab;
