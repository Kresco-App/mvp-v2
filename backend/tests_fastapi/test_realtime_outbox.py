import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

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

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

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


def test_realtime_outbox_respects_publish_concurrency_limit(run_db, monkeypatch, test_settings):
    current_publishers = 0
    max_publishers = 0

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        del settings, channel, name, data, attempts, retry_delay_seconds, http_client
        nonlocal current_publishers, max_publishers
        current_publishers += 1
        max_publishers = max(max_publishers, current_publishers)
        await asyncio.sleep(0.01)
        current_publishers -= 1
        return True

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            for index in range(realtime_outbox.OUTBOX_MAX_CONCURRENCY + 3):
                await realtime_outbox.enqueue_realtime_event(
                    db,
                    channel=f"kresco:live:{index + 1}",
                    event_name="test.bounded",
                    payload={"index": index},
                )
            await db.commit()

        async with session_factory() as db:
            return await realtime_outbox.process_realtime_outbox(db, test_settings, retry_base_seconds=0)

    result = run_db(_case())

    assert result == {
        "claimed": realtime_outbox.OUTBOX_MAX_CONCURRENCY + 3,
        "published": realtime_outbox.OUTBOX_MAX_CONCURRENCY + 3,
        "retry": 0,
        "dead": 0,
    }
    assert max_publishers == realtime_outbox.OUTBOX_MAX_CONCURRENCY


def test_realtime_outbox_reclaims_only_stale_publishing_locks(run_db, monkeypatch, test_settings):
    now = datetime.now(timezone.utc)
    stale_locked_at = now - timedelta(seconds=realtime_outbox.OUTBOX_STALE_LOCK_SECONDS + 1)
    fresh_locked_at = now - timedelta(seconds=realtime_outbox.OUTBOX_STALE_LOCK_SECONDS - 1)
    future_available_at = now + timedelta(minutes=5)
    published_channels: list[str] = []

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        del settings, name, data, attempts, retry_delay_seconds, http_client
        published_channels.append(channel)
        return True

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            pending = RealtimeOutbox(
                channel="kresco:live:pending",
                event_name="pending.event",
                payload_json={},
                status=realtime_outbox.OUTBOX_PENDING,
                available_at=now,
            )
            retry_later = RealtimeOutbox(
                channel="kresco:live:retry-later",
                event_name="retry.later",
                payload_json={},
                status=realtime_outbox.OUTBOX_RETRY,
                available_at=future_available_at,
            )
            fresh_publishing = RealtimeOutbox(
                channel="kresco:live:fresh-publishing",
                event_name="fresh.publishing",
                payload_json={},
                status=realtime_outbox.OUTBOX_PUBLISHING,
                available_at=now,
                locked_at=fresh_locked_at,
                attempts=2,
            )
            stale_publishing = RealtimeOutbox(
                channel="kresco:live:stale-publishing",
                event_name="stale.publishing",
                payload_json={},
                status=realtime_outbox.OUTBOX_PUBLISHING,
                available_at=now,
                locked_at=stale_locked_at,
                attempts=2,
            )
            db.add_all([pending, retry_later, fresh_publishing, stale_publishing])
            await db.commit()
            row_ids = {
                "pending": pending.id,
                "retry_later": retry_later.id,
                "fresh_publishing": fresh_publishing.id,
                "stale_publishing": stale_publishing.id,
            }

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(
                db,
                test_settings,
                retry_base_seconds=0,
                now=now,
            )
            rows = {name: await db.get(RealtimeOutbox, row_id) for name, row_id in row_ids.items()}
            return result, rows

    result, rows = run_db(_case())

    assert result == {"claimed": 2, "published": 2, "retry": 0, "dead": 0}
    assert published_channels == ["kresco:live:pending", "kresco:live:stale-publishing"]
    assert rows["pending"].status == realtime_outbox.OUTBOX_PUBLISHED
    assert rows["pending"].attempts == 1
    assert rows["stale_publishing"].status == realtime_outbox.OUTBOX_PUBLISHED
    assert rows["stale_publishing"].attempts == 3
    assert rows["fresh_publishing"].status == realtime_outbox.OUTBOX_PUBLISHING
    assert rows["fresh_publishing"].attempts == 2
    assert rows["retry_later"].status == realtime_outbox.OUTBOX_RETRY
    assert rows["retry_later"].attempts == 0


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

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

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
    assert retry_row.last_error == "Firestore publish returned false"
    assert dead_row.status == realtime_outbox.OUTBOX_DEAD
    assert dead_row.locked_at is None
    assert "RuntimeError" in dead_row.last_error


def test_requeue_failed_realtime_outbox_resets_retryable_rows(run_db):
    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            pending = RealtimeOutbox(
                channel="kresco:user:1:notifications",
                event_name="pending.event",
                payload_json={},
                status=realtime_outbox.OUTBOX_PENDING,
            )
            published = RealtimeOutbox(
                channel="kresco:user:2:notifications",
                event_name="published.event",
                payload_json={},
                status=realtime_outbox.OUTBOX_PUBLISHED,
            )
            retry = RealtimeOutbox(
                channel="kresco:user:3:notifications",
                event_name="retry.event",
                payload_json={},
                status=realtime_outbox.OUTBOX_RETRY,
                attempts=5,
                locked_at=datetime.now(timezone.utc),
                last_error="temporary failure",
            )
            dead = RealtimeOutbox(
                channel="kresco:user:4:notifications",
                event_name="dead.event",
                payload_json={},
                status=realtime_outbox.OUTBOX_DEAD,
                attempts=8,
                locked_at=datetime.now(timezone.utc),
                last_error="old failure",
            )
            db.add_all([pending, published, retry, dead])
            await db.commit()

        async with session_factory() as db:
            result = await realtime_outbox.requeue_failed_realtime_outbox(db)
            rows = (await db.execute(select(RealtimeOutbox).order_by(RealtimeOutbox.id))).scalars().all()
            return result, rows

    result, rows = run_db(_case())

    assert result == {"requeued": 2}
    assert [row.status for row in rows] == [
        realtime_outbox.OUTBOX_PENDING,
        realtime_outbox.OUTBOX_PUBLISHED,
        realtime_outbox.OUTBOX_RETRY,
        realtime_outbox.OUTBOX_RETRY,
    ]
    assert rows[2].attempts == 0
    assert rows[2].locked_at is None
    assert rows[2].last_error == ""
    assert rows[3].attempts == 0
    assert rows[3].locked_at is None
    assert rows[3].last_error == ""


def test_purge_realtime_outbox_deletes_only_old_terminal_rows(run_db):
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=30)
    fresh = now - timedelta(days=1)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            rows = [
                RealtimeOutbox(
                    channel="kresco:user:1:notifications",
                    event_name="old.published",
                    payload_json={},
                    status=realtime_outbox.OUTBOX_PUBLISHED,
                    updated_at=old,
                ),
                RealtimeOutbox(
                    channel="kresco:user:2:notifications",
                    event_name="old.dead",
                    payload_json={},
                    status=realtime_outbox.OUTBOX_DEAD,
                    updated_at=old,
                ),
                RealtimeOutbox(
                    channel="kresco:user:3:notifications",
                    event_name="fresh.published",
                    payload_json={},
                    status=realtime_outbox.OUTBOX_PUBLISHED,
                    updated_at=fresh,
                ),
                RealtimeOutbox(
                    channel="kresco:user:4:notifications",
                    event_name="old.retry",
                    payload_json={},
                    status=realtime_outbox.OUTBOX_RETRY,
                    updated_at=old,
                ),
                RealtimeOutbox(
                    channel="kresco:user:5:notifications",
                    event_name="old.pending",
                    payload_json={},
                    status=realtime_outbox.OUTBOX_PENDING,
                    updated_at=old,
                ),
            ]
            db.add_all(rows)
            await db.commit()

        async with session_factory() as db:
            first = await realtime_outbox.purge_realtime_outbox(db, retention_days=14, limit=1, now=now)
        async with session_factory() as db:
            second = await realtime_outbox.purge_realtime_outbox(db, retention_days=14, limit=100, now=now)
        async with session_factory() as db:
            remaining = (await db.execute(select(RealtimeOutbox).order_by(RealtimeOutbox.event_name))).scalars().all()
            return first, second, remaining

    first, second, remaining = run_db(_case())

    assert first == {"purged": 1}
    assert second == {"purged": 1}
    assert [row.event_name for row in remaining] == ["fresh.published", "old.pending", "old.retry"]

