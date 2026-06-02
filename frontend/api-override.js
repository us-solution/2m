(function() {
  // Detect if backend server is at a different origin than frontend
  // If running on Vercel (https://ozel-weld.vercel.app), relative URLs work fine (no override)
  // If running from file:// protocol or different host/port, redirect to production URL
  var isLive = window.location.hostname === 'ozel-weld.vercel.app' || window.location.hostname === 'localhost' && window.location.port === '5000';
  var BACKEND_URL = isLive ? '' : 'https://ozel-weld.vercel.app';

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
