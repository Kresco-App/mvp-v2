import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete

from app.database import get_session_factory
from app.models.professor import RealtimeOutbox
from app.services import realtime_outbox


def test_realtime_outbox_publishes_events_concurrently(run_db, monkeypatch, test_settings):
    started: list[str] = []
    release_publishers = asyncio.Event()

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        del settings, name, data, attempts, retry_delay_seconds, http_client
        started.append(channel)
        if len(started) == 3:
            release_publishers.set()
        await release_publishers.wait()
        return True

    monkeypatch.setattr(realtime_outbox, "publish_ably_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            rows = []
            for index in range(3):
                rows.append(
                    await realtime_outbox.enqueue_realtime_event(
                        db,
                        channel=f"kresco:user:{index + 1}:notifications",
                        event_name=f"test.{index}",
                        payload={"index": index},
                    )
                )
            await db.commit()
            event_ids = [row.id for row in rows]

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(db, test_settings, retry_base_seconds=0)
            stored = [await db.get(RealtimeOutbox, event_id) for event_id in event_ids]
            return result, stored

    result, stored = run_db(_case())

    assert result == {"claimed": 3, "published": 3, "retry": 0, "dead": 0}
    assert len(started) == 3
    assert stored and all(row.status == realtime_outbox.OUTBOX_PUBLISHED for row in stored)


def test_realtime_outbox_records_retry_and_dead_letter_states(run_db, monkeypatch, test_settings):
    calls: list[str] = []

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        del settings, name, data, attempts, retry_delay_seconds, http_client
        calls.append(channel)
        if channel.endswith(":2:notifications"):
            return False
        if channel.endswith(":3:notifications"):
            raise RuntimeError("boom")
        return True

    monkeypatch.setattr(realtime_outbox, "publish_ably_message", fake_publish)

    async def _wrapped_case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            published = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:1:notifications",
                event_name="ok.event",
                payload={"ok": True},
            )
            retry = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:2:notifications",
                event_name="retry.event",
                payload={"ok": False},
            )
            dead = RealtimeOutbox(
                channel="kresco:user:3:notifications",
                event_name="dead.event",
                payload_json={"ok": False},
                attempts=7,
                available_at=datetime.now(timezone.utc),
            )
            db.add(dead)
            await db.commit()
            published_id, retry_id, dead_id = published.id, retry.id, dead.id

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(
                db,
                test_settings,
                max_attempts=8,
                retry_base_seconds=0,
            )
            published_row = await db.get(RealtimeOutbox, published_id)
            retry_row = await db.get(RealtimeOutbox, retry_id)
            dead_row = await db.get(RealtimeOutbox, dead_id)
            return result, published_row, retry_row, dead_row

    result, published_row, retry_row, dead_row = run_db(_wrapped_case())

    assert result == {"claimed": 3, "published": 1, "retry": 1, "dead": 1}
    assert calls == [
        "kresco:user:1:notifications",
        "kresco:user:2:notifications",
        "kresco:user:3:notifications",
    ]
    assert published_row.status == realtime_outbox.OUTBOX_PUBLISHED
    assert published_row.published_at is not None
    assert retry_row.status == realtime_outbox.OUTBOX_RETRY
    assert retry_row.locked_at is None
    assert retry_row.last_error == "Ably publish returned false"
    assert dead_row.status == realtime_outbox.OUTBOX_DEAD
    assert dead_row.locked_at is None
    assert "RuntimeError" in dead_row.last_error
