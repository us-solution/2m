// ===== تجاوز عنوان API لتوجيه الطلبات إلى الخادم الخلفي =====
// هذا الملف يكتشف ما إذا كان التطبيق يعمل على بيئة محلية أو إنتاج
// ويقوم بتوجيه طلبات API إلى الخادم الصحيح تلقائياً

(function() {
  // الكشف عن حالة الخادم الخلفي — إذا كان في نفس نطاق الواجهة الأمامية
  // إذا كان يعمل على Vercel، فإن عناوين URL النسبية تعمل بشكل طبيعي (لا حاجة للتجاوز)
  // إذا كان يعمل من بروتوكول file:// أو من host/port مختلف، يتم التوجيه إلى رابط الإنتاج
  var isLive = window.location.hostname === 'ozel-cafe-sadat.vercel.app' || window.location.hostname === 'localhost' && window.location.port === '5000';
  var BACKEND_URL = isLive ? '' : 'https://ozel-cafe-sadat.vercel.app';

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
