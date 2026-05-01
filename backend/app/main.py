import os
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqladmin import Admin
from sqladmin.authentication import AuthenticationBackend
from starlette.middleware.sessions import SessionMiddleware

from app.admin.views import register_admin_views
from app.config import Settings, get_settings
from app.database import init_engine
from app.rate_limit import limiter
from app.routers import courses, gamification, interactions, notifications, payments, quizzes, users

logger = logging.getLogger("kresco.api")
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


class AdminAuth(AuthenticationBackend):
    def __init__(self, secret_key: str, admin_password: str):
        super().__init__(secret_key=secret_key)
        self._password = admin_password

    async def login(self, request: Request) -> bool:
        form = await request.form()
        if form.get("password") == self._password:
            request.session["admin_authenticated"] = True
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("admin_authenticated", False)


def create_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        settings = get_settings()

    # Initialize DB engine at startup (module-level reuse within warm Lambda container)
    engine, _ = init_engine(settings.database_url, settings.is_lambda)

    root_path = "/production" if settings.is_lambda else ""

    app = FastAPI(
        title="Kresco API",
        version="2.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        root_path=root_path,
    )

    # Store settings on app state for access in dependencies
    app.state.settings = settings

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Sessions (required by SQLAdmin auth)
    app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key, max_age=86400)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(users.router, prefix="/api")
    app.include_router(courses.router, prefix="/api/courses")
    app.include_router(quizzes.router, prefix="/api/quizzes")
    app.include_router(gamification.router, prefix="/api/progress")
    app.include_router(interactions.router, prefix="/api/interactions")
    app.include_router(payments.router, prefix="/api/payments")
    app.include_router(notifications.router, prefix="/api/notifications")

    # SQLAdmin panel
    admin_password = os.environ.get("ADMIN_PASSWORD", "kresco-admin-2026")
    auth_backend = AdminAuth(
        secret_key=settings.jwt_secret_key,
        admin_password=admin_password,
    )
    admin = Admin(
        app,
        engine,
        title="Kresco Admin",
        base_url="/admin",
        authentication_backend=auth_backend,
    )
    register_admin_views(admin)

    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.exception(
                "request_failed request_id=%s method=%s path=%s duration_ms=%s",
                request_id,
                request.method,
                request.url.path,
                duration_ms,
            )
            raise
        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["x-request-id"] = request_id
        logger.info(
            "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        logger.exception("unhandled_exception request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )

    @app.get("/")
    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "2.0.0"}

    return app
