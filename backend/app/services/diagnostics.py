from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import BACKEND_DIR, MEDIA_STORAGE_S3, Settings
from app.models.professor import RealtimeOutbox
from app.services.ably import AblyConfigurationError, split_ably_api_key
from app.services.realtime_outbox import OUTBOX_DEAD, OUTBOX_PENDING, OUTBOX_RETRY


DIAGNOSTICS_VERSION = "2.0.0"


async def build_production_diagnostics(db: AsyncSession, settings: Settings) -> dict[str, Any]:
    checks: dict[str, dict[str, Any]] = {
        "configuration": _configuration_check(settings),
        "database": await _database_check(db, settings),
        "migrations": await _migration_check(db),
        "storage": _storage_check(settings),
        "realtime": await _realtime_check(db, settings),
        "video": _video_check(settings),
        "email": _email_check(settings),
        "payment": _payment_check(settings),
    }
    errors = [name for name, check in checks.items() if check.get("status") != "ok"]
    return {
        "status": "not_ready" if errors else "ready",
        "version": DIAGNOSTICS_VERSION,
        "checks": checks,
        "errors": errors,
    }


def expected_migration_heads() -> list[str]:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return sorted(ScriptDirectory.from_config(config).get_heads())


def _configuration_check(settings: Settings) -> dict[str, Any]:
    errors = settings.production_config_errors()
    return {
        "status": "error" if errors else "ok",
        "environment": settings.environment,
        "production_like": settings.is_production_like,
        "error_count": len(errors),
        "errors": errors,
    }


async def _database_check(db: AsyncSession, settings: Settings) -> dict[str, Any]:
    runtime_config = _database_runtime_config(settings)
    try:
        await db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        await db.rollback()
        return {"status": "error", "detail": "database_unreachable", **runtime_config}
    return {"status": "ok", **runtime_config}


def _database_runtime_config(settings: Settings) -> dict[str, Any]:
    strategy = settings.database_connection_strategy.strip().lower()
    return {
        "strategy": strategy,
        "rds_proxy_declared": strategy == "rds_proxy",
    }


async def _migration_check(db: AsyncSession) -> dict[str, Any]:
    expected_heads = expected_migration_heads()
    try:
        result = await db.execute(text("SELECT version_num FROM alembic_version"))
    except SQLAlchemyError:
        await db.rollback()
        return {
            "status": "error",
            "detail": "alembic_version_unavailable",
            "current_heads": [],
            "expected_heads": expected_heads,
        }

    current_heads = sorted({row[0] for row in result.all() if row[0]})
    return {
        "status": "ok" if current_heads == expected_heads else "error",
        "current_heads": current_heads,
        "expected_heads": expected_heads,
    }


def _storage_check(settings: Settings) -> dict[str, Any]:
    backend = settings.media_storage_backend.strip().lower()
    bucket_configured = bool(settings.media_s3_bucket.strip())
    region_configured = bool(settings.media_s3_region.strip())
    presign_ttl_seconds = int(settings.media_s3_presign_ttl_seconds)
    profile_quota_bytes = int(settings.media_profile_quota_bytes)
    chat_conversation_quota_bytes = int(settings.media_chat_conversation_quota_bytes)
    lifecycle_expiration_days = int(settings.media_s3_lifecycle_expiration_days)
    status = "ok" if (
        backend == MEDIA_STORAGE_S3
        and bucket_configured
        and region_configured
        and presign_ttl_seconds >= 60
        and profile_quota_bytes > 0
        and chat_conversation_quota_bytes > 0
        and lifecycle_expiration_days > 0
    ) else "error"
    return {
        "status": status,
        "backend": backend,
        "bucket_configured": bucket_configured,
        "region_configured": region_configured,
        "prefix_configured": bool(settings.media_s3_prefix.strip()),
        "presign_ttl_seconds": presign_ttl_seconds,
        "profile_quota_bytes": profile_quota_bytes,
        "chat_conversation_quota_bytes": chat_conversation_quota_bytes,
        "lifecycle_expiration_days": lifecycle_expiration_days,
    }


async def _realtime_check(db: AsyncSession, settings: Settings) -> dict[str, Any]:
    ably_key_status = _ably_key_status(settings)
    outbox_secret_configured = len(settings.realtime_outbox_secret.strip()) >= 32
    outbox_counts = await _outbox_counts(db)
    status = "ok"
    if (
        ably_key_status != "ok"
        or not outbox_secret_configured
        or outbox_counts.get("status") != "ok"
        or outbox_counts.get("dead", 0) > 0
    ):
        status = "error"

    return {
        "status": status,
        "ably_key": ably_key_status,
        "outbox_secret_configured": outbox_secret_configured,
        "outbox": outbox_counts,
    }


def _ably_key_status(settings: Settings) -> str:
    if not settings.ably_api_key.strip():
        return "missing"
    try:
        split_ably_api_key(settings.ably_api_key)
    except AblyConfigurationError:
        return "malformed"
    return "ok"


async def _outbox_counts(db: AsyncSession) -> dict[str, Any]:
    counts: dict[str, Any] = {
        "status": "ok",
        OUTBOX_PENDING: 0,
        OUTBOX_RETRY: 0,
        OUTBOX_DEAD: 0,
    }
    try:
        result = await db.execute(
            select(RealtimeOutbox.status, func.count(RealtimeOutbox.id)).group_by(RealtimeOutbox.status)
        )
    except SQLAlchemyError:
        await db.rollback()
        return {
            "status": "error",
            "detail": "realtime_outbox_unavailable",
            OUTBOX_PENDING: 0,
            OUTBOX_RETRY: 0,
            OUTBOX_DEAD: 0,
        }

    for status, count in result.all():
        counts[str(status)] = int(count)
    return counts


def _video_check(settings: Settings) -> dict[str, Any]:
    api_secret_configured = bool(settings.vdocipher_api_secret.strip())
    api_base_url_https = _is_https_url(settings.vdocipher_api_base_url)
    live_create_url_https = _is_https_url(settings.vdocipher_live_create_url)
    status = "ok" if api_secret_configured and api_base_url_https and live_create_url_https else "error"
    return {
        "status": status,
        "api_secret_configured": api_secret_configured,
        "api_base_url_https": api_base_url_https,
        "live_create_url_https": live_create_url_https,
    }


def _email_check(settings: Settings) -> dict[str, Any]:
    configured = bool(settings.resend_api_key.strip())
    return {
        "status": "ok" if configured else "error",
        "resend_api_key_configured": configured,
    }


def _payment_check(settings: Settings) -> dict[str, Any]:
    sk_configured = bool(settings.stripe_sk.strip())
    product_id_configured = bool(settings.stripe_product_id.strip())
    webhook_secret_configured = bool(settings.stripe_webhook_secret.strip())
    status = "ok" if sk_configured and product_id_configured and webhook_secret_configured else "error"
    return {
        "status": status,
        "stripe_sk_configured": sk_configured,
        "stripe_product_id_configured": product_id_configured,
        "stripe_webhook_secret_configured": webhook_secret_configured,
    }


def _is_https_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme == "https" and bool(parsed.netloc)
