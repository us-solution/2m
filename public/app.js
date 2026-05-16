/* ═══════════════════════════════════════
   OZEL CAFE — Frontend JS (Premium v2)
   ═══════════════════════════════════════ */

let allDrinks = [], allCategories = [], currentCat = 'all', cart = JSON.parse(localStorage.getItem('ozel_cart') || '[]');
const urlParams  = new URLSearchParams(window.location.search);
const tableParam = urlParams.get('table');
window.currentPuzzle = { sugar: 'عادي', extra: 'بدون' };

// ── Auth State ───────────────────────────
const TOKEN = localStorage.getItem('ozel_token');
const CUSER = JSON.parse(localStorage.getItem('ozel_user') || 'null');
const authHeaders = TOKEN ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN } : { 'Content-Type': 'application/json' };

// ── Loader ──────────────────────────────
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('loader').classList.add('hidden'), 1400);
  fetchMenu();
  renderNavUser();
});

function renderNavUser() {
  const area = document.getElementById('nav-user-area');
  if (!area) return;
  if (CUSER) {
    const initial = CUSER.name.charAt(0).toUpperCase();
    area.innerHTML = `
      <div class="nav-user-logged" onclick="openProfileModal()" style="cursor:pointer; display:flex; align-items:center; gap:0.5rem; background:rgba(212,175,55,0.1); padding:0.4rem 0.8rem; border-radius:50px; border:1px solid rgba(212,175,55,0.2);">
        <div class="user-avatar" style="background:var(--gold); color:var(--bg); width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem;">${initial}</div>
        <span class="user-name" style="color:var(--white); font-size:0.85rem; max-width:70px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:'Tajawal',sans-serif;">${CUSER.name}</span>
      </div>
    `;
  } else {
    area.innerHTML = `
      <a href="/login" class="nav-user-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span>دخول</span>
      </a>
    `;
  }
}

function logoutUser() { localStorage.clear(); location.reload(); }

async function openProfileModal() {
  const modal = document.getElementById('profileModal');
  document.getElementById('profilePoints').textContent = CUSER.points || 0;
  modal.classList.add('open');
  
  try {
    const res = await fetch('/api/me/orders', { headers: authHeaders });
    const orders = await res.json();
    
    const drinkCounts = {};
    orders.forEach(order => {
      const items = JSON.parse(order.items);
      items.forEach(item => {
        drinkCounts[item.name] = (drinkCounts[item.name] || 0) + 1;
      });
    });
    
    const topDrinks = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    
    const listEl = document.getElementById('topDrinksList');
    if (topDrinks.length === 0) {
      listEl.innerHTML = `<p style="color: var(--muted); font-size: 0.85rem; text-align: center;">لا توجد طلبات سابقة بعد</p>`;
    } else {
      listEl.innerHTML = topDrinks.map(([name, count]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg2); padding: 0.8rem 1rem; border-radius: var(--rad);">
          <span style="color: var(--white); font-size: 0.95rem;">${name}</span>
          <span style="color: var(--gold); font-size: 0.85rem; font-weight: 700;">${count} مرات</span>
        </div>
      `).join('');
    }
  } catch(e) { console.error(e); }
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('open'); }

// ── Navbar scroll ────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 60);
});

// ── Fetch Menu ───────────────────────────
async function fetchMenu() {
  try {
    const [catRes, drinksRes, offersRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/drinks'),
      fetch('/api/offers')
    ]);
    allCategories = await catRes.json();
    allDrinks     = await drinksRes.json();
    
    try {
      const offersData = await offersRes.json();
      if (Array.isArray(offersData)) {
        window.allOffers = offersData;
      } else {
        console.warn('Offers data is not an array:', offersData);
        window.allOffers = [];
      }
    } catch(e) {
      console.warn('Failed to parse offers, using empty array', e);
      window.allOffers = [];
    }
    
    buildCatTabs();
    renderMenu(allDrinks);
  } catch(err) {
    console.error('Error fetching menu:', err);
    document.getElementById('menuGrid').innerHTML = `<p style="color:#C0392B;text-align:center;grid-column:1/-1;padding:4rem">تعذّر تحميل القائمة. تأكد من تشغيل الخادم.</p>`;
  }
}

// ── Category Tabs ─────────────────────────
function buildCatTabs() {
  const bar = document.getElementById('catTabs');
  bar.innerHTML = '<button class="cat-btn active" data-cat="all">الكل</button>';
  
  renderOffersCards();

  allCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.cat = cat.id;
    btn.textContent = `${cat.icon} ${cat.name_ar}`;
    btn.addEventListener('click', () => {
      currentCat = String(cat.id);
      bar.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMenu(allDrinks.filter(d => String(d.category_id) === currentCat));
    });
    bar.appendChild(btn);
  });

  bar.querySelector('[data-cat="all"]').addEventListener('click', function() {
    currentCat = 'all';
    bar.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    renderMenu(allDrinks);
  });
}

// ── Render Cards ─────────────────────────
function renderMenu(drinks) {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  if (!drinks.length) {
    grid.innerHTML = `<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:4rem">لا توجد أصناف في هذه الفئة</p>`;
    return;
  }
  drinks.forEach((d, i) => {
    const offer = window.allOffers ? window.allOffers.find(o => String(o.drink_id) === String(d.id)) : null;
    let priceHTML = `<span class="lmi-price">${d.price} <span class="lmi-currency">EGP</span></span>`;
    
    if (offer) {
      const finalPrice = d.price * (1 - offer.discount_percent / 100);
      priceHTML = `
        <span class="lmi-price" style="display:flex; flex-direction:column; align-items:flex-end;">
          <span style="text-decoration:line-through; color:var(--muted); font-size:0.8rem;">${d.price} EGP</span>
          <span style="color:var(--gold); font-weight:700;">${finalPrice.toFixed(0)} EGP</span>
          <span style="background:var(--gold); color:var(--bg); font-size:0.65rem; padding:1px 4px; border-radius:2px; margin-top:2px;">-${offer.discount_percent}%</span>
        </span>
      `;
    }

    const item = document.createElement('div');
    item.className = 'luxury-menu-item';
    item.innerHTML = `
      <div class="lmi-top">
        <span class="lmi-name">${d.name_ar || d.name}</span>
        <span class="lmi-dots"></span>
        ${priceHTML}
      </div>
      <div class="lmi-actions">
        <button class="lmi-btn lmi-details" onclick="openDrink('${d.id}')">التفاصيل</button>
        <button class="lmi-btn lmi-add" onclick="quickAddToCart('${d.id}')">إضافة ✦</button>
      </div>
    `;
    grid.appendChild(item);
  });
}

window.quickAddToCart = function(drinkId) {
  window.currentPuzzle = { sugar: 'عادي', extra: 'بدون' };
  const drink = allDrinks.find(d => d.id === drinkId);
  addToCart(drinkId);
  alert(`تم إضافة ${drink.name_ar || drink.name} إلى السلة بالخيارات الافتراضية`);
};

// ── Drink Modal ───────────────────────────
async function openDrink(id) {
  const drink = allDrinks.find(d => d.id === id) || await fetch(`/api/drinks/${id}`).then(r => r.json());
  const modal   = document.getElementById('drinkModal');
  const content = document.getElementById('modalContent');
  window.currentPuzzle = { sugar: 'عادي', extra: 'بدون' };

  content.innerHTML = `
    <div class="modal-hero-img">
      <img src="${drink.image_emoji}" alt="${drink.name}" onerror="this.parentElement.style.background='var(--bg4)';this.style.display='none';"/>
    </div>
    <div class="modal-body">
      <div class="modal-cat-label">${drink.category_name_ar || drink.category_name}</div>
      <div class="modal-name">${drink.name}</div>
      <div class="modal-name-ar">${drink.name_ar || drink.name}</div>
      <div class="modal-badges">
        <span class="mbadge mbadge-gold">${drink.price} EGP</span>
        <span class="mbadge mbadge-${drink.temperature}">${drink.temperature === 'hot' ? 'ساخن' : 'بارد'}</span>
      </div>

      <div class="msec-title">ابنِ مشروبك — نظام البازل</div>

      <span class="puzzle-label">① مستوى الحلاوة</span>
      <div class="puzzle-chips" id="chips-sugar">
        ${['عادي','مضبوط','قليل','بدون سكر'].map((v,i) => `
          <button class="chip ${i===0?'active':''}" onclick="selectChip('sugar','${v}',this)">${v}</button>
        `).join('')}
      </div>

      <span class="puzzle-label">② الإضافات الخاصة</span>
      <div class="puzzle-chips" id="chips-extra">
        ${[
          ['بدون','بدون'],['شوت إسبريسو','إسبريسو +15'],['حليب لوز','لوز +20'],
          ['صوص كراميل','كراميل +10'],['Boba Bubbles','بوبا +15'],
          ['Ice Cream','آيس كريم +20'],['Marshmello','مارشميلو +10'],['Nuts','مكسرات +15']
        ].map((v,i) => `
          <button class="chip ${i===0?'active':''}" onclick="selectChip('extra','${v[0]}',this)">${v[1]}</button>
        `).join('')}
      </div>

      <button class="puzzle-add-btn" onclick="addToCart(${drink.id})">
        ✦ أضف للسلة
      </button>
    </div>
  `;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

window.selectChip = function(type, value, btn) {
  btn.closest('.puzzle-chips').querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  window.currentPuzzle[type] = value;
  btn.animate([{transform:'scale(.92)'},{transform:'scale(1)'}], {duration:200, easing:'cubic-bezier(.175,.885,.32,1.275)'});
};

function closeModal(e) {
  if (e && e.target !== document.getElementById('drinkModal') && !e.target.classList.contains('modal-x')) return;
  document.getElementById('drinkModal').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Cart ──────────────────────────────────
function addToCart(drinkId) {
  const drink = allDrinks.find(d => d.id === drinkId);
  const sugar = window.currentPuzzle.sugar;
  const extra = window.currentPuzzle.extra;
  let price = drink.price;
  if (extra.includes('إسبريسو') || extra.includes('Boba') || extra.includes('Nuts')) price += 15;
  if (extra.includes('لوز') || extra.includes('Ice Cream')) price += 20;
  if (extra.includes('كراميل') || extra.includes('Marshmello')) price += 10;
  cart.push({ drink_id: drink.id, name: drink.name, name_ar: drink.name_ar, sugar, extra, price });
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI();
  alert('تم إضافة ' + (drink.name_ar || drink.name) + ' إلى السلة بنجاح');
  closeModal();
}

function updateCartUI() {
  const fab   = document.getElementById('cartFab');
  const count = document.getElementById('cartCount');
  if (count) count.textContent = cart.length;
  if (fab) fab.style.transform = cart.length > 0 ? 'scale(1)' : 'scale(0)';
}

function removeFromCart(idx) { 
  cart.splice(idx, 1); 
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI(); 
}

async function submitOrder() {
  if (!cart.length) return alert('السلة فارغة!');
  const isTakeaway = document.getElementById('isTakeaway').checked;
  const table = isTakeaway ? 'Takeaway' : document.getElementById('tableNum').value;
  if (!isTakeaway && !table) return alert('برجاء إدخال رقم الطاولة');
  const notes = document.getElementById('orderNotes').value;
  const total = cart.reduce((s, i) => s + i.price, 0);
  try {
    const res  = await fetch('/api/orders', { method:'POST', headers: authHeaders, body: JSON.stringify({ table_number: table, items: cart, total_price: total, notes: notes }) });
    const data = await res.json();
    if (data.success) {
      const pts = CUSER ? `\nكسبت ${data.points_earned} نقطة!` : '\n\nسجّل الدخول لتكسب نقاط مع كل طلب!';
      alert('تم إرسال طلبك! سيُحضَّر قريباً.' + pts);
      cart = []; document.getElementById('orderNotes').value = ''; updateCartUI(); toggleCart();
    }
  } catch(e) { alert('حدث خطأ، حاول مرة أخرى.'); }
}

function handleContact(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const msg = document.getElementById('contact-msg').value.trim();
  
  const text = `مرحباً أوزيل كافيه، أنا ${name}. رقم هاتفي: ${phone}. ${msg}`;
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/201060161839?text=${encodedText}`;
  
  window.open(whatsappUrl, '_blank');
}

async function renderOffersCards() {
  const container = document.getElementById('offersContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/offers');
    const offers = await res.json();
    
    if (Array.isArray(offers) && offers.length > 0) {
      window.allOffers = offers; // update global ref
      let html = `
        <div class="offers-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; padding:0 1rem;">
          <h3 style="color:var(--gold); font-size:1.4rem; font-family:'Cormorant Garamond',serif; display:flex; align-items:center; gap:0.5rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>
            عروض مميزة
          </h3>
          <span style="color:var(--muted); font-size:0.8rem; letter-spacing:0.1em; text-transform:uppercase;">Limited Time</span>
        </div>
      `;
      
      html += `<div class="offers-scroll-track">`;
      
      offers.forEach(offer => {
        const d = allDrinks.find(drink => String(drink.id) === String(offer.drink_id));
        if (!d) return;
        
        const finalPrice = d.price * (1 - offer.discount_percent / 100);
        html += `
          <div class="premium-offer-card">
            <div class="poc-image-wrapper">
              <img src="${d.image_emoji || 'imgs/default.png'}" class="poc-img" alt="${d.name_ar}">
              <div class="poc-badge">
                <span>خصم</span>
                <strong>${offer.discount_percent}%</strong>
              </div>
              <div class="poc-overlay"></div>
            </div>
            <div class="poc-content">
              <h4 class="poc-title">${d.name_ar || d.name}</h4>
              <p class="poc-desc">${d.tagline || 'تجربة فريدة ومذاق لا يُنسى'}</p>
              
              <div class="poc-price-row">
                <div class="poc-price-old">${d.price} <span class="poc-currency">EGP</span></div>
                <div class="poc-price-new">${finalPrice.toFixed(0)} <span class="poc-currency">EGP</span></div>
              </div>
              
              <button class="poc-btn" onclick="openDrink('${d.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                <span>إضافة للسلة</span>
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
      container.innerHTML = html;
      container.style.display = 'block';
    } else {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  } catch(e) {
    console.error('Failed to render offers cards:', e);
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-pass').value;
  const newPassword = document.getElementById('new-pass').value;
  const msgEl = document.getElementById('cp-msg');
  
  if (!oldPassword || !newPassword) {
    msgEl.textContent = 'يرجى ملء جميع الحقول';
    msgEl.style.color = '#C0392B';
    return;
  }
  
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('ozel_token')
      },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      msgEl.textContent = 'تم تغيير كلمة المرور بنجاح';
      msgEl.style.color = '#27AE60';
      document.getElementById('old-pass').value = '';
      document.getElementById('new-pass').value = '';
    } else {
      msgEl.textContent = data.error || 'حدث خطأ ما';
      msgEl.style.color = '#C0392B';
    }
  } catch (e) {
    console.error(e);
    msgEl.textContent = 'تعذر الاتصال بالسيرفر';
    msgEl.style.color = '#C0392B';
  }
}
