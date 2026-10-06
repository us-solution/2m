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
  
  // إذا كان تشغيل محلي من منفذ خارجي أو ملف مباشر، نوجه الطلبات إلى المنفذ النشط لموقع الويب (5000)
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

