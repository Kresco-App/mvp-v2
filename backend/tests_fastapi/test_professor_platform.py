import inspect
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.routers.professor as professor_router
import app.routers.courses as courses_router
import app.services.professor_audit as professor_audit
import app.services.professor_chat_mutations as professor_chat_mutations
import app.services.professor_change_requests as professor_change_requests
import app.services.professor_change_request_targets as professor_change_request_targets
import app.services.professor_live_interactions as professor_live_interactions
import app.services.professor_live_sessions as professor_live_sessions
import app.services.professor_queries as professor_queries
import app.services.professor_serializers as professor_serializers
from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.notifications import Notification
from app.models.professor import CourseOffering, LiveSession, ProfessorChangeRequest, ProfessorChatConversation, ProfessorChatMessage, ProgramTrack, RealtimeOutbox
from app.models.users import User, UserSubjectEntitlement
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME, create_token
from app.services.media_storage import LocalMediaStorage


def _utc_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


async def _seed_professor_platform(test_settings):
    suffix = uuid4().hex[:8]
    filiere = f"Sciences Math B {suffix}"
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"professor-platform-{suffix}@example.com",
            full_name="Pr Ahmed",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
        )
        other_professor = User(
            email=f"other-professor-platform-{suffix}@example.com",
            full_name="Pr Other",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
        )
        vip_student = User(
            email=f"vip-student-platform-{suffix}@example.com",
            full_name="VIP Student",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
        )
        basic_student = User(
            email=f"basic-student-platform-{suffix}@example.com",
            full_name="Basic Student",
            role="student",
            tier="basic",
            niveau="2BAC",
            filiere=filiere,
            is_active=True,
            is_email_verified=True,
        )
        wrong_track_student = User(
            email=f"wrong-track-platform-{suffix}@example.com",
            full_name="Wrong Track",
            role="student",
            tier="vip",
            niveau="2BAC",
            filiere="Sciences Physiques",
            is_active=True,
            is_email_verified=True,
        )
        subject = Subject(title=f"Mathematics {suffix}", description="", is_published=True, order=1)
        physics = Subject(title=f"Physics {suffix}", description="", is_published=True, order=2)
        chemistry = Subject(title=f"Chemistry {suffix}", description="", is_published=True, order=3)
        track = ProgramTrack(niveau="2BAC", filiere=filiere, title=f"2BAC {filiere}")
        db.add_all([professor, other_professor, vip_student, basic_student, wrong_track_student, subject, physics, chemistry, track])
        await db.flush()
        offering = CourseOffering(
            subject_id=subject.id,
            track_id=track.id,
            professor_user_id=professor.id,
            title=f"Mathematics - 2BAC {filiere}",
        )
        second_offering = CourseOffering(
            subject_id=physics.id,
            track_id=track.id,
            professor_user_id=professor.id,
            title=f"Physics - 2BAC {filiere}",
        )
        other_professor_offering = CourseOffering(
            subject_id=chemistry.id,
            track_id=track.id,
            professor_user_id=other_professor.id,
            title=f"Chemistry - 2BAC {filiere}",
        )
        db.add_all([offering, second_offering, other_professor_offering])
        await db.flush()
        db.add(UserSubjectEntitlement(
            user_id=vip_student.id,
            subject_id=subject.id,
            starts_at=datetime.now(timezone.utc) - timedelta(days=1),
            source="test",
            status="active",
        ))
        topic = Topic(
            subject_id=subject.id,
            course_offering_id=offering.id,
            slug=f"professor-platform-limits-{suffix}",
            title="Limits and Continuity",
            status="published",
            order=1,
        )
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
        db.add(section)
        await db.flush()
        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            title="Continuity at a point",
            item_type="video",
            order=1,
            status="published",
        )
        db.add(item)
        await db.commit()
        return {
            "professor_token": create_token(professor.id, test_settings),
            "professor_id": professor.id,
            "other_professor_token": create_token(other_professor.id, test_settings),
            "other_professor_id": other_professor.id,
            "vip_student_token": create_token(vip_student.id, test_settings),
            "vip_student_id": vip_student.id,
            "basic_student_token": create_token(basic_student.id, test_settings),
            "basic_student_id": basic_student.id,
            "wrong_track_student_token": create_token(wrong_track_student.id, test_settings),
            "wrong_track_student_id": wrong_track_student.id,
            "offering_id": offering.id,
            "second_offering_id": second_offering.id,
            "other_professor_offering_id": other_professor_offering.id,
            "second_subject_id": physics.id,
            "filiere": filiere,
            "topic_id": topic.id,
            "item_id": item.id,
        }


async def _seed_unassigned_professor(test_settings):
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        professor = User(
            email=f"unassigned-professor-{suffix}@example.com",
            full_name="Pr Unassigned",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
        )
        db.add(professor)
        await db.commit()
        await db.refresh(professor)
        return {
            "email": professor.email,
            "token": create_token(professor.id, test_settings),
        }


async def _audit_log_for(model_name: str, object_pk: int | str) -> AdminAuditLog | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog)
            .where(
                AdminAuditLog.model_name == model_name,
                AdminAuditLog.object_pk == str(object_pk),
            )
            .order_by(AdminAuditLog.id.desc())
        )
        return result.scalars().first()


def _install_cookie_session(app_client, test_settings, user_id: int, *, with_csrf: bool) -> str:
    app_client.cookies.set(AUTH_COOKIE_NAME, create_token(user_id, test_settings))
    if not with_csrf:
        app_client.cookies.set(CSRF_COOKIE_NAME, "")
        return ""

    csrf_token = csrf_token_for_user(SimpleNamespace(id=user_id, auth_token_version=0), test_settings)
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    return csrf_token


def _local_media_path(root: Path, url: str) -> Path:
    return root.joinpath(*url.removeprefix("/media/").split("/"))


def test_professor_dashboard_requires_professor_and_returns_scope(app_client, query_counter, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    basic_response = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert basic_response.status_code == 403

    with query_counter() as queries:
        response = app_client.get(
            "/api/professor/dashboard",
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )
    assert response.status_code == 200
    assert queries.count <= 9, queries.statements
    body = response.json()
    assert body["active_offering"]["id"] == seeded["offering_id"]
    assert body["active_offering"]["track"]["filiere"] == seeded["filiere"]

    offerings = app_client.get(
        "/api/professor/offerings?limit=1&offset=1",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert offerings.status_code == 200
    assert [item["id"] for item in offerings.json()] == [seeded["second_offering_id"]]

    invalid_offerings_limit = app_client.get(
        "/api/professor/offerings?limit=101",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid_offerings_limit.status_code == 422


def test_professor_dashboard_reads_projected_unread_chat_count(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    async def _seed_unread_conversation():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = ProfessorChatConversation(
                course_offering_id=seeded["offering_id"],
                professor_user_id=seeded["professor_id"],
                student_user_id=seeded["vip_student_id"],
                unread_for_professor=4,
                last_message_preview="Four unread messages",
                last_message_at=datetime.now(timezone.utc),
            )
            db.add(conversation)
            professor = await db.get(User, seeded["professor_id"])
            professor.professor_unread_chat_count = 4
            await db.commit()

    run_db(_seed_unread_conversation())

    response = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )

    assert response.status_code == 200
    assert response.json()["chat_unread_count"] == 4


def test_professor_dashboard_uses_unread_projection_instead_of_conversation_sum():
    source = inspect.getsource(professor_queries.professor_dashboard)

    assert "professor_unread_chat_count" in source
    assert "sum(ProfessorChatConversation.unread_for_professor)" not in source


def test_professor_requires_active_offering_for_login_and_area(app_client, run_db, test_settings, monkeypatch):
    seeded = run_db(_seed_unassigned_professor(test_settings))
    monkeypatch.setattr(
        "app.routers.users.verify_firebase_token",
        lambda *_: {
            "email": seeded["email"],
            "email_verified": True,
            "firebase_uid": "unassigned-professor-firebase-uid",
            "provider": "password",
            "google_id": None,
            "name": "Unassigned Professor",
            "picture": "",
        },
    )

    login = app_client.post(
        "/api/auth/firebase-session",
        json={"credential": "unassigned-professor-firebase-token"},
    )
    assert login.status_code == 403
    assert login.json()["detail"] == "Active course offering assignment required"
    assert "access_token" not in login.text

    dashboard = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['token']}"},
    )
    assert dashboard.status_code == 403
    assert dashboard.json()["detail"] == "Active course offering assignment required"


def test_student_live_sessions_hide_inactive_course_offerings(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "course_offering_id": seeded["offering_id"],
        "title": "Archived offering live",
        "description": "Should not remain student-visible",
        "starts_at": starts_at.isoformat(),
        "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
        "join_url": "https://live.example/archived",
        "vdocipher_live_id": "live_archived",
    }
    created = app_client.post(
        "/api/professor/live-sessions",
        json=payload,
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]
    started = app_client.post(
        f"/api/professor/live-sessions/{live_id}/start",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert started.status_code == 200

    async def _archive_offering():
        session_factory = get_session_factory()
        async with session_factory() as db:
            offering = await db.get(CourseOffering, seeded["offering_id"])
            offering.status = "archived"
            await db.commit()

    run_db(_archive_offering())

    student_sessions = app_client.get(
        "/api/professor/student-live-sessions",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_sessions.status_code == 200
    assert all(session["id"] != live_id for session in student_sessions.json())

    student_embed = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_embed.status_code == 404
    assert student_embed.json()["detail"] == "Live session not found"


def test_student_live_sessions_hide_inactive_program_tracks(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "course_offering_id": seeded["offering_id"],
        "title": "Inactive track live",
        "description": "Should not remain student-visible",
        "starts_at": starts_at.isoformat(),
        "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
        "join_url": "https://live.example/inactive-track",
        "vdocipher_live_id": "live_inactive_track",
    }
    created = app_client.post(
        "/api/professor/live-sessions",
        json=payload,
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]

    async def _deactivate_track():
        session_factory = get_session_factory()
        async with session_factory() as db:
            offering = await db.get(CourseOffering, seeded["offering_id"])
            track = await db.get(ProgramTrack, offering.track_id)
            track.status = "inactive"
            await db.commit()

    run_db(_deactivate_track())

    student_sessions = app_client.get(
        "/api/professor/student-live-sessions",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_sessions.status_code == 200
    assert all(session["id"] != live_id for session in student_sessions.json())

    student_embed = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_embed.status_code == 404
    assert student_embed.json()["detail"] == "Live session not found"


def test_student_live_sessions_filter_subject_scope_before_pagination(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    now = datetime.now(timezone.utc)
    locked_payload = {
        "course_offering_id": seeded["second_offering_id"],
        "title": "Locked newer live",
        "description": "Should be filtered before pagination",
        "starts_at": (now + timedelta(hours=3)).isoformat(),
        "ends_at": (now + timedelta(hours=4)).isoformat(),
        "join_url": "https://live.example/locked-newer",
        "vdocipher_live_id": "live_locked_newer",
    }
    allowed_payload = {
        "course_offering_id": seeded["offering_id"],
        "title": "Allowed older live",
        "description": "Should survive limit one",
        "starts_at": (now + timedelta(hours=2)).isoformat(),
        "ends_at": (now + timedelta(hours=3)).isoformat(),
        "join_url": "https://live.example/allowed-older",
        "vdocipher_live_id": "live_allowed_older",
    }
    locked = app_client.post(
        "/api/professor/live-sessions",
        json=locked_payload,
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    allowed = app_client.post(
        "/api/professor/live-sessions",
        json=allowed_payload,
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert locked.status_code == 201
    assert allowed.status_code == 201

    response = app_client.get(
        "/api/professor/student-live-sessions?limit=1&offset=0",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )

    assert response.status_code == 200
    ids = [session["id"] for session in response.json()]
    assert ids == [allowed.json()["id"]]
    assert locked.json()["id"] not in ids


def test_professor_live_sessions_are_scoped_to_owned_offering(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "course_offering_id": seeded["offering_id"],
        "title": "Limits live correction",
        "description": "Bac-focused correction",
        "starts_at": starts_at.isoformat(),
        "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
        "join_url": "https://live.example/session",
        "vdocipher_live_id": "live_123",
    }

    forbidden = app_client.post(
        "/api/professor/live-sessions",
        json=payload,
        headers={"Authorization": f"Bearer {seeded['other_professor_token']}"},
    )
    assert forbidden.status_code == 404

    provider_config = app_client.get(
        "/api/professor/live-provider-config",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert provider_config.status_code == 200
    assert provider_config.json()["can_auto_create"] is False
    assert "VDOCIPHER_LIVE_CREATE_URL" in provider_config.json()["missing"]

    auto_create_missing_config = app_client.post(
        "/api/professor/live-sessions",
        json={**payload, "vdocipher_live_id": "", "auto_create_vdocipher": True},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert auto_create_missing_config.status_code == 501

    created = app_client.post(
        "/api/professor/live-sessions",
        json=payload,
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]
    assert created.json()["join_url"] == "https://live.example/session"
    assert created.json()["has_stream_credentials"] is False
    assert "stream_ingest_url" not in created.json()
    assert "stream_key" not in created.json()
    audit = run_db(_audit_log_for("LiveSession", live_id))
    assert audit is not None
    assert audit.action == "professor_create"
    assert audit.request_path == "/api/professor/live-sessions"
    assert audit.changed_data["course_offering_id"] == seeded["offering_id"]

    professor_sessions = app_client.get(
        "/api/professor/live-sessions?limit=1&offset=0",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_sessions.status_code == 200
    assert len(professor_sessions.json()) == 1
    assert professor_sessions.json()[0]["has_stream_credentials"] is False
    assert "stream_ingest_url" not in professor_sessions.json()[0]
    assert "stream_key" not in professor_sessions.json()[0]

    invalid_professor_sessions = app_client.get(
        "/api/professor/live-sessions?limit=0",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid_professor_sessions.status_code == 422

    async def _calendar_event_id():
        session_factory = get_session_factory()
        async with session_factory() as db:
            live = await db.get(LiveSession, live_id)
            return live.calendar_event_id if live else None

    calendar_event_id = run_db(_calendar_event_id())

    professor_embed = app_client.get(
        f"/api/professor/live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_embed.status_code == 200
    assert professor_embed.json()["embed_url"] == "https://player.vdocipher.com/live-v2?liveId=live_123"
    assert professor_embed.json()["chat_embed_url"] == ""

    calendar = app_client.get(
        f"/api/calendar/events?start={starts_at.date().isoformat()}&end={starts_at.date().isoformat()}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert calendar.status_code == 200
    assert any(event["title"] == "Limits live correction" for event in calendar.json())

    wrong_track_calendar = app_client.get(
        f"/api/calendar/events?start={starts_at.date().isoformat()}&end={starts_at.date().isoformat()}",
        headers={"Authorization": f"Bearer {seeded['wrong_track_student_token']}"},
    )
    assert wrong_track_calendar.status_code == 200
    assert all(event["title"] != "Limits live correction" for event in wrong_track_calendar.json())

    student_sessions = app_client.get(
        "/api/professor/student-live-sessions",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_sessions.status_code == 200
    student_live = next(session for session in student_sessions.json() if session["id"] == live_id)
    assert student_live["can_join"] is False
    assert "stream_key" not in student_live
    assert "stream_ingest_url" not in student_live

    paged_student_sessions = app_client.get(
        "/api/professor/student-live-sessions?limit=1&offset=0",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert paged_student_sessions.status_code == 200
    assert len(paged_student_sessions.json()) <= 1

    basic_student_sessions = app_client.get(
        "/api/professor/student-live-sessions",
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert basic_student_sessions.status_code == 200
    assert all(session["id"] != live_id for session in basic_student_sessions.json())

    student_embed_before_start = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_embed_before_start.status_code == 409
    assert student_embed_before_start.json()["detail"] == "Live session is not joinable"

    wrong_track_embed = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['wrong_track_student_token']}"},
    )
    assert wrong_track_embed.status_code == 404

    started = app_client.post(
        f"/api/professor/live-sessions/{live_id}/start",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert started.status_code == 200
    assert started.json()["status"] == "live"

    student_sessions_after_start = app_client.get(
        "/api/professor/student-live-sessions",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_sessions_after_start.status_code == 200
    assert any(session["id"] == live_id and session["can_join"] for session in student_sessions_after_start.json())

    student_embed = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/embed",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_embed.status_code == 200
    assert student_embed.json()["embed_url"] == "https://player.vdocipher.com/live-v2?liveId=live_123"
    assert student_embed.json()["chat_embed_url"] == ""

    question = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "question", "body": "Can you repeat the derivative step?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert question.status_code == 201
    interaction_id = question.json()["id"]
    assert question.json()["status"] == "pending"
    assert question.json()["student_name"] == "VIP Student"

    message = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "The audio is clear now."},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert message.status_code == 201
    message_id = message.json()["id"]
    assert message.json()["kind"] == "message"

    professor_interactions = app_client.get(
        f"/api/professor/live-sessions/{live_id}/interactions",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_interactions.status_code == 200
    assert {item["id"] for item in professor_interactions.json()} >= {interaction_id, message_id}

    professor_questions = app_client.get(
        f"/api/professor/live-sessions/{live_id}/interactions?kind=question&limit=20",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_questions.status_code == 200
    assert all(item["kind"] == "question" for item in professor_questions.json())

    answered = app_client.patch(
        f"/api/professor/live-sessions/interactions/{interaction_id}",
        json={"answer": "Use the product rule before substituting."},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert answered.status_code == 200
    assert answered.json()["status"] == "answered"
    assert answered.json()["answer"] == "Use the product rule before substituting."

    student_interactions = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_interactions.status_code == 200
    assert any(item["id"] == interaction_id and item["status"] == "answered" for item in student_interactions.json())

    student_messages = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/interactions?kind=message",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_messages.status_code == 200
    assert any(item["id"] == message_id for item in student_messages.json())
    assert all(item["kind"] == "message" for item in student_messages.json())

    basic_student_messages = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/interactions?kind=message",
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert basic_student_messages.status_code == 403
    assert basic_student_messages.json()["detail"] == "feature_required:live_sessions"

    hidden_message = app_client.patch(
        f"/api/professor/live-sessions/interactions/{message_id}",
        json={"status": "hidden"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert hidden_message.status_code == 200
    assert hidden_message.json()["status"] == "hidden"

    student_messages_after_hide = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/interactions?kind=message",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_messages_after_hide.status_code == 200
    assert all(item["id"] != message_id for item in student_messages_after_hide.json())

    hidden = app_client.delete(
        f"/api/professor/live-sessions/interactions/{interaction_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert hidden.status_code == 200
    assert hidden.json()["status"] == "deleted"

    deleted_message = app_client.delete(
        f"/api/professor/live-sessions/interactions/{message_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert deleted_message.status_code == 200
    assert deleted_message.json()["status"] == "deleted"

    checkpoint = app_client.post(
        f"/api/professor/live-sessions/{live_id}/checkpoints",
        json={"title": "Quick checkpoint", "prompt": "Answer this after the proof.", "checkpoint_type": "prompt"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert checkpoint.status_code == 201
    checkpoint_id = checkpoint.json()["id"]
    assert checkpoint.json()["status"] == "active"

    student_checkpoints = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/checkpoints",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_checkpoints.status_code == 200
    assert student_checkpoints.json()[0]["id"] == checkpoint_id

    closed_checkpoint = app_client.patch(
        f"/api/professor/live-sessions/checkpoints/{checkpoint_id}",
        json={"status": "closed"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert closed_checkpoint.status_code == 200
    assert closed_checkpoint.json()["status"] == "closed"

    deleted_checkpoint = app_client.patch(
        f"/api/professor/live-sessions/checkpoints/{checkpoint_id}",
        json={"status": "deleted"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert deleted_checkpoint.status_code == 200
    assert deleted_checkpoint.json()["status"] == "deleted"

    student_checkpoints_after_delete = app_client.get(
        f"/api/professor/student-live-sessions/{live_id}/checkpoints",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_checkpoints_after_delete.status_code == 200
    assert all(item["id"] != checkpoint_id for item in student_checkpoints_after_delete.json())

    notifications = app_client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert notifications.status_code == 200
    assert notifications.json()["unread_count"] >= 1
    assert notifications.json()["notifications"][0]["type"] == "live_session"

    read_all = app_client.post(
        "/api/notifications/read-all",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert read_all.status_code == 200

    first_notification_id = notifications.json()["notifications"][0]["id"]
    deleted_notification = app_client.delete(
        f"/api/notifications/{first_notification_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted_notification.status_code == 200

    after_delete = app_client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert all(item["id"] != first_notification_id for item in after_delete.json()["notifications"])

    confirmation = app_client.get(
        "/api/notifications/delete-all-confirmation",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert confirmation.status_code == 200

    deleted_all_notifications = app_client.delete(
        f"/api/notifications?confirmation_token={confirmation.json()['confirmation_token']}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted_all_notifications.status_code == 200

    after_delete_all = app_client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert after_delete_all.json() == {"notifications": [], "unread_count": 0}

    ended = app_client.post(
        f"/api/professor/live-sessions/{live_id}/end",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert ended.status_code == 200
    assert ended.json()["status"] == "completed"

    late_question = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "question", "body": "Can I still ask after the live?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert late_question.status_code == 409
    assert late_question.json()["detail"] == "Live session is not accepting messages"

    deleted = app_client.delete(
        f"/api/professor/live-sessions/{live_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    async def _deleted_calendar_status():
        session_factory = get_session_factory()
        async with session_factory() as db:
            event = await db.get(CalendarEvent, calendar_event_id)
            return event.status if event else None

    assert run_db(_deleted_calendar_status()) == "cancelled"


def test_cookie_live_and_chat_mutations_require_and_accept_csrf(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    origin = "http://localhost:3000"
    live_payload = {
        "course_offering_id": seeded["offering_id"],
        "title": "Cookie CSRF live",
        "description": "",
        "starts_at": starts_at.isoformat(),
        "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
        "vdocipher_live_id": "live_cookie_csrf",
        "stream_ingest_url": "rtmp://cookie.example/live",
        "stream_key": "cookie-key",
    }

    _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=False)
    missing_live_create = app_client.post(
        "/api/professor/live-sessions",
        json=live_payload,
        headers={"Origin": origin},
    )
    assert missing_live_create.status_code == 403

    professor_csrf = _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=True)
    created_live = app_client.post(
        "/api/professor/live-sessions",
        json=live_payload,
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert created_live.status_code == 201
    live_id = created_live.json()["id"]

    _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=False)
    missing_live_update = app_client.patch(
        f"/api/professor/live-sessions/{live_id}",
        json={"title": "Should not persist"},
        headers={"Origin": origin},
    )
    assert missing_live_update.status_code == 403

    professor_csrf = _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=True)
    updated_live = app_client.patch(
        f"/api/professor/live-sessions/{live_id}",
        json={"title": "Cookie CSRF live updated"},
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert updated_live.status_code == 200
    assert updated_live.json()["title"] == "Cookie CSRF live updated"

    _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=False)
    missing_reveal = app_client.post(
        f"/api/professor/live-sessions/{live_id}/stream-credentials/reveal",
        headers={"Origin": origin},
    )
    assert missing_reveal.status_code == 403

    professor_csrf = _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=True)
    revealed = app_client.post(
        f"/api/professor/live-sessions/{live_id}/stream-credentials/reveal",
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert revealed.status_code == 200
    assert revealed.json()["stream_key"] == "cookie-key"

    started = app_client.post(
        f"/api/professor/live-sessions/{live_id}/start",
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert started.status_code == 200

    _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=False)
    missing_live_interaction = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "Missing CSRF"},
        headers={"Origin": origin},
    )
    assert missing_live_interaction.status_code == 403

    student_csrf = _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=True)
    live_interaction = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "CSRF accepted"},
        headers={"Origin": origin, CSRF_HEADER_NAME: student_csrf},
    )
    assert live_interaction.status_code == 201

    _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=False)
    missing_conversation = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Missing CSRF"},
        headers={"Origin": origin},
    )
    assert missing_conversation.status_code == 403

    student_csrf = _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=True)
    conversation = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "CSRF accepted"},
        headers={"Origin": origin, CSRF_HEADER_NAME: student_csrf},
    )
    assert conversation.status_code == 201
    conversation_id = conversation.json()["id"]

    _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=False)
    missing_student_message = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        json={"body": "Missing CSRF"},
        headers={"Origin": origin},
    )
    assert missing_student_message.status_code == 403

    student_csrf = _install_cookie_session(app_client, test_settings, seeded["vip_student_id"], with_csrf=True)
    student_message = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        json={"body": "CSRF accepted message"},
        headers={"Origin": origin, CSRF_HEADER_NAME: student_csrf},
    )
    assert student_message.status_code == 201

    _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=False)
    missing_professor_message = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        json={"body": "Missing CSRF"},
        headers={"Origin": origin},
    )
    assert missing_professor_message.status_code == 403

    professor_csrf = _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=True)
    professor_message = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        json={"body": "CSRF accepted reply"},
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert professor_message.status_code == 201

    _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=False)
    missing_professor_image = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/images",
        data={"body": "Missing CSRF"},
        files={"file": ("work.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
        headers={"Origin": origin},
    )
    assert missing_professor_image.status_code == 403

    professor_csrf = _install_cookie_session(app_client, test_settings, seeded["professor_id"], with_csrf=True)
    professor_image = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/images",
        data={"body": "CSRF accepted image"},
        files={"file": ("work.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
        headers={"Origin": origin, CSRF_HEADER_NAME: professor_csrf},
    )
    assert professor_image.status_code == 201
    assert professor_image.json()["attachment_mime_type"] == "image/png"


def test_professor_live_session_can_be_generated_from_provider(app_client, run_db, test_settings, monkeypatch):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)

    async def fake_create_live_stream(title, settings, *, chat_mode="off"):
        assert title == "Generated live"
        assert chat_mode == "off"
        return {
            "live_id": "generated_live_123",
            "stream_ingest_url": "rtmp://ingest.example/live",
            "stream_key": "secret-stream-key",
            "raw": {"liveId": "generated_live_123", "streamUrl": "rtmp://ingest.example/live", "streamKey": "secret-stream-key"},
        }

    monkeypatch.setattr(professor_live_sessions, "create_live_stream", fake_create_live_stream)

    created = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Generated live",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "",
            "auto_create_vdocipher": True,
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["vdocipher_live_id"] == "generated_live_123"
    assert body["has_stream_credentials"] is True
    assert "stream_ingest_url" not in body
    assert "stream_key" not in body

    revealed = app_client.post(
        f"/api/professor/live-sessions/{body['id']}/stream-credentials/reveal",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert revealed.status_code == 200
    assert revealed.headers["cache-control"] == "no-store"
    assert revealed.headers["pragma"] == "no-cache"
    assert revealed.json()["stream_ingest_url"] == "rtmp://ingest.example/live"
    assert revealed.json()["stream_key"] == "secret-stream-key"
    audit = run_db(_audit_log_for("LiveSessionStreamCredentials", body["id"]))
    assert audit is not None
    assert audit.action == "professor_reveal"
    assert audit.request_path == f"/api/professor/live-sessions/{body['id']}/stream-credentials/reveal"
    assert audit.changed_data == {
        "live_session_id": body["id"],
        "has_stream_ingest_url": True,
        "has_stream_key": True,
    }

    async def _provider_payload():
        session_factory = get_session_factory()
        async with session_factory() as db:
            live = await db.get(LiveSession, body["id"])
            return live.provider_payload_json if live else None

    assert run_db(_provider_payload()) == {
        "liveId": "generated_live_123",
        "streamUrl": "rtmp://ingest.example/live",
        "streamKey": "[redacted]",
    }


def test_professor_live_session_generation_failure_does_not_create_session(app_client, run_db, test_settings, monkeypatch):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)

    async def fake_create_live_stream(title, settings, *, chat_mode="anonymous"):
        del title, settings, chat_mode
        raise HTTPException(status_code=502, detail="Failed to create VdoCipher live stream")

    monkeypatch.setattr(professor_live_sessions, "create_live_stream", fake_create_live_stream)

    failed = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Generated live failure",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "",
            "auto_create_vdocipher": True,
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert failed.status_code == 502
    assert failed.json()["detail"] == "Failed to create VdoCipher live stream"

    async def _live_count():
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(LiveSession).where(
                    LiveSession.course_offering_id == seeded["offering_id"],
                    LiveSession.title == "Generated live failure",
                )
            )
            return len(result.scalars().all())

    assert run_db(_live_count()) == 0


def test_professor_live_session_generation_cleans_up_provider_stream_when_db_persistence_fails(
    app_client,
    run_db,
    test_settings,
    monkeypatch,
):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    cleanup_calls = []

    async def fake_create_live_stream(title, settings, *, chat_mode="off"):
        del title, settings, chat_mode
        return {
            "live_id": "generated_orphan_live",
            "stream_ingest_url": "rtmp://ingest.example/orphan",
            "stream_key": "secret-orphan-key",
            "raw": {
                "liveId": "generated_orphan_live",
                "streamUrl": "rtmp://ingest.example/orphan",
                "streamKey": "secret-orphan-key",
            },
        }

    async def fake_delete_live_stream(live_id, settings):
        cleanup_calls.append({"live_id": live_id, "settings": settings})
        return {"cleanup_state": "deleted"}

    original_flush = professor_live_sessions.AsyncSession.flush
    failed_once = False

    async def fail_first_flush_after_provider_create(self, *args, **kwargs):
        nonlocal failed_once
        if not failed_once:
            failed_once = True
            raise RuntimeError("db persistence failed after provider create")
        return await original_flush(self, *args, **kwargs)

    monkeypatch.setattr(professor_live_sessions, "create_live_stream", fake_create_live_stream)
    monkeypatch.setattr(professor_live_sessions, "delete_live_stream", fake_delete_live_stream)
    monkeypatch.setattr(professor_live_sessions.AsyncSession, "flush", fail_first_flush_after_provider_create)

    with pytest.raises(RuntimeError, match="db persistence failed after provider create"):
        app_client.post(
            "/api/professor/live-sessions",
            json={
                "course_offering_id": seeded["offering_id"],
                "title": "Generated orphan cleanup",
                "description": "",
                "starts_at": starts_at.isoformat(),
                "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
                "vdocipher_live_id": "",
                "auto_create_vdocipher": True,
            },
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )

    assert len(cleanup_calls) == 1
    assert cleanup_calls[0]["live_id"] == "generated_orphan_live"
    assert cleanup_calls[0]["settings"] is test_settings

    async def _orphan_cleanup_state():
        session_factory = get_session_factory()
        async with session_factory() as db:
            live_result = await db.execute(
                select(LiveSession).where(
                    LiveSession.course_offering_id == seeded["offering_id"],
                    LiveSession.title == "Generated orphan cleanup",
                )
            )
            audit_result = await db.execute(
                select(AdminAuditLog)
                .where(
                    AdminAuditLog.model_name == "VdoCipherLiveCleanup",
                    AdminAuditLog.object_pk == "generated_orphan_live",
                )
                .order_by(AdminAuditLog.id.desc())
            )
            return len(live_result.scalars().all()), audit_result.scalars().first()

    live_count, audit = run_db(_orphan_cleanup_state())
    assert live_count == 0
    assert audit is not None
    assert audit.action == "provider_cleanup"
    assert audit.request_path == "/api/professor/live-sessions"
    assert audit.changed_data == {
        "provider": "vdocipher",
        "vdocipher_live_id": "generated_orphan_live",
        "cleanup": {"cleanup_state": "deleted"},
        "cleanup_state": "deleted",
        "cleanup_reason": "",
        "persist_failure_type": "RuntimeError",
        "provider_payload": {
            "liveId": "generated_orphan_live",
            "streamUrl": "rtmp://ingest.example/orphan",
            "streamKey": "[redacted]",
        },
    }


def test_live_interactions_are_trimmed_rate_limited_and_published(app_client, run_db, test_settings, monkeypatch):
    monkeypatch.setattr(professor_live_interactions, "LIVE_INTERACTION_BURST_LIMIT", 2)
    monkeypatch.setattr(professor_live_interactions, "LIVE_INTERACTION_BURST_WINDOW", timedelta(days=1))
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    created = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Realtime moderation live",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "live_rate_limit",
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]

    started = app_client.post(
        f"/api/professor/live-sessions/{live_id}/start",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert started.status_code == 200

    whitespace = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "   "},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert whitespace.status_code == 422

    first = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "   Audio is clear.   "},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert first.status_code == 201
    assert first.json()["body"] == "Audio is clear."

    async def _latest_interaction_outbox():
        session_factory = get_session_factory()
        async with session_factory() as db:
            return await db.scalar(
                select(RealtimeOutbox)
                .where(RealtimeOutbox.event_name == "live.interaction.created")
                .order_by(RealtimeOutbox.id.desc())
                .limit(1)
            )

    outbox_event = run_db(_latest_interaction_outbox())
    assert outbox_event.channel == f"kresco:live:{live_id}"
    assert outbox_event.payload_json == first.json()

    for index in range(professor_live_interactions.LIVE_INTERACTION_BURST_LIMIT - 1):
        response = app_client.post(
            f"/api/professor/student-live-sessions/{live_id}/interactions",
            json={"kind": "message", "body": f"Message {index}"},
            headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
        )
        assert response.status_code == 201

    rate_limited = app_client.post(
        f"/api/professor/student-live-sessions/{live_id}/interactions",
        json={"kind": "message", "body": "One too many"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert rate_limited.status_code == 429


def test_professor_live_session_notify_is_idempotent_per_student(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    created = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Manual notify dedupe live",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "live_manual_notify_dedupe",
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]

    first_notify = app_client.post(
        f"/api/professor/live-sessions/{live_id}/notify",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    second_notify = app_client.post(
        f"/api/professor/live-sessions/{live_id}/notify",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert first_notify.status_code == 200
    assert second_notify.status_code == 200

    async def _manual_notify_counts():
        target_ids = [seeded["vip_student_id"], seeded["basic_student_id"]]
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(Notification.user_id).where(
                    Notification.user_id.in_(target_ids),
                    Notification.type == "live_session",
                    Notification.title == "Upcoming live session",
                    Notification.body == f"Manual notify dedupe live is scheduled for {starts_at:%Y-%m-%d %H:%M}.",
                )
            )
            rows = [int(row[0]) for row in result.all()]
            outbox_result = await db.execute(
                select(RealtimeOutbox.id).where(
                    RealtimeOutbox.channel == f"kresco:offering:{seeded['offering_id']}:notifications",
                    RealtimeOutbox.event_name == "live.session.notify",
                    RealtimeOutbox.payload_json["live_session_id"].as_integer() == live_id,
                )
            )
            return {
                "notifications": {user_id: rows.count(user_id) for user_id in target_ids},
                "offering_events": len(outbox_result.all()),
            }

    notify_counts = run_db(_manual_notify_counts())
    assert notify_counts["notifications"][seeded["vip_student_id"]] == 1
    assert notify_counts["notifications"][seeded["basic_student_id"]] == 0
    assert notify_counts["offering_events"] == 1


def test_live_session_notifications_use_single_offering_realtime_event(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    async def _add_students():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(RealtimeOutbox))
            for index in range(50):
                db.add(User(
                    email=f"live-fanout-{seeded['offering_id']}-{index}@example.com",
                    full_name=f"Live Fanout {index}",
                    role="student",
                    tier="vip",
                    niveau="2BAC",
                    filiere=seeded["filiere"],
                    is_active=True,
                    is_email_verified=True,
                ))
            wrong_subject_vip = User(
                email=f"live-fanout-wrong-subject-{seeded['offering_id']}@example.com",
                full_name="Live Fanout Wrong Subject",
                role="student",
                tier="vip",
                niveau="2BAC",
                filiere=seeded["filiere"],
                is_active=True,
                is_email_verified=True,
            )
            db.add(wrong_subject_vip)
            await db.flush()
            db.add(UserSubjectEntitlement(
                user_id=wrong_subject_vip.id,
                subject_id=seeded["second_subject_id"],
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            await db.commit()
            return wrong_subject_vip.id

    wrong_subject_student_id = run_db(_add_students())

    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    created = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Broadcast fanout live",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "live_broadcast_fanout",
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    live_id = created.json()["id"]

    async def _created_live_notification_counts():
        target_ids = [seeded["vip_student_id"], seeded["basic_student_id"], wrong_subject_student_id]
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(Notification.user_id).where(
                    Notification.user_id.in_(target_ids),
                    Notification.type == "live_session",
                    Notification.title == "New live session scheduled",
                    Notification.body == "Broadcast fanout live was added to your calendar.",
                )
            )
            rows = [int(row[0]) for row in result.all()]
            return {user_id: rows.count(user_id) for user_id in target_ids}

    notification_counts = run_db(_created_live_notification_counts())
    assert notification_counts[seeded["vip_student_id"]] == 1
    assert notification_counts[seeded["basic_student_id"]] == 0
    assert notification_counts[wrong_subject_student_id] == 0

    started = app_client.post(
        f"/api/professor/live-sessions/{live_id}/start",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert started.status_code == 200

    async def _started_outbox_channels():
        session_factory = get_session_factory()
        async with session_factory() as db:
            result = await db.execute(
                select(RealtimeOutbox).where(RealtimeOutbox.event_name == "live.session.started")
            )
            rows = [
                row
                for row in result.scalars().all()
                if row.payload_json.get("live_session_id") == live_id
            ]
            return [(row.channel, row.payload_json) for row in rows]

    outbox = run_db(_started_outbox_channels())

    by_channel = {channel: payload for channel, payload in outbox}
    assert set(by_channel) == {
        f"kresco:offering:{seeded['offering_id']}:notifications",
        f"kresco:live:{live_id}",
    }
    offering_payload = by_channel[f"kresco:offering:{seeded['offering_id']}:notifications"]
    assert offering_payload["live_session_id"] == live_id
    assert offering_payload["course_offering_id"] == seeded["offering_id"]
    assert offering_payload["calendar_event_id"]
    assert offering_payload["title"] == "Broadcast fanout live"
    assert _utc_datetime(offering_payload["starts_at"]) == _utc_datetime(started.json()["starts_at"])
    assert offering_payload["status"] == "live"
    live_payload = by_channel[f"kresco:live:{live_id}"]
    assert live_payload["live_session_id"] == live_id
    assert live_payload["title"] == "Broadcast fanout live"
    assert live_payload["status"] == "live"
    assert _utc_datetime(live_payload["starts_at"]) == _utc_datetime(started.json()["starts_at"])
    assert _utc_datetime(live_payload["ends_at"]) == _utc_datetime(started.json()["ends_at"])
    assert not any(channel.startswith("kresco:user:") for channel, _payload in outbox)


def test_professor_live_session_update_can_reassign_owned_offering(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    created = app_client.post(
        "/api/professor/live-sessions",
        json={
            "course_offering_id": seeded["offering_id"],
            "title": "Owned offering update",
            "description": "",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            "vdocipher_live_id": "live_reassign_123",
            "stream_ingest_url": "rtmp://manual.example/live",
            "stream_key": "manual-key",
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    created_body = created.json()
    live_id = created_body["id"]
    assert created_body["has_stream_credentials"] is True
    assert "stream_ingest_url" not in created_body
    assert "stream_key" not in created_body

    listed = app_client.get(
        "/api/professor/live-sessions",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert listed.status_code == 200
    listed_session = next(item for item in listed.json() if item["id"] == live_id)
    assert listed_session["has_stream_credentials"] is True
    assert "stream_ingest_url" not in listed_session
    assert "stream_key" not in listed_session

    dashboard = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert dashboard.status_code == 200
    dashboard_session = next(item for item in dashboard.json()["upcoming_live_sessions"] if item["id"] == live_id)
    assert dashboard_session["has_stream_credentials"] is True
    assert "stream_ingest_url" not in dashboard_session
    assert "stream_key" not in dashboard_session

    forbidden_reveal = app_client.post(
        f"/api/professor/live-sessions/{live_id}/stream-credentials/reveal",
        headers={"Authorization": f"Bearer {seeded['other_professor_token']}"},
    )
    assert forbidden_reveal.status_code == 404

    revealed = app_client.post(
        f"/api/professor/live-sessions/{live_id}/stream-credentials/reveal",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert revealed.status_code == 200
    assert revealed.json()["stream_ingest_url"] == "rtmp://manual.example/live"
    assert revealed.json()["stream_key"] == "manual-key"

    reassigned = app_client.patch(
        f"/api/professor/live-sessions/{live_id}",
        json={
            "course_offering_id": seeded["second_offering_id"],
            "title": "Reassigned offering",
            "stream_ingest_url": "rtmp://manual.example/updated",
            "stream_key": "updated-key",
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert reassigned.status_code == 200
    assert reassigned.json()["course_offering_id"] == seeded["second_offering_id"]
    assert reassigned.json()["title"] == "Reassigned offering"
    assert reassigned.json()["has_stream_credentials"] is True
    assert "stream_ingest_url" not in reassigned.json()
    assert "stream_key" not in reassigned.json()

    updated_reveal = app_client.post(
        f"/api/professor/live-sessions/{live_id}/stream-credentials/reveal",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert updated_reveal.status_code == 200
    assert updated_reveal.json()["stream_ingest_url"] == "rtmp://manual.example/updated"
    assert updated_reveal.json()["stream_key"] == "updated-key"

    invalid_status = app_client.patch(
        f"/api/professor/live-sessions/{live_id}",
        json={"status": "paused"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid_status.status_code == 400
    assert invalid_status.json()["detail"] == "Unsupported live session status"

    async def _calendar_event_snapshot():
        session_factory = get_session_factory()
        async with session_factory() as db:
            live = await db.get(LiveSession, live_id)
            event = await db.get(CalendarEvent, live.calendar_event_id)
            return event.title, event.subject_id

    title, subject_id = run_db(_calendar_event_snapshot())
    assert title == "Reassigned offering"
    assert subject_id == seeded["second_subject_id"]

    forbidden = app_client.patch(
        f"/api/professor/live-sessions/{live_id}",
        json={"course_offering_id": seeded["second_offering_id"]},
        headers={"Authorization": f"Bearer {seeded['other_professor_token']}"},
    )
    assert forbidden.status_code == 404


def test_change_request_requires_target_inside_offering(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    created = app_client.post(
        "/api/professor/change-requests",
        json={
            "course_offering_id": seeded["offering_id"],
            "target_type": "topic",
            "target_id": seeded["topic_id"],
            "proposed_patch_json": {"title": "Limits and Continuity Updated"},
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "pending"
    audit = run_db(_audit_log_for("ProfessorChangeRequest", created.json()["id"]))
    assert audit is not None
    assert audit.action == "professor_create"
    assert audit.request_path == "/api/professor/change-requests"
    assert audit.changed_data["target_type"] == "topic"
    assert "professor_user_id=" in audit.note

    listed = app_client.get(
        "/api/professor/change-requests?limit=1&offset=0",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created.json()["id"]]

    async def _mark_applied():
        session_factory = get_session_factory()
        async with session_factory() as db:
            row = await db.get(ProfessorChangeRequest, created.json()["id"])
            row.status = "applied"
            await db.commit()

    run_db(_mark_applied())

    pending_after_apply = app_client.get(
        "/api/professor/change-requests",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    all_after_apply = app_client.get(
        "/api/professor/change-requests?status=all",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert pending_after_apply.status_code == 200
    assert pending_after_apply.json() == []
    assert all_after_apply.status_code == 200
    assert [item["id"] for item in all_after_apply.json()] == [created.json()["id"]]

    invalid_limit = app_client.get(
        "/api/professor/change-requests?limit=101",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid_limit.status_code == 422

    forbidden = app_client.post(
        "/api/professor/change-requests",
        json={
            "course_offering_id": seeded["offering_id"],
            "target_type": "topic",
            "target_id": 999999,
            "proposed_patch_json": {"title": "Wrong"},
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert forbidden.status_code == 403


def test_change_request_list_closes_deleted_targets(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    created = app_client.post(
        "/api/professor/change-requests",
        json={
            "course_offering_id": seeded["offering_id"],
            "target_type": "topic",
            "target_id": seeded["topic_id"],
            "proposed_patch_json": {"title": "Will be deleted"},
        },
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert created.status_code == 201
    change_request_id = created.json()["id"]

    async def _delete_target():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(Topic).where(Topic.id == seeded["topic_id"]))
            await db.commit()

    run_db(_delete_target())

    listed = app_client.get(
        "/api/professor/change-requests",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    dashboard = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )

    assert listed.status_code == 200
    assert all(item["id"] != change_request_id for item in listed.json())
    assert dashboard.status_code == 200
    assert all(item["id"] != change_request_id for item in dashboard.json()["pending_change_requests"])

    async def _assert_closed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            row = await db.get(ProfessorChangeRequest, change_request_id)
            assert row.status == "target_deleted"
            assert row.reviewed_at is not None
            assert row.admin_note == "Target was deleted or no longer belongs to this course offering."

    run_db(_assert_closed())


def test_professor_sensitive_mutations_are_rate_limited(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    payload = {
        "course_offering_id": seeded["offering_id"],
        "target_type": "topic",
        "target_id": seeded["topic_id"],
        "proposed_patch_json": {"title": "Repeated change"},
    }

    for index in range(professor_audit.PROFESSOR_MUTATION_BURST_LIMIT):
        response = app_client.post(
            "/api/professor/change-requests",
            json={**payload, "proposed_patch_json": {"title": f"Repeated change {index}"}},
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )
        assert response.status_code == 201

    limited = app_client.post(
        "/api/professor/change-requests",
        json={**payload, "proposed_patch_json": {"title": "Too many changes"}},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Slow down before submitting more professor changes"


def test_professor_time_serializers_normalize_naive_datetimes_as_utc():
    now = datetime(2026, 5, 28, 8, 0, 0, tzinfo=timezone.utc)
    live_session = SimpleNamespace(
        vdocipher_live_id="live-test",
        status="live",
        ends_at=datetime(2026, 5, 28, 8, 5, 0),
    )
    chat_time = datetime(2026, 5, 28, 8, 10, 0)

    assert professor_serializers.live_session_is_joinable(live_session, now=now) is True
    assert professor_serializers.chat_datetime(chat_time) == chat_time.replace(tzinfo=timezone.utc)


def test_vip_student_can_start_one_conversation_and_professor_can_reply(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    basic = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Can I ask a question?"},
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert basic.status_code == 403

    wrong_track = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Wrong track"},
        headers={"Authorization": f"Bearer {seeded['wrong_track_student_token']}"},
    )
    assert wrong_track.status_code == 403

    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Can you explain the last step?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]
    assert created.json()["unread_for_professor"] == 1
    assert "email" not in created.json()["professor"]
    assert "email" not in created.json()["student"]

    duplicate = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Second thread"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert duplicate.status_code == 409

    student_chat_status = app_client.get(
        "/api/professor/student-chat",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_chat_status.status_code == 200
    teacher_threads = student_chat_status.json()["teacher_threads"]
    assert [item["id"] for item in student_chat_status.json()["offerings"]] == [seeded["offering_id"]]
    assert [item["course_offering_id"] for item in teacher_threads] == [seeded["offering_id"]]
    first_thread = teacher_threads[0]
    assert first_thread["conversation"]["id"] == conversation_id
    assert first_thread["last_message_sender_role"] == "student"
    assert first_thread["last_message_preview"] == "Can you explain the last step?"
    assert first_thread["unread_count"] == 0
    assert "email" not in first_thread["professor"]
    assert "email" not in first_thread["conversation"]["student"]

    paged_status = app_client.get(
        "/api/professor/student-chat?limit=1&offset=1",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert paged_status.status_code == 200
    assert paged_status.json()["offerings"] == []
    assert paged_status.json()["teacher_threads"] == []

    invalid_status_limit = app_client.get(
        "/api/professor/student-chat?limit=101",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert invalid_status_limit.status_code == 422

    locked_subject_conversation = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["second_offering_id"], "body": "Can I ask the physics teacher?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert locked_subject_conversation.status_code == 403
    assert locked_subject_conversation.json()["detail"] == "subject_access_required"

    reply = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        json={"body": "Yes, check the continuity theorem condition."},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert reply.status_code == 201
    assert reply.json()["sender_role"] == "professor"
    reply_id = reply.json()["id"]

    unread_status = app_client.get(
        "/api/professor/student-chat",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    unread_thread = next(item for item in unread_status.json()["teacher_threads"] if item["course_offering_id"] == seeded["offering_id"])
    assert unread_thread["last_message_sender_role"] == "professor"
    assert unread_thread["unread_count"] == 1

    read_messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert read_messages.status_code == 200

    still_unread_status = app_client.get(
        "/api/professor/student-chat",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    still_unread_thread = next(item for item in still_unread_status.json()["teacher_threads"] if item["course_offering_id"] == seeded["offering_id"])
    assert still_unread_thread["unread_count"] == 1

    marked_read = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/read",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert marked_read.status_code == 200
    assert marked_read.json()["unread_for_student"] == 0

    read_status = app_client.get(
        "/api/professor/student-chat",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    read_thread = next(item for item in read_status.json()["teacher_threads"] if item["course_offering_id"] == seeded["offering_id"])
    assert read_thread["unread_count"] == 0

    edited_reply = app_client.patch(
        f"/api/professor/chat/messages/{reply_id}",
        json={"body": "Yes, check the edited continuity theorem condition."},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert edited_reply.status_code == 200
    assert edited_reply.json()["body"] == "Yes, check the edited continuity theorem condition."

    forbidden_edit = app_client.patch(
        f"/api/professor/chat/messages/{reply_id}",
        json={"body": "Not my message."},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert forbidden_edit.status_code == 404

    deleted_reply = app_client.delete(
        f"/api/professor/chat/messages/{reply_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert deleted_reply.status_code == 200

    professor_messages = app_client.get(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert all(item["id"] != reply_id for item in professor_messages.json())

    image = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/images",
        data={"body": "Here is my work"},
        files={"file": ("work.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert image.status_code == 201
    assert image.json()["attachment_url"].startswith(f"/media/professor-chat/{conversation_id}/")
    assert image.json()["attachment_mime_type"] == "image/png"
    assert image.json()["body"] == "Here is my work"
    image_message_id = image.json()["id"]

    edited_student_message = app_client.patch(
        f"/api/professor/chat/messages/{image_message_id}",
        json={"body": "Here is my edited work"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert edited_student_message.status_code == 200
    assert edited_student_message.json()["body"] == "Here is my edited work"

    forbidden_delete = app_client.delete(
        f"/api/professor/chat/messages/{image_message_id}",
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert forbidden_delete.status_code == 404
    assert forbidden_delete.json()["detail"] == "Chat message not found"

    deleted_student_message = app_client.delete(
        f"/api/professor/chat/messages/{image_message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted_student_message.status_code == 200

    old_message = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        json={"body": "Fresh follow-up"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert old_message.status_code == 201
    old_message_id = old_message.json()["id"]

    async def _backdate_message():
        session_factory = get_session_factory()
        async with session_factory() as db:
            message = await db.get(ProfessorChatMessage, old_message_id)
            message.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
            await db.commit()

    run_db(_backdate_message())

    too_late_delete = app_client.delete(
        f"/api/professor/chat/messages/{old_message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert too_late_delete.status_code == 403
    assert too_late_delete.json()["detail"] == "Messages can only be deleted for 15 minutes"

    student_messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert all(item["body"] != "Here is my edited work" for item in student_messages.json())

    invalid_image = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/images",
        files={"file": ("work.txt", b"not an image", "text/plain")},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert invalid_image.status_code == 400

    invalid_signature = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/images",
        files={"file": ("work.png", b"<script>alert(1)</script>", "image/png")},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert invalid_signature.status_code == 400

    blocked_reply = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        json={"body": "I should not see this."},
        headers={"Authorization": f"Bearer {seeded['other_professor_token']}"},
    )
    assert blocked_reply.status_code == 404


def test_subject_scoped_vip_student_chat_rejects_same_track_locked_subject(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    async def _seed_locked_subject_conversation():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = ProfessorChatConversation(
                course_offering_id=seeded["second_offering_id"],
                professor_user_id=seeded["professor_id"],
                student_user_id=seeded["vip_student_id"],
                unread_for_student=1,
                last_message_preview="Physics bypass attempt",
                last_message_at=datetime.now(timezone.utc),
            )
            db.add(conversation)
            await db.flush()
            message = ProfessorChatMessage(
                conversation_id=conversation.id,
                sender_user_id=seeded["vip_student_id"],
                body="Physics bypass attempt",
            )
            db.add(message)
            await db.commit()
            return conversation.id, message.id

    conversation_id, message_id = run_db(_seed_locked_subject_conversation())

    status = app_client.get(
        "/api/professor/student-chat",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert status.status_code == 200
    assert seeded["second_offering_id"] not in [item["id"] for item in status.json()["offerings"]]
    assert seeded["second_offering_id"] not in [item["course_offering_id"] for item in status.json()["teacher_threads"]]
    assert conversation_id not in [item["id"] for item in status.json()["conversations"]]

    start = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["second_offering_id"], "body": "Can I ask physics?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert start.status_code == 403
    assert start.json()["detail"] == "subject_access_required"

    messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert messages.status_code == 403
    assert messages.json()["detail"] == "subject_access_required"

    sent = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        json={"body": "Still trying physics"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert sent.status_code == 403
    assert sent.json()["detail"] == "subject_access_required"

    image = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/images",
        data={"body": "Physics image"},
        files={"file": ("work.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert image.status_code == 403
    assert image.json()["detail"] == "subject_access_required"

    edited = app_client.patch(
        f"/api/professor/chat/messages/{message_id}",
        json={"body": "Edited locked physics message"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert edited.status_code == 403
    assert edited.json()["detail"] == "subject_access_required"

    deleted = app_client.delete(
        f"/api/professor/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted.status_code == 403
    assert deleted.json()["detail"] == "subject_access_required"


def test_student_conversation_duplicate_flush_race_returns_409(app_client, run_db, test_settings, monkeypatch):
    seeded = run_db(_seed_professor_platform(test_settings))
    original_flush = professor_chat_mutations.AsyncSession.flush
    raised = {"value": False}

    async def duplicate_flush_once(self, *args, **kwargs):
        if not raised["value"]:
            raised["value"] = True
            raise professor_chat_mutations.IntegrityError("insert conversation", {}, Exception("duplicate"))
        return await original_flush(self, *args, **kwargs)

    monkeypatch.setattr(professor_chat_mutations.AsyncSession, "flush", duplicate_flush_once)

    response = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Race duplicate"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Conversation already exists"


def test_revoked_student_cannot_delete_existing_professor_chat_message(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Message before downgrade"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert messages.status_code == 200
    message_id = messages.json()[0]["id"]

    async def _revoke_chat_access():
        session_factory = get_session_factory()
        async with session_factory() as db:
            student = await db.get(User, seeded["vip_student_id"])
            student.tier = "basic"
            student.is_pro = False
            await db.commit()

    run_db(_revoke_chat_access())

    deleted = app_client.delete(
        f"/api/professor/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )

    assert deleted.status_code == 403
    assert deleted.json()["detail"] == "VIP access required for professor chat"


def test_professor_chat_and_live_mutations_keep_race_guards():
    start_source = inspect.getsource(professor_chat_mutations.start_student_conversation_state)
    assert ".with_for_update()" in start_source
    assert "subject_id=offering.subject_id" in start_source
    conversation_lock_source = "\n".join([
        inspect.getsource(professor_queries.require_professor_conversation),
        inspect.getsource(professor_queries.require_student_conversation),
        inspect.getsource(professor_queries._require_conversation),
    ])
    assert ".with_for_update(nowait=True)" in conversation_lock_source
    assert "CONVERSATION_LOCKED_DETAIL" in conversation_lock_source

    delete_source = inspect.getsource(professor_chat_mutations.delete_chat_message_state)
    access_source = inspect.getsource(professor_chat_mutations.ensure_student_can_use_conversation)
    assert "ensure_student_can_use_conversation(" in delete_source
    assert "ensure_student_professor_chat_access(db, user, subject_id=offering.subject_id)" in access_source
    assert "Messages can only be deleted for 15 minutes" in delete_source

    for function_name in (
        "delete_live_session",
        "update_live_session",
        "cancel_live_session",
        "notify_live_session",
        "start_live_session",
        "end_live_session",
    ):
        source = inspect.getsource(getattr(professor_live_sessions, function_name.replace("_live_session", "_professor_live_session")))
        assert "for_update=True" in source


def test_professor_chat_lock_error_detection_handles_postgres_nowait():
    lock_error = SimpleNamespace(orig=SimpleNamespace(pgcode="55P03"))
    text_error = SimpleNamespace(orig=RuntimeError("could not obtain lock on row in relation"))
    other_error = SimpleNamespace(orig=RuntimeError("connection lost"))

    assert professor_queries.is_lock_unavailable_error(lock_error) is True
    assert professor_queries.is_lock_unavailable_error(text_error) is True
    assert professor_queries.is_lock_unavailable_error(other_error) is False


def test_professor_live_session_lifecycle_stays_out_of_router():
    router_source = inspect.getsource(professor_router)
    live_service_source = inspect.getsource(professor_live_sessions)
    create_source = inspect.getsource(professor_live_sessions.create_professor_live_session)
    notification_source = inspect.getsource(professor_live_sessions.notify_students_for_live)
    course_stream_source = inspect.getsource(courses_router.get_topic_item_stream)

    assert "from app.services.professor_live_sessions import" in router_source
    assert "def _live_calendar_subtitle" not in router_source
    assert "def _sync_calendar_event_from_live_session" not in router_source
    assert "async def _students_for_offering" not in router_source
    assert "async def _notify_students_for_live" not in router_source
    assert "async def _enqueue_live_session_event_and_track" not in router_source
    assert "async def create_professor_live_session" in live_service_source
    assert "await db.rollback()" in create_source
    assert create_source.index("await db.rollback()") < create_source.index("await create_live_stream")
    assert "async def update_professor_live_session" in live_service_source
    assert "async def _apply_professor_live_session_transition" in live_service_source
    for function_name in (
        "cancel_professor_live_session",
        "notify_professor_live_session",
        "start_professor_live_session",
        "end_professor_live_session",
    ):
        assert "_apply_professor_live_session_transition(" in inspect.getsource(getattr(professor_live_sessions, function_name))
    assert "async def notify_students_for_live" in live_service_source
    assert ".from_select(" in notification_source
    assert ".scalars().all()" not in notification_source
    assert "await db.rollback()" in course_stream_source
    assert course_stream_source.index("await db.rollback()") < course_stream_source.index("await get_video_stream_data")
    assert "async def list_professor_live_sessions" in live_service_source
    assert "async def reveal_professor_live_stream_credentials_state" in live_service_source
    assert "offering_notifications_channel_name" in live_service_source
    assert "live_session_channel_name" in live_service_source
    assert "list_professor_live_sessions(" in inspect.getsource(professor_router.list_live_sessions)
    assert "reveal_professor_live_stream_credentials_state(" in inspect.getsource(
        professor_router.reveal_professor_live_stream_credentials
    )


def test_professor_live_interaction_mutations_stay_out_of_router():
    router_source = inspect.getsource(professor_router)
    interaction_service_source = inspect.getsource(professor_live_interactions)

    assert "from app.services.professor_live_interactions import" in router_source
    assert "def _clean_live_interaction_body" not in router_source
    assert "def _normalize_live_interaction_kind" not in router_source
    assert "async def _enforce_live_interaction_burst_limit" not in router_source
    assert "LiveSessionInteraction(" not in inspect.getsource(professor_router.create_student_live_interaction)
    assert "LiveSessionCheckpoint(" not in inspect.getsource(professor_router.create_professor_live_checkpoint)
    assert "live.interaction.created" not in router_source
    assert "live.checkpoint.created" not in router_source

    for function_name, service_call in (
        ("list_professor_live_interactions", "list_professor_live_interaction_entries("),
        ("update_professor_live_interaction", "update_professor_live_interaction_state("),
        ("delete_professor_live_interaction", "delete_professor_live_interaction_state("),
        ("list_student_live_interactions", "list_student_live_interaction_entries("),
        ("create_student_live_interaction", "create_student_live_interaction_state("),
        ("list_professor_live_checkpoints", "list_professor_live_checkpoint_entries("),
        ("create_professor_live_checkpoint", "create_professor_live_checkpoint_state("),
        ("update_professor_live_checkpoint", "update_professor_live_checkpoint_state("),
        ("list_student_live_checkpoints", "list_student_live_checkpoint_entries("),
    ):
        source = inspect.getsource(getattr(professor_router, function_name))
        assert service_call in source
        assert "select(" not in source
        assert "LiveSessionInteraction." not in source
        assert "LiveSessionCheckpoint." not in source
        assert "enqueue_live_session_event(" not in source
        assert "_record_professor_audit(" not in source

    assert "def clean_live_interaction_body" in interaction_service_source
    assert "async def enforce_live_interaction_burst_limit" in interaction_service_source
    assert "async def list_professor_live_interaction_entries" in interaction_service_source
    assert "async def list_student_live_interaction_entries" in interaction_service_source
    assert "async def list_professor_live_checkpoint_entries" in interaction_service_source
    assert "async def list_student_live_checkpoint_entries" in interaction_service_source
    assert "async def create_student_live_interaction_state" in interaction_service_source
    assert "async def create_professor_live_checkpoint_state" in interaction_service_source
    assert "LiveSessionInteraction.status.not_in" in interaction_service_source
    assert "LiveSessionCheckpoint.status != \"deleted\"" in interaction_service_source
    assert "live.interaction.created" in interaction_service_source
    assert "live.checkpoint.created" in interaction_service_source


def test_professor_chat_mutation_helpers_stay_out_of_router():
    router_source = inspect.getsource(professor_router)
    chat_mutation_source = inspect.getsource(professor_chat_mutations)

    assert "from app.services.professor_chat_mutations import" in router_source
    assert "def _touch_conversation" not in router_source
    assert "async def _apply_professor_sent_message_update" not in router_source
    assert "async def _apply_student_sent_message_update" not in router_source
    assert "async def _refresh_chat_preview" not in router_source
    assert "async def publish_chat_message_change" not in router_source
    assert "async def _chat_media_used_bytes" not in router_source
    assert "async def _save_chat_image" not in router_source
    for function_name, service_call in (
        ("list_professor_messages", "list_professor_messages_for_conversation("),
        ("send_professor_message", "send_professor_message_state("),
        ("send_professor_image_message", "send_professor_image_message_state("),
        ("update_chat_message", "update_chat_message_state("),
        ("delete_chat_message", "delete_chat_message_state("),
        ("patch_professor_conversation", "patch_professor_conversation_state("),
        ("mark_student_conversation_read", "mark_student_conversation_read_state("),
        ("start_student_conversation", "start_student_conversation_state("),
        ("list_student_messages", "list_student_messages_for_conversation("),
        ("send_student_message", "send_student_message_state("),
        ("send_student_image_message", "send_student_image_message_state("),
    ):
        source = inspect.getsource(getattr(professor_router, function_name))
        assert service_call in source
        assert "select(" not in source
        assert "await db.commit(" not in source
        assert "await db.flush(" not in source
        assert "db.add(" not in source
        assert "await db.delete(" not in source
        assert "publish_chat_message_change(" not in source
        assert "enqueue_realtime_event(" not in source
    assert "async def apply_professor_sent_message_update" in chat_mutation_source
    assert "async def apply_student_sent_message_update" in chat_mutation_source
    assert "async def apply_sent_message_update" in chat_mutation_source
    assert "async def _persist_chat_message_state" in chat_mutation_source
    assert "async def refresh_chat_preview" in chat_mutation_source
    assert "async def save_chat_image" in chat_mutation_source
    assert "async def mark_student_conversation_read_state" in chat_mutation_source
    assert "async def start_student_conversation_state" in chat_mutation_source
    assert "async def send_professor_message_state" in chat_mutation_source
    assert "async def send_student_image_message_state" in chat_mutation_source
    assert "await enqueue_realtime_event(" in chat_mutation_source


def test_professor_output_serializers_stay_out_of_router():
    router_source = inspect.getsource(professor_router)
    serializer_source = inspect.getsource(professor_serializers)
    query_source = inspect.getsource(professor_queries)

    assert "from app.services.professor_serializers import" in router_source
    assert "from app.services.professor_queries import" in router_source
    assert "def _message_out" not in router_source
    assert "def _conversation_out" not in router_source
    assert "def _professor_live_session_out" not in router_source
    assert "async def _require_professor_live_session" not in router_source
    assert "async def _messages_for_conversation" not in router_source
    assert "async def _student_teacher_threads" not in router_source
    dashboard_source = inspect.getsource(professor_router.get_professor_dashboard)
    assert "_professor_dashboard(" in dashboard_source
    assert "select(LiveSession)" not in dashboard_source
    assert "select(ProfessorChangeRequest)" not in dashboard_source
    assert "select(func." not in dashboard_source
    assert "ProfessorDashboardOut(" not in dashboard_source
    conversation_list_source = inspect.getsource(professor_router.list_professor_conversations)
    assert "_professor_conversations(" in conversation_list_source
    assert "select(ProfessorChatConversation)" not in conversation_list_source
    assert "ProfessorChatConversation.last_message_preview.ilike" not in conversation_list_source
    assert "def message_out" in serializer_source
    assert "def conversation_out" in serializer_source
    assert "def professor_live_session_out" in serializer_source
    assert "async def professor_conversations" in query_source
    assert "async def professor_dashboard" in query_source
    assert "row_number()" in inspect.getsource(professor_queries.conversation_last_sender_role)
    assert ".distinct(" not in inspect.getsource(professor_queries.conversation_last_sender_role)
    assert "ProfessorDashboardOut(" in query_source
    assert "select(ProfessorChangeRequest)" in inspect.getsource(professor_change_requests)
    assert "async def require_professor_live_session" in query_source
    assert "async def messages_for_conversation" in query_source
    assert "async def student_teacher_threads" in query_source
    assert "async def student_live_sessions" in query_source
    assert "async def student_professor_chat_status" in query_source


def test_professor_router_database_work_stays_in_services():
    router_source = inspect.getsource(professor_router)

    for forbidden in (
        "select(",
        "db.execute(",
        "db.scalar(",
        "db.add(",
        "db.add_all(",
        "db.commit(",
        "db.flush(",
        "db.delete(",
        "with_for_update(",
    ):
        assert forbidden not in router_source


def test_professor_change_request_helpers_stay_out_of_router():
    router_source = inspect.getsource(professor_router)
    change_request_source = inspect.getsource(professor_change_requests)
    change_request_target_source = inspect.getsource(professor_change_request_targets)

    assert "from app.services.professor_change_requests import" in router_source
    assert "ALLOWED_CHANGE_TARGETS =" not in router_source
    assert "def _topic_offering_id" not in router_source
    assert "async def _target_belongs_to_offering" not in router_source
    assert "ProfessorChangeRequest(" not in inspect.getsource(professor_router.create_change_request)
    assert "select(ProfessorChangeRequest)" not in inspect.getsource(professor_router.list_change_requests)
    assert "create_professor_change_request(" in inspect.getsource(professor_router.create_change_request)
    assert "list_professor_change_requests(" in inspect.getsource(professor_router.list_change_requests)
    assert "async def target_belongs_to_offering" in change_request_target_source
    assert "async def create_professor_change_request" in change_request_source
    assert "async def list_professor_change_requests" in change_request_source


def test_professor_read_list_services_clamp_pagination_bounds():
    change_request_source = inspect.getsource(professor_change_requests)
    live_session_source = inspect.getsource(professor_live_sessions)
    live_interaction_source = inspect.getsource(professor_live_interactions)
    query_source = inspect.getsource(professor_queries)

    assert "MAX_CHANGE_REQUESTS_LIMIT = 100" in change_request_source
    assert "limit = min(max(limit, 1), MAX_CHANGE_REQUESTS_LIMIT)" in change_request_source
    assert "MAX_PROFESSOR_LIVE_SESSIONS_LIMIT = 100" in live_session_source
    assert "limit = min(max(limit, 1), MAX_PROFESSOR_LIVE_SESSIONS_LIMIT)" in live_session_source
    assert "MAX_LIVE_INTERACTION_LIST_LIMIT = 200" in live_interaction_source
    assert "MAX_LIVE_CHECKPOINT_LIST_LIMIT = 100" in live_interaction_source
    assert "limit = min(max(limit, 1), MAX_LIVE_INTERACTION_LIST_LIMIT)" in live_interaction_source
    assert "limit = min(max(limit, 1), MAX_LIVE_CHECKPOINT_LIST_LIMIT)" in live_interaction_source
    assert "MAX_PROFESSOR_CONVERSATIONS_LIMIT = 100" in query_source
    assert "MAX_CHAT_MESSAGES_LIMIT = 200" in query_source
    assert "limit = min(max(limit, 1), MAX_PROFESSOR_CONVERSATIONS_LIMIT)" in query_source
    assert "limit = min(max(limit, 1), MAX_CHAT_MESSAGES_LIMIT)" in query_source


def test_professor_chat_image_upload_enforces_conversation_quota(app_client, run_db, test_settings, tmp_path, monkeypatch):
    seeded = run_db(_seed_professor_platform(test_settings))
    storage_root = tmp_path / "media"
    monkeypatch.setattr(
        "app.services.professor_chat_mutations.get_media_storage",
        lambda settings: LocalMediaStorage(root=storage_root),
    )
    original_quota = test_settings.media_chat_conversation_quota_bytes
    test_settings.media_chat_conversation_quota_bytes = 30
    png_20 = b"\x89PNG\r\n\x1a\n" + b"a" * 12
    try:
        created = app_client.post(
            "/api/professor/student-chat/conversations",
            json={"course_offering_id": seeded["offering_id"], "body": "Quota check"},
            headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
        )
        assert created.status_code == 201
        conversation_id = created.json()["id"]

        first_image = app_client.post(
            f"/api/professor/student-chat/conversations/{conversation_id}/images",
            data={"body": "First image"},
            files={"file": ("first.png", png_20, "image/png")},
            headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
        )
        assert first_image.status_code == 201
        assert first_image.json()["attachment_size"] == len(png_20)
        first_image_path = _local_media_path(storage_root, first_image.json()["attachment_url"])
        assert first_image_path.exists()

        over_quota_reply = app_client.post(
            f"/api/professor/chat/conversations/{conversation_id}/images",
            data={"body": "Reply image"},
            files={"file": ("reply.png", png_20, "image/png")},
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )
        assert over_quota_reply.status_code == 413
        assert over_quota_reply.json()["detail"] == "Conversation media quota exceeded"

        deleted = app_client.delete(
            f"/api/professor/chat/messages/{first_image.json()['id']}",
            headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
        )
        assert deleted.status_code == 200
        assert not first_image_path.exists()

        replacement = app_client.post(
            f"/api/professor/chat/conversations/{conversation_id}/images",
            data={"body": "Replacement image"},
            files={"file": ("replacement.png", png_20, "image/png")},
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )
        assert replacement.status_code == 201
        assert replacement.json()["attachment_size"] == len(png_20)
    finally:
        test_settings.media_chat_conversation_quota_bytes = original_quota


def test_professor_chat_conversations_are_bounded_and_offset_paginated(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    async def _seed_conversations():
        session_factory = get_session_factory()
        async with session_factory() as db:
            base_time = datetime.now(timezone.utc) - timedelta(minutes=30)
            for index in range(5):
                student = User(
                    email=f"chat-page-student-{uuid4().hex[:8]}@example.com",
                    full_name=f"Chat Page Student {index}",
                    role="student",
                    tier="vip",
                    niveau="2BAC",
                    filiere=seeded["filiere"],
                    is_active=True,
                    is_email_verified=True,
                )
                db.add(student)
                await db.flush()
                db.add(ProfessorChatConversation(
                    course_offering_id=seeded["offering_id"],
                    professor_user_id=seeded["professor_id"],
                    student_user_id=student.id,
                    last_message_preview=f"thread {index}",
                    last_message_at=base_time + timedelta(minutes=index),
                ))
            await db.commit()

    run_db(_seed_conversations())

    first_page = app_client.get(
        "/api/professor/chat/conversations?limit=2",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert first_page.status_code == 200
    assert [item["last_message_preview"] for item in first_page.json()] == ["thread 4", "thread 3"]

    second_page = app_client.get(
        "/api/professor/chat/conversations?limit=2&offset=2",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert second_page.status_code == 200
    assert [item["last_message_preview"] for item in second_page.json()] == ["thread 2", "thread 1"]

    invalid = app_client.get(
        "/api/professor/chat/conversations?limit=101",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid.status_code == 422


def test_professor_chat_messages_are_cursor_paginated(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Initial question"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    async def _seed_messages():
        session_factory = get_session_factory()
        async with session_factory() as db:
            for index in range(12):
                sender_id = seeded["professor_id"] if index % 2 else seeded["vip_student_id"]
                db.add(ProfessorChatMessage(
                    conversation_id=conversation_id,
                    sender_user_id=sender_id,
                    body=f"page-message-{index}",
                ))
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            conversation.unread_for_professor = 4
            conversation.unread_for_student = 3
            await db.commit()

    run_db(_seed_messages())

    professor_page = app_client.get(
        f"/api/professor/chat/conversations/{conversation_id}/messages?limit=5",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_page.status_code == 200
    assert [item["body"] for item in professor_page.json()] == [f"page-message-{index}" for index in range(7, 12)]
    before_id = professor_page.json()[0]["id"]

    older_page = app_client.get(
        f"/api/professor/chat/conversations/{conversation_id}/messages?limit=5&before_id={before_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert older_page.status_code == 200
    assert [item["body"] for item in older_page.json()] == [f"page-message-{index}" for index in range(2, 7)]

    student_page = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages?limit=3",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_page.status_code == 200
    assert [item["body"] for item in student_page.json()] == [f"page-message-{index}" for index in range(9, 12)]

    invalid = app_client.get(
        f"/api/professor/chat/conversations/{conversation_id}/messages?limit=201",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert invalid.status_code == 422

    async def _conversation_unread_counts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            return conversation.unread_for_professor, conversation.unread_for_student

    assert run_db(_conversation_unread_counts()) == (4, 3)


def test_deleting_unread_student_message_decrements_professor_unread_total(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Unread question"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert messages.status_code == 200
    message_id = messages.json()[0]["id"]

    dashboard_before = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert dashboard_before.status_code == 200
    assert dashboard_before.json()["chat_unread_count"] == 1

    deleted = app_client.delete(
        f"/api/professor/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted.status_code == 200

    async def _conversation_unread_counts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            return conversation.unread_for_professor, conversation.unread_for_student

    assert run_db(_conversation_unread_counts()) == (0, 0)

    dashboard_after = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert dashboard_after.status_code == 200
    assert dashboard_after.json()["chat_unread_count"] == 0


def test_deleting_unread_professor_message_decrements_student_unread_counter(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Initial question"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    reply = app_client.post(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        json={"body": "Unread answer"},
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert reply.status_code == 201
    message_id = reply.json()["id"]

    async def _conversation_unread_counts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            return conversation.unread_for_professor, conversation.unread_for_student

    assert run_db(_conversation_unread_counts()) == (0, 1)

    deleted = app_client.delete(
        f"/api/professor/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert deleted.status_code == 200
    assert run_db(_conversation_unread_counts()) == (0, 0)


def test_professor_chat_message_get_routes_do_not_acknowledge_or_commit(
    app_client,
    run_db,
    test_settings,
    monkeypatch,
):
    seeded = run_db(_seed_professor_platform(test_settings))
    created = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Initial question"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    async def _set_unread_counts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            professor = await db.get(User, seeded["professor_id"])
            conversation.unread_for_professor = 2
            conversation.unread_for_student = 1
            professor.professor_unread_chat_count = 2
            await db.commit()

    run_db(_set_unread_counts())

    commit_calls = []
    original_commit = AsyncSession.commit

    async def tracked_commit(self):
        commit_calls.append(True)
        await original_commit(self)

    monkeypatch.setattr(AsyncSession, "commit", tracked_commit)

    professor_page = app_client.get(
        f"/api/professor/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert professor_page.status_code == 200

    student_page = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert student_page.status_code == 200
    assert commit_calls == []

    async def _conversation_unread_counts():
        session_factory = get_session_factory()
        async with session_factory() as db:
            conversation = await db.get(ProfessorChatConversation, conversation_id)
            return conversation.unread_for_professor, conversation.unread_for_student

    assert run_db(_conversation_unread_counts()) == (2, 1)


def test_professor_chat_image_upload_uses_configured_storage(app_client, run_db, test_settings, monkeypatch):
    seeded = run_db(_seed_professor_platform(test_settings))
    started = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["offering_id"], "body": "Can you check this?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert started.status_code == 201
    conversation_id = started.json()["id"]
    calls = []

    class _Storage:
        async def put_object(self, *, key: str, content: bytes, content_type: str):
            calls.append({"key": key, "content": content, "content_type": content_type})
            return SimpleNamespace(
                key=f"test-prefix/{key}",
                reference=f"gs://kresco-media/test-prefix/{key}",
                url=f"https://signed.example.com/test-prefix/{key}?signature=upload",
            )

    monkeypatch.setattr("app.services.professor_chat_mutations.get_media_storage", lambda settings: _Storage())
    async def _async_media_url(reference, settings):
        return f"https://signed.example.com/{reference.removeprefix('gs://kresco-media/')}?signature=read" if str(reference).startswith("gs://") else reference

    monkeypatch.setattr(
        "app.services.professor_serializers.async_media_url",
        _async_media_url,
    )

    image = app_client.post(
        f"/api/professor/student-chat/conversations/{conversation_id}/images",
        data={"body": "Here is my work"},
        files={"file": ("work.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )

    assert image.status_code == 201
    assert image.json()["attachment_url"].startswith(
        f"https://signed.example.com/test-prefix/professor-chat/{conversation_id}/"
    )
    assert image.json()["attachment_url"].endswith("?signature=read")
    assert calls[0]["key"].startswith(f"professor-chat/{conversation_id}/")
    assert calls[0]["content_type"] == "image/png"

    async def _stored_message_attachment():
        session_factory = get_session_factory()
        async with session_factory() as db:
            message = await db.get(ProfessorChatMessage, image.json()["id"])
            return message.attachment_url

    assert run_db(_stored_message_attachment()).startswith(
        f"gs://kresco-media/test-prefix/professor-chat/{conversation_id}/"
    )
