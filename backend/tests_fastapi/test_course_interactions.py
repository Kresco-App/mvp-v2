from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import TopicItemProgress, UserStats
from app.models.interactions import ALLOWED_TARGET_TYPES, Comment, SavedItem, UserNote
from app.models.quizzes import QuestionSet
import app.services.interaction_mutations as interaction_mutations
from app.models.users import User, UserSubjectEntitlement


async def _seed_context(user_id: int, slug: str, *, item_tier: str = "", tab_tier: str = ""):
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title=f"Interaction {slug}", description="", is_published=True, order=1)
        db.add(subject)
        await db.flush()
        topic = Topic(subject_id=subject.id, slug=slug, title=f"Topic {slug}", status="published", is_free_preview=True)
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
        db.add(section)
        await db.flush()
        resource = Resource(topic_id=topic.id, title="Resource", resource_type="pdf", url="/mock.pdf", status="published")
        db.add(resource)
        await db.flush()
        secondary_resource = Resource(topic_id=topic.id, title="Worksheet", resource_type="pdf", url="/worksheet.pdf", status="published")
        db.add(secondary_resource)
        await db.flush()
        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            primary_resource_id=resource.id,
            title="Item",
            item_type="reading",
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
            content="Body",
            status="published",
            order=1,
            required_tier=tab_tier,
        )
        comments_tab = TabContent(topic_item_id=item.id, label="Discussion", tab_type="comments", status="published", order=2)
        resource_tab = TabContent(topic_item_id=item.id, resource_id=secondary_resource.id, label="Worksheet", tab_type="resource", content="Worksheet body", status="published", order=3)
        db.add_all([tab, comments_tab, resource_tab])
        await db.flush()
        question_set = QuestionSet(
            title="Interaction quiz",
            subject_id=subject.id,
            topic_id=topic.id,
            topic_item_id=item.id,
            tab_content_id=tab.id,
            source_type="tab",
        )
        db.add(question_set)
        db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
        await db.commit()
        return {
            "subject_id": subject.id,
            "topic_id": topic.id,
            "topic_item_id": item.id,
            "tab_content_id": tab.id,
            "resource_id": resource.id,
            "secondary_tab_content_id": resource_tab.id,
            "secondary_resource_id": secondary_resource.id,
            "question_set_id": question_set.id,
        }


def test_comment_access_reuses_single_access_context_build(app_client, auth_token, run_db, monkeypatch):
    token, user_id = auth_token(email="interactions-comment-access@example.com", is_pro=False)
    seeded = run_db(_seed_context(user_id, "interactions-comment-access"))
    del token

    calls = []
    from app.services.access import build_access_context as real_build_access_context

    async def tracked_build_access_context(db, user):
        calls.append(True)
        return await real_build_access_context(db, user)

    monkeypatch.setattr(interaction_mutations, "build_access_context", tracked_build_access_context)

    async def _check():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            await interaction_mutations.require_comments_enabled_for_topic_item(db, user, seeded["topic_item_id"])

    run_db(_check())
    assert len(calls) == 1


def test_legacy_interaction_targets_are_rejected():
    assert {"lesson", "chapter", "section"}.isdisjoint(ALLOWED_TARGET_TYPES)


def test_notes_and_saves_infer_topic_context_and_dedupe(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-context@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-context"))
    headers = {"Authorization": f"Bearer {token}"}

    note_response = app_client.post(
        "/api/interactions/notes",
        headers=headers,
        json={"tab_content_id": seeded["tab_content_id"], "body": "context note"},
    )
    save_response = app_client.post(
        "/api/interactions/saves",
        headers=headers,
        json={"target_type": "tab_content", "target_id": seeded["tab_content_id"], "label": "Course tab"},
    )
    duplicate_response = app_client.post(
        "/api/interactions/saves",
        headers=headers,
        json={"target_type": "tab_content", "target_id": seeded["tab_content_id"], "label": "Updated label"},
    )

    assert note_response.status_code == 200
    assert save_response.status_code == 200
    assert duplicate_response.status_code == 200
    note = note_response.json()
    save = save_response.json()
    duplicate = duplicate_response.json()
    assert note["subject_id"] == seeded["subject_id"]
    assert note["topic_id"] == seeded["topic_id"]
    assert note["topic_item_id"] == seeded["topic_item_id"]
    assert save["topic_item_id"] == seeded["topic_item_id"]
    assert duplicate["id"] == save["id"]
    assert duplicate["label"] == "Updated label"

    async def _assert_persisted_once():
        session_factory = get_session_factory()
        async with session_factory() as db:
            save_count = await db.scalar(
                select(func.count()).select_from(SavedItem).where(
                    SavedItem.user_id == user_id,
                    SavedItem.target_type == "tab_content",
                    SavedItem.target_id == seeded["tab_content_id"],
                )
            )
            assert save_count == 1

    run_db(_assert_persisted_once())


def test_notes_support_tab_filters_and_owner_mutations(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-note-mutations@example.com", is_pro=True)
    other_token, _other_user_id = auth_token(email="interactions-note-other@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-note-mutations"))
    headers = {"Authorization": f"Bearer {token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    primary_note = app_client.post(
        "/api/interactions/notes",
        headers=headers,
        json={"tab_content_id": seeded["tab_content_id"], "body": "primary note"},
    )
    secondary_note = app_client.post(
        "/api/interactions/notes",
        headers=headers,
        json={"tab_content_id": seeded["secondary_tab_content_id"], "body": "secondary note"},
    )

    assert primary_note.status_code == 200
    assert secondary_note.status_code == 200

    primary_note_id = primary_note.json()["id"]
    filtered = app_client.get(
        f"/api/interactions/notes?topic_item_id={seeded['topic_item_id']}&tab_content_id={seeded['tab_content_id']}",
        headers=headers,
    )
    updated = app_client.patch(
        f"/api/interactions/notes/{primary_note_id}",
        headers=headers,
        json={"body": "updated primary note"},
    )
    forbidden_update = app_client.patch(
        f"/api/interactions/notes/{primary_note_id}",
        headers=other_headers,
        json={"body": "intrusion"},
    )
    deleted = app_client.delete(f"/api/interactions/notes/{primary_note_id}", headers=headers)
    filtered_after_delete = app_client.get(
        f"/api/interactions/notes?topic_item_id={seeded['topic_item_id']}&tab_content_id={seeded['tab_content_id']}",
        headers=headers,
    )

    assert filtered.status_code == 200
    assert [note["id"] for note in filtered.json()] == [primary_note_id]
    assert updated.status_code == 200
    assert updated.json()["body"] == "updated primary note"
    assert forbidden_update.status_code == 404
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True, "id": primary_note_id}
    assert filtered_after_delete.status_code == 200
    assert filtered_after_delete.json() == []


def test_topic_and_question_set_saves_infer_course_context(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-topic-context@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-topic-question-set-context"))
    headers = {"Authorization": f"Bearer {token}"}

    topic_save = app_client.post(
        "/api/interactions/saves",
        headers=headers,
        json={"target_type": "topic", "target_id": seeded["topic_id"], "label": "Topic"},
    )
    question_set_save = app_client.post(
        "/api/interactions/saves",
        headers=headers,
        json={
            "target_type": "question_set",
            "target_id": seeded["question_set_id"],
            "label": "Quiz",
        },
    )

    assert topic_save.status_code == 200
    assert question_set_save.status_code == 200
    topic_data = topic_save.json()
    question_set_data = question_set_save.json()
    assert topic_data["subject_id"] == seeded["subject_id"]
    assert topic_data["topic_id"] == seeded["topic_id"]
    assert question_set_data["subject_id"] == seeded["subject_id"]
    assert question_set_data["topic_id"] == seeded["topic_id"]
    assert question_set_data["topic_item_id"] == seeded["topic_item_id"]


def test_save_item_rejects_inferred_locked_topic_item_context(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-save-locked-context@example.com", is_pro=False)
    seeded = run_db(_seed_context(user_id, "interactions-save-locked-context", item_tier="pro"))
    headers = {"Authorization": f"Bearer {token}"}

    response = app_client.post(
        "/api/interactions/saves",
        headers=headers,
        json={"target_type": "tab_content", "target_id": seeded["tab_content_id"], "label": "Locked tab"},
    )

    assert response.status_code == 403


def test_resource_open_requires_access_infers_workspace_context_and_marks_progress(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-resource-open@example.com", is_pro=True)
    locked_token, locked_user_id = auth_token(email="interactions-resource-locked@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-resource-open"))

    async def _scope_locked_user_to_other_subject():
        session_factory = get_session_factory()
        async with session_factory() as db:
            other_subject = Subject(title="Other subject", description="", is_published=True, order=99)
            db.add(other_subject)
            await db.flush()
            db.add(UserSubjectEntitlement(user_id=locked_user_id, subject_id=other_subject.id, status="active", source="test"))
            await db.commit()

    run_db(_scope_locked_user_to_other_subject())
    headers = {"Authorization": f"Bearer {token}"}
    locked_headers = {"Authorization": f"Bearer {locked_token}"}

    opened = app_client.post(
        f"/api/courses/resources/{seeded['secondary_resource_id']}/open",
        headers=headers,
    )
    locked = app_client.post(
        f"/api/courses/resources/{seeded['secondary_resource_id']}/open",
        headers=locked_headers,
    )

    assert opened.status_code == 200
    assert locked.status_code == 403
    opened_data = opened.json()
    assert opened_data["resource_id"] == seeded["secondary_resource_id"]
    assert opened_data["subject_id"] == seeded["subject_id"]
    assert opened_data["topic_id"] == seeded["topic_id"]
    assert opened_data["topic_item_id"] == seeded["topic_item_id"]
    assert opened_data["tab_content_id"] == seeded["secondary_tab_content_id"]
    assert opened_data["progress_status"] == "started"

    complete = app_client.post(
        f"/api/courses/topic-items/{seeded['topic_item_id']}/complete",
        headers=headers,
        json={"watched_seconds": 0},
    )
    reopened = app_client.post(
        f"/api/courses/resources/{seeded['resource_id']}/open",
        headers=headers,
        json={"topic_item_id": seeded["topic_item_id"]},
    )

    assert complete.status_code == 200
    assert reopened.status_code == 200
    assert reopened.json()["progress_status"] == "completed"

    async def _assert_progress():
        session_factory = get_session_factory()
        async with session_factory() as db:
            progress = await db.scalar(
                select(TopicItemProgress).where(
                    TopicItemProgress.user_id == user_id,
                    TopicItemProgress.topic_item_id == seeded["topic_item_id"],
                )
            )
            assert progress is not None
            assert progress.status == "completed"

    run_db(_assert_progress())


def test_topic_item_completion_updates_user_stats(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-completion-stats@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Completion stats", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="interactions-completion-stats",
                title="Completion stats",
                status="published",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Reading with progress",
                item_type="reading",
                status="published",
                duration_seconds=60,
            )
            db.add(item)
            await db.flush()
            db.add_all([
                UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"),
                TopicItemProgress(
                    user_id=user_id,
                    topic_id=topic.id,
                    topic_item_id=item.id,
                    status="started",
                    watched_seconds=10,
                    updated_at=datetime.now(timezone.utc) - timedelta(seconds=30),
                ),
            ])
            await db.commit()
            return item.id

    item_id = run_db(_seed())
    completed = app_client.post(
        f"/api/courses/topic-items/{item_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={"watched_seconds": 30},
    )

    assert completed.status_code == 200

    async def _assert_stats():
        session_factory = get_session_factory()
        async with session_factory() as db:
            stats = await db.get(UserStats, user_id)
            assert stats is not None
            assert stats.total_watch_seconds == 20
            assert stats.lessons_completed == 1

    run_db(_assert_stats())


def test_parallel_video_items_share_user_watch_accrual_budget(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-watch-budget@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Watch budget", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="interactions-watch-budget",
                title="Watch budget",
                status="published",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Videos", section_type="main", order=1)
            db.add(section)
            await db.flush()
            first = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="First video",
                item_type="video",
                status="published",
                duration_seconds=120,
            )
            second = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Second video",
                item_type="video",
                status="published",
                duration_seconds=120,
            )
            db.add_all([
                first,
                second,
                UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"),
            ])
            await db.commit()
            return first.id, second.id

    first_id, second_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(
        f"/api/courses/topic-items/{first_id}/complete",
        headers=headers,
        json={"watched_seconds": 120},
    )
    second = app_client.post(
        f"/api/courses/topic-items/{second_id}/complete",
        headers=headers,
        json={"watched_seconds": 120},
    )

    assert first.status_code == 409
    assert second.status_code == 409

    async def _assert_progress_budget():
        session_factory = get_session_factory()
        async with session_factory() as db:
            progress_rows = (
                await db.execute(
                    select(TopicItemProgress)
                    .where(TopicItemProgress.user_id == user_id)
                    .order_by(TopicItemProgress.topic_item_id.asc())
                )
            ).scalars().all()
            stats = await db.get(UserStats, user_id)
            watched_seconds = [progress.watched_seconds for progress in progress_rows]
            assert watched_seconds[0] == 5
            assert 0 <= watched_seconds[1] < 5
            assert [progress.status for progress in progress_rows] == ["started", "started"]
            assert stats is not None
            assert stats.total_watch_seconds == sum(watched_seconds)
            assert stats.total_watch_seconds < 10
            assert stats.lessons_completed == 0

    run_db(_assert_progress_budget())


def test_comments_require_enabled_tab_and_keep_parent_inside_item(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-comments@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-comments"))
    headers = {"Authorization": f"Bearer {token}"}

    parent = app_client.post(
        "/api/interactions/comments",
        headers=headers,
        json={"topic_item_id": seeded["topic_item_id"], "body": "parent"},
    )
    reply = app_client.post(
        "/api/interactions/comments",
        headers=headers,
        json={"topic_item_id": seeded["topic_item_id"], "body": "reply", "parent_id": parent.json()["id"]},
    )
    listing = app_client.get(f"/api/interactions/comments?topic_item_id={seeded['topic_item_id']}", headers=headers)

    assert parent.status_code == 200
    assert reply.status_code == 200
    assert listing.status_code == 200
    assert listing.json()[0]["reply_count"] == 1

    async def _seed_other_item():
        session_factory = get_session_factory()
        async with session_factory() as db:
            section_id = await db.scalar(select(TopicItem.section_id).where(TopicItem.id == seeded["topic_item_id"]))
            topic_id = seeded["topic_id"]
            other = TopicItem(topic_id=topic_id, section_id=section_id, title="Other", item_type="reading", status="published")
            db.add(other)
            await db.flush()
            db.add(TabContent(topic_item_id=other.id, label="Discussion", tab_type="comments", status="published"))
            await db.commit()
            return other.id

    other_item_id = run_db(_seed_other_item())
    bad_reply = app_client.post(
        "/api/interactions/comments",
        headers=headers,
        json={"topic_item_id": other_item_id, "body": "bad", "parent_id": parent.json()["id"]},
    )
    assert bad_reply.status_code == 400


def test_interaction_lists_are_paginated_and_query_bounded(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="interactions-pagination@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-pagination"))

    async def _seed_many():
        session_factory = get_session_factory()
        async with session_factory() as db:
            for index in range(8):
                db.add(UserNote(user_id=user_id, topic_id=seeded["topic_id"], topic_item_id=seeded["topic_item_id"], body=f"note {index}"))
                db.add(SavedItem(user_id=user_id, target_type="topic_item", target_id=seeded["topic_item_id"] + index, topic_id=seeded["topic_id"], topic_item_id=seeded["topic_item_id"]))
            await db.commit()

    run_db(_seed_many())
    headers = {"Authorization": f"Bearer {token}"}

    with query_counter() as note_queries:
        notes = app_client.get("/api/interactions/notes?limit=3&offset=2", headers=headers)
    with query_counter() as save_queries:
        saves = app_client.get("/api/interactions/saves?limit=3&offset=2", headers=headers)

    assert notes.status_code == 200
    assert saves.status_code == 200
    assert len(notes.json()) == 3
    assert len(saves.json()) == 3
    assert note_queries.count <= 3
    assert save_queries.count <= 3
