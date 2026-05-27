import asyncio
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import jwt

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User, UserSubjectEntitlement
from app.services import ably
from app.services.auth import create_token


async def _seed_live_session_for_realtime(test_settings, *, student_tier: str = "vip"):
    suffix = uuid4().hex[:8]
    filiere = f"Sciences Math B {suffix}"
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"ably-live-professor-{suffix}@example.com",
            full_name="Pr Realtime",
            role="professor",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"ably-live-student-{suffix}@example.com",
            full_name="Realtime Student",
            role="student",
            tier=student_tier,
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
        return create_token(student.id, test_settings), live.id


def test_ably_token_requires_authentication(app_client):
    response = app_client.get("/api/realtime/ably-token")

    assert response.status_code == 401


def test_ably_token_returns_503_when_key_is_missing(app_client, auth_token, test_settings):
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = ""
    try:
        token, _ = auth_token(email="ably-missing@example.com")
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key

    assert response.status_code == 503
    assert "ABLY_API_KEY" in response.json()["detail"]


def test_ably_token_returns_user_scoped_jwt(app_client, auth_token, test_settings):
    old_key = test_settings.ably_api_key
    old_ttl = test_settings.ably_token_ttl_seconds
    test_settings.ably_api_key = "test.key:ably-test-secret"
    test_settings.ably_token_ttl_seconds = 600
    try:
        token, user_id = auth_token(email="ably-user@example.com")
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key
        test_settings.ably_token_ttl_seconds = old_ttl

    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == f"user:{user_id}"
    assert body["capability"] == {
        f"kresco:user:{user_id}:notifications": ["subscribe"],
        f"kresco:user:{user_id}:presence": ["presence"],
    }

    header = jwt.get_unverified_header(body["token"])
    assert header["kid"] == "test.key"
    decoded = jwt.decode(body["token"], "ably-test-secret", algorithms=["HS256"])
    assert decoded["x-ably-clientId"] == f"user:{user_id}"
    assert json.loads(decoded["x-ably-capability"]) == body["capability"]


def test_ably_token_includes_accessible_live_session_channel(app_client, run_db, test_settings):
    token, live_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="vip"))
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = "test.key:ably-test-secret"
    try:
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key

    assert response.status_code == 200
    assert response.json()["capability"][f"kresco:live:{live_id}"] == ["subscribe"]


async def _seed_live_session_limit_scope_regression(test_settings):
    suffix = uuid4().hex[:8]
    filiere = f"Scoped Sciences {suffix}"
    now = datetime.now(timezone.utc)
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"ably-scope-professor-{suffix}@example.com",
            full_name="Pr Scoped Realtime",
            role="professor",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"ably-scope-student-{suffix}@example.com",
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
        return create_token(student.id, test_settings), accessible_live.id, locked_session_ids


async def _seed_live_session_window_regression(test_settings):
    suffix = uuid4().hex[:8]
    filiere = f"Window Sciences {suffix}"
    now = datetime.now(timezone.utc)
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"ably-window-professor-{suffix}@example.com",
            full_name="Pr Window Realtime",
            role="professor",
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        student = User(
            email=f"ably-window-student-{suffix}@example.com",
            full_name="Window Realtime Student",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        subject = Subject(title=f"Window Live {suffix}", is_published=True)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, student, subject, track])
        await db.flush()

        offering = CourseOffering(
            subject_id=subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
        )
        db.add(offering)
        await db.flush()
        db.add(UserSubjectEntitlement(
            user_id=student.id,
            subject_id=subject.id,
            starts_at=now - timedelta(days=1),
            source="test",
            status="active",
        ))

        active_live = LiveSession(
            course_offering_id=offering.id,
            professor_user_id=professor.id,
            title="Active token live",
            starts_at=now + timedelta(hours=1),
            ends_at=now + timedelta(hours=2),
            status="scheduled",
            vdocipher_live_id="live_active_window",
        )
        db.add(active_live)
        await db.flush()

        excluded_sessions = []
        for title, starts_at, ends_at, status in [
            ("Past scheduled live", now - timedelta(days=2), now - timedelta(days=2) + timedelta(hours=1), "scheduled"),
            ("Completed live", now - timedelta(hours=2), now + timedelta(hours=1), "completed"),
            ("Cancelled live", now + timedelta(hours=1), now + timedelta(hours=2), "cancelled"),
            ("Far future live", now + timedelta(days=30), now + timedelta(days=30, hours=1), "scheduled"),
        ]:
            live = LiveSession(
                course_offering_id=offering.id,
                professor_user_id=professor.id,
                title=title,
                starts_at=starts_at,
                ends_at=ends_at,
                status=status,
                vdocipher_live_id=f"live_{uuid4().hex[:8]}",
            )
            db.add(live)
            await db.flush()
            excluded_sessions.append(live.id)

        await db.commit()
        return create_token(student.id, test_settings), active_live.id, excluded_sessions


def test_ably_token_filters_subject_scope_before_live_session_limit(app_client, run_db, test_settings):
    token, accessible_live_id, locked_session_ids = run_db(_seed_live_session_limit_scope_regression(test_settings))
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = "test.key:ably-test-secret"
    try:
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key

    assert response.status_code == 200
    capability = response.json()["capability"]
    assert capability[f"kresco:live:{accessible_live_id}"] == ["subscribe"]
    assert not any(f"kresco:live:{live_id}" in capability for live_id in locked_session_ids)


def test_ably_token_filters_inactive_and_far_future_live_sessions(app_client, run_db, test_settings):
    token, active_live_id, excluded_session_ids = run_db(_seed_live_session_window_regression(test_settings))
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = "test.key:ably-test-secret"
    try:
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key

    assert response.status_code == 200
    capability = response.json()["capability"]
    assert capability[f"kresco:live:{active_live_id}"] == ["subscribe"]
    assert not any(f"kresco:live:{live_id}" in capability for live_id in excluded_session_ids)


def test_publish_ably_message_retries_then_succeeds(monkeypatch, test_settings):
    class FakeAsyncClient:
        calls = 0

        def __init__(self, *, timeout: int):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, *, auth: tuple[str, str], json: dict):
            self.__class__.calls += 1
            if self.__class__.calls == 1:
                return httpx.Response(503, request=httpx.Request("POST", url), json={"error": "temporary"})
            return httpx.Response(201, request=httpx.Request("POST", url), json={})

    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = "test.key:ably-test-secret"
    monkeypatch.setattr(ably.httpx, "AsyncClient", FakeAsyncClient)
    try:
        result = asyncio.run(
            ably.publish_ably_message(
                test_settings,
                "kresco:user:1:notifications",
                "test.event",
                {"ok": True},
                attempts=2,
                retry_delay_seconds=0,
            )
        )
    finally:
        test_settings.ably_api_key = old_key

    assert result is True
    assert FakeAsyncClient.calls == 2


def test_publish_ably_message_returns_false_when_unconfigured(test_settings):
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = ""
    try:
        result = asyncio.run(
            ably.publish_ably_message(
                test_settings,
                "kresco:user:1:notifications",
                "test.event",
                {"ok": True},
                retry_delay_seconds=0,
            )
        )
    finally:
        test_settings.ably_api_key = old_key

    assert result is False


def test_ably_token_omits_live_session_channel_without_live_session_feature(app_client, run_db, test_settings):
    token, live_id = run_db(_seed_live_session_for_realtime(test_settings, student_tier="basic"))
    old_key = test_settings.ably_api_key
    test_settings.ably_api_key = "test.key:ably-test-secret"
    try:
        response = app_client.get(
            "/api/realtime/ably-token",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.ably_api_key = old_key

    assert response.status_code == 200
    assert f"kresco:live:{live_id}" not in response.json()["capability"]
