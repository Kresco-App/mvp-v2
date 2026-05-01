"""
AWS Lambda entry-point via Mangum (ASGI → Lambda event adapter).
Zappa's app_function points to lambda_handler below.
"""
import os
os.environ.setdefault("LAMBDA_TASK_ROOT", "/var/task")

from mangum import Mangum

from app.config import get_settings
from app.main import create_app

_settings = get_settings()
_app = create_app(_settings)

# Mangum translates API Gateway events into ASGI scope/receive/send.
# lifespan="off" avoids an asyncio event-loop clash on Lambda cold starts.
lambda_handler = Mangum(_app, lifespan="off")
