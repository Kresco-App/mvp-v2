from datetime import datetime, timedelta, timezone

from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import ActivityEvent, QuestionAttempt, QuizAttempt, TopicItemProgress, XPTransaction
from app.models.quizzes import Question, QuestionSet
from app.models.users import UserSubjectEntitlement
from sqlalchemy import func, select


def test_tab_quiz_grades_required_question_types(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-types@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="quiz-types-topic", title="Quiz Types", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Quiz item", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Quiz",
                tab_type="quiz",
                order=1,
                config_json={
                    "pass_score": 70,
                    "questions": [
                        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
                        {"id": "tf", "type": "true_false", "prompt": "True?", "options": ["true", "false"], "answer": "true"},
                        {"id": "blank", "type": "fill_in_blank", "prompt": "Fill", "answer": "lambda"},
                        {"id": "multi", "type": "multi_select", "prompt": "Pick two", "options": ["a", "b", "c"], "answer": ["a", "c"]},
                        {"id": "num", "type": "numeric_answer", "prompt": "2+2", "answer": "4", "tolerance": 0},
                        {"id": "short", "type": "short_answer", "prompt": "Keyword", "accepted_answers": ["unit", "units"], "answer": "unit"},
                        {"id": "match", "type": "matching", "prompt": "Match", "answer": {"T": "s", "f": "Hz"}},
                        {"id": "order", "type": "ordering", "prompt": "Order", "answer": ["define", "substitute", "conclude"]},
                        {"id": "drag", "type": "drag_and_drop", "prompt": "Sort", "answer": {"period": "time", "lambda": "space"}},
                        {"id": "checkpoint", "type": "interactive_checkpoint", "prompt": "Checkpoint", "answer": "done"},
                    ],
                },
            )
            db.add(tab)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "mc": "A",
                "tf": "true",
                "blank": "Lambda",
                "multi": ["c", "a"],
                "num": "4",
                "short": "units",
                "match": {"T": "s", "f": "Hz"},
                "order": ["define", "substitute", "conclude"],
                "drag": {"period": "time", "lambda": "space"},
                "checkpoint": "done",
            }
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 10
    assert body["score"] == 100
    assert body["passed"] is True
    assert all("answer" not in item for item in body["grading"]["questions"])

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            questions = (await db.execute(select(Question).where(Question.question_set_id == question_set.id))).scalars().all()
            quiz_attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            question_attempts = (await db.execute(select(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            xp_rows = (await db.execute(select(XPTransaction).where(XPTransaction.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            assert question_set.topic_section_id is not None
            assert len(questions) == 10
            assert len(question_attempts) == 10
            assert all(attempt.is_correct for attempt in question_attempts)
            assert len(xp_rows) == 11
            assert {row.reason for row in xp_rows} == {"quiz_correct", "quiz_pass"}

    run_db(_assert_tracking())


def test_topic_workspace_scrubs_quiz_answer_payloads(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-scrub@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Quiz Scrub Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="quiz-scrub-topic", title="Quiz Scrub", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Quizzes", section_type="quizzes", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Quiz item", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Quiz",
                tab_type="quiz",
                order=1,
                config_json={
                    "pass_score": 70,
                    "questions": [
                        {
                            "id": "mc",
                            "type": "multiple_choice",
                            "prompt": "Pick A",
                            "options": [
                                {"text": "A", "is_correct": True},
                                {"text": "B", "is_correct": False},
                            ],
                            "answer": "A",
                            "accepted_answers": ["A"],
                        },
                        {
                            "id": "match",
                            "type": "matching",
                            "prompt": "Match",
                            "answer": {"T": "s", "f": "Hz"},
                        },
                        {
                            "id": "hotspot",
                            "type": "image_hotspot",
                            "prompt": "Aim",
                            "answerRegion": {"shape": "ellipse", "x": 50, "y": 50, "rx": 10, "ry": 10},
                        },
                    ],
                },
            )
            db.add(tab)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())

    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    tab_config = response.json()["sections"][0]["items"][0]["tabs"][0]["config_json"]
    assert not _contains_any_key(
        tab_config,
        {
            "accepted_answers",
            "answer",
            "answerRegion",
            "correct",
            "correct_answer",
            "correctIndex",
            "is_correct",
        },
    )
    questions = tab_config["questions"]
    assert questions[1]["pairs"] == [{"left": "T"}, {"left": "f"}]


def test_tab_quiz_rejects_negative_hotspot_radius_expansion(app_client, auth_token, run_db):
    token, user_id = auth_token(email="hotspot-radius@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Hotspot Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="hotspot-radius-topic", title="Hotspot Quiz", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Hotspots", section_type="chapter", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Hotspot quiz", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Hotspot",
                tab_type="quiz",
                order=1,
                config_json={
                    "pass_score": 100,
                    "questions": [
                        {
                            "id": "hotspot",
                            "type": "image_hotspot",
                            "title": "Hotspot",
                            "prompt": "Aim",
                            "answerRegion": {"shape": "ellipse", "x": 50, "y": 50, "rx": 10, "ry": 10},
                        }
                    ],
                },
            )
            db.add(tab)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "hotspot": {"x": 1000, "y": 1000, "radius": -10000},
            },
            "duration_seconds": 10,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 0
    assert body["score"] == 0
    assert body["passed"] is False

    async def _assert_attempt():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_attempt = (
                await db.execute(
                    select(QuestionAttempt)
                    .join(QuizAttempt, QuestionAttempt.quiz_attempt_id == QuizAttempt.id)
                    .join(QuestionSet, QuizAttempt.question_set_id == QuestionSet.id)
                    .where(QuestionSet.tab_content_id == tab_id)
                )
            ).scalar_one()
            assert question_attempt.is_correct is False

    run_db(_assert_attempt())


def test_tab_quiz_reuses_identical_submission(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-idempotency@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Idempotent Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="idempotent-quiz-topic", title="Idempotent Quiz", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Quiz item", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Quiz",
                tab_type="quiz",
                order=1,
                config_json={
                    "pass_score": 70,
                    "questions": [
                        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
                    ],
                },
            )
            db.add(tab)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"answers": {"mc": "A"}}
    variant_payload = {"answers": {"mc": " a ", "ignored": "attacker-controlled-junk"}}

    first = app_client.post(f"/api/courses/tabs/{tab_id}/quiz/submit", headers=headers, json=payload)
    duplicate = app_client.post(f"/api/courses/tabs/{tab_id}/quiz/submit", headers=headers, json=variant_payload)

    assert first.status_code == 200
    assert first.json()["xp_earned"] == 25
    assert duplicate.status_code == 200
    assert duplicate.json()["xp_earned"] == 0
    assert duplicate.json()["grading"] == first.json()["grading"]

    async def _assert_single_submission():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            attempts = (
                await db.execute(select(QuizAttempt).where(QuizAttempt.user_id == user_id, QuizAttempt.question_set_id == question_set.id))
            ).scalars().all()
            assert len(attempts) == 1
            question_attempt_count = await db.scalar(
                select(func.count()).select_from(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == attempts[0].id)
            )
            xp_count = await db.scalar(
                select(func.count()).select_from(XPTransaction).where(XPTransaction.quiz_attempt_id == attempts[0].id)
            )
            assert len(attempts[0].submission_hash or "") == 64
            assert question_attempt_count == 1
            assert xp_count == 2

    run_db(_assert_single_submission())


def test_topic_item_completion_awards_xp_once_with_context(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-complete-xp@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Completion Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="completion-topic", title="Completion Topic", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Completion video", item_type="video", order=1)
            db.add(item)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return subject.id, topic.id, section.id, item.id

    subject_id, topic_id, section_id, item_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(f"/api/courses/topic-items/{item_id}/complete", headers=headers, json={"watched_seconds": 120})
    duplicate = app_client.post(f"/api/courses/topic-items/{item_id}/complete", headers=headers, json={"watched_seconds": 180})

    assert first.status_code == 200
    assert first.json()["xp_earned"] == 10
    assert duplicate.status_code == 200
    assert duplicate.json()["xp_earned"] == 0

    async def _assert_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            xp_rows = (
                await db.execute(select(XPTransaction).where(XPTransaction.topic_item_id == item_id))
            ).scalars().all()
            assert len(xp_rows) == 1
            row = xp_rows[0]
            assert row.reason == "video_complete"
            assert row.subject_id == subject_id
            assert row.topic_id == topic_id
            assert row.topic_section_id == section_id
            assert row.idempotency_key == f"topic_item_complete:user:{row.user_id}:item:{item_id}"

    run_db(_assert_xp())


def test_topic_item_event_creates_activity_and_progress_without_completion(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-event-progress@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Event Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="event-topic", title="Event Topic", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Event video", item_type="video", order=1)
            db.add(item)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return topic.id, item.id

    topic_id, item_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/topic-items/{item_id}/event",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "event_type": "video_started",
            "target_id": item_id,
            "metadata_json": {"position": 12},
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}

    async def _assert_event_and_progress():
        session_factory = get_session_factory()
        async with session_factory() as db:
            event = await db.scalar(
                select(ActivityEvent).where(
                    ActivityEvent.user_id == user_id,
                    ActivityEvent.topic_item_id == item_id,
                )
            )
            progress = await db.scalar(
                select(TopicItemProgress).where(
                    TopicItemProgress.user_id == user_id,
                    TopicItemProgress.topic_item_id == item_id,
                )
            )
            xp_count = await db.scalar(
                select(func.count()).select_from(XPTransaction).where(XPTransaction.topic_item_id == item_id)
            )
            assert event is not None
            assert event.event_type == "video_started"
            assert event.target_type == "topic_item"
            assert event.target_id == item_id
            assert event.topic_id == topic_id
            assert event.metadata_json == {"position": 12}
            assert progress is not None
            assert progress.status == "started"
            assert progress.completed_at is None
            assert xp_count == 0

    run_db(_assert_event_and_progress())


def test_topic_item_event_and_completion_missing_items_return_404(app_client, auth_token):
    token, _user_id = auth_token(email="topic-event-missing@example.com", is_pro=True)
    headers = {"Authorization": f"Bearer {token}"}

    event_response = app_client.post(
        "/api/courses/topic-items/999999999/event",
        headers=headers,
        json={"event_type": "video_started", "target_id": 999999999},
    )
    completion_response = app_client.post(
        "/api/courses/topic-items/999999999/complete",
        headers=headers,
        json={"watched_seconds": 0},
    )

    assert event_response.status_code == 404
    assert event_response.json()["detail"] == "Topic item not found"
    assert completion_response.status_code == 404
    assert completion_response.json()["detail"] == "Topic item not found"


def test_topic_item_completion_event_is_written_on_repeated_completion(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-complete-event-repeat@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Completion Event Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="completion-event-topic", title="Completion Event", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Readings", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Completion reading",
                item_type="reading",
                order=1,
            )
            db.add(item)
            await db.flush()
            db.add(TopicItemProgress(
                user_id=user_id,
                topic_id=topic.id,
                topic_item_id=item.id,
                status="completed",
                completed_at=datetime.now(timezone.utc) - timedelta(minutes=5),
                watched_seconds=0,
            ))
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return item.id

    item_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/topic-items/{item_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={"watched_seconds": 0},
    )

    assert response.status_code == 200
    assert response.json()["xp_earned"] == 0

    async def _assert_completion_event():
        session_factory = get_session_factory()
        async with session_factory() as db:
            events = (
                await db.execute(
                    select(ActivityEvent).where(
                        ActivityEvent.user_id == user_id,
                        ActivityEvent.topic_item_id == item_id,
                    )
                )
            ).scalars().all()
            xp_count = await db.scalar(
                select(func.count()).select_from(XPTransaction).where(XPTransaction.topic_item_id == item_id)
            )
            assert len(events) == 1
            assert events[0].event_type == "reading_completed"
            assert events[0].metadata_json == {"watched_seconds": 0}
            assert xp_count == 0

    run_db(_assert_completion_event())


def test_topic_item_completion_rejects_impossible_timed_video_spoof(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-complete-spoof@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Timed Completion Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="timed-completion-topic", title="Timed Completion", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Lessons", section_type="lessons", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Timed video",
                item_type="video",
                duration_seconds=120,
                order=1,
            )
            db.add(item)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return item.id

    item_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/topic-items/{item_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={"watched_seconds": 120},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Topic item is not eligible for completion yet"

    async def _assert_not_completed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            progress = await db.scalar(
                select(TopicItemProgress).where(
                    TopicItemProgress.user_id == user_id,
                    TopicItemProgress.topic_item_id == item_id,
                )
            )
            xp_count = await db.scalar(
                select(func.count()).select_from(XPTransaction).where(XPTransaction.topic_item_id == item_id)
            )
            assert progress is not None
            assert progress.status == "started"
            assert progress.watched_seconds < 108
            assert xp_count == 0

    run_db(_assert_not_completed())


def test_topic_item_complete_rejects_client_scored_quiz_completion(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-complete-quiz-spoof@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Quiz Completion Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="quiz-completion-topic", title="Quiz Completion", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Quizzes", section_type="quizzes", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Checkpoint", item_type="checkpoint_quiz", order=1)
            db.add(item)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return item.id

    item_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/topic-items/{item_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={"watched_seconds": 0, "score": 100},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Quiz items must be submitted through quiz endpoints"

    async def _assert_no_spoofed_xp():
        session_factory = get_session_factory()
        async with session_factory() as db:
            xp_count = await db.scalar(
                select(func.count()).select_from(XPTransaction).where(XPTransaction.topic_item_id == item_id)
            )
            assert xp_count == 0

    run_db(_assert_no_spoofed_xp())


def test_tab_quiz_tracks_figma_audit_primitives(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-figma-primitives@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Figma Quiz Subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="figma-quiz-topic", title="Figma Quiz", order=1, is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Chapitre", section_type="chapter", order=1)
            db.add(section)
            await db.flush()
            item = TopicItem(topic_id=topic.id, section_id=section.id, title="Primitive quiz", item_type="checkpoint_quiz", order=1)
            db.add(item)
            await db.flush()
            tab = TabContent(
                topic_item_id=item.id,
                label="Primitive Quiz",
                tab_type="quiz",
                order=1,
                concept_slugs=["ondes"],
                config_json={
                    "pass_score": 80,
                    "questions": [
                        {"id": "approx", "type": "numeric_approximation", "title": "Approx", "prompt": "Estimate", "answer": 2, "tolerance": 0.1, "unit": "m", "sample": "2.00"},
                        {"id": "slider", "type": "slider_estimation", "title": "Slider", "prompt": "Estimate", "min": 0, "max": 10, "step": 0.1, "start": 6.5, "answer": 4, "tolerance": 0.4, "unit": "cm"},
                        {"id": "exact", "type": "exact_match", "title": "Exact", "prompt": "Unit", "answer": "Hz", "sample": "Hz"},
                        {"id": "formula", "type": "formula_builder", "title": "Formula", "prompt": "Build", "tokens": [{"id": "lambda", "label": "lambda"}], "answer": ["lambda", "equals", "v", "divide", "f"]},
                        {"id": "error", "type": "error_spotting", "title": "Error", "prompt": "Spot", "lines": [{"id": "line_1", "label": "ok"}, {"id": "line_2", "label": "bad"}], "answer": "line_2"},
                        {"id": "hotspot", "type": "image_hotspot", "title": "Hotspot", "prompt": "Aim", "cursor": {"x": 38, "y": 62, "radius": 7}, "answerRegion": {"shape": "ellipse", "label": "crest", "x": 63, "y": 29, "rx": 10, "ry": 12}},
                    ],
                },
            )
            db.add(tab)
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            await db.refresh(tab)
            return tab.id

    tab_id = run_db(_seed())
    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "approx": 2.03,
                "slider": 4.2,
                "exact": "hz",
                "formula": ["lambda", "equals", "v", "divide", "f"],
                "error": "line_2",
                "hotspot": {"x": 63, "y": 29, "radius": 7},
            },
            "duration_seconds": 45,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 6
    assert body["score"] == 100
    assert body["passed"] is True

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            questions = (await db.execute(select(Question).where(Question.question_set_id == question_set.id))).scalars().all()
            quiz_attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            question_attempts = (await db.execute(select(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == quiz_attempt.id))).scalars().all()
            assert question_set.pass_score == 80
            assert question_set.topic_section_id is not None
            assert {question.type for question in questions} == {
                "numeric_approximation",
                "slider_estimation",
                "exact_match",
                "formula_builder",
                "error_spotting",
                "image_hotspot",
            }
            assert len(question_attempts) == 6
            assert all(attempt.is_correct for attempt in question_attempts)

    run_db(_assert_tracking())


def _contains_any_key(value, keys: set[str]) -> bool:
    if isinstance(value, dict):
        return any(key in keys or _contains_any_key(item, keys) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_any_key(item, keys) for item in value)
    return False
