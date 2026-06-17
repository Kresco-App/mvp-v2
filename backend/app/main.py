import os
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqladmin import Admin
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.admin.auth import StaffAdminAuth
from app.admin.views import register_admin_views
from app.config import Settings, get_settings, validate_production_settings
from app.database import init_engine, reset_engine
from app.rate_limit import configure_rate_limit_storage, limiter
from app.routers import admin as admin_api
from app.routers import calendar, courses, exam_bank, exercises, gamification, interactions, internal, notifications, payments, professor, quizzes, realtime, reports, telemetry, users
from app.security.csrf import csrf_failure_reason
from app.services.media_storage import warm_media_storage_client
from app.services.telemetry import emit_readiness_error_metric, emit_request_metric, emit_unhandled_exception_metric

APP_VERSION = "2.0.0"

logger = logging.getLogger("kresco.api")
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


class RequestBodyTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = int(max_body_bytes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self.max_body_bytes <= 0:
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin1").lower(): value.decode("latin1")
            for key, value in scope.get("headers", [])
        }
        content_length = headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_body_bytes:
                    response = _apply_security_headers(JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large"},
                    ))
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        received_bytes = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise RequestBodyTooLarge
            return message

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, send_wrapper)
        except RequestBodyTooLarge:
            if response_started:
                raise
            response = _apply_security_headers(JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
            ))
            await response(scope, receive, send)


def _ready_config_service_status(settings: Settings) -> dict[str, str]:
    def _present(value: str) -> bool:
        return bool(value.strip())

    db_url = settings.database_url.strip().lower()
    db_ok = not db_url.startswith("sqlite") and db_url != ""
    return {
        "database": "ok" if db_ok else "misconfigured",
        "gcp": "ok" if _present(settings.gcp_project_id) and _present(settings.gcp_region) else "missing",
        "firebase": "ok" if _present(settings.firebase_project_id) else "missing",
        "gcs": "ok" if _present(settings.media_gcs_bucket) else "missing",
        "vdocipher": "ok" if _present(settings.vdocipher_api_secret) else "missing",
        "smtp": "ok" if _present(settings.resend_api_key) else "missing",
        "payment": "ok" if _present(settings.cmi_client_id) and _present(settings.cmi_store_key) else "missing",
    }


def _apply_security_headers(response: Response) -> Response:
    for name, value in SECURITY_HEADERS.items():
        if name not in response.headers:
            response.headers[name] = value
    return response


def _apply_api_cache_headers(request: Request, response: Response) -> Response:
    if not request.url.path.startswith("/api/"):
        return response
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store, private"
    if "pragma" not in response.headers:
        response.headers["Pragma"] = "no-cache"
    if "expires" not in response.headers:
        response.headers["Expires"] = "0"
    return response


def _register_sqladmin(app: FastAPI, settings: Settings, engine) -> None:
    auth_backend = StaffAdminAuth(settings=settings)
    admin = Admin(
        app,
        engine,
        title="Kresco Admin",
        base_url="/admin",
        templates_dir=str(Path(__file__).resolve().parent / "admin" / "templates"),
        authentication_backend=auth_backend,
    )
    register_admin_views(admin)


async def initialize_app_runtime(app: FastAPI, settings: Settings):
    if app.state.db_engine is not None:
        return app.state.db_engine

    engine, _ = init_engine(
        settings.database_url,
        settings.pgsslrootcert,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
    )
    app.state.db_engine = engine
    await warm_media_storage_client(settings)
    _register_sqladmin(app, settings, engine)
    return engine


def create_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        settings = get_settings()

    validate_production_settings(settings)
    configure_rate_limit_storage(settings.rate_limit_storage_uri)

    root_path = ""
    release_sha = settings.release_sha.strip() or "development"

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await initialize_app_runtime(app, settings)
        try:
            yield
        finally:
            await reset_engine()
            app.state.db_engine = None

    app = FastAPI(
        title="Kresco API",
        version=APP_VERSION,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        root_path=root_path,
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
    )

    # Store settings on app state for access in dependencies
    app.state.settings = settings
    app.state.db_engine = None
    app.state.release_sha = release_sha
    app.dependency_overrides[get_settings] = lambda: settings

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(RequestSizeLimitMiddleware, max_body_bytes=settings.max_request_body_bytes)
    app.add_middleware(SlowAPIMiddleware)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=settings.cors_allow_origin_regex_value,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Compress responses (large JSON course plans / workspaces) for clients that
    # advertise gzip support. Registered last so it wraps the response outermost.
    app.add_middleware(GZipMiddleware, minimum_size=500)

    # Routers
    app.include_router(users.router, prefix="/api")
    app.include_router(calendar.router, prefix="/api/calendar")
    app.include_router(courses.router, prefix="/api/courses")
    app.include_router(exam_bank.router, prefix="/api/exam-bank")
    app.include_router(exercises.router, prefix="/api/exercises")
    app.include_router(quizzes.router, prefix="/api/quizzes")
    app.include_router(gamification.router, prefix="/api/progress")
    app.include_router(interactions.router, prefix="/api/interactions")
    app.include_router(reports.router, prefix="/api")
    app.include_router(payments.router, prefix="/api/payments")
    app.include_router(notifications.router, prefix="/api/notifications")
    app.include_router(realtime.router, prefix="/api/realtime")
    app.include_router(telemetry.router, prefix="/api")
    app.include_router(professor.router, prefix="/api/professor")
    app.include_router(admin_api.router, prefix="/api/admin")
    app.include_router(internal.router, prefix="/api/internal")

    if not settings.is_production_like:
        os.makedirs("media", exist_ok=True)
        app.mount("/media", StaticFiles(directory="media"), name="media")

    @app.middleware("http")
    async def csrf_middleware(request: Request, call_next):
        reason = csrf_failure_reason(request, settings)
        if reason:
            return _apply_security_headers(JSONResponse(status_code=403, content={"detail": reason}))
        return await call_next(request)

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
                "request_failed request_id=%s release_sha=%s method=%s path=%s duration_ms=%s",
                request_id,
                release_sha,
                request.method,
                request.url.path,
                duration_ms,
            )
            emit_request_metric(
                settings,
                release_sha=release_sha,
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
            )
            emit_unhandled_exception_metric(
                settings,
                release_sha=release_sha,
                path=request.url.path,
                error_type="RequestException",
            )
            raise
        duration_ms = int((time.perf_counter() - started) * 1000)
        _apply_api_cache_headers(request, response)
        _apply_security_headers(response)
        response.headers["x-request-id"] = request_id
        response.headers["x-release-sha"] = release_sha
        logger.info(
            "request_complete request_id=%s release_sha=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            release_sha,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        emit_request_metric(
            settings,
            release_sha=release_sha,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        logger.exception("unhandled_exception request_id=%s release_sha=%s path=%s", request_id, release_sha, request.url.path)
        emit_unhandled_exception_metric(
            settings,
            release_sha=release_sha,
            path=request.url.path,
            error_type=type(exc).__name__,
        )
        return _apply_security_headers(JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id, "release_sha": release_sha},
        ))

    @app.get("/")
    @app.get("/health")
    async def health():
        return {"status": "ok", "version": APP_VERSION, "release_sha": release_sha}

    @app.get("/ready")
    async def ready():
        checks: dict[str, object] = {
            "configuration": "ok",
            "database": "ok",
        }
        errors: list[str] = []

        config_errors = settings.production_config_errors()
        checks["config_services"] = _ready_config_service_status(settings)
        if config_errors:
            checks["configuration"] = "error"
            errors.append("configuration")

        try:
            async with app.state.db_engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except Exception as exc:
            checks["database"] = "error"
            errors.append("database")
            logger.warning("readiness_database_failed error_type=%s", type(exc).__name__)
            emit_readiness_error_metric(
                settings,
                release_sha=release_sha,
                check_name="database",
                error_type=type(exc).__name__,
            )

        if errors:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "version": APP_VERSION,
                    "release_sha": release_sha,
                    "checks": checks,
                    "errors": errors,
                },
            )

        return {
            "status": "ready",
            "version": APP_VERSION,
            "release_sha": release_sha,
            "checks": checks,
        }

    return app
