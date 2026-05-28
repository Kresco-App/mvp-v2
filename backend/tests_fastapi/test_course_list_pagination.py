from uuid import uuid4

from app.database import get_session_factory
from app.models.courses import Chapter, Subject, Topic


async def _seed_subjects_for_pagination() -> list[int]:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subjects = [
            Subject(title=f"Pagination Subject {suffix} A", description="", is_published=True, order=-100000),
            Subject(title=f"Pagination Subject {suffix} B", description="", is_published=True, order=-99999),
            Subject(title=f"Pagination Subject {suffix} C", description="", is_published=True, order=-99998),
        ]
        db.add_all(subjects)
        await db.commit()
        return [subject.id for subject in subjects]


async def _seed_topics_for_pagination() -> tuple[int, list[int]]:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Pagination Topics {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topics = [
            Topic(subject_id=subject.id, slug=f"pagination-topic-{suffix}-a", title="Pagination Topic A", order=1, status="published"),
            Topic(subject_id=subject.id, slug=f"pagination-topic-{suffix}-b", title="Pagination Topic B", order=2, status="published"),
            Topic(subject_id=subject.id, slug=f"pagination-topic-{suffix}-c", title="Pagination Topic C", order=3, status="published"),
        ]
        db.add_all(topics)
        await db.commit()
        return subject.id, [topic.id for topic in topics]


async def _seed_subject_with_chapter() -> tuple[int, int]:
    suffix = uuid4().hex[:8]
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Auth Subject {suffix}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        chapter = Chapter(subject_id=subject.id, title=f"Auth Chapter {suffix}", order=1)
        db.add(chapter)
        await db.commit()
        return subject.id, chapter.id


def test_subject_listing_is_bounded_by_limit_and_offset(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="course-subject-pagination@example.com")
    subject_ids = run_db(_seed_subjects_for_pagination())

    response = app_client.get(
        "/api/courses/subjects?limit=2&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert [subject["id"] for subject in response.json()] == subject_ids[1:]


def test_topic_listing_is_bounded_by_limit_and_offset(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="course-pagination@example.com")
    subject_id, topic_ids = run_db(_seed_topics_for_pagination())

    response = app_client.get(
        f"/api/courses/topics?subject_id={subject_id}&limit=2&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert [topic["id"] for topic in response.json()] == topic_ids[1:]


def test_course_list_pagination_rejects_unbounded_limits(app_client, auth_token):
    token, _user_id = auth_token(email="course-pagination-limit@example.com")

    subject_response = app_client.get(
        "/api/courses/subjects?limit=1000",
        headers={"Authorization": f"Bearer {token}"},
    )
    topic_response = app_client.get(
        "/api/courses/topics?limit=1000",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert subject_response.status_code == 422
    assert topic_response.status_code == 422


def test_legacy_course_structure_requires_authentication(app_client, run_db):
    subject_id, chapter_id = run_db(_seed_subject_with_chapter())

    subject_list = app_client.get("/api/courses/subjects")
    subject_detail = app_client.get(f"/api/courses/subjects/{subject_id}")
    chapter_detail = app_client.get(f"/api/courses/chapters/{chapter_id}")

    assert subject_list.status_code == 401
    assert subject_detail.status_code == 401
    assert chapter_detail.status_code == 401


def test_legacy_course_missing_section_semantics_are_preserved(app_client, auth_token):
    token, _user_id = auth_token(email="course-legacy-missing@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    missing_chapter_sections = app_client.get("/api/courses/chapters/999999999/sections", headers=headers)
    assert missing_chapter_sections.status_code == 200
    assert missing_chapter_sections.json() == []

    missing_section_stream = app_client.get("/api/courses/sections/999999999/stream", headers=headers)
    assert missing_section_stream.status_code == 404
    assert missing_section_stream.json()["detail"] == "Section not found"
