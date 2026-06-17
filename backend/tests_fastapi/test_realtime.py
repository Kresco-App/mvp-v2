import inspect
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete

from app import scheduled
from app.database import get_session_factory
from app.models.courses import Subject
from app.models.professor import CourseOffering, LiveSession, ProgramTrack, RealtimeOutbox
from app.models.users import User, UserSubjectEntitlement
from app.routers import realtime as realtime_router
from app.services import realtime_access
from app.services.auth import create_token
from app.services import realtime_outbox
from app.services.access import AccessContext


async def _seed_live_session_for_realtime(
    test_settings,
    *,
    student_tier: str = "vip",
    student_is_pro: bool = False,
    include_subject_entitlement: bool = True,
):
    suffix = uuid4().hex[:8]
    filiere = f"Sciences Math B {suffix}"
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"realtime-live-professor-{suffix}@example.com",
            full_name="Pr Realtime",
            role="professor",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"realtime-live-student-{suffix}@example.com",
            full_name="Realtime Student",
            role="student",
            tier=student_tier,
            is_pro=student_is_pro,
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        subject = Subject(title=f"Realtime Mathematics {suffix}", is_published=True)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, student, subject, track])
        await db.flush()
        offering = CourseOffering(subject_id=subject.id, track_id=track.id, professor_user_id=professor.id)
        db.add(offering)
        await db.flush()
        if include_subject_entitlement:
            db.add(UserSubjectEntitlement(
                user_id=student.id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
        live = LiveSession(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title="Realtime live",
            starts_at=datetime.now(timezone.utc) + timedelta(hours=1),
            ends_at=datetime.now(timezone.utc) + timedelta(hours=2),
            vdocipher_live_id="live_realtime",
        )
        db.add(live)
        await db.commit()
        return create_token(student.id, test_settings), live.id, offering.id


def test_realtime_subscriptions_require_authentication(app_client):
    response = app_client.get("/api/realtime/subscriptions")

    assert response.status_code == 401


def test_realtime_access_queries_stay_out_of_router():
    router_source = inspect.getsource(realtime_router)
    access_source = inspect.getsource(realtime_access)

    assert "build_realtime_subscriptions(" in inspect.getsource(realtime_router.get_realtime_subscriptions)
    assert "select(LiveSession.id)" not in router_source
    assert "select(CourseOffering.id)" not in router_source
    assert "build_access_context(" not in router_source
    assert "subject_scope_enforced" not in router_source
    assert "async def live_session_ids_for_user" in access_source
    assert "async def offering_ids_for_user" in access_source
    assert "subject_scope_enforced" in access_source
    assert "CourseOffering.subject_id.in_(access_context.active_subject_ids)" in access_source


def test_realtime_subscriptions_reuse_student_access_context_for_offering_queries(
    app_client,
    monkeypatch,
    run_db,
    test_settings,
):
    token, _live_id, _offering_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="vip"))
    original_build_access_context = realtime_access.build_access_context
    calls = {"count": 0}

    async def counted_build_access_context(db, user):
        calls["count"] += 1
        return await original_build_access_context(db, user)

    monkeypatch.setattr(realtime_access, "build_access_context", counted_build_access_context)
    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert calls["count"] == 1


def test_realtime_subscriptions_include_user_and_accessible_offering_channels(app_client, run_db, test_settings):
    token, _live_id, offering_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="vip"))

    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    channels = response.json()["notification_channels"]
    assert any(channel.startswith("kresco:user:") and channel.endswith(":notifications") for channel in channels)
    assert f"kresco:offering:{offering_id}:notifications" in channels


async def _seed_live_session_limit_scope_regression(test_settings):
    suffix = uuid4().hex[:8]
    filiere = f"Scoped Sciences {suffix}"
    now = datetime.now(timezone.utc)
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"realtime-scope-professor-{suffix}@example.com",
            full_name="Pr Scoped Realtime",
            role="professor",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"realtime-scope-student-{suffix}@example.com",
            full_name="Scoped Realtime Student",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        allowed_subject = Subject(title=f"Allowed Live {suffix}", is_published=True)
        locked_subject = Subject(title=f"Locked Live {suffix}", is_published=True)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, student, allowed_subject, locked_subject, track])
        await db.flush()

        allowed_offering = CourseOffering(
            subject_id=allowed_subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
        )
        locked_offering = CourseOffering(
            subject_id=locked_subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
        )
        db.add_all([allowed_offering, locked_offering])
        await db.flush()

        accessible_live = LiveSession(
            course_offering_id=allowed_offering.id,
            professor_user_id=professor.id,
            title="Accessible scoped live",
            starts_at=now + timedelta(hours=1),
            ends_at=now + timedelta(hours=2),
            vdocipher_live_id="live_allowed_scope",
        )
        db.add(accessible_live)
        db.add(UserSubjectEntitlement(
            user_id=student.id,
            subject_id=allowed_subject.id,
            starts_at=now - timedelta(days=1),
            source="test",
            status="active",
        ))
        await db.flush()

        locked_session_ids = []
        for index in range(101):
            live = LiveSession(
                course_offering_id=locked_offering.id,
                professor_user_id=professor.id,
                title=f"Locked scoped live {index}",
                starts_at=now + timedelta(hours=3, minutes=index),
                ends_at=now + timedelta(hours=4, minutes=index),
                vdocipher_live_id=f"live_locked_scope_{index}",
            )
            db.add(live)
            await db.flush()
            locked_session_ids.append(live.id)

        await db.commit()
        return create_token(student.id, test_settings), accessible_live.id, allowed_offering.id, locked_offering.id, locked_session_ids


def test_realtime_subscriptions_filter_subject_scope_before_offering_channels(app_client, run_db, test_settings):
    token, _accessible_live_id, allowed_offering_id, locked_offering_id, _locked_session_ids = run_db(
        _seed_live_session_limit_scope_regression(test_settings)
    )

    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    channels = response.json()["notification_channels"]
    assert f"kresco:offering:{allowed_offering_id}:notifications" in channels
    assert f"kresco:offering:{locked_offering_id}:notifications" not in channels


def test_realtime_outbox_processes_pending_events(run_db, monkeypatch, test_settings):
    published: list[tuple[str, str, dict, object]] = []

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        published.append((channel, name, data, http_client))
        return True

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            event = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:1:notifications",
                event_name="test.event",
                payload={"ok": True},
            )
            second = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:2:notifications",
                event_name="test.second",
                payload={"ok": "second"},
            )
            await db.commit()
            event_ids = [event.id, second.id]

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(db, test_settings, retry_base_seconds=0)
            stored = [
                await db.get(RealtimeOutbox, event_id)
                for event_id in event_ids
            ]
            return result, stored

    result, stored = run_db(_case())

    assert result == {"claimed": 2, "published": 2, "retry": 0, "dead": 0}
    assert all(row.status == realtime_outbox.OUTBOX_PUBLISHED for row in stored)
    assert all(row.published_at is not None for row in stored)
    assert [(channel, name, data) for channel, name, data, _ in published] == [
        ("kresco:user:1:notifications", "test.event", {"ok": True}),
        ("kresco:user:2:notifications", "test.second", {"ok": "second"}),
    ]
    assert len({id(http_client) for _, _, _, http_client in published}) == 1


def test_realtime_outbox_retries_and_dead_letters(run_db, monkeypatch, test_settings):
    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        return False

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            retry_event = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:2:notifications",
                event_name="retry.event",
                payload={"ok": False},
            )
            dead_event = RealtimeOutbox(
                channel="kresco:user:3:notifications",
                event_name="dead.event",
                payload_json={"ok": False},
                attempts=7,
            )
            db.add(dead_event)
            await db.commit()
            retry_id = retry_event.id
            dead_id = dead_event.id

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(
                db,
                test_settings,
                max_attempts=8,
                retry_base_seconds=0,
            )
            retry_row = await db.get(RealtimeOutbox, retry_id)
            dead_row = await db.get(RealtimeOutbox, dead_id)
            return result, retry_row, dead_row

    result, retry_row, dead_row = run_db(_case())

    assert result == {"claimed": 2, "published": 0, "retry": 1, "dead": 1}
    assert retry_row.status == realtime_outbox.OUTBOX_RETRY
    assert retry_row.attempts == 1
    assert dead_row.status == realtime_outbox.OUTBOX_DEAD
    assert dead_row.attempts == 8


def test_realtime_outbox_retries_unexpected_publish_exception(run_db, monkeypatch, test_settings):
    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        raise RuntimeError("unexpected publish failure")

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            event = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:4:notifications",
                event_name="exception.event",
                payload={"ok": False},
            )
            await db.commit()
            event_id = event.id

        async with session_factory() as db:
            result = await realtime_outbox.process_realtime_outbox(db, test_settings, retry_base_seconds=0)
            stored = await db.get(RealtimeOutbox, event_id)
            return result, stored

    result, stored = run_db(_case())

    assert result == {"claimed": 1, "published": 0, "retry": 1, "dead": 0}
    assert stored.status == realtime_outbox.OUTBOX_RETRY
    assert stored.locked_at is None
    assert "RuntimeError" in stored.last_error


def test_scheduled_realtime_outbox_event_drains_queue(app_client, run_db, monkeypatch, test_settings):
    del app_client
    published: list[str] = []

    async def fake_publish(settings, channel, name, data, *, attempts, retry_delay_seconds, http_client):
        del settings, name, data, attempts, retry_delay_seconds, http_client
        published.append(channel)
        return True

    monkeypatch.setattr(realtime_outbox, "publish_realtime_message", fake_publish)

    async def _case():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            first = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:offering:1:notifications",
                event_name="live.updated",
                payload={"id": 1},
            )
            second = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:live:1",
                event_name="checkpoint.created",
                payload={"id": 2},
            )
            third = await realtime_outbox.enqueue_realtime_event(
                db,
                channel="kresco:user:1:notifications",
                event_name="chat.message",
                payload={"id": 3},
            )
            await db.commit()
            event_ids = [first.id, second.id, third.id]

        result = await scheduled.process_realtime_outbox_once(
            {"detail": {"limit": "2", "retention_days": "14", "purge_limit": "3"}},
            settings=test_settings,
        )

        async with session_factory() as db:
            stored = [await db.get(RealtimeOutbox, event_id) for event_id in event_ids]
            return result, stored

    result, stored = run_db(_case())

    assert result == {"ok": True, "claimed": 2, "published": 2, "retry": 0, "dead": 0, "purged": 0}
    assert published == ["kresco:offering:1:notifications", "kresco:live:1"]
    assert [row.status for row in stored] == [
        realtime_outbox.OUTBOX_PUBLISHED,
        realtime_outbox.OUTBOX_PUBLISHED,
        realtime_outbox.OUTBOX_PENDING,
    ]


def test_scheduled_alembic_migration_event_runs_head(monkeypatch, test_settings):
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(scheduled, "get_settings", lambda: test_settings)
    monkeypatch.setattr(
        scheduled.command,
        "upgrade",
        lambda config, revision: calls.append((config.get_main_option("script_location"), revision)),
    )

    result = scheduled.run_alembic_migrations_event()

    assert result == {"ok": True, "revision": "head"}
    assert calls == [(str(scheduled.BACKEND_DIR / "alembic"), "head")]
    assert scheduled.os.environ["DATABASE_URL"] == test_settings.database_url
    assert scheduled.os.environ["PGSSLROOTCERT"] == test_settings.pgsslrootcert


def test_scheduled_database_initialization_uses_pool_settings(monkeypatch, test_settings):
    calls = []
    test_settings.database_pool_size = 3
    test_settings.database_max_overflow = 4
    test_settings.database_pool_timeout = 5

    def fake_init_engine(database_url, pgsslrootcert=None, **engine_kwargs):
        calls.append((database_url, pgsslrootcert, engine_kwargs))

    monkeypatch.setattr(scheduled, "init_engine", fake_init_engine)

    scheduled._init_scheduled_database(test_settings)

    assert calls == [
        (
            test_settings.database_url,
            test_settings.pgsslrootcert,
            {"pool_size": 3, "max_overflow": 4, "pool_timeout": 5},
        )
    ]


def test_scheduled_realtime_outbox_limit_parsing():
    assert scheduled._outbox_limit_from_event({}) == scheduled.DEFAULT_OUTBOX_LIMIT
    assert scheduled._outbox_limit_from_event({"limit": "7"}) == 7
    assert scheduled._outbox_limit_from_event({"detail": {"limit": 3}}) == 3
    assert scheduled._outbox_limit_from_event({"limit": "not-a-number"}) == scheduled.DEFAULT_OUTBOX_LIMIT
    assert scheduled._outbox_limit_from_event({"limit": 0}) == 1
    assert scheduled._outbox_limit_from_event({"limit": 9999}) == scheduled.MAX_OUTBOX_LIMIT
    assert scheduled._outbox_retention_days_from_event({}) == realtime_outbox.OUTBOX_DEFAULT_RETENTION_DAYS
    assert scheduled._outbox_retention_days_from_event({"retention_days": "9"}) == 9
    assert scheduled._outbox_retention_days_from_event({"detail": {"retention_days": 6}}) == 6
    assert scheduled._outbox_retention_days_from_event({"retention_days": "bad"}) == realtime_outbox.OUTBOX_DEFAULT_RETENTION_DAYS
    assert scheduled._outbox_retention_days_from_event({"retention_days": 0}) == 1
    assert scheduled._outbox_purge_limit_from_event({}) == scheduled.DEFAULT_OUTBOX_PURGE_LIMIT
    assert scheduled._outbox_purge_limit_from_event({"purge_limit": "7"}) == 7
    assert scheduled._outbox_purge_limit_from_event({"detail": {"purge_limit": 3}}) == 3
    assert scheduled._outbox_purge_limit_from_event({"purge_limit": "bad"}) == scheduled.DEFAULT_OUTBOX_PURGE_LIMIT
    assert scheduled._outbox_purge_limit_from_event({"purge_limit": 0}) == 1
    assert scheduled._outbox_purge_limit_from_event({"purge_limit": 9999}) == realtime_outbox.OUTBOX_MAX_PURGE_LIMIT


def test_internal_process_outbox_requires_worker_secret(app_client, monkeypatch, test_settings):
    async def fake_process(db, settings, *, limit):
        return {"claimed": limit, "published": 0, "retry": 0, "dead": 0}

    monkeypatch.setattr("app.routers.internal.process_realtime_outbox", fake_process)
    old_secret = test_settings.realtime_outbox_secret
    test_settings.realtime_outbox_secret = "test-internal-worker-secret-32-bytes"
    try:
        forbidden = app_client.post(
            "/api/internal/realtime/process-outbox",
            headers={"x-kresco-internal-secret": "wrong"},
        )
        ok = app_client.post(
            "/api/internal/realtime/process-outbox?limit=7",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        test_settings.realtime_outbox_secret = old_secret

    assert forbidden.status_code == 403
    assert ok.status_code == 200
    assert ok.json() == {"ok": True, "claimed": 7, "published": 0, "retry": 0, "dead": 0}


def test_internal_process_outbox_fails_closed_when_worker_secret_is_unconfigured(app_client, test_settings):
    old_secret = test_settings.realtime_outbox_secret
    test_settings.realtime_outbox_secret = "short"
    try:
        response = app_client.post(
            "/api/internal/realtime/process-outbox",
            headers={"x-kresco-internal-secret": "short"},
        )
    finally:
        test_settings.realtime_outbox_secret = old_secret

    assert response.status_code == 503
    assert response.json()["detail"] == "Internal worker secret is not configured"


def test_internal_requeue_failed_outbox_requires_worker_secret(app_client, monkeypatch, test_settings):
    async def fake_requeue(db, *, limit):
        return {"requeued": limit}

    monkeypatch.setattr("app.routers.internal.requeue_failed_realtime_outbox", fake_requeue)
    old_secret = test_settings.realtime_outbox_secret
    test_settings.realtime_outbox_secret = "test-internal-worker-secret-32-bytes"
    try:
        forbidden = app_client.post(
            "/api/internal/realtime/requeue-failed-outbox",
            headers={"x-kresco-internal-secret": "wrong"},
        )
        ok = app_client.post(
            "/api/internal/realtime/requeue-failed-outbox?limit=9",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        test_settings.realtime_outbox_secret = old_secret

    assert forbidden.status_code == 403
    assert ok.status_code == 200
    assert ok.json() == {"ok": True, "requeued": 9}


def test_internal_purge_outbox_requires_worker_secret(app_client, monkeypatch, test_settings):
    async def fake_purge(db, *, retention_days, limit):
        return {"purged": retention_days + limit}

    monkeypatch.setattr("app.routers.internal.purge_realtime_outbox", fake_purge)
    old_secret = test_settings.realtime_outbox_secret
    test_settings.realtime_outbox_secret = "test-internal-worker-secret-32-bytes"
    try:
        forbidden = app_client.post(
            "/api/internal/realtime/purge-outbox",
            headers={"x-kresco-internal-secret": "wrong"},
        )
        ok = app_client.post(
            "/api/internal/realtime/purge-outbox?retention_days=8&limit=9",
            headers={"x-kresco-internal-secret": test_settings.realtime_outbox_secret},
        )
    finally:
        test_settings.realtime_outbox_secret = old_secret

    assert forbidden.status_code == 403
    assert ok.status_code == 200
    assert ok.json() == {"ok": True, "purged": 17}


def test_realtime_subscriptions_omit_offering_channel_without_live_session_feature(app_client, run_db, test_settings):
    token, live_id, offering_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="basic"))
    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    channels = response.json()["notification_channels"]
    assert f"kresco:live:{live_id}" not in channels
    assert f"kresco:offering:{offering_id}:notifications" not in channels


def test_global_pro_realtime_subscriptions_include_unscoped_offering_channels(app_client, run_db, test_settings):
    token, live_id, offering_id = run_db(_seed_live_session_for_realtime(
        test_settings,
        student_tier="basic",
        student_is_pro=True,
        include_subject_entitlement=False,
    ))
    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    channels = response.json()["notification_channels"]
    assert f"kresco:live:{live_id}" not in channels
    assert f"kresco:offering:{offering_id}:notifications" in channels


def test_realtime_subscriptions_fail_closed_when_live_session_access_is_unscoped(
    app_client,
    monkeypatch,
    run_db,
    test_settings,
):
    token, live_id, offering_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="basic"))

    async def fake_unscoped_access_context(db, user):
        return AccessContext(
            user_id=user.id,
            effective_tier="basic",
            feature_keys=frozenset({"live_sessions"}),
            active_subject_ids=frozenset(),
            has_subject_entitlement_rows=False,
        )

    monkeypatch.setattr("app.services.realtime_access.build_access_context", fake_unscoped_access_context)
    response = app_client.get(
        "/api/realtime/subscriptions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    channels = response.json()["notification_channels"]
    assert f"kresco:live:{live_id}" not in channels
    assert f"kresco:offering:{offering_id}:notifications" not in channels

