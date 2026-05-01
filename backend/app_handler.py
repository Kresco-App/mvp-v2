"""
AWS Lambda entry-point.

Zappa (WSGI) calls lambda_handler. We use a2wsgi to adapt our FastAPI ASGI
app to the WSGI interface Zappa expects — no custom event-loop management needed.
"""
import os
os.environ.setdefault("LAMBDA_TASK_ROOT", "/var/task")

from a2wsgi import ASGIMiddleware

from app.config import get_settings
from app.main import create_app

_settings = get_settings()
_asgi_app = create_app(_settings)

# a2wsgi wraps any ASGI app as a standard WSGI callable.
# Zappa's app_function must point here.
lambda_handler = ASGIMiddleware(_asgi_app)
