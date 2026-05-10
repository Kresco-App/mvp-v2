from datetime import datetime, timedelta, timezone

from app.database import get_session_factory
from app.models.calendar import CalendarEvent
from app.models.courses import Subject, Topic


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
                    starts_at=start + timedelta(days=10),
                    ends_at=start + timedelta(days=10, hours=1),
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


def test_calendar_event_detail_404(app_client, auth_token):
    token, _ = auth_token(email="calendar-404@example.com", is_pro=True)
    response = app_client.get(
        "/api/calendar/events/999999",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


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
