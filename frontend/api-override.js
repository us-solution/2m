(function() {
  // Determine if backend server is on localhost:5000 and client is running elsewhere (e.g. port 5500 Live Server, or file:// protocol)
  const isLocalBackend = window.location.protocol === 'file:' || (window.location.port !== '5000' && window.location.port !== '');
  const BACKEND_URL = isLocalBackend ? 'http://localhost:5000' : '';

  if (BACKEND_URL) {
    console.log(`[API Redirect] Client running on ${window.location.origin || 'file://'}. Directing API requests to: ${BACKEND_URL}`);
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        input = BACKEND_URL + input;
      }
      return originalFetch(input, init);
    };
  }

  // Global error logger
  window.addEventListener('error', function(event) {
    const errorLog = {
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error ? event.error.stack : null,
      href: window.location.href
    };
    fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'error', data: errorLog })
    }).catch(() => {});
  });

  window.addEventListener('unhandledrejection', function(event) {
    const errorLog = {
      message: event.reason ? event.reason.message || String(event.reason) : 'Promise rejection',
      stack: event.reason && event.reason.stack ? event.reason.stack : null,
      href: window.location.href
    };
    fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unhandledrejection', data: errorLog })
    }).catch(() => {});
  });
})();

