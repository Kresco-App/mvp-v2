from datetime import date, datetime, timedelta, timezone
import inspect
from uuid import uuid4

from sqlalchemy import delete

import app.routers.calendar as calendar_router
import app.services.calendar_read_models as calendar_read_models
from app.database import get_session_factory
from app.models.calendar import CalendarEvent
from app.models.courses import Subject, Topic
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token
from app.services.gamification_read_models import _sidebar_calendar_days


def test_calendar_events_filter_and_serialize_types(app_client, auth_token, run_db):
    token, _ = auth_token(email="calendar@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math Calendar", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="math-calendar-topic", title="Continuity Calendar", order=1)
            db.add(topic)
            await db.flush()
            start = datetime(2026, 5, 11, 9, 0, tzinfo=timezone.utc)
            outside_range = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
            db.add_all([
                CalendarEvent(
                    event_type="live_session",
                    title="Live continuity",
                    subtitle="Mathematics",
                    teacher_name="Pr Ahmed",
                    subject_id=subject.id,
                    topic_id=topic.id,
                    starts_at=start,
                    ends_at=start + timedelta(hours=1),
                    preparation_href=f"/topics/{topic.id}",
                ),
                CalendarEvent(
                    event_type="study_block",
                    title="Study block",
                    subtitle="Mathematics",
                    teacher_name="Personal study",
                    subject_id=subject.id,
                    topic_id=topic.id,
                    starts_at=start + timedelta(days=1),
                    ends_at=start + timedelta(days=1, hours=2),
                    color="#29aee4",
                ),
                CalendarEvent(
                    event_type="live_session",
                    title="Outside range",
                    starts_at=outside_range,
                    ends_at=outside_range + timedelta(hours=1),
                ),
            ])
            await db.commit()

    run_db(_seed())
    response = app_client.get(
        "/api/calendar/events?start=2026-05-11&end=2026-05-17",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [event["event_type"] for event in body] == ["live_session", "study_block"]
    assert body[0]["subject_title"] == "Math Calendar"
    assert body[0]["topic_title"] == "Continuity Calendar"
    assert body[1]["color"] == "#29aee4"

    paged = app_client.get(
        "/api/calendar/events?start=2026-05-11&end=2026-05-17&limit=1&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert paged.status_code == 200
    assert [event["title"] for event in paged.json()] == ["Study block"]

    invalid = app_client.get(
        "/api/calendar/events?start=2026-05-11&end=2026-05-17&limit=101",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid.status_code == 422


def test_calendar_events_include_entire_utc_end_date_window(app_client, auth_token, run_db):
    token, _ = auth_token(email="calendar-window@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(CalendarEvent))
            subject = Subject(title="Calendar Window", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            event_start = datetime(2026, 5, 17, 23, 30, tzinfo=timezone.utc)
            next_day_start = datetime(2026, 5, 18, 0, 0, tzinfo=timezone.utc)
            db.add_all([
                CalendarEvent(
                    event_type="study_block",
                    title="Late UTC day",
                    subject_id=subject.id,
                    starts_at=event_start,
                    ends_at=event_start + timedelta(minutes=30),
                ),
                CalendarEvent(
                    event_type="study_block",
                    title="Next UTC day",
                    subject_id=subject.id,
                    starts_at=next_day_start,
                    ends_at=next_day_start + timedelta(hours=1),
                ),
            ])
            await db.commit()

    run_db(_seed())
    response = app_client.get(
        "/api/calendar/events?start=2026-05-11&end=2026-05-17",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert [event["title"] for event in response.json()] == ["Late UTC day"]


def test_calendar_events_apply_requested_timezone_window(app_client, auth_token, run_db):
    token, _ = auth_token(email="calendar-timezone-window@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(CalendarEvent))
            subject = Subject(title="Calendar Timezone", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            local_midnight_event = datetime(2026, 5, 11, 23, 15, tzinfo=timezone.utc)
            db.add(CalendarEvent(
                event_type="study_block",
                title="Local next day",
                subject_id=subject.id,
                starts_at=local_midnight_event,
                ends_at=local_midnight_event + timedelta(minutes=30),
            ))
            await db.commit()

    run_db(_seed())

    utc_response = app_client.get(
        "/api/calendar/events?start=2026-05-12&end=2026-05-12",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert utc_response.status_code == 200
    assert utc_response.json() == []

    local_response = app_client.get(
        "/api/calendar/events?start=2026-05-12&end=2026-05-12&timezone=Africa%2FCasablanca",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert local_response.status_code == 200
    assert [event["title"] for event in local_response.json()] == ["Local next day"]

    invalid_response = app_client.get(
        "/api/calendar/events?start=2026-05-12&end=2026-05-12&timezone=Not%2FAZone",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid_response.status_code == 400
    assert invalid_response.json()["detail"] == "Invalid timezone"


def test_calendar_non_live_events_ignore_live_session_join_rows(app_client, auth_token, run_db):
    token, _ = auth_token(email="calendar-non-live-stale-join@example.com", is_pro=False)
    suffix = uuid4().hex[:8]

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title=f"Calendar Non Live {suffix}", description="", is_published=True, order=1)
            track = ProgramTrack(niveau="2BAC", filiere=f"Non Live {suffix}", title=f"Non Live {suffix}")
            professor = User(
                email=f"calendar-non-live-prof-{suffix}@example.com",
                full_name="Prof Non Live",
                role="professor",
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            db.add_all([subject, track, professor])
            await db.flush()
            offering = CourseOffering(
                subject_id=subject.id,
                track_id=track.id,
                professor_user_id=professor.id,
                title=f"Non Live Offering {suffix}",
                status="active",
            )
            db.add(offering)
            await db.flush()
            starts_at = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
            event = CalendarEvent(
                event_type="study_block",
                title="Study block with stale live join",
                subject_id=subject.id,
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=1),
            )
            db.add(event)
            await db.flush()
            db.add(LiveSession(
                course_offering_id=offering.id,
                professor_user_id=professor.id,
                calendar_event_id=event.id,
                title="Unrelated stale live row",
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=1),
                status="scheduled",
            ))
            await db.commit()

    run_db(_seed())

    async def _cleanup():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(LiveSession).where(LiveSession.title == "Unrelated stale live row"))
            await db.execute(delete(CalendarEvent).where(CalendarEvent.title == "Study block with stale live join"))
            await db.commit()

    try:
        response = app_client.get(
            "/api/calendar/events?start=2026-06-01&end=2026-06-01",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert [event["title"] for event in response.json()] == ["Study block with stale live join"]
    finally:
        run_db(_cleanup())


def test_calendar_event_detail_404(app_client, auth_token):
    token, _ = auth_token(email="calendar-404@example.com", is_pro=True)
    response = app_client.get(
        "/api/calendar/events/999999",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


def test_calendar_events_defaults_to_current_week(app_client, auth_token):
    token, _ = auth_token(email="calendar-default@example.com", is_pro=True)
    response = app_client.get(
        "/api/calendar/events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_calendar_events_scope_legacy_role_users_and_hide_live_join_url(app_client, run_db, test_settings):
    from app.services.auth import create_token

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Calendar Scope", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="calendar-scope-topic", title="Scope Topic", order=1)
            db.add(topic)
            await db.flush()
            track = ProgramTrack(niveau="1", filiere="science", title="Scope Track")
            db.add(track)
            await db.flush()
            professor = User(
                email="calendar-legacy-prof@example.com",
                full_name="Prof Scope",
                role="professor",
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            legacy_user = User(
                email="calendar-legacy-user@example.com",
                full_name="Legacy User",
                role="legacy",
                is_email_verified=True,
                is_active=True,
                password="!",
                niveau="",
                filiere="",
            )
            db.add_all([professor, legacy_user])
            await db.flush()
            offering = CourseOffering(
                subject_id=subject.id,
                track_id=track.id,
                professor_user_id=professor.id,
                title="Calendar Scope Offering",
                status="active",
            )
            db.add(offering)
            await db.flush()
            start = datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc)
            live_event = CalendarEvent(
                event_type="live_session",
                title="Scoped live session",
                subtitle="Science",
                teacher_name="Prof Scope",
                subject_id=subject.id,
                topic_id=topic.id,
                starts_at=start,
                ends_at=start + timedelta(hours=1),
                join_url="https://meet.example.com/live/scoped",
            )
            study_event = CalendarEvent(
                event_type="study_block",
                title="Scoped study block",
                subtitle="Science",
                teacher_name="Self study",
                subject_id=subject.id,
                topic_id=topic.id,
                starts_at=start + timedelta(days=1),
                ends_at=start + timedelta(days=1, hours=2),
            )
            db.add_all([live_event, study_event])
            await db.flush()
            db.add(LiveSession(
                course_offering_id=offering.id,
                professor_user_id=professor.id,
                calendar_event_id=live_event.id,
                title="Scoped live session",
                starts_at=live_event.starts_at,
                ends_at=live_event.ends_at,
                join_url=live_event.join_url,
                status="scheduled",
            ))
            await db.commit()
            return create_token(legacy_user.id, test_settings), live_event.id

    token, live_event_id = run_db(_seed())
    response = app_client.get(
        "/api/calendar/events?start=2026-09-01&end=2026-09-07",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [event["title"] for event in body] == ["Scoped study block"]
    assert all(event.get("join_url", "") == "" for event in body)

    detail = app_client.get(
        f"/api/calendar/events/{live_event_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 404


def test_calendar_live_events_require_live_access_and_professor_ownership(app_client, run_db, test_settings):
    suffix = uuid4().hex[:8]

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title=f"Calendar Live Access {suffix}", description="", is_published=True, order=1)
            track = ProgramTrack(niveau="2BAC", filiere=f"Calendar Live {suffix}", title=f"Calendar Live {suffix}")
            professor = User(
                email=f"calendar-live-owner-{suffix}@example.com",
                full_name="Prof Calendar Owner",
                role="professor",
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            inactive_professor = User(
                email=f"calendar-live-inactive-{suffix}@example.com",
                full_name="Prof No Offering",
                role="professor",
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            vip_student = User(
                email=f"calendar-live-vip-{suffix}@example.com",
                full_name="VIP Calendar",
                role="student",
                tier="vip",
                niveau="2BAC",
                filiere=track.filiere,
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            basic_student = User(
                email=f"calendar-live-basic-{suffix}@example.com",
                full_name="Basic Calendar",
                role="student",
                tier="basic",
                niveau="2BAC",
                filiere=track.filiere,
                is_email_verified=True,
                is_active=True,
                password="!",
            )
            db.add_all([subject, track, professor, inactive_professor, vip_student, basic_student])
            await db.flush()
            db.add(UserSubjectEntitlement(
                user_id=vip_student.id,
                subject_id=subject.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                source="test",
                status="active",
            ))
            offering = CourseOffering(
                subject_id=subject.id,
                track_id=track.id,
                professor_user_id=professor.id,
                title=f"Calendar Live Offering {suffix}",
                status="active",
            )
            db.add(offering)
            await db.flush()
            starts_at = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
            live_event = CalendarEvent(
                event_type="live_session",
                title="Entitled live calendar",
                subtitle="Calendar Live",
                teacher_name=professor.full_name,
                subject_id=subject.id,
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=1),
                join_url="https://live.example/calendar-entitled",
            )
            db.add(live_event)
            await db.flush()
            db.add(LiveSession(
                course_offering_id=offering.id,
                professor_user_id=professor.id,
                calendar_event_id=live_event.id,
                title=live_event.title,
                starts_at=live_event.starts_at,
                ends_at=live_event.ends_at,
                join_url=live_event.join_url,
                status="scheduled",
            ))
            await db.commit()
            return {
                "event_id": live_event.id,
                "owner_token": create_token(professor.id, test_settings),
                "inactive_professor_token": create_token(inactive_professor.id, test_settings),
                "vip_token": create_token(vip_student.id, test_settings),
                "basic_token": create_token(basic_student.id, test_settings),
            }

    seeded = run_db(_seed())
    url = "/api/calendar/events?start=2026-10-01&end=2026-10-01"

    vip_list = app_client.get(url, headers={"Authorization": f"Bearer {seeded['vip_token']}"})
    assert vip_list.status_code == 200
    assert any(event["title"] == "Entitled live calendar" for event in vip_list.json())

    vip_detail = app_client.get(
        f"/api/calendar/events/{seeded['event_id']}",
        headers={"Authorization": f"Bearer {seeded['vip_token']}"},
    )
    assert vip_detail.status_code == 200
    assert vip_detail.json()["join_url"] == "https://live.example/calendar-entitled"

    basic_list = app_client.get(url, headers={"Authorization": f"Bearer {seeded['basic_token']}"})
    assert basic_list.status_code == 200
    assert all(event["title"] != "Entitled live calendar" for event in basic_list.json())

    basic_detail = app_client.get(
        f"/api/calendar/events/{seeded['event_id']}",
        headers={"Authorization": f"Bearer {seeded['basic_token']}"},
    )
    assert basic_detail.status_code == 404

    owner_list = app_client.get(url, headers={"Authorization": f"Bearer {seeded['owner_token']}"})
    assert owner_list.status_code == 200
    assert any(event["title"] == "Entitled live calendar" for event in owner_list.json())

    inactive_professor_list = app_client.get(
        url,
        headers={"Authorization": f"Bearer {seeded['inactive_professor_token']}"},
    )
    assert inactive_professor_list.status_code == 200
    assert all(event["title"] != "Entitled live calendar" for event in inactive_professor_list.json())

    inactive_professor_detail = app_client.get(
        f"/api/calendar/events/{seeded['event_id']}",
        headers={"Authorization": f"Bearer {seeded['inactive_professor_token']}"},
    )
    assert inactive_professor_detail.status_code == 404


def test_calendar_read_models_stay_out_of_router():
    router_source = inspect.getsource(calendar_router)
    service_source = inspect.getsource(calendar_read_models)

    assert "from app.services.calendar_read_models import" in router_source
    assert "select(CalendarEvent)" not in router_source
    assert "outerjoin(LiveSession" not in router_source
    assert "ProgramTrack.niveau == user.niveau" not in router_source
    assert "CalendarEventOut(" not in router_source
    assert "CalendarEventDetailOut(**" not in router_source
    assert "HTTPException" not in router_source

    assert "async def list_visible_calendar_events" in service_source
    assert "async def get_visible_calendar_event_detail" in service_source
    assert "def calendar_event_visibility_filter" in service_source
    assert "def calendar_event_out" in service_source
    assert "LiveSession.id.is_(None)" in service_source
    assert "FeatureAccessRequirement(\"live_sessions\")" in service_source
    assert "build_access_context" in service_source
    assert "CourseOffering.professor_user_id == user.id" in service_source
    assert "ProgramTrack.niveau == user.niveau" in service_source
    assert "end must be on or after start" in service_source
    assert "Calendar event not found" in service_source


def test_sidebar_calendar_days_roll_around_today():
    days = _sidebar_calendar_days(date(2026, 5, 26))
    active_days = [day for day in days if day["active"]]

    assert len(days) == 21
    assert active_days == [{"id": "2026-05-26", "label": "Tue", "value": 26, "active": True}]
    assert days[0]["id"] == "2026-05-19"
    assert days[-1]["id"] == "2026-06-08"


def test_sidebar_summary_uses_upcoming_calendar_live_event(app_client, auth_token, run_db):
    token, _ = auth_token(email="sidebar-calendar@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            start = datetime.now(timezone.utc) + timedelta(hours=3)
            db.add(CalendarEvent(
                event_type="live_session",
                title="Upcoming live from calendar",
                subtitle="Physics",
                teacher_name="Pr Salma",
                starts_at=start,
                ends_at=start + timedelta(hours=1),
                preparation_href="/calendar",
            ))
            await db.commit()

    run_db(_seed())
    response = app_client.get(
        "/api/progress/sidebar-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    live_events = response.json()["live_events"]
    assert live_events[0]["title"] == "Upcoming live from calendar"
    assert live_events[0]["href"].startswith("/calendar?event=")


def test_sidebar_summary_does_not_return_demo_live_events(app_client, auth_token, run_db):
    token, _ = auth_token(email="sidebar-calendar-empty@example.com", is_pro=True)

    async def _clear_events():
        session_factory = get_session_factory()
        async with session_factory() as db:
            await db.execute(delete(CalendarEvent))
            await db.commit()

    run_db(_clear_events())
    response = app_client.get(
        "/api/progress/sidebar-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["live_events"] == []
