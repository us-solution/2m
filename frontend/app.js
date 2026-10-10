/* ═══════════════════════════════════════════════════════════════
   2M CAFE — Frontend Engine (Luxury Obsidian & Amber Gold)
   ═══════════════════════════════════════════════════════════════ */

// ===== Debounce Utility =====
window._debounceTimers = {};
window.debounceClick = function(key, fn, ms = 300) {
  if (window._debounceTimers[key]) return;
  window._debounceTimers[key] = true;
  setTimeout(() => { window._debounceTimers[key] = false; }, ms);
  fn();
};

// ===== LocalStorage Storage Key Helpers (2M with Fallback) =====
function getStore(key) {
  return localStorage.getItem('2m_' + key) || localStorage.getItem('ozel_' + key);
}
function setStore(key, val) {
  localStorage.setItem('2m_' + key, val);
}
function removeStore(key) {
  localStorage.removeItem('2m_' + key);
  localStorage.removeItem('ozel_' + key);
}

// ===== Global State =====
let allDrinks = [];
let allCategories = [];
let currentCat = 'all';
let cart = [];
try {
  cart = JSON.parse(getStore('cart') || '[]');
} catch (e) {
  cart = [];
}

const urlParams = new URLSearchParams(window.location.search);
let tableParam = urlParams.get('table');
if (tableParam) {
  setStore('table_number', tableParam.trim());
} else {
  tableParam = getStore('table_number');
}

window.currentPuzzle = { sugar: 'Normal', extra: 'None' };
window.allOffers = [];

// ===== Pusher Menu Auto-Sync =====
(function() {
  if (typeof Pusher !== 'undefined') {
    try {
      const pusher = new Pusher('d7010f3c5b8b98295a04', { cluster: 'eu', forceTLS: true });
      const channel = pusher.subscribe('menu-updates');
      channel.bind('menu-changed', () => {
        console.log('[Pusher] 2M Menu update received. Reloading menu...');
        if (typeof fetchMenu === 'function') {
          fetchMenu();
        }
      });
    } catch (e) {
      console.warn('[Pusher] Menu updates subscription failed:', e);
    }
  }
})();

// ===== User & Authentication State =====
function getCurrentUser() {
  try {
    return JSON.parse(getStore('user') || 'null');
  } catch (e) {
    return null;
  }
}
let CUSER = getCurrentUser();

function getAuthHeaders() {
  const tok = getStore('token');
  return tok
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }
    : { 'Content-Type': 'application/json' };
}

// ===== Bilingual Support (AR / EN) =====
let currentLang = getStore('lang') || 'ar';

const transMap = {
  'Normal': { en: 'Normal Sugar', ar: 'سكر طبيعي' },
  'Medium': { en: 'Medium Sugar', ar: 'سكر وسط' },
  'Less': { en: 'Less Sugar', ar: 'سكر خفيف' },
  'No Sugar': { en: 'No Sugar', ar: 'بدون سكر' },
  'None': { en: 'No Extras', ar: 'بدون إضافات' }
};

// ===== Dynamic Customization Options (Cashier POS Synced) =====
let customizationOptions = null;

async function loadCustomizationOptions() {
  try {
    const res = await fetch('/api/customization');
    if (res.ok) {
      const data = await res.json();
      customizationOptions = data;
      if (data.sugarLevels) {
        data.sugarLevels.forEach(s => {
          transMap[s.key] = { en: s.nameEn, ar: s.nameAr };
        });
      }
      if (data.extras) {
        data.extras.forEach(e => {
          transMap[e.key] = { en: e.nameEn, ar: e.nameAr };
        });
      }
    }
  } catch(e) {
    console.warn('Failed to load customization options', e);
  }
}

// ===== Smooth Scrolling =====
window.scrollToSection = function(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ===== Language Toggle =====
window.toggleLanguage = function() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  setStore('lang', currentLang);
  applyLanguage(currentLang);
};

window.applyLanguage = function(lang) {
  const isAr = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  document.body.dir = isAr ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-en]').forEach(el => {
    el.innerHTML = isAr ? el.getAttribute('data-ar') : el.getAttribute('data-en');
  });

  document.querySelectorAll('[data-placeholder-en]').forEach(el => {
    el.placeholder = isAr ? el.getAttribute('data-placeholder-ar') : el.getAttribute('data-placeholder-en');
  });

  buildCatTabs();
  filterAndRenderMenu();
  renderOffersCards();
  renderNavUser();
};

// ===== Navigation User Area =====
function renderNavUser() {
  const area = document.getElementById('nav-user-area');
  const drawerArea = document.getElementById('drawer-user-area');
  const isAr = currentLang === 'ar';
  CUSER = getCurrentUser();

  let html = '';
  if (CUSER) {
    const initial = (CUSER.name || 'U').charAt(0).toUpperCase();
    const ptsLabel = isAr ? 'نقطة' : 'pts';
    const profileText = isAr ? 'حسابي' : 'My Profile';
    const isAdmin = CUSER.role === 'admin' || CUSER.role === 'partner';
    const adminBtn = isAdmin ? `
      <a href="admin.html" class="nav-admin-btn" title="لوحة التحكم الإدارية" style="text-decoration: none; padding: 0.4rem 0.85rem; border-radius: 8px; background: var(--gold); color: #0c0a09; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 8px rgba(217,119,6,0.35); transition: transform .15s;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <span>${isAr ? 'لوحة التحكم' : 'Admin'}</span>
      </a>
    ` : '';
    html = `
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        ${adminBtn}
        <div class="nav-user-logged" onclick="location.href='profile.html'" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <div class="user-avatar" style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#b45309);color:#0c0a09;font-weight:800;display:flex;align-items:center;justify-content:center;">${initial}</div>
          <div class="user-info-brief" style="display:flex;flex-direction:column;line-height:1.2;">
            <span class="user-name" style="font-size:0.82rem;font-weight:700;color:var(--text);">${CUSER.name}</span>
            <span class="user-pts" style="font-size:0.7rem; color:var(--gold); font-weight:600;">${CUSER.points || 0} ${ptsLabel}</span>
          </div>
        </div>
        <a href="profile.html" class="nav-user-btn" style="text-decoration: none; padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--line); color: var(--gold); font-size: 0.8rem; font-weight: 600;">
          <span>${profileText}</span>
        </a>
      </div>
    `;
  } else {
    const loginText = isAr ? 'تسجيل الدخول' : 'Login';
    html = `
      <a href="login.html" class="nav-user-btn" style="text-decoration:none; padding: 0.45rem 1rem; border-radius: 8px; background: rgba(245,158,11,0.12); border: 1px solid var(--gold); color: var(--gold); font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center;">
        <span>${loginText}</span>
      </a>
    `;
  }

  if (area) area.innerHTML = html;
  if (drawerArea) drawerArea.innerHTML = html;
}

window.toggleMobileMenu = function() {
  const drawer = document.getElementById('mobileDrawer');
  const hamburger = document.getElementById('navHamburger');
  if (drawer) drawer.classList.toggle('open');
  if (hamburger) hamburger.classList.toggle('active');
};

window.logoutUser = function() {
  removeStore('token');
  removeStore('user');
  removeStore('cart');
  location.href = 'index.html';
};

// ===== Menu Data Fetching =====
async function fetchMenu() {
  try {
    const [catRes, drinksRes, offersRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/drinks'),
      fetch('/api/offers')
    ]);
    if (catRes.ok) allCategories = await catRes.json();
    if (drinksRes.ok) allDrinks = await drinksRes.json();

    if (offersRes.ok) {
      const offersData = await offersRes.json();
      window.allOffers = Array.isArray(offersData) ? offersData : [];
    } else {
      window.allOffers = [];
    }

    applyLanguage(currentLang);
  } catch(err) {
    console.error('Error fetching 2M menu:', err);
    applyLanguage(currentLang);
    const grid = document.getElementById('menuGrid');
    if (grid) {
      grid.innerHTML = currentLang === 'ar'
        ? '<p style="color:var(--red);text-align:center;grid-column:1/-1;padding:4rem">فشل تحميل المنيو. يرجى المحاولة لاحقاً</p>'
        : '<p style="color:var(--red);text-align:center;grid-column:1/-1;padding:4rem">Failed to load menu. Please try again</p>';
    }
  }
}

// ===== Category Tabs Building =====
function buildCatTabs() {
  const bar = document.getElementById('catTabs');
  if (!bar) return;
  const isAr = currentLang === 'ar';

  if (!allCategories || !allCategories.length) {
    bar.innerHTML = '';
    return;
  }

  const validCatIds = allCategories.map(c => String(c.id || c._id));
  if (currentCat === 'all' || !validCatIds.includes(currentCat)) {
    currentCat = validCatIds[0];
  }

  bar.innerHTML = allCategories.map(cat => {
    const catId = String(cat.id || cat._id);
    const isActive = currentCat === catId;
    const catName = isAr ? (cat.name_ar || cat.name) : (cat.name || cat.name_ar);
    return `<button class="cat-btn ${isActive ? 'active' : ''}" data-cat="${catId}">${catName}</button>`;
  }).join('');

  bar.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const catId = this.getAttribute('data-cat');
      currentCat = String(catId);
      bar.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      filterAndRenderMenu();
    });
  });
}

// ===== Search and Filter Rendering =====
function filterAndRenderMenu() {
  const searchInput = document.getElementById('menuSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = allDrinks;
  if (query) {
    filtered = allDrinks.filter(d => {
      const nameEn = (d.name || '').toLowerCase();
      const nameAr = (d.name_ar || '').toLowerCase();
      return nameEn.includes(query) || nameAr.includes(query);
    });
  } else if (currentCat && currentCat !== 'all') {
    filtered = allDrinks.filter(d => String(d.category_id) === currentCat);
  }

  renderMenu(filtered);
}

// ===== Render Menu Items =====
function renderMenu(drinks) {
  renderMenuGrid(drinks);
}

// ===== Helper: Best Match Drink Image =====
function getDrinkImage(d) {
  if (!d) return 'imgs/espresso.png';
  if (d.image_emoji && d.image_emoji.startsWith('imgs/')) return d.image_emoji;
  if (d.image_url) return d.image_url;

  const name = ((d.name || '') + ' ' + (d.name_ar || '')).toLowerCase();
  if (name.includes('تركي') || name.includes('turkish')) return 'imgs/turkish.png';
  if (name.includes('لاتيه') || name.includes('latte') || name.includes('كابتشينو') || name.includes('cappuccino') || name.includes('فلات')) return 'imgs/latte.png';
  if (name.includes('آيس كوفي') || name.includes('iced coffee') || name.includes('آيس امريكانو') || name.includes('ايس')) return 'imgs/icedcoffee.png';
  if (name.includes('فراب') || name.includes('frappe')) return 'imgs/frappe.png';
  if (name.includes('موكا') || name.includes('شوكليت') || name.includes('chocolate') || name.includes('سحلب') || name.includes('شاي') || name.includes('اعشاب') || name.includes('أعشاب') || name.includes('كركديه') || name.includes('ينسون')) return 'imgs/hotchoc.png';
  if (name.includes('شيك') || name.includes('shake')) return 'imgs/milkshake.png';
  if (name.includes('سموذي') || name.includes('smoothie') || name.includes('زبادي') || name.includes('سلاش')) return 'imgs/smoothie.png';
  if (name.includes('موهيتو') || name.includes('mojito') || name.includes('صودا') || name.includes('سبرايت') || name.includes('غازية')) return 'imgs/mojito.png';
  if (name.includes('عصير') || name.includes('juice') || name.includes('برتقال') || name.includes('مانجو') || name.includes('فراولة') || name.includes('ليمون') || name.includes('كوكتيل')) return 'imgs/juice.png';
  if (name.includes('آيس كريم') || name.includes('ice cream') || name.includes('جيلاتو') || name.includes('ايس كريم')) return 'imgs/icecream.png';
  if (name.includes('وافل') || name.includes('waffle') || name.includes('كريب') || name.includes('بان كيك') || name.includes('تشيز كيك') || name.includes('كيك') || name.includes('سندوتش') || name.includes('فطير') || name.includes('حلو')) return 'imgs/desserts.png';
  if (d.category_icon && d.category_icon.startsWith('imgs/')) return d.category_icon;
  return 'imgs/espresso.png';
}

function renderMenuGrid(drinks) {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const isAr = currentLang === 'ar';

  if (!drinks || !drinks.length) {
    grid.innerHTML = isAr
      ? '<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:4rem">لا توجد أصناف متوفرة في هذا القسم حالياً</p>'
      : '<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:4rem">No items available in this category</p>';
    return;
  }

  const egpLabel = isAr ? 'ج.م' : 'EGP';
  const detailsLabel = isAr ? 'تخصيص' : 'Customize';
  const addLabel = isAr ? 'إضافة +' : 'Add +';

  drinks.forEach((d) => {
    const offer = window.allOffers ? window.allOffers.find(o => String(o.drink_id) === String(d.id)) : null;
    let priceHTML = `
      <div class="lmi-price-tag">
        <span class="lmi-price-current">${d.price}</span>
        <span class="lmi-price-currency">${egpLabel}</span>
      </div>
    `;

    if (offer) {
      const finalPrice = Math.round(d.price * (1 - offer.discount_percent / 100));
      priceHTML = `
        <div class="lmi-price-tag">
          <span class="lmi-price-old">${d.price}</span>
          <span class="lmi-price-current">${finalPrice}</span>
          <span class="lmi-price-currency">${egpLabel}</span>
        </div>
      `;
    }

    const displayName = isAr ? (d.name_ar || d.name) : (d.name || d.name_ar);
    const itemImg = getDrinkImage(d);
    const itemDesc = d.tagline || d.description || (isAr ? 'مُحضر بأجود المكونات الطازجة' : 'Freshly prepared with top ingredients');

    const item = document.createElement('div');
    item.className = 'luxury-menu-item';
    item.innerHTML = `
      <div class="lmi-card-top">
        <div class="lmi-thumb-box" onclick="openDrink('${d.id}')">
          <img src="${itemImg}" alt="${displayName}" class="lmi-thumb-img" onerror="this.src='imgs/espresso.png'" loading="lazy" />
          ${offer ? `<span class="lmi-sale-badge">-${offer.discount_percent}%</span>` : ''}
        </div>
        <div class="lmi-info">
          <h4 class="lmi-name" onclick="openDrink('${d.id}')">${displayName}</h4>
          <p class="lmi-desc">${itemDesc}</p>
          ${priceHTML}
        </div>
      </div>
      <div class="lmi-actions">
        <button type="button" class="lmi-btn lmi-details" onclick="openDrink('${d.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>${detailsLabel}</span>
        </button>
        <button type="button" class="lmi-btn lmi-add" onclick="openDrink('${d.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>${addLabel}</span>
        </button>
      </div>
    `;
    grid.appendChild(item);
  });
}

// ===== Sugar and Extras Chips Helpers =====
function getSugarChipsHTML(prefix) {
  const levels = (customizationOptions && customizationOptions.sugarLevels && customizationOptions.sugarLevels.length)
    ? customizationOptions.sugarLevels
    : [
        { key: 'Normal', nameEn: 'Normal Sugar', nameAr: 'سكر طبيعي' },
        { key: 'Medium', nameEn: 'Medium Sugar', nameAr: 'سكر وسط' },
        { key: 'Less', nameEn: 'Less Sugar', nameAr: 'سكر خفيف' },
        { key: 'No Sugar', nameEn: 'No Sugar', nameAr: 'بدون سكر' }
      ];

  const pctMap = {
    'Normal': '100%',
    'Medium': '70%',
    'Less': '30%',
    'No Sugar': '0%'
  };

  const isAr = currentLang === 'ar';
  return levels.map((s, i) => {
    const label = isAr ? s.nameAr : s.nameEn;
    const pct = pctMap[s.key] || '';
    const badgeHtml = pct ? `<span class="chip-badge">${pct}</span>` : '';
    return `<button type="button" class="chip ${prefix}-chip ${i===0?'active':''}" onclick="selectChip('sugar', '${s.key}', this)">
      <span>${label}</span>
      ${badgeHtml}
    </button>`;
  }).join('');
}

function getExtrasChipsHTML(prefix, drinkExtras) {
  let extrasList = (customizationOptions && customizationOptions.extras && customizationOptions.extras.length)
    ? [...customizationOptions.extras]
    : [
        { key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0 }
      ];

  if (drinkExtras && Array.isArray(drinkExtras) && drinkExtras.length) {
    const allowed = new Set(drinkExtras);
    extrasList = extrasList.filter(e => allowed.has(e.key) || e.key === 'None');
  }

  if (!extrasList.find(e => e.key === 'None')) {
    extrasList.unshift({ key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0 });
  }

  const isAr = currentLang === 'ar';
  const egpLabel = isAr ? 'ج.م' : 'EGP';

  return extrasList.map((e, i) => {
    const label = isAr ? e.nameAr : e.nameEn;
    const price = e.price || 0;
    const priceText = price > 0 ? `<span class="chip-price">+${price} ${egpLabel}</span>` : '';
    return `<button type="button" class="chip ${prefix}-chip ${i===0?'active':''}" onclick="selectChip('extra', '${e.key}', this)">
      <span class="chip-label">${label}</span>
      ${priceText}
    </button>`;
  }).join('');
}

// ===== Drink Customization Modal =====
let _modalSessionId = 0;

window.openDrink = async function(id) {
  let drink = allDrinks.find(d => String(d.id) === String(id));
  if (!drink) {
    try {
      const res = await fetch(`/api/drinks/${id}`);
      if (res.ok) drink = await res.json();
    } catch(e) {}
  }
  if (!drink) return;

  window.currentPuzzle = { sugar: 'Normal', extra: 'None' };
  _modalSessionId = (_modalSessionId + 1) % 1e9;
  const isAr = currentLang === 'ar';
  const displayName = isAr ? (drink.name_ar || drink.name) : (drink.name || drink.name_ar);

  const modal = document.getElementById('drinkModal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;

  const continueText = isAr ? 'متابعة الطلب' : 'Continue Ordering';
  const finishText = isAr ? 'إتمام الطلب بالسلة' : 'Go to Cart';
  const buildTitle = isAr ? 'تخصيص المشروب (2M Customizer)' : 'Drink Customization';
  const sugarTitle = isAr ? '① درجة الحلاوة' : '① Sweetness Level';
  const extraTitle = isAr ? '② الإضافات (من قائمة الكاشير)' : '② Extras (POS Cashier Extras)';
  const egpLabel = isAr ? 'ج.م' : 'EGP';
  const tempLabel = drink.temperature === 'hot' ? (isAr ? 'ساخن' : 'Hot') : (isAr ? 'بارد' : 'Cold');

  const itemImg = getDrinkImage(drink);
  content.innerHTML = `
    <div class="modal-body" style="padding: 1.5rem;">
      <div style="display:flex; gap:1.15rem; align-items:center; margin-bottom:1.25rem; border-bottom:1.5px solid var(--line); padding-bottom:1rem;">
        <div style="width:75px; height:75px; border-radius:16px; background:#f8fafc; border:1.5px solid var(--line); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
          <img src="${itemImg}" alt="${displayName}" style="width:60px; height:60px; object-fit:contain;" onerror="this.src='imgs/espresso.png'" />
        </div>
        <div style="flex:1;">
          <span style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">${drink.category_name_ar || drink.category_name || '2M CAFE'}</span>
          <h2 style="font-size:1.35rem; color:var(--text); font-weight:800; margin:0.15rem 0 0.25rem;">${displayName}</h2>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <span style="font-size:1.3rem; font-weight:900; color:var(--primary);">${drink.price} <span style="font-size:0.8rem; font-weight:700; color:var(--muted);">${egpLabel}</span></span>
            <span style="font-size:0.72rem; color:var(--muted); background:#f1f5f9; padding:2px 8px; border-radius:6px; font-weight:700;">${tempLabel}</span>
          </div>
        </div>
      </div>

      <div class="msec-title" style="font-size:0.88rem; font-weight:800; color:var(--primary); margin-bottom:0.75rem;">${buildTitle}</div>

      <span class="puzzle-label" style="display:block; font-size:0.82rem; font-weight:700; color:var(--text); margin-bottom:0.4rem;">${sugarTitle}</span>
      <div class="puzzle-chips" id="chips-sugar" style="display:flex; flex-wrap:wrap; gap:0.45rem; margin-bottom:1.15rem;">
        ${getSugarChipsHTML('pz')}
      </div>

      <span class="puzzle-label" style="display:block; font-size:0.82rem; font-weight:700; color:var(--text); margin-bottom:0.4rem;">${extraTitle}</span>
      <div class="puzzle-chips" id="chips-extra" style="display:flex; flex-wrap:wrap; gap:0.45rem; margin-bottom:1.15rem; max-height:180px; overflow-y:auto; padding:2px;">
        ${getExtrasChipsHTML('pz', drink.availableExtras)}
      </div>

      <textarea id="drinkNotes" placeholder="${isAr ? 'أضف ملاحظات خاصة لتحضير طلبك...' : 'Add special preparation notes...'}" style="width:100%; background:#f8fafc; border:1.5px solid var(--line); border-radius:12px; padding:0.75rem 1rem; color:var(--text); font-family:inherit; font-size:0.88rem; margin-bottom:1.15rem; resize:vertical; min-height:55px;"></textarea>

      <div class="puzzle-qty-row" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.35rem; background:#f8fafc; padding:0.65rem 1.15rem; border-radius:14px; border:1.5px solid var(--line);">
        <label style="font-size:0.9rem; color:var(--text); font-weight:800;">${isAr ? 'الكمية' : 'Quantity'}</label>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <button type="button" class="qty-btn" onclick="const inp=document.getElementById('drinkQty'); inp.value=Math.max(1,parseInt(inp.value)-1)" style="width:36px;height:36px;border-radius:10px;border:1.5px solid var(--line);background:#ffffff;color:var(--text);font-weight:800;font-size:1.1rem;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.05);">-</button>
          <input type="number" id="drinkQty" value="1" min="1" style="width:40px; text-align:center; background:transparent; border:none; color:var(--primary); font-size:1.15rem; font-weight:900;" readonly />
          <button type="button" class="qty-btn" onclick="const inp=document.getElementById('drinkQty'); inp.value=parseInt(inp.value)+1" style="width:36px;height:36px;border-radius:10px;border:1.5px solid var(--line);background:#ffffff;color:var(--text);font-weight:800;font-size:1.1rem;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.05);">+</button>
        </div>
      </div>

      <div style="display: flex; gap: 0.85rem;">
        <button class="modal-action-btn modal-btn-continue" onclick="addToCart('${drink.id}', 'continue')">
          ${continueText}
        </button>
        <button class="modal-action-btn modal-btn-finish" onclick="addToCart('${drink.id}', 'finish')">
          ${finishText}
        </button>
      </div>
    </div>
  `;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.selectChip = function(type, value, btn) {
  const container = btn.closest('.puzzle-chips');
  if (container) {
    container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  }
  btn.classList.add('active');
  window.currentPuzzle[type] = value;
  btn.animate([
    { transform: 'scale(0.95)' },
    { transform: 'scale(1.02)' },
    { transform: 'scale(1)' }
  ], { duration: 200, easing: 'ease-out' });
};

window.closeModal = function(e) {
  if (e && e.target !== document.getElementById('drinkModal') && !e.target.classList.contains('modal-x')) return;
  const modal = document.getElementById('drinkModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
};

// ===== Add To Cart & Cart Operations =====
let _sessionUsed = new Set();

window.addToCart = function(drinkId, behavior = 'continue') {
  const sessionKey = drinkId + ':' + _modalSessionId;
  if (_sessionUsed.has(sessionKey)) {
    console.warn('[Cart] Blocked duplicate add');
    return;
  }
  _sessionUsed.add(sessionKey);

  const drink = allDrinks.find(d => String(d.id) === String(drinkId));
  if (!drink) return;

  const sugar = window.currentPuzzle.sugar || 'Normal';
  const extra = window.currentPuzzle.extra || 'None';
  const notesElement = document.getElementById('drinkNotes');
  const notes = notesElement ? notesElement.value.trim() : '';
  const qtyInput = document.getElementById('drinkQty');
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  const isAr = currentLang === 'ar';

  let unitPrice = drink.price;
  let extraPrice = 0;
  if (extra && extra !== 'None' && customizationOptions && customizationOptions.extras) {
    const found = customizationOptions.extras.find(e => e.key === extra);
    if (found) {
      extraPrice = found.price || 0;
      unitPrice += extraPrice;
    }
  }

  cart.push({
    drink_id: drink.id,
    name: drink.name,
    name_ar: drink.name_ar,
    sugar,
    extra,
    extraPrice,
    notes,
    price: unitPrice,
    basePrice: drink.price,
    quantity: qty
  });

  setStore('cart', JSON.stringify(cart));
  updateCartUI();

  const displayName = isAr ? (drink.name_ar || drink.name) : (drink.name || drink.name_ar);

  if (behavior === 'finish') {
    window.location.href = 'cart.html';
  } else {
    alert(isAr ? `تمت إضافة "${displayName}" إلى السلة بنجاح` : `Added "${displayName}" to your cart`);
    closeModal();
  }
};

function updateCartUI() {
  const fab = document.getElementById('cartFab');
  const count = document.getElementById('cartCount');
  const totalItems = cart.reduce((s, i) => s + (i.quantity || 1), 0);
  if (count) count.textContent = totalItems;
  if (fab) fab.style.transform = totalItems > 0 ? 'scale(1)' : 'scale(0)';
}

window.removeFromCart = function(idx) {
  cart.splice(idx, 1);
  setStore('cart', JSON.stringify(cart));
  updateCartUI();
};

// ===== Order Submission =====
window.submitOrder = async function() {
  const isAr = currentLang === 'ar';
  if (!cart.length) {
    return alert(isAr ? 'السلة فارغة!' : 'Your cart is empty!');
  }

  const takeawayCheckbox = document.getElementById('isTakeaway');
  const isTakeaway = takeawayCheckbox ? takeawayCheckbox.checked : false;
  const tableInput = document.getElementById('tableNum');
  const table = isTakeaway ? 'Takeaway' : (tableInput ? tableInput.value.trim() : (tableParam || ''));

  if (!isTakeaway && !table) {
    return alert(isAr ? 'الرجاء إدخال رقم الطاولة أو اختيار تيك أواي' : 'Please specify a table number or choose Takeaway');
  }

  const notesInput = document.getElementById('orderNotes');
  const notes = notesInput ? notesInput.value.trim() : '';
  const total = cart.reduce((s, i) => s + i.price * (i.quantity || 1), 0);

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        table,
        notes,
        is_takeaway: isTakeaway,
        items: cart,
        total_price: total
      })
    });

    const data = await res.json();
    if (data.success || res.ok) {
      const orderId = data.order ? (data.order._id || data.order.id) : (data.order_id || '2M-' + Date.now().toString().slice(-4));
      setStore('active_order_id', String(orderId));
      setStore('active_order_time', String(Date.now()));

      let msg = isAr ? `تم إرسال طلبك بنجاح! رقم الطلب: ${orderId}` : `Order placed successfully! Order ID: ${orderId}`;
      if (data.points_earned) {
        msg += isAr ? `\nربحت ${data.points_earned} نقطة ولاء 2M!` : `\nYou earned ${data.points_earned} 2M Loyalty Points!`;
      }
      alert(msg);

      cart = [];
      setStore('cart', JSON.stringify(cart));
      updateCartUI();
      window.location.href = 'index.html';
    } else {
      alert(data.error || (isAr ? 'حدث خطأ أثناء إرسال الطلب' : 'Failed to submit order'));
    }
  } catch(e) {
    console.error('Order error:', e);
    alert(isAr ? 'فشل الاتصال بالسيرفر. يرجى المحاولة مجدداً' : 'Failed to connect to server. Please try again.');
  }
};

// ===== Contact Form =====
window.handleContactSubmit = function(e) {
  if (e) e.preventDefault();
  const name = (document.getElementById('contact-name') ? document.getElementById('contact-name').value.trim() : '');
  const phone = (document.getElementById('contact-phone') ? document.getElementById('contact-phone').value.trim() : '');
  const msg = (document.getElementById('contact-msg') ? document.getElementById('contact-msg').value.trim() : '');

  const text = `*New Contact Message — 2M CAFE*\n\n*Name:* ${name}\n*Phone:* ${phone}\n*Message:* ${msg}`;
  const encodedText = encodeURIComponent(text);
  window.open(`https://wa.me/201060161839?text=${encodedText}`, '_blank');
};

// ===== Special Offers Cards =====
// ===== Special Offers Cards (عروض 2M CAFE المميزة) =====
async function renderOffersCards() {
  const container = document.getElementById('offersContainer');
  if (!container) return;
  const isAr = currentLang === 'ar';

  try {
    let offers = Array.isArray(window.allOffers) && window.allOffers.length > 0 ? window.allOffers : [];

    // إذا لم تكن هناك عروض نشطة في قاعدة البيانات، استعراض 4 أصناف توقيعية كعروض ترويجية
    if (offers.length === 0 && Array.isArray(allDrinks) && allDrinks.length > 0) {
      const candidates = allDrinks.filter(d => 
        ['لاتيه', 'فرابتشينو', 'موكا', 'وافل', 'كراميل', 'قهوة', 'موهيتو'].some(k => (d.name_ar || '').includes(k))
      ).slice(0, 4);

      const discounts = [20, 15, 25, 20];
      offers = candidates.map((c, i) => ({
        id: c.id,
        drink_id: c.id,
        discount_percent: discounts[i % discounts.length],
        name: c.name,
        name_ar: c.name_ar,
        price: c.price,
        image_emoji: c.image_emoji
      }));
    }

    if (offers.length > 0) {
      const eyebrow = isAr ? '/ عروض حصرية /' : '/ Special Promotions /';
      const titleLabel = isAr ? 'عروض 2M المميزة — <em>مذاق استثنائي بسعر خاص</em>' : '2M Special Offers — <em>Exquisite Taste, Special Price</em>';
      const subLabel = isAr ? 'استمتع بأشهى مشروباتنا وتشكيلاتنا الحصرية بأسعار مميزة لفترة محدودة' : 'Indulge in our signature handcrafted creations with exclusive limited-time savings';
      const offLabel = isAr ? 'خصم' : 'OFF';
      const addText = isAr ? 'اطلب الآن' : 'Order Now';
      const egpLabel = isAr ? 'ج.م' : 'EGP';
      const saveLabel = isAr ? 'وفر' : 'Save';

      let html = `
        <div class="offers-header">
          <div class="offers-header-info">
            <p class="section-eyebrow">${eyebrow}</p>
            <h2 class="section-heading">${titleLabel}</h2>
            <p class="section-sub">${subLabel}</p>
          </div>
          <div class="offers-nav-arrows">
            <button type="button" class="offer-arrow-btn" onclick="scrollOffersTrack(-1)" aria-label="Previous Offer">‹</button>
            <button type="button" class="offer-arrow-btn" onclick="scrollOffersTrack(1)" aria-label="Next Offer">›</button>
          </div>
        </div>
        <div class="offers-scroll-track" id="offersScrollTrack">
      `;

      offers.forEach(offer => {
        const d = (allDrinks && allDrinks.find(drink => String(drink.id) === String(offer.drink_id))) || offer;
        if (!d) return;

        const originalPrice = Number(d.price) || Number(offer.price) || 50;
        const discountPct = Number(offer.discount_percent) || 20;
        const finalPrice = Math.round(originalPrice * (1 - discountPct / 100));
        const savedAmount = originalPrice - finalPrice;
        const displayName = isAr ? (d.name_ar || d.name) : (d.name || d.name_ar);
        const iconSrc = getDrinkImage(d);

        html += `
          <div class="premium-offer-card" onclick="openDrink('${d.id}')">
            <div class="poc-top-bar">
              <span class="poc-badge-discount">🔥 ${discountPct}% ${offLabel}</span>
              <span class="poc-badge-tag">2M SPECIAL</span>
            </div>
            
            <div class="poc-icon-wrap">
              <img src="${iconSrc}" alt="${displayName}" class="poc-img" onerror="this.src='imgs/espresso.png'" />
            </div>

            <div class="poc-body">
              <h4 class="poc-title">${displayName}</h4>
              <p class="poc-desc" data-en="Handcrafted with 100% specialty ingredients" data-ar="مُحضر بأجود المكونات الطازجة">${isAr ? 'مُحضر بأجود المكونات الطازجة' : 'Handcrafted with specialty ingredients'}</p>
              
              <div class="poc-price-row">
                <div class="poc-prices">
                  <span class="poc-old-price">${originalPrice} ${egpLabel}</span>
                  <span class="poc-new-price">${finalPrice} <small>${egpLabel}</small></span>
                </div>
                <span class="poc-save-pill">${saveLabel} ${savedAmount} ${egpLabel}</span>
              </div>
            </div>

            <button type="button" class="btn-gold poc-btn" onclick="event.stopPropagation(); openDrink('${d.id}')">
              <span>${addText}</span>
              <span class="poc-btn-icon">✦</span>
            </button>
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
    console.error('Failed to render offers:', e);
  }
}

// التمرير السلس لشريط العروض
window.scrollOffersTrack = function(direction) {
  const track = document.getElementById('offersScrollTrack');
  if (!track) return;
  const cardWidth = 320;
  const scrollAmount = (direction > 0 ? 1 : -1) * (currentLang === 'ar' ? -cardWidth : cardWidth);
  track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
};

// ===== Profile & Membership Logic =====
window.openProfileModal = async function() {
  if (!window.location.pathname.includes('profile.html')) {
    window.location.href = 'profile.html';
    return;
  }
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('open');

  let userDetails = getCurrentUser();
  try {
    const meRes = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    if (meRes.ok) {
      userDetails = await meRes.json();
      setStore('user', JSON.stringify(userDetails));
    }
  } catch (e) {
    console.warn('Failed to fetch latest user stats', e);
  }

  if (userDetails) {
    const ptsEl = document.getElementById('profilePoints');
    if (ptsEl) ptsEl.textContent = userDetails.points || 0;
    const nameEl = document.getElementById('profileMemberName');
    if (nameEl) nameEl.textContent = userDetails.name || '2M MEMBER';

    const cardEl = document.getElementById('profileVipCard');
    const badgeEl = document.getElementById('profileTierBadge');
    const discountEl = document.getElementById('profileDiscountRate');

    if (cardEl && badgeEl && discountEl) {
      const STATUS_MAP = {
        standard:    ['card-standard', 'linear-gradient(135deg, #181410 0%, #26201a 100%)', 'Standard Member', '0%'],
        gold:        ['card-gold',     'linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)', 'Gold VIP', '15%'],
        vip:         ['card-vip',      'linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)', 'VIP Member', '15%'],
        student:     ['card-cyan',     'linear-gradient(135deg, #032B45 0%, #0284C7 50%, #38BDF8 100%)', 'Student Special', '10%'],
        '2m_family': ['card-2m',       'linear-gradient(135deg, #0c0a09 0%, #451a03 50%, #d97706 100%)', '2M Family', '20%'],
        ozel_family: ['card-2m',       'linear-gradient(135deg, #0c0a09 0%, #451a03 50%, #d97706 100%)', '2M Family', '20%']
      };
      const status = userDetails.customerStatus || 'standard';
      const [cssClass, bgColor, title, discountPct] = STATUS_MAP[status] || STATUS_MAP.standard;

      cardEl.className = 'vip-card ' + cssClass;
      cardEl.style.background = bgColor;
      badgeEl.textContent = title;
      discountEl.textContent = (currentLang === 'ar' ? 'نسبة الخصم الخاصة: ' : 'Your discount rate: ') + discountPct;
    }

    const adminCard = document.getElementById('adminAccessCard');
    if (adminCard) {
      const isAdmin = userDetails.role === 'admin' || userDetails.role === 'partner';
      adminCard.style.display = isAdmin ? 'block' : 'none';
    }
  }

  // Load Order History
  try {
    const res = await fetch('/api/me/orders', { headers: getAuthHeaders() });
    if (res.ok) {
      const orders = await res.json();
      const drinkCounts = {};
      orders.forEach(order => {
        let items = [];
        try {
          items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        } catch(e) {
          items = order.items || [];
        }
        if (Array.isArray(items)) {
          items.forEach(item => {
            const nameKey = item.name || item.name_ar;
            if (nameKey) drinkCounts[nameKey] = (drinkCounts[nameKey] || 0) + (item.quantity || 1);
          });
        }
      });

      const topDrinks = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const listEl = document.getElementById('topDrinksList');
      if (listEl) {
        if (topDrinks.length === 0) {
          listEl.innerHTML = `<p style="color: var(--muted); font-size: 0.85rem; text-align: center;">${currentLang === 'ar' ? 'لا توجد طلبات سابقة بعد' : 'No order history yet'}</p>`;
        } else {
          listEl.innerHTML = topDrinks.map(([name, count]) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid var(--line);">
              <span style="color: var(--text); font-size: 0.9rem; font-weight:600;">${name}</span>
              <span style="color: var(--gold); font-size: 0.85rem; font-weight: 800;">${count} ${currentLang === 'ar' ? 'مرات' : 'times'}</span>
            </div>
          `).join('');
        }
      }
    }
  } catch(e) {
    console.warn('Orders history fetch error', e);
  }
};

window.closeProfileModal = function() {
  if (window.location.pathname.includes('profile.html')) {
    window.location.href = 'index.html';
  } else {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('open');
  }
};

window.changePassword = async function() {
  const oldPassword = document.getElementById('old-pass') ? document.getElementById('old-pass').value : '';
  const newPassword = document.getElementById('new-pass') ? document.getElementById('new-pass').value : '';
  const msgEl = document.getElementById('cp-msg');
  if (!msgEl) return;

  if (!oldPassword || !newPassword) {
    msgEl.textContent = currentLang === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields';
    msgEl.style.color = 'var(--red)';
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      msgEl.textContent = currentLang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully';
      msgEl.style.color = 'var(--green)';
      if (document.getElementById('old-pass')) document.getElementById('old-pass').value = '';
      if (document.getElementById('new-pass')) document.getElementById('new-pass').value = '';
    } else {
      msgEl.textContent = data.error || (currentLang === 'ar' ? 'خطأ في كلمة المرور' : 'Error updating password');
      msgEl.style.color = 'var(--red)';
    }
  } catch(e) {
    msgEl.textContent = currentLang === 'ar' ? 'فشل الاتصال بالخادم' : 'Failed to connect to server';
    msgEl.style.color = 'var(--red)';
  }
};

// ===== Global Order Tracker Floating Bar =====
(function initGlobalOrderTracker() {
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

// ===== DOM Ready Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  try {
    applyLanguage(currentLang);
    renderNavUser();
    updateCartUI();
    fetchMenu();
    loadCustomizationOptions();

    // Attach search input listener
    const searchInput = document.getElementById('menuSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filterAndRenderMenu();
      });
    }

    if (window.location.pathname.includes('profile.html')) {
      if (!getStore('token')) {
        window.location.href = 'login.html';
        return;
      }
      window.openProfileModal();
    }
  } catch(e) {
    console.error('[2M Init Error]', e);
  }

  // Smooth dismiss of cinematic loader
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => { loader.style.display = 'none'; }, 1000);
    }
  }, 800);
});

// Window Scroll Header Effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
});
