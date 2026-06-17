from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Mapping
from typing import Any

from alembic import command
from alembic.config import Config

from app.config import BACKEND_DIR
from app.config import Settings, get_settings
from app.database import get_session_factory, init_engine
from scripts.seed_staging_demo import seed_staging_demo
from app.services.gamification_read_models import refresh_leaderboard_projection_if_stale
from app.services.realtime_outbox import (
    OUTBOX_DEFAULT_RETENTION_DAYS,
    OUTBOX_MAX_PURGE_LIMIT,
    process_realtime_outbox,
    purge_realtime_outbox,
)

logger = logging.getLogger(__name__)

DEFAULT_OUTBOX_LIMIT = 100
MAX_OUTBOX_LIMIT = 500
DEFAULT_OUTBOX_PURGE_LIMIT = 250


def run_alembic_migrations_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, str | bool]:
    del context
    revision = str((event or {}).get("revision") or "head").strip()
    if revision != "head":
        raise ValueError("Only Alembic upgrade to head is supported by the deployment worker.")

    settings = get_settings()
    os.environ["DATABASE_URL"] = settings.database_url
    os.environ["PGSSLROOTCERT"] = settings.pgsslrootcert

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, revision)
    return {"ok": True, "revision": revision}


def process_realtime_outbox_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, int | bool]:
    del context
    return asyncio.run(process_realtime_outbox_once(event or {}))


STAGING_DEMO_SEED_CONFIRMATION = "seed-staging-demo"


def seed_staging_demo_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, bool]:
    del context
    settings = get_settings()
    if settings.environment.strip().lower() != "staging":
        raise ValueError("Staging demo seed can only run when KRESCO_ENV is staging.")
    if _event_text(event or {}, "confirm") != STAGING_DEMO_SEED_CONFIRMATION:
        raise ValueError("Staging demo seed requires confirm=seed-staging-demo.")

    asyncio.run(seed_staging_demo(settings.database_url, allow_confirmed=True))
    return {"ok": True}


def refresh_leaderboard_projection_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, bool]:
    del event
    del context
    return asyncio.run(refresh_leaderboard_projection_once())


async def process_realtime_outbox_once(
    event: Mapping[str, Any] | None = None,
    *,
    settings: Settings | None = None,
) -> dict[str, int | bool]:
    resolved_settings = settings or get_settings()
    _init_scheduled_database(resolved_settings)
    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Database engine was not initialized for scheduled outbox processing.")

    limit = _outbox_limit_from_event(event or {})
    purge_retention_days = _outbox_retention_days_from_event(event or {})
    purge_limit = _outbox_purge_limit_from_event(event or {})
    async with session_factory() as db:
        result = await process_realtime_outbox(db, resolved_settings, limit=limit)
    async with session_factory() as db:
        purge_result = await purge_realtime_outbox(
            db,
            retention_days=purge_retention_days,
            limit=purge_limit,
        )

    logger.info(
        "scheduled_realtime_outbox_processed claimed=%s published=%s retry=%s dead=%s purged=%s",
        result["claimed"],
        result["published"],
        result["retry"],
        result["dead"],
        purge_result["purged"],
    )
    return {"ok": True, **result, **purge_result}


async def refresh_leaderboard_projection_once(
    *,
    settings: Settings | None = None,
) -> dict[str, bool]:
    resolved_settings = settings or get_settings()
    _init_scheduled_database(resolved_settings)
    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Database engine was not initialized for scheduled leaderboard refresh.")

    async with session_factory() as db:
        refreshed = await refresh_leaderboard_projection_if_stale(db)
        if refreshed:
            await db.commit()

    logger.info("scheduled_leaderboard_projection_refreshed refreshed=%s", refreshed)
    return {"ok": True, "refreshed": refreshed}


def _init_scheduled_database(settings: Settings) -> None:
    init_engine(
        settings.database_url,
        settings.is_lambda,
        settings.pgsslrootcert,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
    )


def _outbox_limit_from_event(event: Mapping[str, Any]) -> int:
    return _event_int(event, "limit", default=DEFAULT_OUTBOX_LIMIT, max_value=MAX_OUTBOX_LIMIT)


def _outbox_retention_days_from_event(event: Mapping[str, Any]) -> int:
    return _event_int(event, "retention_days", default=OUTBOX_DEFAULT_RETENTION_DAYS)


def _outbox_purge_limit_from_event(event: Mapping[str, Any]) -> int:
    return _event_int(event, "purge_limit", default=DEFAULT_OUTBOX_PURGE_LIMIT, max_value=OUTBOX_MAX_PURGE_LIMIT)


def _event_int(
    event: Mapping[str, Any],
    key: str,
    *,
    default: int,
    max_value: int | None = None,
) -> int:
    raw_value = event.get(key)
    detail = event.get("detail")
    if raw_value is None and isinstance(detail, Mapping):
        raw_value = detail.get(key)

    try:
        value = int(raw_value) if raw_value is not None else default
    except (TypeError, ValueError):
        value = default

    if max_value is not None:
        value = min(value, max_value)
    return max(1, value)


def _event_text(event: Mapping[str, Any], key: str) -> str:
    raw_value = event.get(key)
    detail = event.get("detail")
    if raw_value is None and isinstance(detail, Mapping):
        raw_value = detail.get(key)
    return str(raw_value or "").strip()
