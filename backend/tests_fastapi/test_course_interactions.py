from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import TopicItemProgress
from app.models.interactions import ALLOWED_TARGET_TYPES, Comment, SavedItem, UserNote
from app.models.quizzes import QuestionSet
from app.models.users import UserSubjectEntitlement


async def _seed_context(user_id: int, slug: str):
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
        item = TopicItem(topic_id=topic.id, section_id=section.id, primary_resource_id=resource.id, title="Item", item_type="reading", status="published")
        db.add(item)
        await db.flush()
        tab = TabContent(topic_item_id=item.id, resource_id=resource.id, label="Course", tab_type="course", content="Body", status="published", order=1)
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


def test_resource_open_requires_access_infers_workspace_context_and_marks_progress(app_client, auth_token, run_db):
    token, user_id = auth_token(email="interactions-resource-open@example.com", is_pro=True)
    locked_token, _locked_user_id = auth_token(email="interactions-resource-locked@example.com", is_pro=True)
    seeded = run_db(_seed_context(user_id, "interactions-resource-open"))
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
