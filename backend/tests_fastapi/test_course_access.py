from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Exam, Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import TopicItemProgress
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token


async def _seed_topic(
    user_id: int,
    slug: str,
    *,
    item_tier: str = "",
    tab_tier: str = "",
    resource_status: str = "published",
):
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Subject {slug}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topic = Topic(subject_id=subject.id, slug=slug, title=f"Topic {slug}", status="published", is_free_preview=True)
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
        db.add(section)
        await db.flush()
        resource = Resource(
            topic_id=topic.id,
            title="Locked video",
            resource_type="video",
            provider="vdocipher",
            provider_resource_id="secret-video",
            url="https://secret.example/video",
            status=resource_status,
            required_tier=tab_tier,
        )
        db.add(resource)
        await db.flush()
        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            primary_resource_id=resource.id,
            title="Topic item",
            item_type="video",
            status="published",
            required_tier=item_tier,
        )
        db.add(item)
        await db.flush()
        tab = TabContent(
            topic_item_id=item.id,
            resource_id=resource.id,
            label="Course",
            tab_type="course",
            content="secret tab body",
            config_json={"answer": "secret"},
            status="published",
            required_tier=tab_tier,
        )
        db.add(tab)
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
        await db.commit()
        return subject.id, topic.id, item.id, tab.id


def test_topic_workspace_redacts_locked_child_content(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-redaction@example.com", is_pro=False)
    _subject_id, topic_id, _item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-redaction-topic", tab_tier="pro")
    )

    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    item = response.json()["sections"][0]["items"][0]
    tab = item["tabs"][0]
    assert item["can_access"] is True
    assert tab["can_access"] is False
    assert tab["content"] == ""
    assert tab["config_json"] == {}
    assert tab["resource"]["provider_resource_id"] == ""
    assert tab["resource"]["url"] == ""


def test_locked_topic_item_stream_and_completion_are_forbidden(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-forbidden@example.com", is_pro=False)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-forbidden-topic", item_tier="pro")
    )
    headers = {"Authorization": f"Bearer {token}"}

    stream = app_client.get(f"/api/courses/topic-items/{item_id}/stream", headers=headers)
    complete = app_client.post(f"/api/courses/topic-items/{item_id}/complete", headers=headers, json={"watched_seconds": 0})

    assert stream.status_code == 403
    assert complete.status_code == 403


def test_topic_item_stream_enforces_primary_resource_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-locked-primary-resource@example.com", is_pro=False)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-locked-primary-resource", tab_tier="pro")
    )

    stream = app_client.get(
        f"/api/courses/topic-items/{item_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert stream.status_code == 403
    assert stream.json()["detail"] == "pro_required"


def test_topic_item_stream_rejects_unpublished_primary_resource(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-draft-primary-resource@example.com", is_pro=True)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-draft-primary-resource", resource_status="draft")
    )

    stream = app_client.get(
        f"/api/courses/topic-items/{item_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert stream.status_code == 404
    assert stream.json()["detail"] == "No video resource configured for this topic item"


def test_create_topic_returns_created_card_for_unpublished_subject(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            staff = User(
                email="topic-create-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Draft Subject", description="", is_published=False)
            db.add_all([staff, subject])
            await db.commit()
            await db.refresh(staff)
            await db.refresh(subject)
            return create_token(staff.id, test_settings), subject.id

    token, subject_id = run_db(_seed())
    response = app_client.post(
        "/api/courses/topics",
        headers={"Authorization": f"Bearer {token}"},
        json={"subject_id": subject_id, "title": "Draft Topic", "description": "Created under draft"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["subject_id"] == subject_id
    assert data["subject_title"] == "Draft Subject"
    assert data["title"] == "Draft Topic"
    assert data["item_count"] == 0


def test_subject_and_topic_lists_are_paginated_and_query_bounded(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="course-pagination@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            ids = []
            for index in range(6):
                subject = Subject(title=f"Paginated {index}", description="", is_published=True, order=index)
                db.add(subject)
                await db.flush()
                db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
                topic = Topic(subject_id=subject.id, slug=f"paginated-topic-{index}", title=f"Topic {index}", status="published", order=index)
                db.add(topic)
                await db.flush()
                section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
                db.add(section)
                await db.flush()
                db.add(TopicItem(topic_id=topic.id, section_id=section.id, title="Item", item_type="reading", status="published"))
                ids.append(subject.id)
            await db.commit()
            return ids[0]

    subject_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    with query_counter() as subjects_queries:
        subjects_response = app_client.get("/api/courses/subjects?limit=3&offset=1", headers=headers)
    with query_counter() as topics_queries:
        topics_response = app_client.get(f"/api/courses/subjects/{subject_id}/topics?limit=10", headers=headers)

    assert subjects_response.status_code == 200
    assert len(subjects_response.json()) == 3
    assert topics_response.status_code == 200
    assert len(topics_response.json()) == 1
    assert subjects_queries.count <= 6
    assert topics_queries.count <= 8


def test_exam_bank_excludes_exams_under_unpublished_subjects(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="exam-bank-filter@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            published_subject = Subject(title="Published subject", description="", is_published=True, order=1)
            draft_subject = Subject(title="Draft subject", description="", is_published=False, order=2)
            db.add_all([published_subject, draft_subject])
            await db.flush()
            published_exam = Exam(
                subject_id=published_subject.id,
                title="Published exam",
                year=2025,
                session="June",
                statement_url="/published.pdf",
                status="published",
            )
            draft_exam = Exam(
                subject_id=draft_subject.id,
                title="Draft exam",
                year=2024,
                session="June",
                statement_url="/draft.pdf",
                status="published",
            )
            db.add_all([published_exam, draft_exam])
            await db.commit()
            return published_exam.id, draft_exam.id

    published_exam_id, draft_exam_id = run_db(_seed())
    response = app_client.get(
        "/api/courses/exam-bank",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    exams = response.json()
    assert [exam["id"] for exam in exams] == [published_exam_id]
    assert draft_exam_id not in {exam["id"] for exam in exams}


def test_topic_workspace_query_count_is_stable_with_many_items(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="workspace-budget@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Workspace budget", is_published=True)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="workspace-budget", title="Workspace budget", is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            for index in range(25):
                item = TopicItem(topic_id=topic.id, section_id=section.id, title=f"Item {index}", item_type="reading", status="published")
                db.add(item)
                await db.flush()
                db.add(TabContent(topic_item_id=item.id, label="Course", tab_type="course", content="body", status="published"))
                if index % 3 == 0:
                    db.add(TopicItemProgress(user_id=user_id, topic_id=topic.id, topic_item_id=item.id, status="completed"))
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    with query_counter() as queries:
        response = app_client.get(
            f"/api/courses/topics/{topic_id}/workspace",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["item_count"] == 25
    assert queries.count <= 12
