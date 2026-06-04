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
from app.services.realtime_outbox import process_realtime_outbox

logger = logging.getLogger(__name__)

DEFAULT_OUTBOX_LIMIT = 100
MAX_OUTBOX_LIMIT = 500


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


def seed_staging_demo_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, bool]:
    del event
    del context
    settings = get_settings()
    if settings.environment.strip().lower() == "production":
        raise ValueError("Refusing to seed production.")

    os.environ["KRESCO_ALLOW_STAGING_DEMO_SEED"] = "true"
    asyncio.run(seed_staging_demo(settings.database_url))
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
    init_engine(resolved_settings.database_url, resolved_settings.is_lambda, resolved_settings.pgsslrootcert)
    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Database engine was not initialized for scheduled outbox processing.")

    limit = _outbox_limit_from_event(event or {})
    async with session_factory() as db:
        result = await process_realtime_outbox(db, resolved_settings, limit=limit)

    logger.info(
        "scheduled_realtime_outbox_processed claimed=%s published=%s retry=%s dead=%s",
        result["claimed"],
        result["published"],
        result["retry"],
        result["dead"],
    )
    return {"ok": True, **result}


async def refresh_leaderboard_projection_once(
    *,
    settings: Settings | None = None,
) -> dict[str, bool]:
    resolved_settings = settings or get_settings()
    init_engine(resolved_settings.database_url, resolved_settings.is_lambda, resolved_settings.pgsslrootcert)
    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Database engine was not initialized for scheduled leaderboard refresh.")

    async with session_factory() as db:
        refreshed = await refresh_leaderboard_projection_if_stale(db)
        if refreshed:
            await db.commit()

    logger.info("scheduled_leaderboard_projection_refreshed refreshed=%s", refreshed)
    return {"ok": True, "refreshed": refreshed}


def _outbox_limit_from_event(event: Mapping[str, Any]) -> int:
    raw_limit = event.get("limit")
    detail = event.get("detail")
    if raw_limit is None and isinstance(detail, Mapping):
        raw_limit = detail.get("limit")

    try:
        limit = int(raw_limit) if raw_limit is not None else DEFAULT_OUTBOX_LIMIT
    except (TypeError, ValueError):
        limit = DEFAULT_OUTBOX_LIMIT

    return max(1, min(limit, MAX_OUTBOX_LIMIT))
