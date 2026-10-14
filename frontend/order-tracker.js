// ===== Global Order Tracker Floating Bar =====
// Self-contained: the cart page has its own script and cannot load app.js
// (both declare `cart`, `currentLang`, … — loading app.js there threw
// "Identifier 'cart' has already been declared").
(function initGlobalOrderTracker() {
  if (window.__2mOrderTrackerStarted) return;
  window.__2mOrderTrackerStarted = true;

  function getStore(key) { return localStorage.getItem('2m_' + key) || localStorage.getItem('ozel_' + key); }
  function removeStore(key) { localStorage.removeItem('2m_' + key); localStorage.removeItem('ozel_' + key); }
  function getAuthHeaders() {
    const tok = getStore('token');
    return tok ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok } : { 'Content-Type': 'application/json' };
  }

  function getActiveOrderId() {
    try {
      const orderId = getStore('active_order_id');
      const orderTime = parseInt(getStore('active_order_time') || '0', 10);
      if (orderId && (Date.now() - orderTime < 3 * 60 * 60 * 1000)) {
        return orderId;
      }
    } catch(e) {}
    return null;
  }

  function createTrackerUI() {
    if (sessionStorage.getItem('2m_gtb_dismissed') === '1') return;

    const existingBar = document.getElementById('globalTrackerBar');
    if (existingBar) existingBar.remove();

    const isAr = (getStore('lang') || 'ar') === 'ar';
    const bar = document.createElement('div');
    bar.id = 'globalTrackerBar';
    bar.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      width: calc(100% - 32px);
      max-width: 480px;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1.5px solid var(--primary, #c58b35);
      border-radius: 14px;
      padding: 0.85rem 1.2rem;
      box-shadow: 0 10px 30px rgba(70, 50, 30, 0.12), 0 0 20px rgba(197, 139, 53, 0.15);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
      font-family: 'Tajawal', sans-serif;
    `;

    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
        <div id="gtb-icon-wrap" style="font-size:1.4rem; flex-shrink:0;">⏳</div>
        <div style="display:flex; flex-direction:column; min-width:0;">
          <span id="gtb-status" style="font-size:0.9rem; font-weight:800; color:var(--text, #1c1815);">${isAr ? 'جاري متابعة طلبك...' : 'Tracking your order...'}</span>
          <span id="gtb-sub" style="font-size:0.72rem; color:var(--primary, #c58b35); font-weight:700;">2M CAFE Live Tracker</span>
        </div>
      </div>
      <button onclick="sessionStorage.setItem('2m_gtb_dismissed', '1'); document.getElementById('globalTrackerBar').remove();" style="background:rgba(70,50,30,0.06); border:1px solid rgba(70,50,30,0.15); border-radius:50%; width:26px; height:26px; color:#1c1815; display:flex; align-items:center; justify-content:center; cursor:pointer;">&times;</button>
    `;

    document.body.appendChild(bar);
  }

  async function pollTracker() {
    const orderId = getActiveOrderId();
    if (!orderId) {
      const existing = document.getElementById('globalTrackerBar');
      if (existing) existing.remove();
      return;
    }

    createTrackerUI();

    try {
      const res = await fetch(`/api/orders/${orderId}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const order = await res.json();
        const statusEl = document.getElementById('gtb-status');
        const iconEl = document.getElementById('gtb-icon-wrap');
        const isAr = (getStore('lang') || 'ar') === 'ar';

        const statusMap = {
          pending:   { text: isAr ? 'تم استلام الطلب ⏳' : 'Order Received ⏳', icon: '⏳' },
          preparing: { text: isAr ? 'جاري تحضير طلبك ☕' : 'Preparing Order ☕', icon: '☕' },
          ready:     { text: isAr ? 'طلبك جاهز للاستلام! 🎉' : 'Ready for Pickup! 🎉', icon: '🎉' },
          completed: { text: isAr ? 'تم تسليم الطلب بنجاح ✓' : 'Order Completed ✓', icon: '✓' },
          cancelled: { text: isAr ? 'تم إلغاء الطلب ✕' : 'Order Cancelled ✕', icon: '✕' }
        };

        const st = statusMap[order.status] || { text: order.status, icon: '☕' };
        if (statusEl) statusEl.textContent = st.text;
        if (iconEl) iconEl.textContent = st.icon;

        if (order.status === 'completed' || order.status === 'cancelled') {
          setTimeout(() => {
            removeStore('active_order_id');
            removeStore('active_order_time');
            const bar = document.getElementById('globalTrackerBar');
            if (bar) bar.remove();
          }, 15000);
        }
      }
    } catch(e) {}
  }

  setInterval(pollTracker, 10000);
  setTimeout(pollTracker, 2000);
})();
