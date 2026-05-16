async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();
    renderOrders(orders);
  } catch(e) {
    console.error("Failed to fetch orders");
  }
}

function renderOrders(orders) {
  const grid = document.getElementById('ordersGrid');
  grid.innerHTML = '';
  
  if(orders.length === 0) {
    grid.innerHTML = '<p style="text-align:center; width:100%; color:var(--text-dim)">لا توجد طلبات حالية.</p>';
    return;
  }
  
  orders.forEach(order => {
    let items = [];
    try {
      items = JSON.parse(order.items);
    } catch(e) {}
    
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-header">
        <div class="order-table">طاولة: ${order.table_number}</div>
        <div class="order-status ${order.status}">${order.status === 'pending' ? 'قيد التحضير 🕒' : 'مكتمل ✅'}</div>
      </div>
      <div class="order-body">
        ${items.map(item => `
          <div class="order-item">
            <strong>${item.name}</strong><br/>
            <small style="color:var(--text-dim)">سكر: ${item.sugar} | إضافات: ${item.extra}</small>
          </div>
        `).join('')}
      </div>
      <div class="order-total">الإجمالي: ${order.total_price} EGP</div>
      ${order.status === 'pending' ? `
        <div class="order-actions">
          <button class="btn-complete" onclick="markComplete(${order.id})">تحديد كمكتمل</button>
        </div>
      ` : ''}
    `;
    grid.appendChild(card);
  });
}

async function markComplete(id) {
  await fetch(`/api/orders/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' })
  });
  fetchOrders();
}

// Fetch orders every 5 seconds
fetchOrders();
setInterval(fetchOrders, 5000);
