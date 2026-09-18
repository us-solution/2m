// ===== تجاوز عنوان API لتوجيه الطلبات إلى الخادم الخلفي =====
// هذا الملف يكتشف ما إذا كان التطبيق يعمل على بيئة محلية أو إنتاج
// ويقوم بتوجيه طلبات API إلى الخادم الصحيح تلقائياً

(function() {
  // الكشف عن حالة الخادم الخلفي
  var hostname = window.location.hostname;
  var currentPort = window.location.port;

  // إذا تم فتح المنيو مباشرة على بورت الكاشير (5050) أو بورت الموقع (5000)، تبقى مسارات API نسبية على نفس السيرفر
  if (currentPort === '5050' || currentPort === '5000') {
    return;
  }

  var isLocalIP = (hostname === 'localhost' || hostname === '127.0.0.1' || 
                   hostname.startsWith('192.168.') || hostname.startsWith('10.') || 
                   hostname.startsWith('172.') || hostname.endsWith('.local')) && 
                  currentPort !== '5000' && currentPort !== '5050';
  var isFileProtocol = window.location.protocol === 'file:';
  
  // إذا كان تشغيل محلي من منفذ خارجي أو ملف مباشر، نوجه الطلبات إلى المنفذ النشط
  var BACKEND_URL = '';
  if (isLocalIP) {
    BACKEND_URL = 'http://' + hostname + ':5050';
  } else if (isFileProtocol) {
    BACKEND_URL = 'http://127.0.0.1:5050';
  }
  
  if (BACKEND_URL) {
    console.log('[API Redirect] Client on ' + window.location.origin + '. Redirecting API to: ' + BACKEND_URL);
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        input = BACKEND_URL + input;
      }
      return originalFetch(input, init);
    };
  }
})();

// ===== تفعيل الهوية واللوجو والخلفية الديناميكية للموقع =====
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // عدم تفعيل التغيير التلقائي للصور في لوحة التحكم لتفادي تعارض الرفع
    if (window.location.pathname.includes('admin.html')) return;

    fetch('/api/customization')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data) {
          // اللوجو الفاتح (للهيدر والفوتر والقائمة الجانبية)
          if (data.logo1) {
            document.querySelectorAll('.nav-logo-img, .drawer-logo, .footer-logo-img, .logo-img').forEach(function(img) {
              img.src = data.logo1;
            });
            // أيضاً تحديث أي روابط شعار في عناصر footer-logo-img img
            document.querySelectorAll('.footer-logo-img img').forEach(function(img) {
              img.src = data.logo1;
            });
          }
          // اللوجو الداكن / الذهبي (للودر وعن الكافيه)
          if (data.logo2) {
            document.querySelectorAll('.loader-logo-cinematic, .about-card-logo').forEach(function(img) {
              img.src = data.logo2;
            });
          }
          // الصورة الخلفية الرئيسية
          if (data.heroBg) {
            var heroBg = document.querySelector('.hero-bg');
            if (heroBg) {
              heroBg.style.backgroundImage = 'url(' + data.heroBg + ')';
              heroBg.style.backgroundSize = 'cover';
              heroBg.style.backgroundPosition = 'center';
              heroBg.style.backgroundRepeat = 'no-repeat';
            }
          }
        }
      })
      .catch(function(err) { console.warn('[Customization] Failed to load brand assets:', err); });
  });
})();

