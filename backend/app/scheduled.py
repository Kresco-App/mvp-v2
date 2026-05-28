from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

from app.config import Settings, get_settings
from app.database import get_session_factory, init_engine
from app.services.realtime_outbox import process_realtime_outbox

logger = logging.getLogger(__name__)

DEFAULT_OUTBOX_LIMIT = 100
MAX_OUTBOX_LIMIT = 500


def process_realtime_outbox_event(
    event: Mapping[str, Any] | None = None,
    context: Any = None,
) -> dict[str, int | bool]:
    del context
    return asyncio.run(process_realtime_outbox_once(event or {}))


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
