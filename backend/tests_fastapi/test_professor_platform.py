from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

import app.routers.professor as professor_router
from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.professor import CourseOffering, LiveSession, ProfessorChatConversation, ProfessorChatMessage, ProgramTrack, RealtimeOutbox
from app.models.users import User, UserSubjectEntitlement
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME, create_token


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
            password="!",
        )
        other_professor = User(
            email=f"other-professor-platform-{suffix}@example.com",
            full_name="Pr Other",
            role="professor",
            tier="basic",
            is_active=True,
            is_email_verified=True,
            password="!",
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
            password="!",
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
            password="!",
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
            password="!",
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
    import app.routers.users as users_router

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
            password=users_router._hash_password("strong-pass-123"),
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


def test_professor_dashboard_requires_professor_and_returns_scope(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    basic_response = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['basic_student_token']}"},
    )
    assert basic_response.status_code == 403

    response = app_client.get(
        "/api/professor/dashboard",
        headers={"Authorization": f"Bearer {seeded['professor_token']}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["active_offering"]["id"] == seeded["offering_id"]
    assert body["active_offering"]["track"]["filiere"] == seeded["filiere"]


def test_professor_requires_active_offering_for_login_and_area(app_client, run_db, test_settings):
    seeded = run_db(_seed_unassigned_professor(test_settings))

    login = app_client.post(
        "/api/auth/login",
        json={"email": seeded["email"], "password": "strong-pass-123"},
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

    deleted_all_notifications = app_client.delete(
        "/api/notifications",
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

    monkeypatch.setattr(professor_router, "create_live_stream", fake_create_live_stream)

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

    monkeypatch.setattr(professor_router, "create_live_stream", fake_create_live_stream)

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


def test_live_interactions_are_trimmed_rate_limited_and_published(app_client, run_db, test_settings, monkeypatch):
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

    for index in range(professor_router.LIVE_INTERACTION_BURST_LIMIT - 1):
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


def test_live_session_notifications_use_single_offering_realtime_event(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))

    async def _add_students():
        session_factory = get_session_factory()
        async with session_factory() as db:
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
                    password="!",
                ))
            await db.commit()

    run_db(_add_students())

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
    assert offering_payload["starts_at"] == started.json()["starts_at"]
    assert offering_payload["status"] == "live"
    assert by_channel[f"kresco:live:{live_id}"] == {
        "live_session_id": live_id,
        "title": "Broadcast fanout live",
        "status": "live",
        "starts_at": started.json()["starts_at"],
        "ends_at": started.json()["ends_at"],
    }
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


def test_professor_sensitive_mutations_are_rate_limited(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
    payload = {
        "course_offering_id": seeded["offering_id"],
        "target_type": "topic",
        "target_id": seeded["topic_id"],
        "proposed_patch_json": {"title": "Repeated change"},
    }

    for index in range(professor_router.PROFESSOR_MUTATION_BURST_LIMIT):
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
    assert len(teacher_threads) == 3
    first_thread = next(item for item in teacher_threads if item["course_offering_id"] == seeded["offering_id"])
    other_professor_thread = next(item for item in teacher_threads if item["course_offering_id"] == seeded["other_professor_offering_id"])
    assert first_thread["conversation"]["id"] == conversation_id
    assert first_thread["last_message_sender_role"] == "student"
    assert first_thread["last_message_preview"] == "Can you explain the last step?"
    assert first_thread["unread_count"] == 0
    assert "email" not in first_thread["professor"]
    assert "email" not in first_thread["conversation"]["student"]
    assert other_professor_thread["conversation"] is None
    assert other_professor_thread["professor"]["full_name"] == "Pr Other"
    assert "email" not in other_professor_thread["professor"]

    second_conversation = app_client.post(
        "/api/professor/student-chat/conversations",
        json={"course_offering_id": seeded["other_professor_offering_id"], "body": "Can I ask the chemistry teacher?"},
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert second_conversation.status_code == 201
    assert second_conversation.json()["professor"]["full_name"] == "Pr Other"
    assert "email" not in second_conversation.json()["professor"]
    assert "email" not in second_conversation.json()["student"]

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

    deleted_student_message = app_client.delete(
        f"/api/professor/chat/messages/{image_message_id}",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert deleted_student_message.status_code == 200

    student_messages = app_client.get(
        f"/api/professor/student-chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {seeded['vip_student_token']}"},
    )
    assert all(item["id"] != image_message_id for item in student_messages.json())

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


def test_professor_chat_image_upload_enforces_conversation_quota(app_client, run_db, test_settings):
    seeded = run_db(_seed_professor_platform(test_settings))
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

        over_quota_reply = app_client.post(
            f"/api/professor/chat/conversations/{conversation_id}/images",
            data={"body": "Reply image"},
            files={"file": ("reply.png", png_20, "image/png")},
            headers={"Authorization": f"Bearer {seeded['professor_token']}"},
        )
        assert over_quota_reply.status_code == 413
        assert over_quota_reply.json()["detail"] == "Conversation media quota exceeded"
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
                    password="!",
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

    assert run_db(_conversation_unread_counts()) == (0, 0)


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
                reference=f"s3://kresco-media/test-prefix/{key}",
                url=f"https://signed.example.com/test-prefix/{key}?signature=upload",
            )

    monkeypatch.setattr("app.routers.professor.get_media_storage", lambda settings: _Storage())
    monkeypatch.setattr(
        "app.routers.professor.media_url",
        lambda reference, settings: f"https://signed.example.com/{reference.removeprefix('s3://kresco-media/')}?signature=read"
        if str(reference).startswith("s3://")
        else reference,
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
        f"s3://kresco-media/test-prefix/professor-chat/{conversation_id}/"
    )
