// ===== تجاوز عنوان API لتوجيه الطلبات إلى الخادم الخلفي =====
// هذا الملف يكتشف ما إذا كان التطبيق يعمل على بيئة محلية أو إنتاج
// ويقوم بتوجيه طلبات API إلى الخادم الصحيح تلقائياً

(function() {
  // الكشف عن حالة الخادم الخلفي
  // إذا كنا نعمل على نطاق مباشر (مثل ozel.cafe أو cafe.sadat) أو محلياً على المنفذ 5000، نستخدم مسارات نسبية تلقائياً
  var isLocalDevServer = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000';
  var isFileProtocol = window.location.protocol === 'file:';
  
  // إذا كان تشغيل محلي غير خادم التطبيق (منفذ آخر) أو ملف مباشر، نوجه الطلبات إلى الخادم المحلي
  var BACKEND_URL = (isLocalDevServer || isFileProtocol) ? 'http://127.0.0.1:5000' : '';

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
