import os
from collections.abc import Callable

os.environ.setdefault("LAMBDA_TASK_ROOT", "/var/task")

from a2wsgi import ASGIMiddleware

from app.config import get_settings
from app.main import create_app
from app.stage_prefix import strip_stage_prefix

_settings = get_settings()
_app = create_app(_settings)


class StripApiGatewayStagePrefix:
    def __init__(self, app: Callable, stage: str) -> None:
        normalized_stage = stage.strip().strip("/")
        self.app = app
        self.prefix = f"/{normalized_stage}" if normalized_stage else ""

    def __call__(self, environ, start_response):
        if self.prefix:
            strip_stage_prefix(environ, self.prefix)
        return self.app(environ, start_response)


# Zappa is the outer Lambda handler and calls app_function as a WSGI callable.
# a2wsgi bridges FastAPI (ASGI) to WSGI so Zappa can invoke it correctly.
application = StripApiGatewayStagePrefix(ASGIMiddleware(_app), _settings.environment)
