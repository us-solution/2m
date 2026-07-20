/* ═══════════════════════════════════════
   OZEL CAFE — Frontend JS (Premium v2.1 - Bilingual & Turn-Based Imposter)
   ═══════════════════════════════════════ */
/* ===== أوزيل كافيه — ملف JavaScript الرئيسي للواجهة الأمامية ===== */
/* يتضمن هذا الملف جميع وظائف التطبيق: القائمة، السلة، الألعاب، الترجمة، وغيرها */

// ===== أداة منع النقر المتكرر (Debounce) =====
window._debounceTimers = {};
window.debounceClick = function(key, fn, ms = 300) {
  if (window._debounceTimers[key]) return;
  window._debounceTimers[key] = true;
  setTimeout(() => { window._debounceTimers[key] = false; }, ms);
  fn();
};

// ===== متغيرات الحالة العامة للتطبيق =====
let allDrinks = [], allCategories = [], currentCat = 'all', cart = JSON.parse(localStorage.getItem('ozel_cart') || '[]');
const urlParams  = new URLSearchParams(window.location.search);
const tableParam = urlParams.get('table');
window.currentPuzzle = { sugar: 'Normal', extra: 'None' };

// ===== تهيئة Pusher للتحديثات الفورية للمنيو =====
(function() {
  if (typeof Pusher !== 'undefined') {
    try {
      const pusher = new Pusher('d7010f3c5b8b98295a04', { cluster: 'eu', forceTLS: true });
      const channel = pusher.subscribe('menu-updates');
      channel.bind('menu-changed', () => {
        console.log('[Pusher] Menu update received. Reloading menu...');
        if (typeof fetchMenu === 'function') {
          fetchMenu();
        }
      });
    } catch (e) {
      console.warn('[Pusher] Menu updates subscription failed:', e);
    }
  }
})();


// ===== حالة غرفة التسلية والألعاب الجماعية =====
let loungePlayers = [];

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

let tttBoard = Array(9).fill(null);
let tttCurrentPlayer = 'O'; 
let tttActive = true;
let tttWinner = null;
let tttMode = 'local'; 

// ===== حالة المصادقة والمستخدم =====
const CUSER = JSON.parse(localStorage.getItem('ozel_user') || 'null');

function getAuthHeaders() {
  const tok = localStorage.getItem('ozel_token');
  return tok ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok } : { 'Content-Type': 'application/json' };
}

// ===== إعداد اللغة الثنائية (عربي / إنجليزي) =====
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

// ===== خيارات التخصيص الديناميكية (من الخادم) =====
let customizationOptions = null;

// تحميل خيارات السكر والإضافات من الخادم
async function loadCustomizationOptions() {
  try {
    const res = await fetch('/api/customization');
    if (res.ok) {
      const data = await res.json();
      customizationOptions = data;
      // بناء transMap ديناميكي من البيانات
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
  } catch(e) { console.warn('Failed to load customization options', e); }
}

// تحميل الشركاء وعرض شعاراتهم في الصفحة الرئيسية
async function loadPartners() {
  const container = document.getElementById('partnersContainer');
  if (!container) return;
  try {
    const res = await fetch('/api/auth/partners');
    if (res.ok) {
      const partners = await res.json();
      if (partners.length === 0) {
        container.innerHTML = `<p style="color: var(--muted); font-size: 0.9rem;" data-en="No partners added yet" data-ar="لا يوجد شركاء مضافون بعد">No partners added yet</p>`;
        return;
      }
      container.innerHTML = partners.map(p => `
        <div class="partner-logo-card" onclick="location.href='profile.html?id=${p._id}'" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.8rem; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
          <div style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; background: var(--bg3); box-shadow: 0 8px 20px rgba(0,0,0,0.05);">
            <img src="${p.partnerLogo || 'imgs/Ozel-Logo--01.png'}" alt="${p.name}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
          <span style="font-family: 'Tajawal', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--text);">${p.name}</span>
        </div>
      `).join('');
    }
  } catch(e) { console.warn('Failed to load partners', e); }
}

// ===== التمرير السلس للأقسام =====
window.scrollToSection = function(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ===== تبديل اللغة بين العربية والإنجليزية =====
window.toggleLanguage = function() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('ozel_lang', currentLang);
  applyLanguage(currentLang);
};

// ===== تطبيق اللغة على جميع عناصر الصفحة =====
window.applyLanguage = function(lang) {
  const isAr = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  document.body.dir = isAr ? 'rtl' : 'ltr';
  
  document.querySelectorAll('[data-en]').forEach(el => {
    // لا تغير محتوى كلمة ÖZEL — يجب أن تبقى دائماً بالخط اللاتيني
    if (el.classList && el.classList.contains('headline-line')) return;
    el.innerHTML = isAr ? el.getAttribute('data-ar') : el.getAttribute('data-en');
  });
  
  document.querySelectorAll('[data-placeholder-en]').forEach(el => {
    el.placeholder = isAr ? el.getAttribute('data-placeholder-ar') : el.getAttribute('data-placeholder-en');
  });

  // تطبيق font-family صريح على كلمة ÖZEL لتمنع الـ browser من استخدام خط عربي
  document.querySelectorAll('.headline-line').forEach(el => {
    el.style.fontFamily = "'Cormorant Garamond', serif";
    el.style.direction = 'ltr';
    el.style.unicodeBidi = 'isolate';
  });

  buildCatTabs();
  if (allDrinks.length) {
    renderMenu(currentCat === 'all' ? allDrinks : allDrinks.filter(d => String(d.category_id) === currentCat));
  }
  renderOffersCards();
  renderNavUser();

  if (imposterGame && imposterGame.state !== 'setup') {
    if (imposterGame.state === 'reveal' || imposterGame.state === 'describe' || imposterGame.state === 'ask' || imposterGame.state === 'vote' || imposterGame.state === 'tally') {
      if (typeof renderImposterGameplay === 'function') renderImposterGameplay();
    } else if (imposterGame.state === 'result') {
      if (typeof showImposterResults === 'function') showImposterResults(imposterGame.winner);
    }
  }
  updateTTTStatus();
};

// ===== تهيئة التطبيق عند تحميل الصفحة =====
document.addEventListener('DOMContentLoaded', () => {
  try {
    applyLanguage(currentLang);
    renderNavUser();
    updateCartUI();
    fetchMenu();
    loadCustomizationOptions();
    if (document.getElementById('partnersContainer')) {
      loadPartners();
    }
    if (document.getElementById('vlogGalleryGrid')) {
      loadVlog();
    }
    if (window.location.pathname.includes('profile.html')) {
      const pid = urlParams.get('id');
      if (pid) {
        window.loadPublicPartnerProfile(pid);
      } else {
        if (!localStorage.getItem('ozel_token')) {
          window.location.href = 'index.html';
          return;
        }
        window.openProfileModal();
      }
    }
  } catch(e) { console.error('[Init]', e); }
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => { loader.style.display = 'none'; }, 1200);
    }
  }, 1000);
});

// ===== عرض حالة المستخدم في شريط التنقل =====
function renderNavUser() {
  const area = document.getElementById('nav-user-area');
  const drawerArea = document.getElementById('drawer-user-area');
  const isAr = currentLang === 'ar';
  
  let html = '';
  if (CUSER) {
    const initial = CUSER.name.charAt(0).toUpperCase();
    const ptsLabel = isAr ? 'نقاط' : 'pts';
    const profileText = isAr ? 'حسابي ✦' : 'My Profile ✦';
    html = `
      <div style="display: flex; align-items: center; gap: 0.8rem;">
        <div class="nav-user-logged" onclick="openProfileModal()" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <div class="user-avatar">${initial}</div>
          <div class="user-info-brief">
            <span class="user-name">${CUSER.name}</span>
            <span class="user-pts" style="font-size:0.65rem; color:var(--gold); font-weight:700;">${CUSER.points || 0} ${ptsLabel}</span>
          </div>
        </div>
        <a href="profile.html" class="nav-user-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 0.8rem; font-size: 0.75rem;">
          <span>${profileText}</span>
        </a>
      </div>
    `;
  } else {
    const loginText = isAr ? 'تسجيل الدخول' : 'Login';
    html = `
      <a href="login.html" class="nav-user-btn">
        <span>${loginText}</span>
      </a>
    `;
  }

  if (area) area.innerHTML = html;
  if (drawerArea) drawerArea.innerHTML = html;
}

// ===== فتح/إغلاق القائمة الجانبية المتنقلة =====
window.toggleMobileMenu = function() {
  const drawer = document.getElementById('mobileDrawer');
  const hamburger = document.getElementById('navHamburger');
  if (drawer) {
    drawer.classList.toggle('open');
  }
  if (hamburger) {
    hamburger.classList.toggle('active');
  }
};

// ===== تسجيل الخروج =====
window.logoutUser = function() { localStorage.clear(); location.reload(); };

// ===== تبديل تبويبات الملف الشخصي =====
window.switchProfileTab = function(btnEl, tabName) {
  if (typeof btnEl === 'string') {
    tabName = btnEl;
    btnEl = document.querySelector(`.profile-tab-btn[onclick*="${tabName}"]`);
  }

  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.profile-tab-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });

  // تفعيل الزر المختار
  if (btnEl) btnEl.classList.add('active');

  // تفعيل اللوحة المختارة
  const activePanel = document.getElementById(`profile-tab-${tabName}`);
  if (activePanel) {
    activePanel.classList.add('active');
    activePanel.style.display = 'block';
  }

  // إذا تم اختيار الصور المرفوعة أو المعجب بها، نقوم بجلبها
  if (tabName === 'uploads' || tabName === 'liked') {
    window.loadProfileMedia();
  }
};

window.loadProfileMedia = async function() {
  const isAr = currentLang === 'ar';
  const myPhotosGrid = document.getElementById('myPhotosGrid');
  const myLikedGrid = document.getElementById('myLikedGrid');
  if (!myPhotosGrid || !myLikedGrid) return;

  myPhotosGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 2rem 0;">${isAr ? 'جاري تحميل صورك...' : 'Loading uploads...'}</div>`;
  myLikedGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 2rem 0;">${isAr ? 'جاري تحميل المعجب بها...' : 'Loading favorites...'}</div>`;

  try {
    const photosRes = await fetch('/api/vlog/my-photos', { headers: getAuthHeaders() });
    if (photosRes.ok) {
      const photos = await photosRes.json();
      if (photos.length === 0) {
        myPhotosGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 2rem 0; font-size: 0.85rem;">${isAr ? 'لم تقم برفع أي صور بعد.' : 'You haven\'t uploaded any photos yet.'}</div>`;
      } else {
        myPhotosGrid.innerHTML = photos.map(p => {
          const capText = p.caption ? p.caption.replace(/'/g, "\\'") : '';
          return `
            <div class="profile-photo-card" onclick="openVlogLightbox('${p.image}', '${capText}')" style="cursor: pointer;">
              <img src="${p.image}" alt="Uploaded photo"/>
              <div class="ppc-overlay">
                <span class="ppc-likes">
                  <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  ${p.likesCount || 0}
                </span>
                <div style="display: flex; gap: 0.3rem; margin-top: 0.3rem;">
                  <button class="ppc-btn" onclick="event.stopPropagation(); downloadVlogPhoto('${p._id || p.id}', '${p.image}')" title="${isAr ? 'تحميل' : 'Download'}">
                    <svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
                  </button>
                  <button class="ppc-btn delete-btn" onclick="event.stopPropagation(); deleteProfilePhoto('${p._id || p.id}')" title="${isAr ? 'حذف' : 'Delete'}">
                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    myPhotosGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--red); padding: 2rem 0; font-size: 0.85rem;">${isAr ? 'خطأ في التحميل' : 'Error loading photos.'}</div>`;
  }

  try {
    const likedRes = await fetch('/api/vlog/my-favorites', { headers: getAuthHeaders() });
    if (likedRes.ok) {
      const liked = await likedRes.json();
      if (liked.length === 0) {
        myLikedGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 2rem 0; font-size: 0.85rem;">${isAr ? 'لا توجد صور في المفضلة بعد.' : 'No favorited photos yet.'}</div>`;
      } else {
        myLikedGrid.innerHTML = liked.map(p => {
          const capText = p.caption ? p.caption.replace(/'/g, "\\'") : '';
          return `
            <div class="profile-photo-card" onclick="openVlogLightbox('${p.image}', '${capText}')" style="cursor: pointer;">
              <img src="${p.image}" alt="Liked photo"/>
              <div class="ppc-overlay">
                <span class="ppc-likes">
                  <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  ${p.likesCount || 0}
                </span>
                <div style="display: flex; gap: 0.3rem; margin-top: 0.3rem;">
                  <button class="ppc-btn" onclick="event.stopPropagation(); downloadVlogPhoto('${p._id || p.id}', '${p.image}')" title="${isAr ? 'تحميل' : 'Download'}">
                    <svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
                  </button>
                  <button class="ppc-btn delete-btn" onclick="event.stopPropagation(); window.toggleFavorite('${p._id || p.id}', this)" title="${isAr ? 'إزالة من المفضلة' : 'Remove from Favorites'}">
                    <svg viewBox="0 0 24 24" style="fill: var(--gold); stroke: var(--gold); stroke-width: 2;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    myLikedGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--red); padding: 2rem 0; font-size: 0.85rem;">${isAr ? 'خطأ في التحميل' : 'Error loading favorites.'}</div>`;
  }
};

// ===== فتح نافذة الملف الشخصي =====
window.openProfileModal = async function() {
  if (!window.location.pathname.includes('profile.html')) {
    window.location.href = 'profile.html';
    return;
  }
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.classList.add('open');
  
  // إعادة تعيين التبويب النشط إلى العضوية عند الفتح
  window.switchProfileTab('card');
  
  const isAr = currentLang === 'ar';
  
  // جلب أحدث بيانات المستخدم من الخادم للحفاظ على تحديث الإحصائيات
  let userDetails = CUSER;
  try {
    const meRes = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    if (meRes.ok) {
      userDetails = await meRes.json();
      localStorage.setItem('ozel_user', JSON.stringify(userDetails));
    }
  } catch (e) {
    console.warn('Failed to fetch latest user stats, using cached user data', e);
  }
  
  // عرض التفاصيل على بطاقة العضوية
  document.getElementById('profilePoints').textContent = userDetails.points || 0;
  if (document.getElementById('profileMemberName')) {
    document.getElementById('profileMemberName').textContent = userDetails.name || 'MEMBER';
  }

  const partnerSec = document.getElementById('partnerEditSection');
  if (partnerSec) {
    if (userDetails.isPartner || userDetails.role === 'partner') {
      partnerSec.style.display = 'block';
      const bioInput = document.getElementById('partner-bio-input');
      if (bioInput) bioInput.value = userDetails.partnerBio || '';
    } else {
      partnerSec.style.display = 'none';
    }
  }

  // معالجة تنسيق بطاقة العضوية الديناميكي حسب حالة العميل
  const cardEl = document.getElementById('profileVipCard');
  const badgeEl = document.getElementById('profileTierBadge');
  const discountEl = document.getElementById('profileDiscountRate');

  if (cardEl && badgeEl && discountEl) {
    // تكوين حالة العميل: الحالة → [classCSS, لون الخلفية, اللقب, نسبة الخصم]
    const STATUS_MAP = {
      standard:    ['card-green',  '#1a2e24', 'STANDARD',     null],
      gold:        ['card-red',    '#541a1a', 'GOLD',         '10%'],
      student:     ['card-blue',   '#1a5276', 'STUDENT',      '15%'],
      ozel_family: ['card-purple', '#1a0a30', 'OZEL FAMILY', '30%']
    };
    const status = userDetails.customerStatus || 'standard';
    const [cssClass, bgColor, title, discountPct] = STATUS_MAP[status] || STATUS_MAP.standard;

    // إزالة كلاسات الحالة القديمة
    ['card-green','card-red','card-blue','card-purple','tier-none','tier-bronze','tier-silver','tier-gold','tier-student'].forEach(cls => cardEl.classList.remove(cls));
    cardEl.classList.add('vip-card', cssClass);

    // إضافة تنسيق لون الخلفية للبطاقة
    let styleTag = document.getElementById('card-color-override');
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'card-color-override'; document.head.appendChild(styleTag); }
    styleTag.textContent = `#profileVipCard { background: ${bgColor} !important; background-image: none !important; animation: none !important; background-size: 100% 100% !important; }`;

    badgeEl.textContent = title;

    if (status === 'standard') {
      // الحالة العادية: الخصم بناءً على النقاط (كل 100 نقطة = 10 جنيه)
      const pts = userDetails.points || 0;
      const egpDiscount = Math.floor(pts / 100) * 10;
      discountEl.innerHTML = `Your discount rate: <span style="color:#fff; font-size:1.15rem; font-weight:700;">${egpDiscount} EGP</span>`;
    } else {
      discountEl.innerHTML = `Your discount rate: <span style="color:#fff; font-size:1.15rem; font-weight:700;">${discountPct}</span>`;
    }
  }

  // تفعيل تأثير الميلان على بطاقة العضوية
  if (typeof VanillaTilt !== 'undefined' && cardEl) {
    VanillaTilt.init(cardEl);
  }
  
  try {
    const res = await fetch('/api/me/orders', { headers: getAuthHeaders() });
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
          const nameKey = item.name;
          drinkCounts[nameKey] = (drinkCounts[nameKey] || 0) + 1;
        });
      }
    });
    
    const topDrinks = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    
    const listEl = document.getElementById('topDrinksList');
    if (topDrinks.length === 0) {
      listEl.innerHTML = `<p style="color: var(--muted); font-size: 0.85rem; text-align: center;">No previous orders yet</p>`;
    } else {
      listEl.innerHTML = topDrinks.map(([name, count]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 0.8rem 1rem; border-radius: var(--rad); border: 1px solid var(--line);">
          <span style="color: var(--text); font-size: 0.95rem;">${name}</span>
          <span style="color: var(--gold); font-size: 0.85rem; font-weight: 700;">${count} times</span>
        </div>
      `).join('');
    }
  } catch(e) { console.error(e); }
}

// ===== إغلاق نافذة الملف الشخصي =====
window.closeProfileModal = function() {
  if (window.location.pathname.includes('profile.html')) {
    window.location.href = 'index.html';
  } else {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('open');
  }
};

// ===== تأثير شريط التنقل عند التمرير =====
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
});

// ===== جلب بيانات القائمة من الخادم =====
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
    console.error('Error fetching menu:', err);
    applyLanguage(currentLang);
    const grid = document.getElementById('menuGrid');
    if (grid) {
      grid.innerHTML = currentLang === 'ar'
        ? `<p style="color:#C0392B;text-align:center;grid-column:1/-1;padding:4rem">فشل تحميل القائمة. يرجى المحاولة لاحقاً.</p>`
        : `<p style="color:#C0392B;text-align:center;grid-column:1/-1;padding:4rem">Failed to load menu. Please try again later.</p>`;
    }
  }
}

// ===== بناء أزرار تصنيفات القائمة =====
function buildCatTabs() {
  const bar = document.getElementById('catTabs');
  if (!bar) return;
  const isAr = currentLang === 'ar';
  
  renderOffersCards();

  if (!allCategories || !allCategories.length) {
    bar.innerHTML = '';
    return;
  }

  // If currentCat is 'all' or is not valid, default to the first category id
  const validCatIds = allCategories.map(c => String(c.id || c._id));
  if (currentCat === 'all' || !validCatIds.includes(currentCat)) {
    currentCat = validCatIds[0];
  }

  bar.innerHTML = allCategories.map(cat => {
    const isActive = currentCat === String(cat.id || cat._id);
    const catName = isAr ? (cat.name_ar || cat.name) : cat.name;
    return `<button class="cat-btn ${isActive ? 'active' : ''}" data-cat="${cat.id || cat._id}">${catName}</button>`;
  }).join('');

  // Add event listeners to category buttons
  bar.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const catId = this.getAttribute('data-cat');
      currentCat = String(catId);
      bar.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderMenu(allDrinks.filter(d => String(d.category_id) === currentCat));
    });
  });
}

// ===== عرض بطاقات المشروبات في القائمة =====
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

// ===== دوال مساعدة لعرض أسماء الإضافات حسب اللغة =====
function getExtraChipText(value, displayVal, isAr) {
  // البحث في خيارات التخصيص الديناميكية أولاً
  if (customizationOptions && customizationOptions.extras) {
    const found = customizationOptions.extras.find(e => e.key === value);
    if (found) {
      const name = isAr ? found.nameAr : found.nameEn;
      const price = found.price || 0;
      return price > 0 ? `${name} +${price}` : name;
    }
  }
  return displayVal;
}

// ===== دوال مساعدة لتوليد أزرار السكر والإضافات ديناميكياً =====
function getSugarChipsHTML(prefix) {
  const levels = (customizationOptions && customizationOptions.sugarLevels && customizationOptions.sugarLevels.length)
    ? customizationOptions.sugarLevels
    : [{ key: 'Normal', nameEn: 'Normal Sugar', nameAr: 'سكر طبيعي' },
       { key: 'Medium', nameEn: 'Medium Sugar', nameAr: 'سكر وسط' },
       { key: 'Less', nameEn: 'Less Sugar', nameAr: 'سكر خفيف' },
       { key: 'No Sugar', nameEn: 'No Sugar', nameAr: 'بدون سكر' }];
  
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
    const clickHandler = prefix === 'deck' ? 'selectDeckChip' : 'selectChip';
    return `<button class="chip ${prefix}-chip ${i===0?'active':''}" onclick="${clickHandler}('sugar','${s.key}',this)">
      <span>${label}</span>
      ${badgeHtml}
    </button>`;
  }).join('');
}

function getExtrasChipsHTML(prefix, drinkExtras) {
  let extrasList = (customizationOptions && customizationOptions.extras && customizationOptions.extras.length)
    ? customizationOptions.extras
    : [{ key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0 },
       { key: 'Extra Shot', nameEn: 'Extra Espresso Shot', nameAr: 'جرعة إضافية', price: 25 },
       { key: 'Caramel Syrup', nameEn: 'Caramel Syrup', nameAr: 'سيرب كراميل', price: 15 },
       { key: 'Vanilla Syrup', nameEn: 'Vanilla Syrup', nameAr: 'سيرب فانيليا', price: 15 },
       { key: 'Ice Cream', nameEn: 'Ice Cream', nameAr: 'آيس كريم', price: 20 },
       { key: 'Marshmallow', nameEn: 'Marshmallow', nameAr: 'مارشميلو', price: 10 },
       { key: 'Nuts', nameEn: 'Nuts Mix', nameAr: 'مكسرات', price: 15 }];
  // تصفية حسب الإضافات المتاحة للمشروب
  if (drinkExtras && Array.isArray(drinkExtras) && drinkExtras.length) {
    const allowed = new Set(drinkExtras);
    extrasList = extrasList.filter(e => allowed.has(e.key));
  } else {
    extrasList = [];
    extrasList.push({ key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0 });
  }
  const isAr = currentLang === 'ar';
  return extrasList.map((e, i) => {
    const label = isAr ? e.nameAr : e.nameEn;
    const price = e.price || 0;
    const priceText = price > 0 ? `<span class="chip-price">+${price} EGP</span>` : '';
    const clickHandler = prefix === 'deck' ? 'selectDeckChip' : 'selectChip';
    return `<button class="chip ${prefix}-chip ${i===0?'active':''}" onclick="${clickHandler}('extra','${e.key}',this)">
      <span class="chip-label">${label}</span>
      ${priceText}
    </button>`;
  }).join('');
}

// دوال مساعدة للاختيار
window.selectDeckChip = function(type, value, btn) {
  btn.closest('.deck-chips').querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  window.currentPuzzle[type] = value;
  btn.animate([
    { transform: 'scale(0.95)' },
    { transform: 'scale(1.02)' },
    { transform: 'scale(1)' }
  ], { duration: 250, easing: 'ease-out' });
};

// ===== نافذة تخصيص المشروب (Drink Modal) =====
let _modalSessionId = 0;

window.openDrink = async function(id) {
  const drink = allDrinks.find(d => d.id == id) || await fetch(`/api/drinks/${id}`).then(r => r.json());
  window.currentPuzzle = { sugar: 'Normal', extra: 'None' };
  _modalSessionId = (_modalSessionId + 1) % 1e9;
  const isAr = currentLang === 'ar';
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;

  // الوضع البديل: النافذة المنبثقة (للجوال/التابلت)
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
        ${getSugarChipsHTML('pz')}
      </div>

      <span class="puzzle-label">${extraTitle}</span>
      <div class="puzzle-chips" id="chips-extra">
        ${getExtrasChipsHTML('pz', drink.availableExtras)}
      </div>

      <textarea id="drinkNotes" placeholder="${isAr ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:.7rem 1rem; border-radius:var(--rad); font-family:'Tajawal',sans-serif; font-size:.95rem; outline:none; margin-top: 1rem; height: 60px;"></textarea>

      <div class="puzzle-qty-row" style="display:flex;align-items:center;gap:.8rem;margin-top:1rem;">
        <label style="font-size:.85rem;color:var(--muted);font-weight:500">${isAr ? 'العدد' : 'Qty'}</label>
        <button type="button" class="qty-btn" onclick="const inp=document.getElementById('drinkQty');let v=parseInt(inp.value)||1;if(v>1){v--;inp.value=v}" style="width:36px;height:36px;border:1px solid var(--line);background:var(--bg3);color:var(--text);font-size:1.2rem;cursor:pointer;border-radius:4px;">−</button>
        <input type="number" id="drinkQty" value="1" min="1" oninput="if(this.value<1||this.value=='')this.value=1" style="width:50px;text-align:center;background:var(--bg3);border:1px solid var(--line);color:var(--text);padding:.3rem;border-radius:4px;font-size:1rem;font-family:'Tajawal',sans-serif">
        <button type="button" class="qty-btn" onclick="const inp=document.getElementById('drinkQty');let v=parseInt(inp.value)||1;v++;inp.value=v" style="width:36px;height:36px;border:1px solid var(--line);background:var(--bg3);color:var(--text);font-size:1.2rem;cursor:pointer;border-radius:4px;">+</button>
      </div>

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

// ===== اختيار خيار السكر أو الإضافات في النافذة =====
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
  ], { duration: 250, easing: 'ease-out' });
};

// ===== إغلاق النافذة المنبثقة =====
window.closeModal = function(e) {
  if (e && e.target !== document.getElementById('drinkModal') && !e.target.classList.contains('modal-x')) return;
  const modal = document.getElementById('drinkModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ===== إضافة المنتج إلى سلة المشتريات =====
let _sessionUsed = new Set();

window.addToCart = function(drinkId, behavior = 'continue') {
  const sessionKey = drinkId + ':' + _modalSessionId;
  if (_sessionUsed.has(sessionKey)) { console.warn('[Cart] Blocked duplicate add'); return; }
  _sessionUsed.add(sessionKey);
  const drink = allDrinks.find(d => d.id == drinkId);
  const sugar = window.currentPuzzle.sugar;
  const extra = window.currentPuzzle.extra;
  const notesElement = document.getElementById('drinkNotes');
  const notes = notesElement ? notesElement.value : '';
  const qtyInput = document.getElementById('drinkQty');
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  const isAr = currentLang === 'ar';
  
  let price = drink.price;
  // حساب السعر الإضافي من خيارات التخصيص الديناميكية
  if (extra && extra !== 'None' && customizationOptions && customizationOptions.extras) {
    const found = customizationOptions.extras.find(e => e.key === extra);
    if (found) price += found.price || 0;
  }
  
  const totalPrice = price * qty;
  cart.push({ drink_id: drink.id, name: drink.name, name_ar: drink.name_ar, sugar, extra, price, notes, quantity: qty });
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI();
  
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;

  if (behavior === 'finish') {
    window.location.href = 'cart.html';
  } else {
    alert(isAr ? `تم إضافة ${displayName} إلى السلة بنجاح` : `Added ${displayName} to cart successfully`);
    closeModal();
  }
}

// ===== تحديث واجهة السلة =====
function updateCartUI() {
  const fab   = document.getElementById('cartFab');
  const count = document.getElementById('cartCount');
  if (count) count.textContent = cart.length;
  if (fab) fab.style.transform = cart.length > 0 ? 'scale(1)' : 'scale(0)';
}

// ===== حذف عنصر من السلة =====
function removeFromCart(idx) { 
  cart.splice(idx, 1); 
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI(); 
}

// ===== إرسال الطلب إلى الخادم =====
async function submitOrder() {
  const isAr = currentLang === 'ar';
  if (!cart.length) return alert(isAr ? 'السلة فارغة!' : 'Cart is empty!');
  const isTakeaway = document.getElementById('isTakeaway').checked;
  const table = isTakeaway ? 'Takeaway' : document.getElementById('tableNum').value;
  if (!isTakeaway && !table) return alert(isAr ? 'الرجاء إدخال رقم الطاولة' : 'Please enter table number');
  const notes = document.getElementById('orderNotes').value;
  const total = cart.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  try {
    const res  = await fetch('/api/orders', { method:'POST', headers: getAuthHeaders(), body: JSON.stringify({ table_number: table, items: cart, total_price: total, notes: notes }) });
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

// ===== معالجة نموذج التواصل عبر واتساب =====
window.handleContact = function(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const msg = document.getElementById('contact-msg').value.trim();
  
  const text = `✦ *New Contact — OZEL CAFE* ✦\n\n✦ *Name:* ${name}\n✦ *Phone Number:* ${phone}\n\n✦ *Message:*\n${msg}\n\n— *Sent from website*`;
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/201060161839?text=${encodedText}`;
  
  window.open(whatsappUrl, '_blank');
}

// ===== عرض بطاقات العروض الخاصة =====
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

// ===== تغيير كلمة المرور =====
window.changePassword = async function() {
  const oldPassword = document.getElementById('old-pass').value;
  const newPassword = document.getElementById('new-pass').value;
  const msgEl = document.getElementById('cp-msg');
  if (!msgEl) return;
  
  if (!oldPassword || !newPassword) {
    msgEl.textContent = 'Please fill all fields';
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
      msgEl.textContent = 'Password changed successfully';
      msgEl.style.color = '#27AE60';
      document.getElementById('old-pass').value = '';
      document.getElementById('new-pass').value = '';
    } else {
      msgEl.textContent = data.error || 'Something went wrong';
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
/* ===== منطق ركن التسلية والألعاب الجماعية ===== */

// ===== التبديل بين علامات تبويب الألعاب =====
window.switchLoungeTab = function(tabName) {
  document.querySelectorAll('.lounge-game-card').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.lounge-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });
  
  const activeBtn = document.getElementById(`btn-tab-${tabName}`);
  const activePanel = document.getElementById(`lounge-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) {
    activePanel.classList.add('active');
    activePanel.style.display = 'block';
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
  } else if (tabName === 'uno') {
    if (typeof initUnoLobby === 'function') {
      initUnoLobby();
    }
  }
};



// ===== كلمات لعبة الدخيل (ثنائية اللغة) =====
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

// ===== نصوص لعبة الدخيل باللغتين =====
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


// ===== عرض مؤشر مراحل اللعبة =====
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

// ===== عرض شاشة إعداد لعبة الدخيل =====
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

// ===== إضافة لاعب إلى اللعبة =====
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
};

// ===== إزالة لاعب من الإعداد =====
window.removeImposterSetupPlayer = function(idx) {
  loungePlayers.splice(idx, 1);
  renderImposterSetup();
};

// ===== بدء لعبة الدخيل =====
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

// ===== عرض شاشة اللعب الرئيسية للعبة الدخيل =====
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

// ===== عرض بطاقة كلمة اللاعب السرية =====
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

// ===== إظهار الكلمة السرية للاعب =====
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

// ===== إخفاء الكلمة السرية بعد مشاهدتها =====
window.hideSecretWord = function(idx) {
  const player = imposterGame.players[idx];
  player.isSeen = true;
  
  const overlay = document.querySelector('.glass-overlay-wrap');
  if (overlay) overlay.remove();
  
  renderImposterGameplay();
};

// ===== الانتقال إلى اللاعب التالي في مرحلة الوصف =====
window.nextDescribeTurn = function() {
  imposterGame.currentTurnIdx++;
  renderImposterGameplay();
};

// ===== الانتقال إلى اللاعب التالي في مرحلة الأسئلة =====
window.nextAskTurn = function() {
  imposterGame.currentTurnIdx++;
  renderImposterGameplay();
};

// ===== بدء اختيار المشتبه به من قبل المصوت =====
window.startVoterSelection = function() {
  imposterGame.isSelectingSuspect = true;
  renderImposterGameplay();
};

// ===== تسجيل التصويت السري =====
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

// ===== إغلاق نافذة نجاح التصويت =====
window.closeVoteSuccessOverlay = function() {
  const overlay = document.querySelector('.glass-overlay-wrap');
  if (overlay) overlay.remove();
  renderImposterGameplay();
};

// ===== معالجة نتائج التصويت =====
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

// ===== بدء الجولة التالية =====
window.startNextRound = function() {
  imposterGame.round++;
  imposterGame.currentTurnIdx = 0;
  imposterGame.state = 'describe';
  renderImposterGameplay();
};

// ===== عرض نتائج لعبة الدخيل =====
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

// ===== إعادة تعيين لعبة الدخيل =====
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

// ===== منطق لعبة إكس-أو (Tic-Tac-Coffee) =====

const winPatterns = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], 
  [0, 3, 6], [1, 4, 7], [2, 5, 8], 
  [0, 4, 8], [2, 4, 6]             
];

// ===== تعيين وضع اللعبة (لاعب ضد لاعب أو ضد الذكاء الاصطناعي) =====
window.setTTTMode = function(mode) {
  tttMode = mode;
  document.querySelectorAll('.ttt-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('ttt-btn-' + mode);
  if (btn) btn.classList.add('active');
  resetTTT();
};

// ===== لعب حركة في إكس-أو =====
window.playTTT = function(idx) {
  if (!tttActive || tttBoard[idx]) return;
  if (tttMode === 'ai' && tttCurrentPlayer === 'X') return;
  
  makeTTTMove(idx, tttCurrentPlayer);
  
  if (checkTTTWinner()) return;
  
  tttCurrentPlayer = tttCurrentPlayer === 'O' ? 'X' : 'O';
  updateTTTStatus();

  if (tttMode === 'ai' && tttCurrentPlayer === 'X' && tttActive) {
    setTimeout(makeAIMove, 500);
  }
};

// ===== تنفيذ الحركة على اللوحة =====
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

// ===== تحديث حالة اللعبة والنص =====
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
    } else if (tttMode === 'ai') {
      if (tttWinner === 'X') {
        statusEl.innerHTML = isAr ? 'الذكاء الاصطناعي فاز!' : 'AI Wins!';
        statusEl.style.color = 'var(--red)';
      } else {
        statusEl.innerHTML = isAr ? 'أنت الفائز!' : 'You Win!';
        statusEl.style.color = 'var(--green)';
      }
    } else {
      let winnerName = tttWinner === 'O' 
        ? (isAr ? 'اللاعب O' : 'Player O') 
        : (isAr ? 'اللاعب X' : 'Player X');
      statusEl.innerHTML = isAr ? `الفائز هو: ${winnerName}!` : `Winner is: ${winnerName}!`;
      statusEl.style.color = 'var(--green)';
    }
  } else {
    if (tttMode === 'ai') {
      if (tttCurrentPlayer === 'O') {
        statusEl.innerHTML = isAr ? 'دورك (O)' : 'Your Turn (O)';
        statusEl.style.color = 'var(--accent-emerald)';
      } else {
        statusEl.innerHTML = isAr ? 'الذكاء الاصطناعي يُفكر...' : 'AI is thinking...';
        statusEl.style.color = 'var(--gold)';
      }
    } else {
      if (tttCurrentPlayer === 'O') {
        statusEl.innerHTML = isAr ? 'دور اللاعب الأول (اللاعب O)' : "Player O's Turn";
        statusEl.style.color = 'var(--accent-emerald)';
      } else {
        statusEl.innerHTML = isAr ? 'دور اللاعب الثاني (اللاعب X)' : "Player X's Turn";
        statusEl.style.color = 'var(--gold)';
      }
    }
  }
}

// ===== التحقق من وجود فائز في إكس-أو =====
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

// ===== الحصول على الخلايا الفارغة =====
function getEmptyCells() {
  return tttBoard.reduce((acc, cell, i) => cell === null ? acc.concat(i) : acc, []);
}

// ===== خوارزمية Minimax للذكاء الاصطناعي =====
function minimax(board, depth, isMaximizing) {
  const scores = { X: 10, O: -10, draw: 0 };
  const available = board.reduce((acc, cell, i) => cell === null ? acc.concat(i) : acc, []);

  if (checkBoardWinner(board) === 'X') return scores.X - depth;
  if (checkBoardWinner(board) === 'O') return scores.O + depth;
  if (available.length === 0) return scores.draw;

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of available) {
      board[i] = 'X';
      best = Math.max(best, minimax(board, depth + 1, false));
      board[i] = null;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of available) {
      board[i] = 'O';
      best = Math.min(best, minimax(board, depth + 1, true));
      board[i] = null;
    }
    return best;
  }
}

// ===== التحقق من الفائز على لوحة معينة =====
function checkBoardWinner(board) {
  for (const [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

// ===== حساب أفضل حركة للذكاء الاصطناعي =====
function getBestMove() {
  let bestScore = -Infinity;
  let bestMove = null;
  const available = getEmptyCells();
  const board = [...tttBoard];

  for (const i of available) {
    board[i] = 'X';
    const score = minimax(board, 0, false);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

// ===== تنفيذ حركة الذكاء الاصطناعي =====
function makeAIMove() {
  if (!tttActive || tttCurrentPlayer !== 'X') return;
  const move = getBestMove();
  if (move === null) { checkTTTWinner(); return; }
  makeTTTMove(move, 'X');
  if (checkTTTWinner()) return;
  tttCurrentPlayer = 'O';
  updateTTTStatus();
}

// ===== إعادة تعيين لعبة إكس-أو =====
window.resetTTT = function() {
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

  if (tttMode === 'ai') {
    document.querySelector('#ttt-btn-ai')?.classList.add('active');
  }
};

/* ═══════════════════════════════════════════
   SENSORY SPLIT-DECK HELPERS
   ═══════════════════════════════════════════ */
/* ===== دوال مساعدة للوحة التخصيص المنقسمة (Split-Deck) ===== */

// ===== إضافة المنتج إلى السلة من اللوحة =====
window.addDeckToCart = function(drinkId) {
  const sessionKey = drinkId + ':' + _modalSessionId;
  if (_sessionUsed.has(sessionKey)) return;
  _sessionUsed.add(sessionKey);
  const drink = allDrinks.find(d => d.id == drinkId);
  if (!drink) return;
  const sugar = window.currentPuzzle.sugar;
  const extra = window.currentPuzzle.extra;
  const notesElement = document.getElementById('deckNotes');
  const notes = notesElement ? notesElement.value : '';
  const qtyInput = document.getElementById('deckQty');
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  const isAr = currentLang === 'ar';
  
  let price = drink.price;
  // حساب السعر الإضافي من خيارات التخصيص الديناميكية
  if (extra && extra !== 'None' && customizationOptions && customizationOptions.extras) {
    const found = customizationOptions.extras.find(e => e.key === extra);
    if (found) price += found.price || 0;
  }
  
  cart.push({ drink_id: drink.id, name: drink.name, name_ar: drink.name_ar, sugar, extra, price, notes, quantity: qty });
  localStorage.setItem('ozel_cart', JSON.stringify(cart));
  updateCartUI();
  
  const displayName = isAr ? (drink.name_ar || drink.name) : drink.name;
  alert(isAr ? `تم إضافة ${displayName} إلى السلة بنجاح ✦` : `Added ${displayName} to cart successfully ✦`);
};

/* ========================================================
   OZEL CAFE — Vlog & Album Photo Contest Logic (Clean & Modern Layout)
   ======================================================== */
window.selectedVlogBase64 = null;

// تحميل وتنزيل وحذف وعرض الصور
window.downloadVlogPhoto = function(postId, base64Data) {
  if (!base64Data) {
    console.error('No image data found for download.');
    return;
  }
  const link = document.createElement('a');
  link.href = base64Data;
  link.download = `ozel-cafe-vlog-${postId}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.openVlogLightbox = function(imageUrl, caption) {
  const lightbox = document.getElementById('vlogLightbox');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  if (!lightbox || !img) return;
  img.src = imageUrl;
  if (cap) cap.textContent = caption || '';
  lightbox.classList.add('open');
};

window.closeVlogLightbox = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-x')) return;
  const lightbox = document.getElementById('vlogLightbox');
  if (lightbox) lightbox.classList.remove('open');
};

window.deleteProfilePhoto = async function(postId) {
  const isAr = currentLang === 'ar';
  const confirmMsg = isAr 
    ? 'هل أنت متأكد من رغبتك في حذف هذه الصورة نهائياً؟' 
    : 'Are you sure you want to permanently delete this photo?';
  
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/vlog/${postId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      alert(isAr ? 'تم حذف الصورة بنجاح.' : 'Photo deleted successfully.');
      window.loadProfileMedia();
      window.loadVlog();
    } else {
      const data = await res.json();
      alert(data.error || (isAr ? 'فشل حذف الصورة.' : 'Failed to delete photo.'));
    }
  } catch (err) {
    console.error(err);
    alert(isAr ? 'حدث خطأ في الاتصال بالخادم.' : 'Server connection error.');
  }
};

// 1. تحميل الصور والمتصدرين والفائزين
window.loadVlog = async function() {
  const isAr = currentLang === 'ar';
  const galleryGrid = document.getElementById('vlogGalleryGrid');
  const uploadPanel = document.getElementById('vlogUploadPanel');
  const leaderboard = document.getElementById('vlogLeaderboard');
  const leaderboardList = document.getElementById('vlogLeaderboardList');
  const winnersSection = document.getElementById('vlogWinnersSection');
  const winnersGrid = document.getElementById('vlogWinnersGrid');

  if (!galleryGrid) return;

  // أ. عرض لوحة الرفع حسب حالة المستخدم (بدون أي إيموجيز)
  if (CUSER) {
    const isMobile = window.innerWidth <= 600;
    const postBtnText = isAr ? 'نشر الصورة في الألبوم ✦' : 'Post to Album ✦';
    const uploadTitle = isAr ? 'شارك صورتك وتنافس على الأوردر الهدية' : 'Share Your Photo & Compete';
    const captionPlaceholder = isAr ? 'اكتب وصفاً جميلاً لصورتك...' : 'Write a beautiful caption...';
    const selectText = isAr 
      ? (isMobile ? 'اضغط لاختيار صورة من جهازك' : 'اسحب الصورة هنا أو <strong>اضغط للاختيار</strong>') 
      : (isMobile ? 'Tap to choose a photo' : 'Drag & drop image here or <strong>browse</strong>');
    const limitText = isAr ? 'صيغ الصور المدعومة: JPG, PNG. أقصى حد: صورة واحدة يومياً.' : 'Supported formats: JPG, PNG. Limit: 1 photo per day.';
    
    uploadPanel.innerHTML = `
      <h3 class="vup-title">${uploadTitle}</h3>
      <div class="drag-drop-zone" id="vlogDragZone" onclick="document.getElementById('vlogFileInput').click()">
        <div class="dd-icon" style="color: var(--gold); margin-bottom: 0.5rem;">
          <svg style="width: 32px; height: 32px;" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>
        </div>
        <div class="dd-text" id="vlogDragText">${selectText}</div>
        <div style="font-size: 0.7rem; color: var(--muted); margin-top: 0.4rem;">${limitText}</div>
        <input type="file" id="vlogFileInput" accept="image/*" style="display: none;" onchange="handleVlogFileSelect(this)"/>
      </div>
      <div class="image-preview-wrapper" id="vlogPreviewWrapper">
        <img id="vlogPreviewImg" src="" alt="Preview"/>
        <button class="remove-preview-btn" onclick="clearVlogPreview()">✕</button>
      </div>
      <div class="form-group" style="margin-bottom: 1rem;">
        <textarea id="vlogCaption" placeholder="${captionPlaceholder}" style="width:100%; min-height:60px; background:var(--bg3); border:1px solid var(--line); color:var(--text); padding:.8rem; border-radius:4px; font-family:'Tajawal',sans-serif; outline:none; font-size:0.9rem; resize:vertical;"></textarea>
      </div>
      <button class="btn-gold" id="vlogSubmitBtn" onclick="handleVlogUpload()" style="width: 100%; justify-content: center;">
        <span>${postBtnText}</span>
      </button>
    `;
    setupVlogDragAndDrop();
  } else {
    const loginPrompt = isAr ? 'سجل دخولك لتتمكن من مشاركة صورك والتنافس على الأوردر الهدية! ✦' : 'Log in to share your photos and compete for a free order! ✦';
    const loginBtnText = isAr ? 'تسجيل الدخول / إنشاء حساب ✦' : 'Login / Register ✦';
    uploadPanel.innerHTML = `
      <div class="login-redirect-card">
        <div class="lrc-icon" style="color: var(--gold); margin-bottom: 0.5rem;">
          <svg style="width: 32px; height: 32px;" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor"/></svg>
        </div>
        <p class="lrc-text">${loginPrompt}</p>
        <a href="login.html" class="btn-gold" style="display: inline-flex; text-decoration: none;">${loginBtnText}</a>
      </div>
    `;
  }

  // ب. جلب الصور النشطة من الخادم
  try {
    const res = await fetch('/api/vlog', { headers: getAuthHeaders() });
    if (res.ok) {
      const posts = await res.json();
      renderVlogGallery(posts, isAr);
    } else {
      galleryGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--red);">${isAr ? 'فشل تحميل الألبوم.' : 'Failed to load gallery.'}</p>`;
    }
  } catch (err) {
    console.error(err);
    galleryGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--red);">${isAr ? 'خطأ في الاتصال بالخادم.' : 'Connection error.'}</p>`;
  }

  // ج. جلب لوحة الصدارة والفائزين السابقين
  try {
    const res = await fetch('/api/vlog/contest');
    if (res.ok) {
      const data = await res.json();
      
      // عرض لوحة الصدارة (بدون أي إيموجيز)
      if (data.leaders && data.leaders.length > 0) {
        leaderboard.style.display = 'block';
        const gridLayout = document.querySelector('.vlog-grid-layout');
        if (gridLayout) gridLayout.classList.remove('leaderboard-hidden');
        leaderboardList.innerHTML = data.leaders.map((l, index) => {
          const rankClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : ''));
          return `
            <div class="leader-row">
              <div class="leader-rank ${rankClass}">${index + 1}</div>
              <div class="leader-img-wrapper">
                <img src="${l.image}" alt="${l.userName}"/>
              </div>
              <div class="leader-info">
                <span class="leader-name">${l.userName}</span>
                <span class="leader-caption">${l.caption || '...'}</span>
              </div>
              <div class="leader-likes">
                <span>${l.likesCount}</span>
                <span style="color: var(--burgundy); display: inline-flex; align-items: center; margin-left: 0.3rem;">
                  <svg style="width: 14px; height: 14px; fill: var(--burgundy);" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </span>
              </div>
            </div>
          `;
        }).join('');
      } else {
        leaderboard.style.display = 'none';
        const gridLayout = document.querySelector('.vlog-grid-layout');
        if (gridLayout) gridLayout.classList.add('leaderboard-hidden');
      }

      // عرض الفائزين السابقين
      if (data.winners && data.winners.length > 0) {
        winnersSection.style.display = 'block';
        winnersGrid.innerHTML = data.winners.map(w => {
          const dateStr = new Date(w.wonAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
          return `
            <div class="vlog-card winner-card">
              <div class="vc-image-wrapper">
                <span class="winner-ribbon">${isAr ? 'الفائز' : 'WINNER'}</span>
                <img src="${w.image}" alt="Winner"/>
                <div class="vc-overlay"></div>
                <div class="vc-author-tag">
                  <span class="vc-author-name">${w.userName}</span>
                  <span class="vc-date">${dateStr}</span>
                </div>
              </div>
              <div class="vc-body" style="gap:0.5rem;">
                <div class="winner-prize-tag">${w.winnerPrize}</div>
                <p class="vc-caption">${w.caption || ''}</p>
                <div style="font-size:0.75rem; color:var(--muted); text-align:center;">
                  <span style="color: var(--burgundy); display: inline-flex; align-items: center; gap: 0.2rem; justify-content: center; width: 100%;">
                    <svg style="width: 13px; height: 13px; fill: var(--burgundy);" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    ${w.likesCount} ${isAr ? 'إعجاب' : 'likes'}
                  </span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        winnersSection.style.display = 'none';
      }
    }
  } catch (err) {
    console.error(err);
  }
};

// عرض صور ألبوم الفيد
function renderVlogGallery(posts, isAr) {
  const grid = document.getElementById('vlogGalleryGrid');
  if (!grid) return;

  if (posts.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 3rem 0;">${isAr ? 'كن أول من يشارك صورته في الألبوم!' : 'Be the first to share a photo!'}</p>`;
    return;
  }

  grid.innerHTML = posts.map(p => {
    const formattedDate = new Date(p.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const likedClass = p.hasLiked ? 'liked' : '';
    const heartSvg = `
      <svg viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    `;
    return `
      <div class="vlog-card">
        <div class="vc-image-wrapper" onclick="openVlogLightbox('${p.image}', '${p.caption ? p.caption.replace(/'/g, "\\'") : ''}')" style="cursor: pointer;">
          <img src="${p.image}" alt="User post"/>
          <div class="vc-overlay"></div>
          <div class="vc-author-tag">
            <span class="vc-author-name">${p.userName}</span>
            <span class="vc-date">${formattedDate}</span>
          </div>
        </div>
        <div class="vc-body">
          <p class="vc-caption">${p.caption || ''}</p>
          <div class="vc-footer">
            <button class="vc-like-btn ${likedClass}" onclick="toggleVlogLike('${p.id}', this)">
              ${heartSvg}
              <span class="like-count">${p.likesCount}</span>
            </button>
            <button class="vc-download-btn" onclick="downloadVlogPhoto('${p.id}', '${p.image}')" title="${isAr ? 'تحميل الصورة' : 'Download Photo'}">
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ضغط وتجهيز الملف عند الاختيار
window.handleVlogFileSelect = function(input) {
  const file = input.files[0];
  if (!file) return;
  processVlogImage(file);
};

function processVlogImage(file) {
  const isAr = currentLang === 'ar';
  if (!file.type.startsWith('image/')) {
    alert(isAr ? 'يرجى اختيار ملف صورة صالح!' : 'Please select a valid image file!');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // ضغط الصورة بواسطة Canvas
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 800; // أقصى طول أو عرض للصور

      if (width > height) {
        if (width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // تحويل الصورة إلى JPEG مضغوطة بنسبة 70% لجعل الحجم خفيفاً جداً
      window.selectedVlogBase64 = canvas.toDataURL('image/jpeg', 0.7);
      
      // إظهار المعاينة
      document.getElementById('vlogPreviewImg').src = window.selectedVlogBase64;
      document.getElementById('vlogPreviewWrapper').style.display = 'block';
      document.getElementById('vlogDragZone').style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

window.clearVlogPreview = function() {
  window.selectedVlogBase64 = null;
  const fileInput = document.getElementById('vlogFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('vlogPreviewImg').src = '';
  document.getElementById('vlogPreviewWrapper').style.display = 'none';
  document.getElementById('vlogDragZone').style.display = 'flex';
};

// إعداد سحب وإفلات الملفات
function setupVlogDragAndDrop() {
  const zone = document.getElementById('vlogDragZone');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    }, false);
  });

  zone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) processVlogImage(file);
  }, false);
}

// تسجيل الإعجاب
window.toggleVlogLike = async function(postId, btn) {
  const isAr = currentLang === 'ar';
  if (!CUSER) {
    alert(isAr ? 'يرجى تسجيل الدخول لتتمكن من التفاعل والإعجاب بالصور! ❤️' : 'Please log in to like photos and participate! ❤️');
    return;
  }

  // تجنب النقر المتكرر
  debounceClick(`like_${postId}`, async () => {
    try {
      const res = await fetch(`/api/vlog/${postId}/like`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        
        // تحديث واجهة الإعجاب
        const countSpan = btn.querySelector('.like-count');
        if (countSpan) countSpan.textContent = data.likesCount;

        if (data.hasLiked) {
          btn.classList.add('liked');
        } else {
          btn.classList.remove('liked');
        }

        // تحديث لوحة الصدارة دون إعادة جلب كل البيانات بالكامل
        loadVlog();
      }
    } catch (err) {
      console.error(err);
    }
  }, 250);
};

// رفع الصورة
window.handleVlogUpload = async function() {
  const isAr = currentLang === 'ar';
  if (!window.selectedVlogBase64) {
    alert(isAr ? 'يرجى اختيار صورة أولاً لمشاركتها!' : 'Please select a photo first!');
    return;
  }

  const btn = document.getElementById('vlogSubmitBtn');
  const caption = document.getElementById('vlogCaption').value.trim();
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `<span>${isAr ? 'جاري النشر والرفع...' : 'Posting...'}</span>`;

  try {
    const res = await fetch('/api/vlog', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        image: window.selectedVlogBase64,
        caption
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(isAr ? 'تم نشر صورتك بنجاح! شكراً لمشاركتك المتميزة ✦' : 'Your photo has been posted successfully! Thank you for sharing ✦');
      clearVlogPreview();
      document.getElementById('vlogCaption').value = '';
      loadVlog();
    } else {
      alert(data.error || (isAr ? 'فشل نشر الصورة، يرجى المحاولة لاحقاً.' : 'Failed to post photo.'));
    }
  } catch (err) {
    console.error(err);
    alert(isAr ? 'حدث خطأ أثناء الاتصال بالخادم.' : 'Server connection error.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};

// تحميل الملف الشخصي العام للشريك
window.loadPublicPartnerProfile = async function(pid) {
  const isAr = currentLang === 'ar';
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('open');
  const bodyEl = document.querySelector('#profileModal .modal-body');
  if (!bodyEl) return;
  
  bodyEl.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 4rem 0; font-family: 'Tajawal', sans-serif;">${isAr ? 'جاري تحميل ملف الشريك...' : 'Loading partner profile...'}</div>`;
  
  try {
    const res = await fetch(`/api/auth/partners/${pid}`);
    if (!res.ok) {
      bodyEl.innerHTML = `<div style="text-align: center; color: var(--red); padding: 4rem 0; font-family: 'Tajawal', sans-serif;">${isAr ? 'لم يتم العثور على الشريك' : 'Partner profile not found'}</div>`;
      return;
    }
    
    const data = await res.json();
    const partner = data.partner;
    const posts = data.posts || [];
    
    // عرض الصور المرفوعة بواسطة الشريك
    let postsHtml = `<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 2rem 0; font-size: 0.85rem; font-family: 'Tajawal', sans-serif;">${isAr ? 'لا توجد صور مضافة بعد.' : 'No photos posted yet.'}</div>`;
    if (posts.length > 0) {
      postsHtml = posts.map(p => {
        const capText = p.caption ? p.caption.replace(/'/g, "\\'") : '';
        const likedClass = (CUSER && p.likes && p.likes.some(id => String(id) === String(CUSER.id))) ? 'liked' : '';
        const isFav = CUSER && CUSER.favorites && CUSER.favorites.some(id => String(id) === String(p._id || p.id));
        const heartSvg = `<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        
        return `
          <div class="vlog-card" style="width: 100%; max-width: 320px; margin: 0 auto; display: flex; flex-direction: column;">
            <div class="vc-image-wrapper" onclick="openVlogLightbox('${p.image}', '${capText}')" style="cursor: pointer; position: relative;">
              <img src="${p.image}" alt="Partner photo" style="width: 100%; height: 220px; object-fit: cover; border-top-left-radius: 8px; border-top-right-radius: 8px; display: block;"/>
              <div class="vc-overlay"></div>
            </div>
            <div class="vc-body" style="padding: 1rem; background: var(--bg2); border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; border: 1px solid var(--line); border-top: none; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
              <p class="vc-caption" style="margin-bottom: 0.8rem; font-size: 0.85rem; text-align: right; color: var(--text);">${p.caption || ''}</p>
              <div class="vc-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                <button class="vc-like-btn ${likedClass}" onclick="toggleVlogLike('${p._id || p.id}', this)">
                  ${heartSvg}
                  <span class="like-count">${p.likesCount || 0}</span>
                </button>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="vc-like-btn" onclick="event.stopPropagation(); window.toggleFavorite('${p._id || p.id}', this)" title="${isAr ? 'المفضلة' : 'Favorite'}" style="padding: 0.3rem;">
                    <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: ${isFav ? 'var(--gold)' : 'none'}; stroke: var(--gold); stroke-width: 2;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  </button>
                  <button class="vc-download-btn" onclick="event.stopPropagation(); downloadVlogPhoto('${p._id || p.id}', '${p.image}')" title="${isAr ? 'تحميل' : 'Download'}" style="padding: 0.3rem; border: none; background: transparent; cursor: pointer; color: var(--muted);">
                    <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    bodyEl.innerHTML = `
      <div class="partner-profile-header" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.2rem; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line);">
        <div style="width: 130px; height: 130px; border-radius: 50%; overflow: hidden; border: 3px solid var(--gold); background: var(--bg3); box-shadow: 0 10px 25px rgba(0,0,0,0.06);">
          <img src="${partner.partnerLogo || 'imgs/Ozel-Logo--01.png'}" alt="${partner.name}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>
        <div>
          <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--text); font-weight: 700;">${partner.name}</h2>
          <p style="font-family: 'Tajawal', sans-serif; font-size: 0.95rem; color: var(--muted); max-width: 500px; margin: 0.5rem auto 0; line-height: 1.5;">${partner.partnerBio || (isAr ? 'لا توجد نبذة تعريفية بعد.' : 'No bio available.')}</p>
        </div>
      </div>
      <div class="partner-gallery-title" style="margin-bottom: 1.5rem;">
        <h3 style="font-family: 'Tajawal', sans-serif; font-size: 1.25rem; color: var(--text); font-weight: 700; text-align: center;" data-en="Shared Photo Gallery" data-ar="معرض صور الشريك">معرض صور الشريك</h3>
        <div style="width: 40px; height: 2px; background: var(--gold); margin: 0.4rem auto 0;"></div>
      </div>
      <div class="profile-photos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; justify-content: center; width: 100%;">
        ${postsHtml}
      </div>
    `;
    
  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = `<div style="text-align: center; color: var(--red); padding: 4rem 0; font-family: 'Tajawal', sans-serif;">${isAr ? 'خطأ في الاتصال بالخادم.' : 'Server connection error.'}</div>`;
  }
};

// تبديل حالة المفضلة لصورة
window.toggleFavorite = async function(postId, btn) {
  const isAr = currentLang === 'ar';
  if (!CUSER) {
    alert(isAr ? 'يرجى تسجيل الدخول لتتمكن من إضافة الصور إلى المفضلة! ⭐' : 'Please log in to add photos to favorites! ⭐');
    return;
  }
  
  const svg = btn.querySelector('svg');
  const isFav = svg.style.fill !== 'none';
  const method = isFav ? 'DELETE' : 'POST';
  
  try {
    const res = await fetch(`/api/me/favorites/${postId}`, {
      method: method,
      headers: getAuthHeaders()
    });
    
    if (res.ok) {
      const data = await res.json();
      CUSER.favorites = data.favorites;
      localStorage.setItem('ozel_user', JSON.stringify(CUSER));
      
      if (isFav) {
        svg.style.fill = 'none';
        showToast(isAr ? 'تمت إزالة الصورة من المفضلة' : 'Removed from favorites', 'success');
      } else {
        svg.style.fill = 'var(--gold)';
        showToast(isAr ? 'تمت إضافة الصورة إلى المفضلة' : 'Added to favorites', 'success');
      }
      
      // إذا كنا في صفحة الملف الشخصي، نقوم بتحديث الشبكة فوراً
      if (window.location.pathname.includes('profile.html')) {
        const pid = urlParams.get('id');
        if (pid) {
          window.loadPublicPartnerProfile(pid);
        } else {
          window.loadProfileMedia();
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

// حفظ بيانات الملف الشخصي للشريك
window.savePartnerProfile = async function() {
  const isAr = currentLang === 'ar';
  const fileInput = document.getElementById('partner-logo-file');
  const bioInput = document.getElementById('partner-bio-input');
  const msgEl = document.getElementById('partner-save-msg');
  
  if (!msgEl) return;
  msgEl.textContent = isAr ? 'جاري الحفظ...' : 'Saving...';
  msgEl.style.color = 'var(--gold)';
  
  let partnerLogo = undefined;
  if (fileInput && fileInput.files[0]) {
    partnerLogo = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    });
  }
  
  const partnerBio = bioInput ? bioInput.value.trim() : '';
  
  try {
    const res = await fetch('/api/me/partner-profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ partnerBio, partnerLogo })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      msgEl.textContent = isAr ? 'تم حفظ بيانات الشريك بنجاح ✦' : 'Partner details saved successfully ✦';
      msgEl.style.color = 'var(--green)';
      
      // تحديث البيانات المحلية
      const meRes = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (meRes.ok) {
        const userDetails = await meRes.json();
        localStorage.setItem('ozel_user', JSON.stringify(userDetails));
      }
    } else {
      msgEl.textContent = data.error || (isAr ? 'فشل حفظ البيانات.' : 'Failed to save details.');
      msgEl.style.color = 'var(--red)';
    }
  } catch (err) {
    console.error(err);
    msgEl.textContent = isAr ? 'حدث خطأ أثناء الاتصال بالخادم.' : 'Server connection error.';
    msgEl.style.color = 'var(--red)';
  }
};
