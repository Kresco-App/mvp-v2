from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.courses import Chapter, ChapterSection, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import ActivityEvent
from app.models.interactions import Comment
from app.models.quizzes import QuestionSet, Quiz
from app.models.users import UserSubjectEntitlement


async def _seed_topic_context(slug: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Subject {slug}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()

        topic = Topic(
            subject_id=subject.id,
            slug=slug,
            title=f"Topic {slug}",
            description="",
            status="published",
        )
        db.add(topic)
        await db.flush()

        section = TopicSection(topic_id=topic.id, title="Main Path", section_type="main_path", order=1)
        db.add(section)
        await db.flush()

        resource = Resource(
            topic_id=topic.id,
            title=f"Resource {slug}",
            resource_type="pdf",
            url=f"/mock/{slug}.pdf",
            status="published",
        )
        db.add(resource)
        await db.flush()

        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            primary_resource_id=resource.id,
            title=f"Item {slug}",
            description="",
            item_type="reading",
            status="published",
        )
        db.add(item)
        await db.flush()

        tab = TabContent(
            topic_item_id=item.id,
            resource_id=resource.id,
            label="Course",
            tab_type="course",
            content="Read this.",
            status="published",
        )
        db.add(tab)
        await db.commit()
        return {
            "subject_id": subject.id,
            "topic_id": topic.id,
            "topic_item_id": item.id,
            "tab_content_id": tab.id,
            "resource_id": resource.id,
        }


def test_note_creation_infers_subject_context_and_records_activity(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interaction-note@example.com", is_pro=True)
    seeded = run_db(_seed_topic_context("interaction-note-context"))

    response = app_client.post(
        "/api/interactions/notes",
        json={
            "tab_content_id": seeded["tab_content_id"],
            "body": "This tab should restore all context.",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    note = response.json()
    assert note["subject_id"] == seeded["subject_id"]
    assert note["topic_id"] == seeded["topic_id"]
    assert note["topic_item_id"] == seeded["topic_item_id"]
    assert note["tab_content_id"] == seeded["tab_content_id"]

    async def _assert_activity():
        session_factory = get_session_factory()
        async with session_factory() as db:
            event = (
                await db.execute(
                    select(ActivityEvent).where(
                        ActivityEvent.user_id == user_id,
                        ActivityEvent.event_type == "note_created",
                        ActivityEvent.target_type == "user_note",
                        ActivityEvent.target_id == note["id"],
                    )
                )
            ).scalar_one()
            assert event.topic_id == seeded["topic_id"]
            assert event.topic_item_id == seeded["topic_item_id"]
            assert event.metadata_json == {
                "subject_id": seeded["subject_id"],
                "tab_content_id": seeded["tab_content_id"],
            }

    run_db(_assert_activity())


def test_saved_tab_content_infers_context_and_keeps_activity_idempotent(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interaction-save-tab@example.com", is_pro=True)
    seeded = run_db(_seed_topic_context("interaction-save-tab-context"))

    response = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "tab_content",
            "target_id": seeded["tab_content_id"],
            "label": "Course tab",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    save = response.json()
    assert save["subject_id"] == seeded["subject_id"]
    assert save["topic_id"] == seeded["topic_id"]
    assert save["topic_item_id"] == seeded["topic_item_id"]

    duplicate = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "tab_content",
            "target_id": seeded["tab_content_id"],
            "label": "Updated label",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == save["id"]
    assert duplicate.json()["label"] == "Updated label"

    async def _assert_activity():
        session_factory = get_session_factory()
        async with session_factory() as db:
            count = (
                await db.execute(
                    select(func.count()).where(
                        ActivityEvent.user_id == user_id,
                        ActivityEvent.event_type == "saved_item_created",
                        ActivityEvent.target_type == "tab_content",
                        ActivityEvent.target_id == seeded["tab_content_id"],
                    )
                )
            ).scalar_one()
            assert count == 1
            event = (
                await db.execute(
                    select(ActivityEvent).where(
                        ActivityEvent.user_id == user_id,
                        ActivityEvent.event_type == "saved_item_created",
                        ActivityEvent.target_type == "tab_content",
                        ActivityEvent.target_id == seeded["tab_content_id"],
                    )
                )
            ).scalar_one()
            assert event.topic_id == seeded["topic_id"]
            assert event.topic_item_id == seeded["topic_item_id"]
            assert event.metadata_json == {
                "saved_item_id": save["id"],
                "subject_id": seeded["subject_id"],
            }

    run_db(_assert_activity())


def test_saved_resource_infers_topic_context_from_primary_resource(app_client, auth_token, run_db):
    token, _ = auth_token(email="interaction-save-resource@example.com", is_pro=True)
    seeded = run_db(_seed_topic_context("interaction-save-resource-context"))

    response = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "resource",
            "target_id": seeded["resource_id"],
            "label": "Reference PDF",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    save = response.json()
    assert save["subject_id"] == seeded["subject_id"]
    assert save["topic_id"] == seeded["topic_id"]
    assert save["topic_item_id"] == seeded["topic_item_id"]


async def _seed_legacy_course_context(slug: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Legacy Subject {slug}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()

        chapter = Chapter(subject_id=subject.id, title="Legacy Chapter", description="", order=1)
        db.add(chapter)
        await db.flush()

        lesson = Lesson(chapter_id=chapter.id, title="Legacy Lesson", duration_seconds=60, order=1)
        section = ChapterSection(
            chapter_id=chapter.id,
            title="Legacy Section",
            section_type="video",
            order=1,
        )
        db.add_all([lesson, section])
        await db.commit()
        return {
            "subject_id": subject.id,
            "chapter_id": chapter.id,
            "lesson_id": lesson.id,
            "section_id": section.id,
        }


def test_saved_legacy_course_targets_infer_subject_context(app_client, auth_token, run_db):
    token, _ = auth_token(email="interaction-save-legacy-course@example.com", is_pro=True)
    seeded = run_db(_seed_legacy_course_context("interaction-save-legacy-course"))

    for target_type, target_id_key in [
        ("lesson", "lesson_id"),
        ("chapter", "chapter_id"),
        ("section", "section_id"),
    ]:
        response = app_client.post(
            "/api/interactions/saves",
            json={
                "target_type": target_type,
                "target_id": seeded[target_id_key],
                "label": f"Legacy {target_type}",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        save = response.json()
        assert save["subject_id"] == seeded["subject_id"]
        assert save["topic_id"] is None
        assert save["topic_item_id"] is None


async def _seed_legacy_quiz_with_colliding_question_set():
    session_factory = get_session_factory()
    async with session_factory() as db:
        correct_subject = Subject(title="Legacy Quiz Subject", description="", is_published=True, order=1)
        wrong_subject = Subject(title="Unrelated Question Set Subject", description="", is_published=True, order=2)
        db.add_all([correct_subject, wrong_subject])
        await db.flush()

        chapter = Chapter(subject_id=correct_subject.id, title="Legacy Chapter", description="", order=1)
        db.add(chapter)
        await db.flush()

        lesson = Lesson(chapter_id=chapter.id, title="Legacy Lesson", duration_seconds=60, order=1)
        db.add(lesson)
        await db.flush()

        colliding_id = 900001
        quiz = Quiz(id=colliding_id, lesson_id=lesson.id, title="Legacy Quiz", pass_score=70)
        wrong_question_set = QuestionSet(
            id=colliding_id,
            subject_id=wrong_subject.id,
            title="Unrelated Question Set",
            source_type="tab",
        )
        db.add_all([quiz, wrong_question_set])
        await db.commit()
        return {
            "quiz_id": quiz.id,
            "correct_subject_id": correct_subject.id,
            "wrong_subject_id": wrong_subject.id,
        }


def test_saved_legacy_quiz_context_ignores_colliding_question_set_id(app_client, auth_token, run_db):
    token, _ = auth_token(email="interaction-save-legacy-quiz@example.com", is_pro=True)
    seeded = run_db(_seed_legacy_quiz_with_colliding_question_set())

    response = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "quiz",
            "target_id": seeded["quiz_id"],
            "label": "Legacy quiz",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    save = response.json()
    assert save["subject_id"] == seeded["correct_subject_id"]
    assert save["subject_id"] != seeded["wrong_subject_id"]


async def _seed_question_set_quiz_context(slug: str):
    seeded = await _seed_topic_context(slug)
    session_factory = get_session_factory()
    async with session_factory() as db:
        question_set = QuestionSet(
            subject_id=seeded["subject_id"],
            topic_id=seeded["topic_id"],
            topic_item_id=seeded["topic_item_id"],
            tab_content_id=seeded["tab_content_id"],
            title=f"Question Set {slug}",
            source_type="tab",
        )
        db.add(question_set)
        await db.commit()
        await db.refresh(question_set)
        return {**seeded, "question_set_id": question_set.id}


def test_saved_question_set_quiz_context_falls_back_when_no_legacy_quiz_exists(app_client, auth_token, run_db):
    token, _ = auth_token(email="interaction-save-question-set-quiz@example.com", is_pro=True)
    seeded = run_db(_seed_question_set_quiz_context("interaction-save-question-set-quiz"))

    response = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "quiz",
            "target_id": seeded["question_set_id"],
            "label": "Question set quiz",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    save = response.json()
    assert save["subject_id"] == seeded["subject_id"]
    assert save["topic_id"] == seeded["topic_id"]
    assert save["topic_item_id"] == seeded["topic_item_id"]


def test_saved_unknown_quiz_context_stays_empty_without_error(app_client, auth_token):
    token, _ = auth_token(email="interaction-save-unknown-quiz@example.com", is_pro=True)

    response = app_client.post(
        "/api/interactions/saves",
        json={
            "target_type": "quiz",
            "target_id": 987654321,
            "label": "Unknown quiz",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    save = response.json()
    assert save["subject_id"] is None
    assert save["topic_id"] is None
    assert save["topic_item_id"] is None


def test_topic_item_comments_require_comments_tab_and_use_topic_key(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interaction-topic-comments@example.com", is_pro=False)
    seeded = run_db(_seed_topic_context("interaction-topic-comments"))
    headers = {"Authorization": f"Bearer {token}"}

    blocked = app_client.get(
        f"/api/interactions/comments?topic_item_id={seeded['topic_item_id']}",
        headers=headers,
    )
    assert blocked.status_code == 404
    assert blocked.json()["detail"] == "Comments are not enabled for this item"

    async def _enable_comments_tab():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=seeded["subject_id"],
                source="test",
                status="active",
            ))
            db.add(TabContent(
                topic_item_id=seeded["topic_item_id"],
                label="Discussion",
                tab_type="comments",
                content="",
                status="published",
            ))
            await db.commit()

    run_db(_enable_comments_tab())

    created = app_client.post(
        "/api/interactions/comments",
        json={"topic_item_id": seeded["topic_item_id"], "body": "This belongs to the topic item."},
        headers=headers,
    )
    assert created.status_code == 200
    comment = created.json()
    assert comment["topic_item_id"] == seeded["topic_item_id"]
    assert "target_type" not in comment
    assert "target_id" not in comment

    listed = app_client.get(
        f"/api/interactions/comments?topic_item_id={seeded['topic_item_id']}",
        headers=headers,
    )
    assert listed.status_code == 200
    assert [item["body"] for item in listed.json()] == ["This belongs to the topic item."]


def test_topic_item_comments_are_limit_offset_paginated(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interaction-topic-comments-page@example.com", is_pro=False)
    seeded = run_db(_seed_topic_context("interaction-topic-comments-page"))
    headers = {"Authorization": f"Bearer {token}"}

    async def _enable_comments_and_seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(UserSubjectEntitlement(
                user_id=user_id,
                subject_id=seeded["subject_id"],
                source="test",
                status="active",
            ))
            db.add(TabContent(
                topic_item_id=seeded["topic_item_id"],
                label="Discussion",
                tab_type="comments",
                content="",
                status="published",
            ))
            await db.flush()

            comments = []
            for index in range(8):
                comment = Comment(
                    user_id=user_id,
                    topic_item_id=seeded["topic_item_id"],
                    body=f"comment {index}",
                )
                db.add(comment)
                comments.append(comment)
            await db.flush()
            db.add(Comment(
                user_id=user_id,
                topic_item_id=seeded["topic_item_id"],
                parent_id=comments[3].id,
                body="reply to comment 3",
            ))
            await db.commit()

    run_db(_enable_comments_and_seed())

    page = app_client.get(
        f"/api/interactions/comments?topic_item_id={seeded['topic_item_id']}&limit=3&offset=2",
        headers=headers,
    )
    assert page.status_code == 200
    assert [item["body"] for item in page.json()] == ["comment 2", "comment 3", "comment 4"]
    assert page.json()[1]["reply_count"] == 1

    invalid = app_client.get(
        f"/api/interactions/comments?topic_item_id={seeded['topic_item_id']}&limit=101",
        headers=headers,
    )
    assert invalid.status_code == 422
