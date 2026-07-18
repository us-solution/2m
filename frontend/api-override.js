// ===== تجاوز عنوان API لتوجيه الطلبات إلى الخادم الخلفي =====
// هذا الملف يكتشف ما إذا كان التطبيق يعمل على بيئة محلية أو إنتاج
// ويقوم بتوجيه طلبات API إلى الخادم الصحيح تلقائياً

(function() {
  // الكشف عن حالة الخادم الخلفي
  var hostname = window.location.hostname;
  var isLocalIP = (hostname === 'localhost' || hostname === '127.0.0.1' || 
                   hostname.startsWith('192.168.') || hostname.startsWith('10.') || 
                   hostname.startsWith('172.') || hostname.endsWith('.local')) && 
                  window.location.port !== '5000';
  var isFileProtocol = window.location.protocol === 'file:';
  
  // إذا كان تشغيل محلي غير خادم التطبيق (منفذ آخر) أو ملف مباشر، نوجه الطلبات إلى الخادم المحلي
  var BACKEND_URL = '';
  if (isLocalIP) {
    BACKEND_URL = 'http://' + hostname + ':5000';
  } else if (isFileProtocol) {
    BACKEND_URL = 'http://127.0.0.1:5000';
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

