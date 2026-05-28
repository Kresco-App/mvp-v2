from datetime import date, datetime, timedelta, timezone
import inspect

from sqlalchemy import delete

import app.routers.calendar as calendar_router
import app.services.calendar_read_models as calendar_read_models
from app.database import get_session_factory
from app.models.calendar import CalendarEvent
from app.models.courses import Subject, Topic
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User
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
