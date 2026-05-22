/* ═══════════════════════════════════════
   OZEL CAFE — Frontend JS (Premium v2.1 - Bilingual & Turn-Based Imposter)
   ═══════════════════════════════════════ */

let allDrinks = [], allCategories = [], currentCat = 'all', cart = JSON.parse(localStorage.getItem('ozel_cart') || '[]');
const urlParams  = new URLSearchParams(window.location.search);
const tableParam = urlParams.get('table');
window.currentPuzzle = { sugar: 'Normal', extra: 'None' };

// ── Auth State ───────────────────────────
const TOKEN = localStorage.getItem('ozel_token');
const CUSER = JSON.parse(localStorage.getItem('ozel_user') || 'null');
const authHeaders = TOKEN ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN } : { 'Content-Type': 'application/json' };

// ── Bilingual Language Setup ──────────────
let currentLang = localStorage.getItem('ozel_lang') || 'en';

const transMap = {
  'Normal': { en: 'Normal Sugar', ar: 'سكر طبيعي' },
  'Medium': { en: 'Medium Sugar', ar: 'سكر وسط' },
  'Less': { en: 'Less Sugar', ar: 'سكر خفيف' },
  'No Sugar': { en: 'No Sugar', ar: 'بدون سكر' },
  'None': { en: 'No Extras', ar: 'بدون إضافات' },
  'Extra Shot': { en: 'Extra Espresso Shot', ar: 'جرعة إسبريسو إضافية' },
  'Espresso Shot': { en: 'Extra Espresso Shot', ar: 'جرعة إسبريسو إضافية' },
  'Almond Milk': { en: 'Almond Milk', ar: 'حليب اللوز' },
  'Caramel Sauce': { en: 'Caramel Sauce', ar: 'صوص كراميل' },
  'Caramel Syrup': { en: 'Caramel Syrup', ar: 'شراب كراميل' },
  'Vanilla Syrup': { en: 'Vanilla Syrup', ar: 'شراب فانيليا' },
  'Boba Bubbles': { en: 'Boba Bubbles', ar: 'حبيبات البوبا' },
  'Ice Cream': { en: 'Ice Cream', ar: 'آيس كريم' },
  'Marshmallow': { en: 'Marshmallows', ar: 'مارشميلو' },
  'Nuts': { en: 'Nuts mix', ar: 'مكسرات مشكلة' },
  'Shot': { en: 'Extra Shot', ar: 'جرعة إضافية' },
  'Vanilla': { en: 'Vanilla Syrup', ar: 'فانيليا' },
  'Caramel': { en: 'Caramel Syrup', ar: 'كراميل' }
};

window.toggleLanguage = function() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('ozel_lang', currentLang);
  applyLanguage(currentLang);
};

window.applyLanguage = function(lang) {
  const isAr = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  document.body.style.direction = isAr ? 'rtl' : 'ltr';
  
  document.querySelectorAll('[data-en]').forEach(el => {
    el.innerHTML = isAr ? el.getAttribute('data-ar') : el.getAttribute('data-en');
  });
  
  document.querySelectorAll('[data-placeholder-en]').forEach(el => {
    el.placeholder = isAr ? el.getAttribute('data-placeholder-ar') : el.getAttribute('data-placeholder-en');
  });

  buildCatTabs();
  renderMenu(currentCat === 'all' ? allDrinks : allDrinks.filter(d => String(d.category_id) === currentCat));
  renderOffersCards();
  renderNavUser();
  drawWheel();
  
  if (imposterGame) {
    if (imposterGame.state === 'setup') {
      renderImposterSetup();
    } else if (imposterGame.state === 'reveal' || imposterGame.state === 'describe' || imposterGame.state === 'ask' || imposterGame.state === 'vote' || imposterGame.state === 'tally') {
      renderImposterGameplay();
    } else if (imposterGame.state === 'result') {
      showImposterResults(imposterGame.winner);
    }
  }
  updateTTTStatus();
  if (typeof updateSpinResult === 'function') {
    updateSpinResult();
  }
};

// ── Loader ──────────────────────────────
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
  }, 1400);
  fetchMenu();
});

function renderNavUser() {
  const area = document.getElementById('nav-user-area');
  if (!area) return;
  const isAr = currentLang === 'ar';
  if (CUSER) {
    const initial = CUSER.name.charAt(0).toUpperCase();
    const ptsLabel = isAr ? 'نقاط' : 'pts';
    area.innerHTML = `
      <div class="nav-user-logged" onclick="openProfileModal()">
        <div class="user-avatar">${initial}</div>
        <div class="user-info-brief">
          <span class="user-name">${CUSER.name}</span>
          <span class="user-pts" style="font-size:0.65rem; color:var(--gold); font-weight:700;">${CUSER.points || 0} ${ptsLabel}</span>
        </div>
      </div>
    `;
  } else {
    const loginText = isAr ? 'تسجيل الدخول' : 'Login';
    area.innerHTML = `
      <a href="/login" class="nav-user-btn">
        <span>${loginText}</span>
      </a>
    `;
  }
}

function logoutUser() { localStorage.clear(); location.reload(); }

async function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  document.getElementById('profilePoints').textContent = CUSER.points || 0;
  if (document.getElementById('profileMemberName')) {
    document.getElementById('profileMemberName').textContent = CUSER.name || 'MEMBER';
  }
  modal.classList.add('open');
  
  const isAr = currentLang === 'ar';
  
  try {
    const res = await fetch('/api/me/orders', { headers: authHeaders });
    const orders = await res.json();
    
    const drinkCounts = {};
    orders.forEach(order => {
      const items = JSON.parse(order.items);
      items.forEach(item => {
        const nameKey = isAr ? (item.name_ar || item.name) : item.name;
        drinkCounts[nameKey] = (drinkCounts[nameKey] || 0) + 1;
      });
    });
    
    const topDrinks = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    
    const listEl = document.getElementById('topDrinksList');
    if (topDrinks.length === 0) {
      listEl.innerHTML = isAr 
        ? `<p style="color: var(--muted); font-size: 0.85rem; text-align: center;">لا توجد طلبات سابقة بعد</p>`
        : `<p style="color: var(--muted); font-size: 0.85rem; text-align: center;">No previous orders yet</p>`;
    } else {
      const timesLabel = isAr ? 'مرات' : 'times';
      listEl.innerHTML = topDrinks.map(([name, count]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg2); padding: 0.8rem 1rem; border-radius: var(--rad); border: 1px solid var(--line);">
          <span style="color: var(--text); font-size: 0.95rem;">${name}</span>
          <span style="color: var(--gold); font-size: 0.85rem; font-weight: 700;">${count} ${timesLabel}</span>
        </div>
      `).join('');
    }
  } catch(e) { console.error(e); }
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('open'); }

// ── Navbar scroll ────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
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
    
    applyLanguage(currentLang);
  } catch(err) {
    console.error('Error fetching menu:', err);
    const grid = document.getElementById('menuGrid');
    if (grid) {
      grid.innerHTML = currentLang === 'ar'
        ? `<p style="color:#C0392B;text-align:center;grid-column:1/-1;padding:4rem">فشل تحميل القائمة. يرجى التأكد من تشغيل الخادم.</p>`
        : `<p style="color:#C0392B;text-align:center;grid-column:1/-1;padding:4rem">Failed to load menu. Make sure the server is running.</p>`;
    }
  }
}

// ── Category Tabs ─────────────────────────
function buildCatTabs() {
  const bar = document.getElementById('catTabs');
  if (!bar) return;
  const isAr = currentLang === 'ar';
  const allLabel = isAr ? 'الكل' : 'All';
  bar.innerHTML = `<button class="cat-btn active" data-cat="all">${allLabel}</button>`;
  
  renderOffersCards();

  allCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.cat = cat.id;
    btn.textContent = isAr ? (cat.name_ar || cat.name) : cat.name;
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
  if (!grid) return;
  grid.innerHTML = '';
  const isAr = currentLang === 'ar';
  
  if (!drinks.length) {
    grid.innerHTML = isAr
      ? `<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:4rem">لا توجد أصناف في هذا القسم</p>`
      : `<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:4rem">No items in this category</p>`;
    return;
  }
  
  const egpLabel = isAr ? 'ج.م' : 'EGP';
  const detailsLabel = isAr ? 'التفاصيل' : 'Details';
  const addLabel = isAr ? 'إضافة ✦' : 'Add ✦';

  drinks.forEach((d, i) => {
    const offer = window.allOffers ? window.allOffers.find(o => String(o.drink_id) === String(d.id)) : null;
    let priceHTML = `<span class="lmi-price">${d.price} <span class="lmi-currency">${egpLabel}</span></span>`;
    
    if (offer) {
      const finalPrice = d.price * (1 - offer.discount_percent / 100);
      priceHTML = `
        <span class="lmi-price" style="display:flex; flex-direction:column; align-items:flex-end;">
          <span style="text-decoration:line-through; color:var(--muted); font-size:0.8rem;">${d.price} ${egpLabel}</span>
          <span style="color:var(--gold); font-weight:700;">${finalPrice.toFixed(0)} ${egpLabel}</span>
          <span style="background:var(--gold); color:var(--white); font-size:0.65rem; padding:1px 4px; border-radius:2px; margin-top:2px;">-${offer.discount_percent}%</span>
        </span>
      `;
    }

    const displayName = isAr ? (d.name_ar || d.name) : d.name;

    const item = document.createElement('div');
    item.className = 'luxury-menu-item';
    item.innerHTML = `
      <div class="lmi-top">
        <span class="lmi-name">${displayName}</span>
        <span class="lmi-dots"></span>
        ${priceHTML}
      </div>
      <div class="lmi-actions">
        <button class="lmi-btn lmi-details" onclick="openDrink('${d.id}')">${detailsLabel}</button>
        <button class="lmi-btn lmi-add" onclick="openDrink('${d.id}')">${addLabel}</button>
      </div>
    `;
    grid.appendChild(item);
  });
}

window.quickAddToCart = function(drinkId) {
  window.currentPuzzle = { sugar: 'Normal', extra: 'None' };
  addToCart(drinkId);
};

// Helpers to map extras names and costs dynamically
function getExtraChipText(value, displayVal, isAr) {
  if (value === 'None') return isAr ? 'بدون إضافات' : 'None';
  if (value === 'Extra Shot') return isAr ? 'جرعة إضافية +25' : 'Shot +25';
  if (value === 'Caramel Syrup') return isAr ? 'سيرب كراميل +15' : 'Caramel +15';
  if (value === 'Vanilla Syrup') return isAr ? 'سيرب فانيليا +15' : 'Vanilla +15';
  if (value === 'Ice Cream') return isAr ? 'آيس كريم +20' : 'Ice Cream +20';
  if (value === 'Marshmallow') return isAr ? 'مارشميلو +10' : 'Marshmallow +10';
  if (value === 'Nuts') return isAr ? 'مكسرات +15' : 'Nuts +15';
  
  if (value === 'Espresso Shot') return isAr ? 'إسبريسو +15' : 'Espresso +15';
  if (value === 'Almond Milk') return isAr ? 'حليب لوز +20' : 'Almond +20';
  if (value === 'Caramel Sauce') return isAr ? 'صوص كراميل +10' : 'Caramel +10';
  if (value === 'Boba Bubbles') return isAr ? 'بوبا +15' : 'Boba +15';
  return displayVal;
}

// ── Drink Modal ───────────────────────────
async function openDrink(id) {
  const drink = allDrinks.find(d => d.id === id) || await fetch(`/api/drinks/${id}`).then(r => r.json());
  window.currentPuzzle = { sugar: 'Normal', extra: 'None' };
  const isAr = currentLang === 'ar';
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;

  // Split-Deck logic on desktop
  const deck = document.getElementById('alchemyDeck');
  const isDesktop = window.innerWidth > 1024;
  if (deck && isDesktop) {
    const deckContent = document.getElementById('deckContent');
    // Generate dynamic sensory profile
    const intensity = drink.temperature === 'hot' ? 4 : 2;
    const sweetness = drink.name.toLowerCase().includes('latte') ? 3 : (drink.name.toLowerCase().includes('espresso') ? 1 : 4);
    const creaminess = drink.name.toLowerCase().includes('shake') || drink.name.toLowerCase().includes('latte') ? 4 : 1;

    deckContent.innerHTML = `
      <div class="deck-content-wrap">
        <img class="deck-drink-img" src="${drink.image_emoji}" alt="${displayName}" onerror="this.src='imgs/espresso.png';">
        <div class="deck-meta">
          <h4 class="deck-name">${displayName}</h4>
          <span class="deck-price">${drink.price} EGP</span>
        </div>
        <p class="deck-desc">${isAr ? (drink.description_ar || drink.description || 'مشروب أوزيل الفاخر المحضر بعناية فائقة وتوازن مذهل للنكهات.') : (drink.description || 'OZEL premium drink prepared with meticulous care and incredible flavor balance.')}</p>
        
        <div class="deck-sensory-box">
          <div class="deck-sensory-row">
            <span>${isAr ? 'التركيز' : 'Intensity'}</span>
            <div class="deck-dots">
              ${Array.from({length: 5}).map((_, i) => `<span class="deck-dot ${i < intensity ? 'active' : ''}"></span>`).join('')}
            </div>
          </div>
          <div class="deck-sensory-row">
            <span>${isAr ? 'الحلاوة' : 'Sweetness'}</span>
            <div class="deck-dots">
              ${Array.from({length: 5}).map((_, i) => `<span class="deck-dot ${i < sweetness ? 'active gold' : ''}"></span>`).join('')}
            </div>
          </div>
          <div class="deck-sensory-row">
            <span>${isAr ? 'القوام' : 'Creaminess'}</span>
            <div class="deck-dots">
              ${Array.from({length: 5}).map((_, i) => `<span class="deck-dot ${i < creaminess ? 'active' : ''}"></span>`).join('')}
            </div>
          </div>
        </div>

        <div class="deck-customizer">
          <div class="deck-custom-group">
            <span class="deck-custom-label">${isAr ? 'درجة السكر' : 'Sugar Level'}</span>
            <div class="deck-chips" id="deck-chips-sugar">
              ${['Normal','Medium','Less','No Sugar'].map((v,i) => {
                const sTrans = transMap[v] ? transMap[v][currentLang] : v;
                return `<button class="deck-chip ${i===0?'active':''}" onclick="selectDeckChip('sugar','${v}',this)">${sTrans}</button>`;
              }).join('')}
            </div>
          </div>
          <div class="deck-custom-group">
            <span class="deck-custom-label">${isAr ? 'الإضافات' : 'Extras'}</span>
            <div class="deck-chips" id="deck-chips-extra">
              ${[
                ['None','None'],
                ['Extra Shot','Shot +25'],
                ['Caramel Syrup','Caramel +15'],
                ['Vanilla Syrup','Vanilla +15'],
                ['Ice Cream','Ice Cream +20'],
                ['Marshmallow','Marshmallow +10'],
                ['Nuts','Nuts +15']
              ].map((v,i) => {
                const extTxt = getExtraChipText(v[0], v[1], isAr);
                return `<button class="deck-chip ${i===0?'active':''}" onclick="selectDeckChip('extra','${v[0]}',this)">${extTxt}</button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <textarea id="deckNotes" placeholder="${isAr ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}" style="width:100%; background:var(--bg3); border:1px solid var(--line); color:var(--text); padding:.6rem 1rem; border-radius:var(--rad); font-family:'Tajawal',sans-serif; font-size:.85rem; outline:none; height: 50px; resize:none;"></textarea>

        <button class="btn-gold" onclick="addDeckToCart('${drink.id}')" style="width: 100%; justify-content: center; padding: 0.8rem; background: var(--accent-emerald); color: var(--white);">
          ${isAr ? 'إضافة للطلب ✦' : 'Add to Order ✦'}
        </button>
      </div>
    `;
    
    const deckRect = deck.getBoundingClientRect();
    if (deckRect.top < 0 || deckRect.bottom > window.innerHeight) {
      deck.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return;
  }

  // Fallback to Modal (for Mobile/Tablet)
  const modal   = document.getElementById('drinkModal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;

  const continueText = isAr ? 'متابعة الطلب' : 'Continue Ordering';
  const finishText = isAr ? 'إنهاء الطلب' : 'Finish Order';
  const buildTitle = isAr ? 'تخصيص مشروبك — نظام الألغاز' : 'Build your drink — Puzzle System';
  const sugarTitle = isAr ? '① درجة الحلاوة' : '① Sweetness Level';
  const extraTitle = isAr ? '② إضافات خاصة' : '② Special Extras';
  const tempLabel = drink.temperature === 'hot' ? (isAr ? 'ساخن' : 'Hot') : (isAr ? 'بارد' : 'Cold');

  content.innerHTML = `
    <div class="modal-hero-img">
      <img src="${drink.image_emoji}" alt="${displayName}" onerror="this.parentElement.style.background='var(--bg4)';this.style.display='none';"/>
    </div>
    <div class="modal-body">
      <div class="modal-cat-label">${isAr ? (drink.category_name_ar || drink.category_name) : drink.category_name}</div>
      <div class="modal-name">${displayName}</div>
      <div class="modal-badges">
        <span class="mbadge mbadge-gold">${drink.price} EGP</span>
        <span class="mbadge mbadge-${drink.temperature}">${tempLabel}</span>
      </div>

      <div class="msec-title">${buildTitle}</div>

      <span class="puzzle-label">${sugarTitle}</span>
      <div class="puzzle-chips" id="chips-sugar">
        ${['Normal','Medium','Less','No Sugar'].map((v,i) => {
          const sTrans = transMap[v] ? transMap[v][currentLang] : v;
          return `<button class="chip ${i===0?'active':''}" onclick="selectChip('sugar','${v}',this)">${sTrans}</button>`;
        }).join('')}
      </div>

      <span class="puzzle-label">${extraTitle}</span>
      <div class="puzzle-chips" id="chips-extra">
        ${[
          ['None','None'],['Espresso Shot','Espresso +15'],['Almond Milk','Almond +20'],
          ['Caramel Sauce','Caramel +10'],['Boba Bubbles','Boba +15'],
          ['Ice Cream','Ice Cream +20'],['Marshmallow','Marshmallow +10'],['Nuts','Nuts +15']
        ].map((v,i) => {
          const extTxt = getExtraChipText(v[0], v[1], isAr);
          return `<button class="chip ${i===0?'active':''}" onclick="selectChip('extra','${v[0]}',this)">${extTxt}</button>`;
        }).join('')}
      </div>

      <textarea id="drinkNotes" placeholder="${isAr ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:.7rem 1rem; border-radius:var(--rad); font-family:'Tajawal',sans-serif; font-size:.95rem; outline:none; margin-top: 1rem; height: 60px;"></textarea>

      <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
        <button class="puzzle-add-btn" onclick="addToCart('${drink.id}', 'continue')" style="flex: 1;">
          ${continueText}
        </button>
        <button class="puzzle-add-btn" onclick="addToCart('${drink.id}', 'finish')" style="flex: 1; background: var(--gold); color: var(--white);">
          ${finishText}
        </button>
      </div>
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
  const modal = document.getElementById('drinkModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Cart ──────────────────────────────────
function addToCart(drinkId, behavior = 'continue') {
  const drink = allDrinks.find(d => d.id === drinkId);
  const sugar = window.currentPuzzle.sugar;
  const extra = window.currentPuzzle.extra;
  const notesElement = document.getElementById('drinkNotes');
  const notes = notesElement ? notesElement.value : '';
  const isAr = currentLang === 'ar';
  
  let price = drink.price;
  if (extra.includes('Espresso') || extra.includes('Boba') || extra.includes('Nuts') || extra.includes('Shot')) price += 15;
  if (extra.includes('Almond') || extra.includes('Ice Cream')) price += 20;
  if (extra.includes('Caramel') || extra.includes('Marshmallow')) price += 10;
  
  cart.push({ drink_id: drink.id, name: drink.name, name_ar: drink.name_ar, sugar, extra, price, notes });
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI();
  
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;

  if (behavior === 'finish') {
    window.location.href = '/cart.html';
  } else {
    alert(isAr ? `تم إضافة ${displayName} إلى السلة بنجاح` : `Added ${displayName} to cart successfully`);
    closeModal();
  }
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
  const isAr = currentLang === 'ar';
  if (!cart.length) return alert(isAr ? 'السلة فارغة!' : 'Cart is empty!');
  const isTakeaway = document.getElementById('isTakeaway').checked;
  const table = isTakeaway ? 'Takeaway' : document.getElementById('tableNum').value;
  if (!isTakeaway && !table) return alert(isAr ? 'الرجاء إدخال رقم الطاولة' : 'Please enter table number');
  const notes = document.getElementById('orderNotes').value;
  const total = cart.reduce((s, i) => s + i.price, 0);
  try {
    const res  = await fetch('/api/orders', { method:'POST', headers: authHeaders, body: JSON.stringify({ table_number: table, items: cart, total_price: total, notes: notes }) });
    const data = await res.json();
    if (data.success) {
      const pts = CUSER 
        ? (isAr ? `\nربحت ${data.points_earned} نقطة!` : `\nYou earned ${data.points_earned} points!`)
        : (isAr ? '\n\nسجل دخولك لكسب نقاط مع كل طلب!' : '\n\nLogin to earn points with every order!');
      alert((isAr ? 'تم إرسال طلبك بنجاح! سيتم تحضيره قريباً.' : 'Your order has been sent! It will be prepared soon.') + pts);
      cart = []; 
      const notesInput = document.getElementById('orderNotes');
      if (notesInput) notesInput.value = ''; 
      updateCartUI(); 
      if (typeof toggleCart === 'function') toggleCart();
    }
  } catch(e) { 
    alert(isAr ? 'فشل الاتصال بالخادم، يرجى المحاولة لاحقاً.' : 'An error occurred, try again.'); 
  }
}

function handleContact(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const msg = document.getElementById('contact-msg').value.trim();
  
  const text = `✦ *New Contact — OZEL CAFE* ✦\n\n✦ *Name:* ${name}\n✦ *Phone Number:* ${phone}\n\n✦ *Message:*\n${msg}\n\n— *Sent from website*`;
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/201060161839?text=${encodedText}`;
  
  window.open(whatsappUrl, '_blank');
}

async function renderOffersCards() {
  const container = document.getElementById('offersContainer');
  if (!container) return;

  const isAr = currentLang === 'ar';
  
  try {
    if (Array.isArray(window.allOffers) && window.allOffers.length > 0) {
      const offers = window.allOffers;
      
      const titleLabel = isAr ? 'عروض خاصة' : 'Special Offers';
      const subLabel = isAr ? 'لفترة محدودة' : 'Limited Time';
      const offLabel = isAr ? 'خصم' : 'OFF';
      const addText = isAr ? 'إضافة للطلب ✦' : 'Add to Order ✦';
      const egpLabel = isAr ? 'ج.م' : 'EGP';
      
      let html = `
        <div class="offers-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; padding:0 1rem;">
          <h3 style="color:var(--gold); font-size:1.4rem; font-family:'Cormorant Garamond',serif;">
            ${titleLabel}
          </h3>
          <span style="color:var(--muted); font-size:0.8rem; letter-spacing:0.1em; text-transform:uppercase;">${subLabel}</span>
        </div>
      `;
      
      html += `<div class="offers-scroll-track">`;
      
      offers.forEach(offer => {
        const d = allDrinks.find(drink => String(drink.id) === String(offer.drink_id));
        if (!d) return;
        
        const finalPrice = d.price * (1 - offer.discount_percent / 100);
        const displayName = isAr ? (d.name_ar || d.name) : d.name;
        const defaultTagline = isAr ? 'تجربة فريدة ومذاق لا ينسى' : 'A unique experience and unforgettable taste';
        const displayTagline = isAr ? (d.tagline_ar || d.tagline || defaultTagline) : (d.tagline || defaultTagline);

        html += `
          <div class="premium-offer-card">
            <div class="poc-image-wrapper">
              <img src="${d.image_emoji || 'imgs/espresso.png'}" class="poc-img" alt="${displayName}">
              <div class="poc-badge">
                <span>${offLabel}</span>
                <strong>${offer.discount_percent}%</strong>
              </div>
              <div class="poc-overlay"></div>
            </div>
            <div class="poc-content">
              <h4 class="poc-title">${displayName}</h4>
              <p class="poc-desc">${displayTagline}</p>
              
              <div class="poc-price-row">
                <div class="poc-price-old">${d.price} <span class="poc-currency">${egpLabel}</span></div>
                <div class="poc-price-new">${finalPrice.toFixed(0)} <span class="poc-currency">${egpLabel}</span></div>
              </div>
              
              <button class="poc-btn" onclick="openDrink('${d.id}')">
                <span>${addText}</span>
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
  if (!msgEl) return;
  const isAr = currentLang === 'ar';
  
  if (!oldPassword || !newPassword) {
    msgEl.textContent = isAr ? 'يرجى ملء جميع الحقول' : 'Please fill all fields';
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
      msgEl.textContent = isAr ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully';
      msgEl.style.color = '#27AE60';
      document.getElementById('old-pass').value = '';
      document.getElementById('new-pass').value = '';
    } else {
      msgEl.textContent = data.error || (isAr ? 'حدث خطأ ما' : 'Something went wrong');
      msgEl.style.color = '#C0392B';
    }
  } catch (e) {
    console.error(e);
    msgEl.textContent = isAr ? 'فشل الاتصال بالخادم' : 'Failed to connect to server';
    msgEl.style.color = '#C0392B';
  }
}

/* ═══════════════════════════════════════════
   TABLE LOUNGE & GROUP GAMES LOGIC
   ═══════════════════════════════════════════ */

window.switchLoungeTab = function(tabName) {
  document.querySelectorAll('.lounge-game-card').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.lounge-panel').forEach(panel => panel.classList.remove('active'));
  
  const activeBtn = document.getElementById(`btn-tab-${tabName}`);
  const activePanel = document.getElementById(`lounge-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tttAiTimeout) {
    clearTimeout(tttAiTimeout);
    tttAiTimeout = null;
  }

  if (tabName === 'ttt') {
    resetTTT();
  } else if (tabName === 'imposter') {
    if (imposterGame.state === 'gameplay' || imposterGame.state === 'reveal' || imposterGame.state === 'describe' || imposterGame.state === 'ask' || imposterGame.state === 'vote' || imposterGame.state === 'tally') {
      renderImposterGameplay();
    } else if (imposterGame.state === 'result') {
      showImposterResults(imposterGame.winner);
    } else {
      renderImposterSetup();
    }
  }
};

// --- Spin the Cup Logic ---
let loungePlayers = [];
let isSpinning = false;
let currentCupAngle = 0;
let lastSpinWinnerIdx = null;
let lastSpinPromptIdx = null;

const spinPrompts = [
  { 
    ar: "عليه دفع ثمن المشروبات والحلويات لهذه الجلسة!", 
    en: "Must pay for drinks and desserts for this session!" 
  },
  { 
    ar: "ما هو المشروب المفضل لديه في أوزيل كافيه ولماذا؟", 
    en: "What is their favorite drink at OZEL CAFE and why?" 
  },
  { 
    ar: "شارك سرًا طريفًا لم تشاركه مع الآخرين من قبل!", 
    en: "Share a funny secret you have never shared with others before!" 
  },
  { 
    ar: "قم بتقليد ضحكة أحد الجالسين على الطاولة بشكل كوميدي", 
    en: "Imitate the laugh of someone sitting at the table in a funny way!" 
  },
  { 
    ar: "اختر صديقًا ليقوم بغناء مقطع من أغنيته المفضلة حالاً", 
    en: "Choose a friend to sing a snippet of their favorite song right now!" 
  },
  { 
    ar: "ما هي الكلمة الأولى التي تتبادر لذهنك لوصف كافيه أوزيل؟", 
    en: "What is the first word that comes to mind to describe OZEL CAFE?" 
  },
  { 
    ar: "تحدي: قم بتغيير نبرة صوتك إلى صوت طفل صغير للدقيقتين القادمتين", 
    en: "Challenge: Change your voice tone to a small child for the next 2 minutes!" 
  },
  { 
    ar: "ما هو أكثر مشروب غريب طلبته في حياتك وماذا كان طعمه؟", 
    en: "What is the weirdest drink you ever ordered in your life and how did it taste?" 
  },
  { 
    ar: "اسأل الشخص الذي يقابلك سؤالاً صريحاً جداً ولا يمكنه الرفض", 
    en: "Ask the person opposite you a very candid question that they cannot refuse!" 
  },
  { 
    ar: "تحدي: حاول عدم استخدام هاتفك تماماً حتى تنتهي من شرب كوبك!", 
    en: "Challenge: Try not to use your phone at all until you finish drinking your cup!" 
  },
  { 
    ar: "ما هو أجمل موقف مر عليك هذا الأسبوع؟", 
    en: "What is the most beautiful thing that happened to you this week?" 
  },
  { 
    ar: "تحدي: قم بوصف جارك الأيمن بـ 3 كلمات إيجابية فقط!", 
    en: "Challenge: Describe your right-hand neighbor with only 3 positive words!" 
  }
];

function drawWheel() {
  const svg = document.getElementById('wheel-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const N = loungePlayers.length || 4; 
  const isAr = currentLang === 'ar';
  const placeholderNames = isAr 
    ? ["بانتظار اللاعبين...", "أوزيل كافيه", "المشروب السري", "صاحب الفنجان"]
    : ["Waiting for players...", "OZEL CAFE", "Secret Drink", "Cup Owner"];
  const names = loungePlayers.length ? loungePlayers : placeholderNames;
  const sectorSize = 360 / N;
  
  const colors = [
    '#5c766d', // Brand Sage Green
    '#541a1a', // Brand Deep Cocoa Brown
    '#759288', // Light Sage Green
    '#702424', // Deep Burgundy
    '#8da199', // Pale Sage
    '#9c6161', // Soft Crimson
    '#394e47', // Dark Sage
    '#380e0e'  // Very Dark Cocoa
  ];

  for (let i = 0; i < N; i++) {
    const startAngle = i * sectorSize;
    const endAngle = (i + 1) * sectorSize;
    
    function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
      const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
      return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
      };
    }
    
    const x = 150, y = 150, radius = 140;
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    const pathData = [
      "M", x, y,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", colors[i % colors.length]);
    path.setAttribute("stroke", "rgba(255,255,255,0.2)");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("id", `wheel-sector-${i}`);
    svg.appendChild(path);

    const midAngle = startAngle + (sectorSize / 2);
    const textPos = polarToCartesian(x, y, 90, midAngle);
    
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", textPos.x);
    text.setAttribute("y", textPos.y);
    text.setAttribute("fill", "#ffffff");
    text.setAttribute("font-size", N > 6 ? "9px" : "11px");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "Tajawal, sans-serif");
    
    let rotation = midAngle;
    text.setAttribute("transform", `rotate(${rotation}, ${textPos.x}, ${textPos.y})`);
    
    text.textContent = names[i];
    svg.appendChild(text);
  }
}

window.addLoungePlayer = function() {
  const input = document.getElementById('player-name-input');
  if (!input) return;
  const name = input.value.trim();
  const isAr = currentLang === 'ar';
  
  if (!name) {
    alert(isAr ? "الرجاء إدخال اسم صحيح" : "Please enter a valid name");
    return;
  }
  
  if (loungePlayers.length >= 8) {
    alert(isAr ? "الحد الأقصى هو 8 لاعبين" : "Maximum is 8 players");
    return;
  }
  
  if (loungePlayers.includes(name)) {
    alert(isAr ? "هذا الاسم موجود بالفعل" : "This name already exists");
    return;
  }
  
  loungePlayers.push(name);
  input.value = '';
  lastSpinWinnerIdx = null;
  lastSpinPromptIdx = null;
  if (typeof updateSpinResult === 'function') updateSpinResult();
  renderLoungePlayers();
  drawWheel();
  if (typeof renderImposterSetup === 'function') {
    renderImposterSetup();
  }
};

window.removeLoungePlayer = function(idx) {
  loungePlayers.splice(idx, 1);
  lastSpinWinnerIdx = null;
  lastSpinPromptIdx = null;
  if (typeof updateSpinResult === 'function') updateSpinResult();
  renderLoungePlayers();
  drawWheel();
  if (typeof renderImposterSetup === 'function') {
    renderImposterSetup();
  }
};

function renderLoungePlayers() {
  const container = document.getElementById('player-chips-container');
  if (!container) return;
  container.innerHTML = '';
  
  loungePlayers.forEach((p, idx) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `
      <span>${p}</span>
      <span class="player-chip-remove" onclick="removeLoungePlayer(${idx})">✕</span>
    `;
    container.appendChild(chip);
  });
}

window.updateSpinResult = function() {
  const resultBox = document.getElementById('spin-result');
  if (!resultBox) return;
  const isAr = currentLang === 'ar';
  
  if (isSpinning) {
    resultBox.textContent = isAr ? "جاري دوران فنجان القهوة وتحديد المصير..." : "Spinning the coffee cup to determine your fate...";
    return;
  }
  
  if (lastSpinWinnerIdx === null || lastSpinPromptIdx === null) {
    resultBox.innerHTML = isAr
      ? `<span>انقر على الفنجان في المنتصف لبدء اللعب!</span>`
      : `<span>Click the cup in the center to start playing!</span>`;
    return;
  }
  
  if (lastSpinWinnerIdx >= loungePlayers.length) {
    lastSpinWinnerIdx = null;
    lastSpinPromptIdx = null;
    resultBox.innerHTML = isAr
      ? `<span>انقر على الفنجان في المنتصف لبدء اللعب!</span>`
      : `<span>Click the cup in the center to start playing!</span>`;
    return;
  }
  
  const winnerName = loungePlayers[lastSpinWinnerIdx];
  const promptObj = spinPrompts[lastSpinPromptIdx];
  const randomPrompt = isAr ? promptObj.ar : promptObj.en;
  const resultTitle = isAr ? 'النتيجة لـ:' : 'Result for:';

  resultBox.innerHTML = `
    <div style="animation: popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;">
      ${resultTitle} <strong style="color:var(--gold); font-size:1.2rem;">${winnerName}</strong>
      <p style="margin-top:0.4rem; font-weight:500;">${randomPrompt}</p>
    </div>
  `;
};

window.spinTheCupV2 = function() {
  if (isSpinning) return;
  
  const resultBox = document.getElementById('spin-result');
  const N = loungePlayers.length;
  const isAr = currentLang === 'ar';
  
  if (N < 2) {
    resultBox.innerHTML = isAr
      ? `<span style="color:var(--burgundy); font-weight:700;">الرجاء إضافة لاعبين على الأقل للعب! (من 2 إلى 8 لاعبين)</span>`
      : `<span style="color:var(--burgundy); font-weight:700;">Please add at least 2 players to play! (2 to 8 players)</span>`;
    return;
  }
  
  isSpinning = true;
  resultBox.textContent = isAr ? "جاري دوران فنجان القهوة وتحديد المصير..." : "Spinning the coffee cup to determine your fate...";
  
  const winnerIndex = Math.floor(Math.random() * N);
  const promptIndex = Math.floor(Math.random() * spinPrompts.length);
  
  lastSpinWinnerIdx = winnerIndex;
  lastSpinPromptIdx = promptIndex;
  
  const sectorSize = 360 / N;
  const targetCenterAngle = (winnerIndex * sectorSize) + (sectorSize / 2);
  
  const totalRotations = 5 + Math.floor(Math.random() * 3);
  currentCupAngle = (Math.ceil(currentCupAngle / 360) * 360) + (totalRotations * 360) + targetCenterAngle;
  
  const cup = document.getElementById('cup-center-spinner');
  if (cup) {
    cup.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.35, 1)';
    cup.style.transform = `rotate(${currentCupAngle}deg)`;
  }
  
  document.querySelectorAll('#wheel-svg path').forEach(p => {
    p.style.opacity = '1';
    p.classList.remove('winning-sector');
  });
  
  setTimeout(() => {
    isSpinning = false;
    
    const winnerPath = document.getElementById(`wheel-sector-${winnerIndex}`);
    if (winnerPath) {
      winnerPath.classList.add('winning-sector');
    }
    
    document.querySelectorAll('#wheel-svg path').forEach((p, idx) => {
      if (idx !== winnerIndex) {
        p.style.opacity = '0.5';
      }
    });
    
    updateSpinResult();
  }, 5000);
};

// --- Imposter Game Logic ---
const imposterWordPairs = [
  { wordA_en: "Coffee", wordB_en: "Tea", wordA_ar: "قهوة", wordB_ar: "شاي" },
  { wordA_en: "Milk", wordB_en: "Cream", wordA_ar: "حليب", wordB_ar: "كريمة" },
  { wordA_en: "Sugar", wordB_en: "Salt", wordA_ar: "سكر", wordB_ar: "ملح" },
  { wordA_en: "Chocolate", wordB_en: "Vanilla", wordA_ar: "شوكولاتة", wordB_ar: "فانيليا" },
  { wordA_en: "Spoon", wordB_en: "Fork", wordA_ar: "ملعقة", wordB_ar: "شوكة" },
  { wordA_en: "Sea", wordB_en: "Pool", wordA_ar: "بحر", wordB_ar: "مسبح" },
  { wordA_en: "Car", wordB_en: "Bicycle", wordA_ar: "سيارة", wordB_ar: "دراجة" },
  { wordA_en: "Book", wordB_en: "Notebook", wordA_ar: "كتاب", wordB_ar: "دفتر" },
  { wordA_en: "Sun", wordB_en: "Moon", wordA_ar: "شمس", wordB_ar: "قمر" },
  { wordA_en: "Cat", wordB_en: "Dog", wordA_ar: "قطة", wordB_ar: "كلب" },
  { wordA_en: "Apple", wordB_en: "Orange", wordA_ar: "تفاحة", wordB_ar: "برتقالة" },
  { wordA_en: "Sandwich", wordB_en: "Pizza", wordA_ar: "ساندوتش", wordB_ar: "بيتزا" },
  { wordA_en: "Water", wordB_en: "Juice", wordA_ar: "ماء", wordB_ar: "عصير" },
  { wordA_en: "Barista", wordB_en: "Chef", wordA_ar: "باريستا", wordB_ar: "طباخ" },
  { wordA_en: "Winter", wordB_en: "Summer", wordA_ar: "شتاء", wordB_ar: "صيف" },
  { wordA_en: "Night", wordB_en: "Day", wordA_ar: "ليل", wordB_ar: "نهار" },
  { wordA_en: "Phone", wordB_en: "Computer", wordA_ar: "هاتف", wordB_ar: "كمبيوتر" },
  { wordA_en: "Airplane", wordB_en: "Train", wordA_ar: "طائرة", wordB_ar: "قطار" },
  { wordA_en: "Gold", wordB_en: "Silver", wordA_ar: "ذهب", wordB_ar: "فضة" },
  { wordA_en: "Chair", wordB_en: "Sofa", wordA_ar: "كرسي", wordB_ar: "كنبة" }
];

const imposterTexts = {
  en: {
    title: "Who is the Imposter?",
    desc: "A group deception game for 3-8 players. Everyone receives the same secret word, except one who is the 'Imposter'. Find them before they blend in!",
    playersTitle: "Current Players",
    minPlayersAlert: "Please add at least 3 players to start",
    addPlayerPlaceholder: "New player name...",
    addButton: "Add +",
    startGameButton: "✦ Start Game ✦",
    resetButton: "Reset Game",
    cancelButton: "Cancel Game",
    playAgainButton: "Play Again",
    passPhoneTitle: "Role Distribution",
    passPhoneDesc: "Click your card to see your secret word. Hide it before passing to the next player.",
    clickToSee: "Click to see word",
    seen: "Seen ✓",
    confirmIdentity: "Are you {name}?",
    shieldScreen: "Ensure no one else is looking at the screen!",
    showSecretBtn: "Yes, show secret word",
    yourSecretWord: "Your secret word is:",
    rememberWord: "Remember it! Do not let anyone see it.",
    hideSecretBtn: "Got it, hide word",
    
    describeTitle: "Round {round}: Describe Word",
    describeDesc: "Each player must describe their word in ONE word/clue. Do not give it away!",
    describeTurn: "It is {name}'s turn to describe their word.",
    doneBtn: "Done / Next Player",
    
    askTitle: "Round {round}: Ask Questions",
    askDesc: "Each player asks one question to any other player about their clue/word.",
    askTurn: "It is {name}'s turn to ask a question to anyone.",
    
    voteTitle: "Round {round}: Secret Voting",
    voteDesc: "Time to vote! Pass the phone to each player to cast their vote secretly.",
    passToVote: "Pass the phone to {name}",
    castVoteBtn: "I am {name}, cast my vote",
    chooseSuspect: "Who do you suspect is the Imposter?",
    voteCasted: "Vote cast successfully!",
    
    tallyTitle: "Voting Results",
    votedFor: "{voter} voted for {suspect}",
    highestVotes: "{name} received the highest votes ({count}) and is eliminated!",
    tieAlert: "It's a tie! Tying players: {list}. A random draw was conducted.",
    eliminatedRole: "{name} was a {role}!",
    imposterRevealed: "The Imposter was {name}!",
    nextRoundBtn: "Start Next Round",
    
    citizensWin: "Citizens Win!",
    imposterWins: "Imposter Wins!",
    finalDesc: "Roles and secret words revealed:",
    citizenWordLabel: "Citizen Word:",
    imposterWordLabel: "Imposter Word:",
    roleTagCitizen: "Citizen",
    roleTagImposter: "Imposter",
    statusEliminated: "Eliminated",
    statusAlive: "Alive"
  },
  ar: {
    title: "مين الدخيل؟",
    desc: "لعبة خادعة جماعية تحتاج إلى 3 لاعبين على الأقل. سيتلقى الجميع نفس الكلمة السرية ما عدا لاعب واحد سيكون 'الدخيل'. هدفكم معرفته، وهدفه التمويه والبقاء!",
    playersTitle: "اللاعبون الحاليون",
    minPlayersAlert: "الرجاء إضافة 3 لاعبين على الأقل للبدء",
    addPlayerPlaceholder: "اسم لاعب جديد...",
    addButton: "إضافة +",
    startGameButton: "✦ ابدأ اللعبة ✦",
    resetButton: "إعادة تعيين",
    cancelButton: "إلغاء اللعبة",
    playAgainButton: "العب مجدداً",
    passPhoneTitle: "توزيع الأدوار سراً",
    passPhoneDesc: "اضغط على بطاقتك لمعرفة كلمتك السرية، ثم أغلقها قبل تمرير الهاتف للاعب التالي.",
    clickToSee: "اضغط لرؤية الكلمة",
    seen: "تمت الرؤية ✓",
    confirmIdentity: "هل أنت {name}؟",
    shieldScreen: "تأكد من عدم وجود أي شخص بجانبك يرى الشاشة حالياً!",
    showSecretBtn: "نعم، اعرض الكلمة السرية",
    yourSecretWord: "كلمتك السرية هي:",
    rememberWord: "تذكر هذه الكلمة جيداً! لا تدع أحداً يراها.",
    hideSecretBtn: "حفظ وإخفاء الكلمة",
    
    describeTitle: "الجولة {round}: وصف الكلمة",
    describeDesc: "يجب على كل لاعب وصف كلمته بكلمة واحدة أو تلميح واحد دون كشفها للدخيل!",
    describeTurn: "الآن دور اللاعب: {name} ليصف كلمته.",
    doneBtn: "تم / اللاعب التالي",
    
    askTitle: "الجولة {round}: طرح الأسئلة",
    askDesc: "يقوم كل لاعب بطرح سؤال واحد على أي لاعب آخر بخصوص تلميحه أو كلمته.",
    askTurn: "الآن دور اللاعب: {name} ليسأل أي لاعب آخر.",
    
    voteTitle: "الجولة {round}: التصويت السري",
    voteDesc: "وقت التصويت! مرر الهاتف لكل لاعب ليصوت للمشتبه به بشكل سري.",
    passToVote: "مرر الهاتف إلى {name}",
    castVoteBtn: "أنا {name}، أريد التصويت",
    chooseSuspect: "من تشتبه بأنه الدخيل؟",
    voteCasted: "تم تسجيل صوتك بنجاح!",
    
    tallyTitle: "نتائج التصويت",
    votedFor: "صوّت {voter} لصالح {suspect}",
    highestVotes: "حصل {name} على أعلى الأصوات ({count}) وتم استبعاده!",
    tieAlert: "تعادل الأصوات بين: {list}. تم إجراء قرعة عشوائية لاستبعاد أحدهم.",
    eliminatedRole: "اتضح أن {name} كان {role}!",
    imposterRevealed: "الدخيل الحقيقي هو {name}!",
    nextRoundBtn: "ابدأ الجولة التالية",
    
    citizensWin: "فوز المواطنين!",
    imposterWins: "فوز الدخيل!",
    finalDesc: "تم كشف جميع الأدوار والكلمات السرية بنهاية اللعبة:",
    citizenWordLabel: "كلمة المواطنين:",
    imposterWordLabel: "كلمة الدخيل:",
    roleTagCitizen: "مواطن",
    roleTagImposter: "الدخيل",
    statusEliminated: "مستبعد",
    statusAlive: "ناجي"
  }
};

let imposterGame = {
  players: [],
  citizenWordEn: "",
  imposterWordEn: "",
  citizenWordAr: "",
  imposterWordAr: "",
  round: 1,
  currentTurnIdx: 0,
  state: "setup",
  winner: null,
  votes: {},
  eliminatedThisRound: null,
  tieBreakerUsed: false,
  tiedPlayers: [],
  isSelectingSuspect: false
};

function renderStepsIndicator(activeStep) {
  const steps = [
    { key: 'setup', en: 'Setup', ar: 'الإعداد' },
    { key: 'reveal', en: 'Reveal', ar: 'الكشف' },
    { key: 'describe', en: 'Describe', ar: 'الوصف' },
    { key: 'ask', en: 'Ask', ar: 'الأسئلة' },
    { key: 'vote', en: 'Vote', ar: 'التصويت' },
    { key: 'result', en: 'Result', ar: 'النتيجة' }
  ];
  
  const isAr = currentLang === 'ar';
  
  return `
    <div class="glass-steps-container">
      ${steps.map((s, idx) => {
        const isActive = s.key === activeStep;
        const isDone = steps.findIndex(st => st.key === activeStep) > idx;
        const label = isAr ? s.ar : s.en;
        const stateClass = isActive ? 'current' : (isDone ? 'past' : 'future');
        return `
          <div class="glass-step ${stateClass}">
            <div class="glass-step-dot"></div>
            <div class="glass-step-label">${label}</div>
          </div>
          ${idx < steps.length - 1 ? `<div class="glass-step-line ${isDone ? 'past' : ''}"></div>` : ''}
        `;
      }).join('')}
    </div>
  `;
}

window.renderImposterSetup = function() {
  const setupPanel = document.getElementById('imposter-setup');
  const gameplayPanel = document.getElementById('imposter-gameplay');
  const resultPanel = document.getElementById('imposter-result');
  
  if (!setupPanel) return;
  
  setupPanel.style.display = 'block';
  if (gameplayPanel) gameplayPanel.style.display = 'none';
  if (resultPanel) resultPanel.style.display = 'none';
  
  const isAr = currentLang === 'ar';
  const t = imposterTexts[currentLang];
  const N = loungePlayers.length;
  
  let playersListHTML = '';
  if (N === 0) {
    playersListHTML = `<p class="glass-empty-state">${isAr ? 'لا يوجد لاعبون مضافون حالياً. يمكنك إضافتهم بالأسفل:' : 'No players added yet. Add them below:'}</p>`;
  } else {
    playersListHTML = `
      <div class="glass-chips-container">
        ${loungePlayers.map((p, idx) => `
          <div class="glass-player-chip">
            <span>${p}</span>
            <button class="glass-chip-remove" onclick="removeImposterSetupPlayer(${idx})">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  setupPanel.innerHTML = `
    
    <div class="glass-hero-panel">
      <h3 class="glass-title glow-gold">${t.title}</h3>
      <p class="glass-desc">${t.desc}</p>
    </div>
    
    <div class="glass-card-panel">
      <div class="glass-panel-header">
        <span class="glass-panel-title">${t.playersTitle}</span>
        <span class="glass-panel-count">${N}/8</span>
      </div>
      
      ${playersListHTML}
      
      <div class="glass-input-row">
        <input type="text" id="imposter-player-input" class="glass-input" placeholder="${t.addPlayerPlaceholder}" maxlength="12" onkeydown="if(event.key==='Enter') addImposterSetupPlayer()" />
        <button class="glass-btn-gold" onclick="addImposterSetupPlayer()">
          <span class="btn-icon">✦</span> ${t.addButton}
        </button>
      </div>
    </div>
    
    <div class="glass-action-area">
      <button class="glass-btn-massive" onclick="startImposterGame()" ${N < 3 ? 'disabled' : ''}>
        ${t.startGameButton}
      </button>
      ${N < 3 ? `<p class="glass-alert-text">${t.minPlayersAlert}</p>` : ''}
    </div>
  `;
};

window.addImposterSetupPlayer = function() {
  const isAr = currentLang === 'ar';
  const input = document.getElementById('imposter-player-input');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return alert(isAr ? "الرجاء إدخال اسم صحيح" : "Please enter a valid name");
  if (loungePlayers.length >= 8) return alert(isAr ? "الحد الأقصى هو 8 لاعبين" : "Maximum is 8 players");
  if (loungePlayers.includes(name)) return alert(isAr ? "هذا الاسم موجود بالفعل" : "This name already exists");
  
  loungePlayers.push(name);
  input.value = '';
  renderImposterSetup();
  renderLoungePlayers();
  drawWheel();
};

window.removeImposterSetupPlayer = function(idx) {
  loungePlayers.splice(idx, 1);
  renderImposterSetup();
  renderLoungePlayers();
  drawWheel();
};

window.startImposterGame = function() {
  if (loungePlayers.length < 3) return;
  
  const pair = imposterWordPairs[Math.floor(Math.random() * imposterWordPairs.length)];
  const isSwap = Math.random() > 0.5;
  
  const citizenWordEn = isSwap ? pair.wordB_en : pair.wordA_en;
  const imposterWordEn = isSwap ? pair.wordA_en : pair.wordB_en;
  
  const citizenWordAr = isSwap ? pair.wordB_ar : pair.wordA_ar;
  const imposterWordAr = isSwap ? pair.wordA_ar : pair.wordB_ar;
  
  const imposterIdx = Math.floor(Math.random() * loungePlayers.length);
  
  imposterGame.players = loungePlayers.map((name, idx) => {
    const isImposter = idx === imposterIdx;
    return {
      name: name,
      role: isImposter ? "imposter" : "citizen",
      word_en: isImposter ? imposterWordEn : citizenWordEn,
      word_ar: isImposter ? imposterWordAr : citizenWordAr,
      isEliminated: false,
      isSeen: false
    };
  });
  
  imposterGame.citizenWordEn = citizenWordEn;
  imposterGame.imposterWordEn = imposterWordEn;
  imposterGame.citizenWordAr = citizenWordAr;
  imposterGame.imposterWordAr = imposterWordAr;
  
  imposterGame.activePlayerCount = loungePlayers.length;
  imposterGame.imposterCount = 1;
  imposterGame.round = 1;
  imposterGame.currentTurnIdx = 0;
  imposterGame.state = "reveal";
  imposterGame.isSelectingSuspect = false;
  
  renderImposterGameplay();
};

window.renderImposterGameplay = function() {
  const setupPanel = document.getElementById('imposter-setup');
  const gameplayPanel = document.getElementById('imposter-gameplay');
  const resultPanel = document.getElementById('imposter-result');
  
  if (setupPanel) setupPanel.style.display = 'none';
  if (gameplayPanel) gameplayPanel.style.display = 'block';
  if (resultPanel) resultPanel.style.display = 'none';
  
  const t = imposterTexts[currentLang];
  const isAr = currentLang === 'ar';
  
  if (imposterGame.state === 'reveal') {
    const allSeen = imposterGame.players.every(p => p.isSeen);
    if (!allSeen) {
      gameplayPanel.innerHTML = `
        
        <div class="glass-hero-panel">
          <h3 class="glass-title glow-gold">${t.passPhoneTitle}</h3>
          <p class="glass-desc">${t.passPhoneDesc}</p>
        </div>
        
        <div class="glass-flip-grid">
          ${imposterGame.players.map((p, idx) => {
            const isFlipped = p.isSeen;
            const statusText = p.isSeen ? t.seen : t.clickToSee;
            return `
              <div class="glass-flip-card ${isFlipped ? 'flipped' : ''}" onclick="${isFlipped ? '' : `revealImposterCard(${idx})`}">
                <div class="glass-flip-card-inner">
                  <div class="glass-flip-card-front">
                    <span class="card-icon">❓</span>
                    <span class="card-name">${p.name}</span>
                    <span class="card-status">${statusText}</span>
                  </div>
                  <div class="glass-flip-card-back">
                    <span class="card-icon">👁️</span>
                    <span class="card-name">${p.name}</span>
                    <span class="card-status">${t.seen}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div class="glass-action-area">
          <button class="glass-btn-outline" onclick="resetImposterGame()">
            ${t.cancelButton}
          </button>
        </div>
      `;
    } else {
      imposterGame.state = 'describe';
      imposterGame.currentTurnIdx = 0;
      renderImposterGameplay();
    }
  } 
  
  else if (imposterGame.state === 'describe') {
    const activePlayers = imposterGame.players.filter(p => !p.isEliminated);
    const turnPlayer = activePlayers[imposterGame.currentTurnIdx];
    
    if (!turnPlayer) {
      imposterGame.state = 'ask';
      imposterGame.currentTurnIdx = 0;
      renderImposterGameplay();
      return;
    }
    
    const title = t.describeTitle.replace('{round}', imposterGame.round);
    const turnMsg = t.describeTurn.replace('{name}', `<strong style="color:var(--gold); font-size:1.3rem;">${turnPlayer.name}</strong>`);
    
    gameplayPanel.innerHTML = `
      
      <div class="glass-hero-panel">
        <h3 class="glass-title glow-gold">${title}</h3>
        <p class="glass-desc">${t.describeDesc}</p>
      </div>
      
      <div class="glass-turn-panel">
        <div class="glass-turn-message">
          ${turnMsg}
        </div>
        <button class="glass-btn-gold" onclick="nextDescribeTurn()">
          ${t.doneBtn} <span class="btn-icon">✦</span>
        </button>
      </div>
      
      <div class="glass-action-area">
        <button class="glass-btn-outline" onclick="resetImposterGame()">${t.resetButton}</button>
      </div>
    `;
  }
  
  else if (imposterGame.state === 'ask') {
    const activePlayers = imposterGame.players.filter(p => !p.isEliminated);
    const turnPlayer = activePlayers[imposterGame.currentTurnIdx];
    
    if (!turnPlayer) {
      imposterGame.state = 'vote';
      imposterGame.currentTurnIdx = 0;
      imposterGame.votes = {};
      imposterGame.isSelectingSuspect = false;
      renderImposterGameplay();
      return;
    }
    
    const title = t.askTitle.replace('{round}', imposterGame.round);
    const turnMsg = t.askTurn.replace('{name}', `<strong style="color:var(--gold); font-size:1.3rem;">${turnPlayer.name}</strong>`);
    
    gameplayPanel.innerHTML = `
      
      <div class="glass-hero-panel">
        <h3 class="glass-title glow-gold">${title}</h3>
        <p class="glass-desc">${t.askDesc}</p>
      </div>
      
      <div class="glass-turn-panel">
        <div class="glass-turn-message">
          ${turnMsg}
        </div>
        <button class="glass-btn-gold" onclick="nextAskTurn()">
          ${t.doneBtn} <span class="btn-icon">✦</span>
        </button>
      </div>
      
      <div class="glass-action-area">
        <button class="glass-btn-outline" onclick="resetImposterGame()">${t.resetButton}</button>
      </div>
    `;
  }
  
  else if (imposterGame.state === 'vote') {
    const activePlayers = imposterGame.players.filter(p => !p.isEliminated);
    const voter = activePlayers[imposterGame.currentTurnIdx];
    
    if (!voter) {
      processVotingTally();
      return;
    }
    
    const title = t.voteTitle.replace('{round}', imposterGame.round);
    const passMessage = t.passToVote.replace('{name}', `<strong style="color:var(--gold); font-size:1.4rem;">${voter.name}</strong>`);
    const castBtnLabel = t.castVoteBtn.replace('{name}', voter.name);
    
    if (!imposterGame.isSelectingSuspect) {
      gameplayPanel.innerHTML = `
        
        <div class="glass-hero-panel">
          <h3 class="glass-title glow-gold">${title}</h3>
          <p class="glass-desc">${t.voteDesc}</p>
        </div>
        
        <div class="glass-turn-panel">
          <div class="glass-turn-message">
            ${passMessage}
          </div>
          <button class="glass-btn-gold" onclick="startVoterSelection()">
            ${castBtnLabel} <span class="btn-icon">✦</span>
          </button>
        </div>
        
        <div class="glass-action-area">
          <button class="glass-btn-outline" onclick="resetImposterGame()">${t.resetButton}</button>
        </div>
      `;
    } else {
      const suspects = activePlayers.filter(p => p.name !== voter.name);
      
      gameplayPanel.innerHTML = `
        
        <div class="glass-hero-panel">
          <h3 class="glass-title glow-gold">${title}</h3>
          <p class="glass-desc" style="color:var(--burgundy); font-weight:700;">${voter.name}, ${t.chooseSuspect}</p>
        </div>
        
        <div class="glass-suspects-grid">
          ${suspects.map(s => `
            <button class="glass-suspect-btn" onclick="castSecretVote('${voter.name}', '${s.name}')">
              <span class="suspect-name">${s.name}</span>
              <span class="suspect-icon">✦</span>
            </button>
          `).join('')}
        </div>
        
        <div class="glass-action-area">
          <button class="glass-btn-outline" onclick="resetImposterGame()">${t.resetButton}</button>
        </div>
      `;
    }
  }
  
  else if (imposterGame.state === 'tally') {
    const elimPlayer = imposterGame.eliminatedThisRound;
    
    const votesSummaryHTML = Object.entries(imposterGame.votes).map(([voter, suspect]) => {
      return `
        <div class="imposter-result-row">
          <span>${voter}</span>
          <span style="color:var(--muted); font-size:0.85rem;">➔ ${suspect}</span>
        </div>
      `;
    }).join('');
    
    let tieAlertHTML = "";
    if (imposterGame.tieBreakerUsed) {
      const listStr = imposterGame.tiedPlayers.join(', ');
      tieAlertHTML = `
        <div style="background:var(--gold-glow); color:var(--burgundy); border:1px solid rgba(84, 26, 26, 0.2); padding:1rem; border-radius:var(--rad); margin-bottom:1.5rem; font-size:0.9rem; font-weight:700;">
          ${t.tieAlert.replace('{list}', listStr)}
        </div>
      `;
    }
    
    const roleLabel = elimPlayer.role === 'imposter' ? t.roleTagImposter : t.roleTagCitizen;
    const roleTagClass = elimPlayer.role === 'imposter' ? 'imposter' : 'citizen';
    
    gameplayPanel.innerHTML = `
      
      <div class="glass-hero-panel">
        <h3 class="glass-title glow-gold">${t.tallyTitle}</h3>
      </div>
      
      <div class="glass-tally-panel">
        ${tieAlertHTML}
        
        <div class="glass-tally-header">
          ${isAr ? 'تفاصيل التصويت:' : 'Voting Details:'}
        </div>
        
        <div class="glass-tally-list">
          ${votesSummaryHTML}
        </div>
        
        <div class="glass-tally-footer">
          <div class="glass-tally-eliminated">
            ${t.highestVotes.replace('{name}', elimPlayer.name).replace('{count}', Object.values(imposterGame.votes).filter(v => v === elimPlayer.name).length)}
          </div>
          <div class="glass-tally-role">
            ${t.eliminatedRole.replace('{name}', elimPlayer.name).replace('{role}', `<span class="glass-role-tag ${roleTagClass}">${roleLabel}</span>`)}
          </div>
        </div>
      </div>
      
      <div class="glass-action-area">
        <button class="glass-btn-massive" onclick="startNextRound()">
          ${t.nextRoundBtn} <span class="btn-icon">✦</span>
        </button>
      </div>
    `;
  }
};

window.revealImposterCard = function(idx) {
  const player = imposterGame.players[idx];
  if (player.isSeen) return;
  
  const t = imposterTexts[currentLang];
  const confirmMsg = t.confirmIdentity.replace('{name}', player.name);
  
  const overlay = document.createElement('div');
  overlay.className = 'glass-overlay-wrap';
  overlay.innerHTML = `
    <div class="glass-modal-box imposter-reveal-modal">
      <div class="glass-modal-title">${confirmMsg}</div>
      <p class="glass-modal-desc">${t.shieldScreen}</p>
      <button class="glass-btn-gold" onclick="showSecretWord(${idx}, this)">
        ${t.showSecretBtn} <span class="btn-icon">👁️</span>
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
};

window.showSecretWord = function(idx, btn) {
  const player = imposterGame.players[idx];
  const modal = btn.closest('.imposter-reveal-modal');
  const t = imposterTexts[currentLang];
  const displayWord = currentLang === 'ar' ? player.word_ar : player.word_en;
  
  modal.innerHTML = `
    <div class="glass-modal-title glow-gold">${player.name}</div>
    <p class="glass-modal-desc">${t.yourSecretWord}</p>
    <div class="glass-secret-word-display">${displayWord}</div>
    <p class="glass-modal-desc" style="font-size:0.85rem;">${t.rememberWord}</p>
    <button class="glass-btn-danger" onclick="hideSecretWord(${idx})">
      ${t.hideSecretBtn} <span class="btn-icon">✕</span>
    </button>
  `;
};

window.hideSecretWord = function(idx) {
  const player = imposterGame.players[idx];
  player.isSeen = true;
  
  const overlay = document.querySelector('.glass-overlay-wrap');
  if (overlay) overlay.remove();
  
  renderImposterGameplay();
};

window.nextDescribeTurn = function() {
  imposterGame.currentTurnIdx++;
  renderImposterGameplay();
};

window.nextAskTurn = function() {
  imposterGame.currentTurnIdx++;
  renderImposterGameplay();
};

window.startVoterSelection = function() {
  imposterGame.isSelectingSuspect = true;
  renderImposterGameplay();
};

window.castSecretVote = function(voterName, suspectName) {
  imposterGame.votes[voterName] = suspectName;
  imposterGame.isSelectingSuspect = false;
  imposterGame.currentTurnIdx++;
  
  const t = imposterTexts[currentLang];
  const overlay = document.createElement('div');
  overlay.className = 'glass-overlay-wrap';
  overlay.innerHTML = `
    <div class="glass-modal-box">
      <div class="success-icon-check">✓</div>
      <div class="glass-modal-title glow-gold">${t.voteCasted}</div>
      <button class="glass-btn-gold" onclick="closeVoteSuccessOverlay()">
        ${t.doneBtn} <span class="btn-icon">✦</span>
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
};

window.closeVoteSuccessOverlay = function() {
  const overlay = document.querySelector('.glass-overlay-wrap');
  if (overlay) overlay.remove();
  renderImposterGameplay();
};

function processVotingTally() {
  const activePlayers = imposterGame.players.filter(p => !p.isEliminated);
  const counts = {};
  activePlayers.forEach(p => counts[p.name] = 0);
  
  Object.values(imposterGame.votes).forEach(suspect => {
    counts[suspect] = (counts[suspect] || 0) + 1;
  });
  
  let maxVotes = -1;
  let candidates = [];
  
  Object.entries(counts).forEach(([name, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      candidates = [name];
    } else if (count === maxVotes) {
      candidates.push(name);
    }
  });
  
  let eliminatedName = "";
  
  if (candidates.length > 1) {
    imposterGame.tieBreakerUsed = true;
    const randIdx = Math.floor(Math.random() * candidates.length);
    eliminatedName = candidates[randIdx];
    imposterGame.tiedPlayers = candidates;
  } else {
    eliminatedName = candidates[0];
    imposterGame.tieBreakerUsed = false;
    imposterGame.tiedPlayers = [];
  }
  
  const eliminatedPlayer = imposterGame.players.find(p => p.name === eliminatedName);
  eliminatedPlayer.isEliminated = true;
  
  imposterGame.eliminatedThisRound = eliminatedPlayer;
  
  const activeCitizens = imposterGame.players.filter(p => !p.isEliminated && p.role === 'citizen');
  const activeImposters = imposterGame.players.filter(p => !p.isEliminated && p.role === 'imposter');
  
  imposterGame.activePlayerCount = activeCitizens.length + activeImposters.length;
  imposterGame.imposterCount = activeImposters.length;
  
  if (imposterGame.imposterCount === 0) {
    imposterGame.winner = 'citizens';
    imposterGame.state = 'result';
    showImposterResults('citizens');
  } else if (imposterGame.activePlayerCount <= 2) {
    imposterGame.winner = 'imposter';
    imposterGame.state = 'result';
    showImposterResults('imposter');
  } else {
    imposterGame.state = 'tally';
    renderImposterGameplay();
  }
}

window.startNextRound = function() {
  imposterGame.round++;
  imposterGame.currentTurnIdx = 0;
  imposterGame.state = 'describe';
  renderImposterGameplay();
};

window.showImposterResults = function(winner) {
  const setupPanel = document.getElementById('imposter-setup');
  const gameplayPanel = document.getElementById('imposter-gameplay');
  const resultPanel = document.getElementById('imposter-result');
  
  if (setupPanel) setupPanel.style.display = 'none';
  if (gameplayPanel) gameplayPanel.style.display = 'none';
  if (resultPanel) resultPanel.style.display = 'block';
  
  const t = imposterTexts[currentLang];
  const isAr = currentLang === 'ar';
  
  let resultTitle = '';
  let resultClass = '';
  
  if (winner === 'citizens') {
    resultTitle = t.citizensWin;
    resultClass = 'color: var(--green);';
  } else {
    resultTitle = t.imposterWins;
    resultClass = 'color: var(--red);';
  }
  
  const citizenWord = currentLang === 'ar' ? imposterGame.citizenWordAr : imposterGame.citizenWordEn;
  const imposterWord = currentLang === 'ar' ? imposterGame.imposterWordAr : imposterGame.imposterWordEn;
  
  resultPanel.innerHTML = `
    
    <div class="glass-hero-panel">
      <h3 class="glass-title glow-gold" style="${resultClass}">${resultTitle}</h3>
      <p class="glass-desc">${isAr ? 'تم كشف جميع الأدوار والكلمات السرية بنهاية الجولة.' : 'All roles and words are revealed at the end of the round.'}</p>
    </div>
    
    <div class="glass-results-panel">
      <div class="glass-result-words">
        <div class="glass-result-row">
          <span>${t.citizenWordLabel}</span>
          <span class="word-citizen">${citizenWord}</span>
        </div>
        <div class="glass-result-row">
          <span>${t.imposterWordLabel}</span>
          <span class="word-imposter">${imposterWord}</span>
        </div>
      </div>
      
      <div class="glass-tally-header">
        ${t.finalDesc}
      </div>
      
      <div class="glass-results-list">
        ${imposterGame.players.map(p => {
          const roleText = p.role === 'imposter' ? t.roleTagImposter : t.roleTagCitizen;
          const roleClass = p.role === 'imposter' ? 'imposter' : 'citizen';
          const statusText = p.isEliminated ? t.statusEliminated : t.statusAlive;
          const pWord = currentLang === 'ar' ? p.word_ar : p.word_en;
          return `
            <div class="glass-result-player-row">
              <span class="player-info">${p.name} <small>(${statusText})</small></span>
              <span class="glass-role-tag ${roleClass}">${roleText} ➔ ${pWord}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="glass-action-area">
      <button class="glass-btn-massive" onclick="resetImposterGame()">
        ${t.playAgainButton} <span class="btn-icon">↺</span>
      </button>
    </div>
  `;
};

window.resetImposterGame = function() {
  imposterGame = {
    players: [],
    citizenWordEn: "",
    imposterWordEn: "",
    citizenWordAr: "",
    imposterWordAr: "",
    round: 1,
    currentTurnIdx: 0,
    state: "setup",
    winner: null,
    votes: {},
    eliminatedThisRound: null,
    tieBreakerUsed: false,
    tiedPlayers: [],
    isSelectingSuspect: false
  };
  renderImposterSetup();
};

// --- Tic-Tac-Coffee Logic ---
let tttBoard = Array(9).fill(null);
let tttCurrentPlayer = 'O'; 
let tttActive = true;
let tttMode = 'local'; 
let tttWinner = null; 
let tttAiTimeout = null;

const winPatterns = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], 
  [0, 3, 6], [1, 4, 7], [2, 5, 8], 
  [0, 4, 8], [2, 4, 6]             
];

window.setTTTMode = function(mode) {
  tttMode = mode;
  document.querySelectorAll('.ttt-mode-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`ttt-btn-${mode}`);
  if (activeBtn) activeBtn.classList.add('active');
  
  const difficultyContainer = document.getElementById('ttt-difficulty-container');
  if (difficultyContainer) {
    difficultyContainer.style.display = mode === 'ai' ? 'block' : 'none';
  }
  
  resetTTT();
};

window.playTTT = function(idx) {
  if (!tttActive || tttBoard[idx]) return;
  
  makeTTTMove(idx, tttCurrentPlayer);
  
  if (checkTTTWinner()) return;
  
  if (tttMode === 'ai' && tttActive) {
    tttCurrentPlayer = 'X'; 
    updateTTTStatus();
    
    tttActive = false; 
    
    if (tttAiTimeout) clearTimeout(tttAiTimeout);
    tttAiTimeout = setTimeout(() => {
      tttAiTimeout = null;
      const difficultySelect = document.getElementById('ttt-difficulty');
      const difficulty = difficultySelect ? difficultySelect.value : 'smart';
      
      const aiMove = difficulty === 'smart' ? getBestMoveMinimax() : getRandomMove();
      
      tttActive = true; 
      if (aiMove !== null) {
        makeTTTMove(aiMove, 'X');
        if (!checkTTTWinner()) {
          tttCurrentPlayer = 'O';
          updateTTTStatus();
        }
      }
    }, 600);
  } else {
    tttCurrentPlayer = tttCurrentPlayer === 'O' ? 'X' : 'O';
    updateTTTStatus();
  }
};

function makeTTTMove(idx, player) {
  tttBoard[idx] = player;
  const cell = document.querySelector(`.ttt-cell[data-idx="${idx}"]`);
  if (cell) {
    cell.innerHTML = player;
    cell.classList.add('taken');
    cell.classList.add('player-' + player.toLowerCase());
    
    cell.animate([
      { transform: 'scale(0.8)', opacity: 0.5 },
      { transform: 'scale(1)', opacity: 1 }
    ], { duration: 250, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
  }
}

function updateTTTStatus() {
  const statusEl = document.getElementById('ttt-status');
  if (!statusEl) return;
  const isAr = currentLang === 'ar';
  
  const boardEl = document.getElementById('ttt-board');
  if (boardEl) {
    boardEl.classList.remove('turn-o', 'turn-x');
    if (tttActive) {
      boardEl.classList.add(tttCurrentPlayer === 'O' ? 'turn-o' : 'turn-x');
    }
  }
  
  if (tttWinner) {
    if (tttWinner === 'draw') {
      statusEl.innerHTML = isAr ? 'تعادل! العبوا مجدداً' : "It's a draw! Play again";
      statusEl.style.color = 'var(--muted)';
    } else {
      let winnerName = tttWinner === 'O' 
        ? (isAr ? 'اللاعب O' : 'Player O') 
        : (isAr ? 'اللاعب X' : 'Player X');
      if (tttMode === 'ai' && tttWinner === 'X') {
        winnerName = isAr ? 'الباريستا الذكي' : 'Smart Barista';
      }
      statusEl.innerHTML = isAr ? `الفائز هو: ${winnerName}!` : `Winner is: ${winnerName}!`;
      statusEl.style.color = 'var(--green)';
    }
  } else {
    if (tttCurrentPlayer === 'O') {
      statusEl.innerHTML = isAr ? 'دور اللاعب الأول (اللاعب O)' : "Player O's Turn";
      statusEl.style.color = 'var(--accent-emerald)';
    } else {
      if (tttMode === 'ai') {
        statusEl.innerHTML = isAr ? 'الباريستا الذكي يفكر...' : 'Smart Barista is thinking...';
        statusEl.style.color = 'var(--gold)';
      } else {
        statusEl.innerHTML = isAr ? 'دور اللاعب الثاني (اللاعب X)' : "Player X's Turn";
        statusEl.style.color = 'var(--gold)';
      }
    }
  }
}

function checkTTTWinner() {
  let roundWon = false;
  let winningPattern = null;
  
  for (let i = 0; i < winPatterns.length; i++) {
    const [a, b, c] = winPatterns[i];
    if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
      roundWon = true;
      winningPattern = [a, b, c];
      break;
    }
  }
  
  if (roundWon) {
    const winnerSymbol = tttBoard[winningPattern[0]];
    tttWinner = winnerSymbol;
    tttActive = false;
    
    updateTTTStatus();
    
    winningPattern.forEach(idx => {
      const cell = document.querySelector(`.ttt-cell[data-idx="${idx}"]`);
      if (cell) cell.classList.add('winning-cell');
    });
    
    return true;
  }
  
  if (!tttBoard.includes(null)) {
    tttWinner = 'draw';
    tttActive = false;
    updateTTTStatus();
    return true;
  }
  return false;
}

function evaluateBoard(board) {
  for (let i = 0; i < winPatterns.length; i++) {
    const [a, b, c] = winPatterns[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      if (board[a] === 'X') return 10;
      if (board[a] === 'O') return -10;
    }
  }
  return 0;
}

function minimax(board, depth, isMaxing) {
  const score = evaluateBoard(board);

  if (score === 10) return score - depth;
  if (score === -10) return score + depth;
  if (!board.includes(null)) return 0;

  if (isMaxing) {
    let best = -1000;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = 1000;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function getBestMoveMinimax() {
  let bestVal = -1000;
  let bestMove = null;

  for (let i = 0; i < 9; i++) {
    if (tttBoard[i] === null) {
      tttBoard[i] = 'X';
      let moveVal = minimax(tttBoard, 0, false);
      tttBoard[i] = null;

      if (moveVal > bestVal) {
        bestVal = moveVal;
        bestMove = i;
      }
    }
  }
  return bestMove;
}

function getRandomMove() {
  const availableMoves = [];
  for (let i = 0; i < 9; i++) {
    if (tttBoard[i] === null) {
      availableMoves.push(i);
    }
  }
  if (availableMoves.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * availableMoves.length);
  return availableMoves[randomIndex];
}

window.resetTTT = function() {
  if (tttAiTimeout) {
    clearTimeout(tttAiTimeout);
    tttAiTimeout = null;
  }
  tttBoard = Array(9).fill(null);
  tttCurrentPlayer = 'O';
  tttActive = true;
  tttWinner = null;
  
  updateTTTStatus();
  
  document.querySelectorAll('.ttt-cell').forEach(cell => {
    cell.innerHTML = '';
    cell.className = 'ttt-cell';
    cell.style.background = '';
    cell.style.borderColor = '';
  });
};

/* ═══════════════════════════════════════════
   SENSORY SPLIT-DECK HELPERS
   ═══════════════════════════════════════════ */

window.selectDeckChip = function(type, value, btn) {
  btn.closest('.deck-chips').querySelectorAll('.deck-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  window.currentPuzzle[type] = value;
  btn.animate([{transform:'scale(.92)'},{transform:'scale(1)'}], {duration:200, easing:'cubic-bezier(.175,.885,.32,1.275)'});
};

window.addDeckToCart = function(drinkId) {
  const drink = allDrinks.find(d => d.id === drinkId);
  if (!drink) return;
  const sugar = window.currentPuzzle.sugar;
  const extra = window.currentPuzzle.extra;
  const notesElement = document.getElementById('deckNotes');
  const notes = notesElement ? notesElement.value : '';
  const isAr = currentLang === 'ar';
  
  let price = drink.price;
  if (extra.includes('Espresso') || extra.includes('Boba') || extra.includes('Nuts') || extra.includes('Shot') || extra.includes('Vanilla')) price += 15;
  if (extra.includes('Almond') || extra.includes('Ice Cream')) price += 20;
  if (extra.includes('Caramel') || extra.includes('Marshmallow')) price += 10;
  
  cart.push({ drink_id: drink.id, name: drink.name, name_ar: drink.name_ar, sugar, extra, price, notes });
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI();
  
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;
  alert(isAr ? `تم إضافة ${displayName} إلى السلة بنجاح ✦` : `Added ${displayName} to cart successfully ✦`);
};
