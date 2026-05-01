import os
os.environ.setdefault("LAMBDA_TASK_ROOT", "/var/task")

from a2wsgi import ASGIMiddleware

from app.config import get_settings
from app.main import create_app

_settings = get_settings()
_app = create_app(_settings)

# Zappa is the outer Lambda handler and calls app_function as a WSGI callable.
# a2wsgi bridges FastAPI (ASGI) → WSGI so Zappa can invoke it correctly.
application = ASGIMiddleware(_app)
