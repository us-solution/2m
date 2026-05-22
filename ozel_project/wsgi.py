"""
WSGI config for ozel_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ozel_project.settings')

application = get_wsgi_application()

# ── Auto-migrate & seed on Vercel cold start ──────────────────────
_IS_VERCEL = bool(os.environ.get('VERCEL') or os.environ.get('VERCEL_ENV'))
if _IS_VERCEL:
    _db_path = '/tmp/db.sqlite3'
    if not os.path.exists(_db_path):
        try:
            from django.core.management import call_command
            call_command('migrate', '--run-syncdb', verbosity=0)

            # Auto-seed: call the migrate-db endpoint logic directly
            from api.views import _auto_seed
            _auto_seed()
        except Exception as e:
            import sys
            print(f"[OZEL] Auto-migrate/seed error: {e}", file=sys.stderr)
