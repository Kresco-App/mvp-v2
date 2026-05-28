from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.professor import RealtimeOutbox
from app.services.ably import publish_ably_message

OUTBOX_PENDING = "pending"
OUTBOX_RETRY = "retry"
OUTBOX_PUBLISHING = "publishing"
OUTBOX_PUBLISHED = "published"
OUTBOX_DEAD = "dead"
OUTBOX_DELIVERABLE_STATUSES = {OUTBOX_PENDING, OUTBOX_RETRY}
OUTBOX_STALE_LOCK_SECONDS = 300
OUTBOX_MAX_CONCURRENCY = 8

logger = logging.getLogger(__name__)


async def enqueue_realtime_event(
    db: AsyncSession,
    *,
    channel: str,
    event_name: str,
    payload: dict,
    available_at: datetime | None = None,
) -> RealtimeOutbox:
    clean_channel = channel.strip()
    clean_event_name = event_name.strip()
    if not clean_channel:
        raise ValueError("Realtime outbox channel is required")
    if not clean_event_name:
        raise ValueError("Realtime outbox event name is required")

    event = RealtimeOutbox(
        channel=clean_channel,
        event_name=clean_event_name,
        payload_json=payload,
        status=OUTBOX_PENDING,
        available_at=available_at or _utc_now(),
    )
    db.add(event)
    return event


async def process_realtime_outbox(
    db: AsyncSession,
    settings: Settings,
    *,
    limit: int = 100,
    max_attempts: int = 8,
    retry_base_seconds: int = 5,
    now: datetime | None = None,
) -> dict[str, int]:
    batch_now = now or _utc_now()
    events = await _claim_realtime_outbox_batch(db, limit=max(1, min(limit, 500)), now=batch_now)
    if not events:
        return {"claimed": 0, "published": 0, "retry": 0, "dead": 0}

    published = 0
    retry = 0
    dead = 0

    async def _publish_event(event: RealtimeOutbox) -> tuple[RealtimeOutbox, bool, str]:
        failure_reason = "Ably publish returned false"
        try:
            delivered = await publish_ably_message(
                settings,
                event.channel,
                event.event_name,
                event.payload_json,
                attempts=2,
                retry_delay_seconds=0.2,
                http_client=http_client,
            )
        except Exception as exc:
            delivered = False
            failure_reason = f"{type(exc).__name__}: {str(exc)[:500]}"
            logger.exception(
                "Realtime outbox publish raised unexpectedly",
                extra={"outbox_id": event.id, "channel": event.channel, "event": event.event_name},
            )
        return event, delivered, failure_reason

    async with httpx.AsyncClient(timeout=5) as http_client:
        sem = asyncio.Semaphore(min(len(events), OUTBOX_MAX_CONCURRENCY))

        async def _bounded_publish(event: RealtimeOutbox) -> tuple[RealtimeOutbox, bool, str]:
            async with sem:
                return await _publish_event(event)

        results = await asyncio.gather(*(_bounded_publish(event) for event in events))

    for event, delivered, failure_reason in results:
        if delivered:
            event.status = OUTBOX_PUBLISHED
            event.published_at = _utc_now()
            event.last_error = ""
            event.locked_at = None
            published += 1
            continue

        event.last_error = failure_reason
        event.locked_at = None
        if event.attempts >= max_attempts:
            event.status = OUTBOX_DEAD
            event.available_at = _utc_now()
            dead += 1
        else:
            event.status = OUTBOX_RETRY
            event.available_at = _utc_now() + _retry_delay(event.attempts, retry_base_seconds)
            retry += 1

    await db.commit()
    return {"claimed": len(events), "published": published, "retry": retry, "dead": dead}


async def _claim_realtime_outbox_batch(db: AsyncSession, *, limit: int, now: datetime) -> list[RealtimeOutbox]:
    stale_before = now - timedelta(seconds=OUTBOX_STALE_LOCK_SECONDS)
    stmt = (
        select(RealtimeOutbox)
        .where(
            or_(
                RealtimeOutbox.status.in_(OUTBOX_DELIVERABLE_STATUSES),
                (RealtimeOutbox.status == OUTBOX_PUBLISHING) & (RealtimeOutbox.locked_at <= stale_before),
            ),
            RealtimeOutbox.available_at <= now,
        )
        .order_by(RealtimeOutbox.available_at, RealtimeOutbox.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    events = list(result.scalars().all())
    for event in events:
        event.status = OUTBOX_PUBLISHING
        event.locked_at = now
        event.attempts = int(event.attempts or 0) + 1
    if events:
        await db.commit()
    return events


def _retry_delay(attempts: int, retry_base_seconds: int) -> timedelta:
    seconds = min(max(retry_base_seconds, 0) * (2 ** max(attempts - 1, 0)), 300)
    return timedelta(seconds=seconds)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
