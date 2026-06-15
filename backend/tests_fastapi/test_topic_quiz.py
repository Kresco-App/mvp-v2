from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import QuestionAttempt, QuizAttempt, TopicItemProgress, UserStats, XPTransaction
from app.models.quizzes import Question, QuestionSet
from app.models.users import User
from app.models.users import UserSubjectEntitlement
from app.schemas.courses import TabQuizSubmitIn
from app.services.course_tab_quiz_submission import submit_tab_quiz_attempt
from tests_fastapi.course_factories import seed_course_hierarchy


async def _seed_quiz_tab(user_id: int, slug: str, questions: list[dict], *, pass_score: int = 70):
    seeded = await seed_course_hierarchy(
        user_id,
        slug,
        subject_kwargs={"title": f"Quiz {slug}"},
        topic_kwargs={"order": 1},
        section_kwargs={"title": "Quizzes", "section_type": "quizzes", "order": 1},
        create_resource=False,
        item_kwargs={"title": "Quiz item", "item_type": "checkpoint_quiz", "order": 1},
        tab_kwargs={
            "resource_id": None,
            "label": "Quiz",
            "tab_type": "quiz",
            "content": "",
            "order": 1,
            "config_json": {"pass_score": pass_score, "questions": questions},
        },
    )
    return seeded.quiz_tuple()


def test_tab_quiz_grades_tracks_xp_and_question_attempts(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-quiz-grading@example.com", is_pro=True)
    questions = [
        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
        {"id": "multi", "type": "multi_select", "prompt": "Pick two", "options": ["a", "b", "c"], "answer": ["a", "c"]},
        {"id": "num", "type": "numeric_answer", "prompt": "2+2", "answer": "4", "tolerance": 0},
        {"id": "match", "type": "matching", "prompt": "Match", "answer": {"T": "s", "f": "Hz"}},
        {"id": "order", "type": "ordering", "prompt": "Order", "answer": ["define", "substitute", "conclude"]},
    ]
    _subject_id, _topic_id, section_id, item_id, tab_id = run_db(
        _seed_quiz_tab(user_id, "topic-quiz-grading", questions)
    )

    response = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "answers": {
                "mc": "A",
                "multi": ["c", "a"],
                "num": "4",
                "match": {"T": "s", "f": "Hz"},
                "order": ["define", "substitute", "conclude"],
            }
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["correct"] == 5
    assert body["score"] == 100
    assert body["passed"] is True
    assert body["xp_earned"] > 0
    assert body["attempt"]["correct"] == 5
    assert body["attempt"]["grading"]["questions"][0]["answered"] is True

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            questions_count = await db.scalar(select(func.count()).select_from(Question).where(Question.question_set_id == question_set.id))
            attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.question_set_id == question_set.id))).scalar_one()
            attempt_count = await db.scalar(select(func.count()).select_from(QuestionAttempt).where(QuestionAttempt.quiz_attempt_id == attempt.id))
            xp_count = await db.scalar(select(func.count()).select_from(XPTransaction).where(XPTransaction.quiz_attempt_id == attempt.id))
            progress = await db.scalar(select(TopicItemProgress).where(TopicItemProgress.user_id == user_id, TopicItemProgress.topic_item_id == item_id))
            stats = await db.get(UserStats, user_id)
            assert question_set.topic_section_id == section_id
            assert questions_count == 5
            assert attempt_count == 5
            assert xp_count == 6
            assert progress is not None
            assert progress.status == "completed"
            assert progress.completed_at is not None
            assert progress.best_score == 100
            assert stats is not None
            assert stats.quizzes_passed == 1

    run_db(_assert_tracking())


def test_tab_quiz_submission_recovers_from_question_set_and_attempt_number_race(auth_token, run_db, monkeypatch):
    token, user_id = auth_token(email="topic-quiz-race@example.com", is_pro=True)
    del token
    questions = [
        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
    ]
    _subject_id, _topic_id, section_id, item_id, tab_id = run_db(_seed_quiz_tab(user_id, "topic-quiz-race", questions))

    original_flush = AsyncSession.flush
    original_rollback = AsyncSession.rollback
    original_commit = AsyncSession.commit
    calls = {"race_triggered": False, "seeded": False}

    async def racing_flush(self, *args, **kwargs):
        pending_types = {type(obj).__name__ for obj in getattr(self, "new", ())}
        if not calls["race_triggered"] and "QuizAttempt" in pending_types:
            calls["race_triggered"] = True
            raise IntegrityError("insert", {}, Exception("duplicate key"))
        return await original_flush(self, *args, **kwargs)

    async def rollback_and_seed(self):
        await original_rollback(self)
        if calls["seeded"]:
            return
        calls["seeded"] = True
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = await db.get(Subject, _subject_id)
            topic = await db.get(Topic, _topic_id)
            section = await db.get(TopicSection, section_id)
            item = await db.get(TopicItem, item_id)
            question_set = QuestionSet(
                subject_id=subject.id if subject else None,
                topic_id=topic.id if topic else None,
                topic_section_id=section.id if section else None,
                topic_item_id=item.id if item else None,
                tab_content_id=tab_id,
                title="Quiz",
                source_type="tab",
                pass_score=70,
                status="published",
                order=1,
                concept_slugs=[],
            )
            db.add(question_set)
            await db.flush()
            db.add(Question(
                question_set_id=question_set.id,
                external_id="mc",
                type="multiple_choice",
                prompt="Pick A",
                config_json={"options": ["A", "B"]},
                answer_json={"answer": "A"},
                status="published",
            ))
            db.add(QuizAttempt(
                user_id=user_id,
                question_set_id=question_set.id,
                subject_id=subject.id if subject else None,
                topic_id=topic.id if topic else None,
                topic_section_id=section.id if section else None,
                topic_item_id=item.id if item else None,
                tab_content_id=tab_id,
                source_type="tab",
                submission_hash="seeded-submission-hash",
                score=0,
                passed=False,
                answers={},
                grading={},
                attempt_number=1,
                duration_seconds=0,
            ))
            await original_commit(db)

    monkeypatch.setattr(AsyncSession, "flush", racing_flush)
    monkeypatch.setattr(AsyncSession, "rollback", rollback_and_seed)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            tab = (
                await db.execute(
                    select(TabContent)
                    .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
                    .where(TabContent.id == tab_id)
                )
            ).scalar_one()
            result = await submit_tab_quiz_attempt(
                db,
                user=user,
                tab_id=tab.id,
                body=TabQuizSubmitIn(answers={"mc": "A"}),
            )
            await db.commit()
            return result

    result = run_db(_exercise())

    assert result.attempt.attempt_number == 2
    assert result.passed is True

    async def _assert_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            attempts = (
                await db.execute(
                    select(QuizAttempt)
                    .where(QuizAttempt.question_set_id == question_set.id)
                    .order_by(QuizAttempt.attempt_number.asc(), QuizAttempt.id.asc())
                )
            ).scalars().all()
            progress = await db.scalar(
                select(TopicItemProgress).where(
                    TopicItemProgress.user_id == user_id,
                    TopicItemProgress.topic_item_id == item_id,
                )
            )
            assert [attempt.attempt_number for attempt in attempts] == [1, 2]
            assert progress is not None
            assert progress.status == "completed"
            assert progress.completed_at is not None

    run_db(_assert_tracking())


def test_topic_workspace_scrubs_quiz_answers(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-quiz-scrub@example.com", is_pro=True)
    questions = [
        {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": [{"text": "A", "is_correct": True}], "answer": "A"},
        {"id": "match", "type": "matching", "prompt": "Match", "answer": {"T": "s", "f": "Hz"}},
        {"id": "hotspot", "type": "image_hotspot", "prompt": "Aim", "answerRegion": {"x": 50, "y": 50, "rx": 10, "ry": 10}},
    ]
    _subject_id, topic_id, _section_id, _item_id, _tab_id = run_db(
        _seed_quiz_tab(user_id, "topic-quiz-scrub", questions)
    )

    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    config = response.json()["sections"][0]["items"][0]["tabs"][0]["config_json"]
    assert not _contains_any_key(config, {"answer", "answerRegion", "accepted_answers", "is_correct"})
    assert config["questions"][1]["pairs"] == [{"left": "T"}, {"left": "f"}]


def test_tab_quiz_reuses_identical_submission(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-quiz-idempotency@example.com", is_pro=True)
    _subject_id, _topic_id, _section_id, _item_id, tab_id = run_db(
        _seed_quiz_tab(
            user_id,
            "topic-quiz-idempotency",
            [{"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"}],
        )
    )
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(f"/api/courses/tabs/{tab_id}/quiz/submit", headers=headers, json={"answers": {"mc": "A"}})
    duplicate = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers=headers,
        json={"answers": {"mc": " a ", "ignored": "junk"}},
    )

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert first.json()["xp_earned"] > 0
    assert duplicate.json()["xp_earned"] == 0
    assert duplicate.json()["attempt"]["id"] == first.json()["attempt"]["id"]

    async def _assert_single_attempt():
        session_factory = get_session_factory()
        async with session_factory() as db:
            question_set = (await db.execute(select(QuestionSet).where(QuestionSet.tab_content_id == tab_id))).scalar_one()
            attempts = (await db.execute(select(QuizAttempt).where(QuizAttempt.user_id == user_id, QuizAttempt.question_set_id == question_set.id))).scalars().all()
            stats = await db.get(UserStats, user_id)
            assert len(attempts) == 1
            assert len(attempts[0].submission_hash or "") == 64
            assert stats is not None
            assert stats.quizzes_passed == 1

    run_db(_assert_single_attempt())


def test_tab_quiz_attempt_history_returns_safe_recent_summaries(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-quiz-attempt-history@example.com", is_pro=True)
    _subject_id, _topic_id, _section_id, _item_id, tab_id = run_db(
        _seed_quiz_tab(
            user_id,
            "topic-quiz-attempt-history",
            [
                {"id": "mc", "type": "multiple_choice", "prompt": "Pick A", "options": ["A", "B"], "answer": "A"},
                {"id": "blank", "type": "fill_in_blank", "prompt": "State the law", "answer": "Ohm"},
            ],
        )
    )
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers=headers,
        json={"answers": {"mc": "B"}},
    )
    second = app_client.post(
        f"/api/courses/tabs/{tab_id}/quiz/submit",
        headers=headers,
        json={"answers": {"mc": "A", "blank": "Ohm"}},
    )
    attempts = app_client.get(f"/api/courses/tabs/{tab_id}/quiz/attempts", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert attempts.status_code == 200

    body = attempts.json()
    assert [attempt["id"] for attempt in body] == [
        second.json()["attempt"]["id"],
        first.json()["attempt"]["id"],
    ]
    assert body[0]["score"] == 100
    assert body[0]["passed"] is True
    assert body[0]["grading"]["questions"] == [
        {"id": "mc", "type": "multiple_choice", "correct": True, "answered": True},
        {"id": "blank", "type": "fill_in_blank", "correct": True, "answered": True},
    ]
    assert body[1]["grading"]["questions"] == [
        {"id": "mc", "type": "multiple_choice", "correct": False, "answered": True},
        {"id": "blank", "type": "fill_in_blank", "correct": False, "answered": False},
    ]
    assert not _contains_any_key(body, {"answers", "answer", "accepted_answers", "correct_answer_json", "selected_answer_json"})


def test_standalone_subject_quiz_enforces_subject_access(app_client, auth_token, run_db):
    locked_token, locked_user_id = auth_token(email="standalone-quiz-locked@example.com", is_pro=True)
    allowed_token, allowed_user_id = auth_token(email="standalone-quiz-allowed@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            quiz_subject = Subject(title="Standalone gated quiz", description="", is_published=True, order=1)
            other_subject = Subject(title="Standalone other quiz", description="", is_published=True, order=2)
            db.add_all([quiz_subject, other_subject])
            await db.flush()
            question_set = QuestionSet(
                subject_id=quiz_subject.id,
                title="Standalone access quiz",
                source_type="subject_exam",
                pass_score=70,
                status="published",
            )
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                external_id="standalone-q1",
                type="multiple_choice",
                prompt="Choose one",
                config_json={"options": [{"id": 1, "text": "Correct"}, {"id": 2, "text": "Wrong"}]},
                answer_json={"answer": 1},
                status="published",
            )
            db.add_all([
                question,
                UserSubjectEntitlement(user_id=locked_user_id, subject_id=other_subject.id, source="test", status="active"),
                UserSubjectEntitlement(user_id=allowed_user_id, subject_id=quiz_subject.id, source="test", status="active"),
            ])
            await db.commit()
            return quiz_subject.id, question_set.id, question.id

    subject_id, question_set_id, question_id = run_db(_seed())

    locked_headers = {"Authorization": f"Bearer {locked_token}"}
    allowed_headers = {"Authorization": f"Bearer {allowed_token}"}

    locked_discovery = app_client.get(f"/api/quizzes/subjects/{subject_id}/discovery", headers=locked_headers)
    locked_detail = app_client.get(f"/api/quizzes/{question_set_id}", headers=locked_headers)
    locked_submit = app_client.post(
        f"/api/quizzes/{question_set_id}/submit",
        headers=locked_headers,
        json={"answers": {str(question_id): 1}},
    )
    allowed_discovery = app_client.get(f"/api/quizzes/subjects/{subject_id}/discovery", headers=allowed_headers)
    allowed_submit = app_client.post(
        f"/api/quizzes/{question_set_id}/submit",
        headers=allowed_headers,
        json={"answers": {str(question_id): 1}},
    )
    allowed_retry = app_client.post(
        f"/api/quizzes/{question_set_id}/submit",
        headers=allowed_headers,
        json={"answers": {str(question_id): 2}},
    )

    assert locked_discovery.status_code == 403
    assert locked_detail.status_code == 403
    assert locked_submit.status_code == 403
    assert allowed_discovery.status_code == 200
    assert allowed_discovery.json()["quiz"]["id"] == question_set_id
    assert allowed_submit.status_code == 200
    assert allowed_submit.json()["passed"] is True
    assert allowed_submit.json()["xp_earned"] > 0
    assert allowed_retry.status_code == 200
    assert allowed_retry.json()["passed"] is False

    async def _assert_legacy_submit_tracking():
        session_factory = get_session_factory()
        async with session_factory() as db:
            attempts = (
                await db.execute(
                    select(QuizAttempt)
                    .where(QuizAttempt.user_id == allowed_user_id, QuizAttempt.question_set_id == question_set_id)
                    .order_by(QuizAttempt.attempt_number.asc())
                )
            ).scalars().all()
            question_attempts = (
                await db.execute(
                    select(QuestionAttempt)
                    .where(QuestionAttempt.user_id == allowed_user_id, QuestionAttempt.question_id == question_id)
                    .order_by(QuestionAttempt.id.asc())
                )
            ).scalars().all()
            xp_count = await db.scalar(
                select(func.count())
                .select_from(XPTransaction)
                .where(XPTransaction.user_id == allowed_user_id, XPTransaction.question_set_id == question_set_id)
            )
            assert [attempt.attempt_number for attempt in attempts] == [1, 2]
            assert len({attempt.submission_hash for attempt in attempts}) == 2
            assert [question_attempt.is_correct for question_attempt in question_attempts] == [True, False]
            assert xp_count >= 2

    run_db(_assert_legacy_submit_tracking())


def test_subject_quiz_discovery_skips_locked_candidates_past_initial_window(app_client, auth_token, run_db):
    token, user_id = auth_token(email="quiz-discovery-window@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Discovery window", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            for index in range(25):
                topic = Topic(
                    subject_id=subject.id,
                    slug=f"discovery-window-locked-{index}",
                    title=f"Locked {index}",
                    status="published",
                    required_tier="vip",
                )
                db.add(topic)
                await db.flush()
                db.add(
                    QuestionSet(
                        subject_id=subject.id,
                        topic_id=topic.id,
                        title=f"Locked quiz {index}",
                        source_type="topic",
                        pass_score=70,
                        status="published",
                        order=index,
                    )
                )
            accessible = QuestionSet(
                subject_id=subject.id,
                title="Accessible quiz",
                source_type="subject_exam",
                pass_score=70,
                status="published",
                order=25,
            )
            db.add(accessible)
            await db.flush()
            db.add(
                Question(
                    question_set_id=accessible.id,
                    external_id="accessible-q1",
                    type="multiple_choice",
                    prompt="Choose one",
                    config_json={"options": [{"id": 1, "text": "Correct"}, {"id": 2, "text": "Wrong"}]},
                    answer_json={"answer": 1},
                    status="published",
                )
            )
            await db.commit()
            return subject.id, accessible.id

    subject_id, accessible_id = run_db(_seed())

    response = app_client.get(
        f"/api/quizzes/subjects/{subject_id}/discovery",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["quiz"]["id"] == accessible_id


def test_subject_quiz_discovery_loads_questions_only_for_selected_quiz(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="quiz-discovery-question-load@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Discovery question load", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            for index in range(12):
                topic = Topic(
                    subject_id=subject.id,
                    slug=f"discovery-question-load-locked-{index}",
                    title=f"Locked question load {index}",
                    status="published",
                    required_tier="vip",
                )
                db.add(topic)
                await db.flush()
                question_set = QuestionSet(
                    subject_id=subject.id,
                    topic_id=topic.id,
                    title=f"Locked quiz with question {index}",
                    source_type="topic",
                    pass_score=70,
                    status="published",
                    order=index,
                )
                db.add(question_set)
                await db.flush()
                db.add(
                    Question(
                        question_set_id=question_set.id,
                        external_id=f"locked-q-{index}",
                        type="multiple_choice",
                        prompt="Locked question",
                        config_json={"options": [{"id": 1, "text": "Correct"}]},
                        answer_json={"answer": 1},
                        status="published",
                    )
                )
            accessible = QuestionSet(
                subject_id=subject.id,
                title="Accessible quiz with question",
                source_type="subject_exam",
                pass_score=70,
                status="published",
                order=12,
            )
            db.add(accessible)
            await db.flush()
            db.add(
                Question(
                    question_set_id=accessible.id,
                    external_id="accessible-question-load-q1",
                    type="multiple_choice",
                    prompt="Choose one",
                    config_json={"options": [{"id": 1, "text": "Correct"}, {"id": 2, "text": "Wrong"}]},
                    answer_json={"answer": 1},
                    status="published",
                )
            )
            await db.commit()
            return subject.id, accessible.id

    subject_id, accessible_id = run_db(_seed())

    with query_counter() as queries:
        response = app_client.get(
            f"/api/quizzes/subjects/{subject_id}/discovery",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["quiz"]["id"] == accessible_id
    assert len(body["quiz"]["questions"]) == 1
    question_loads = [
        statement
        for statement in queries.statements
        if "FROM questions" in statement and "questions.question_set_id" in statement
    ]
    assert len(question_loads) == 1, queries.statements
    assert question_loads[0].count("?") == 1, question_loads[0]


def test_topic_item_completion_rejects_spoofed_video_and_quiz_completion(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-completion-spoof@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Completion spoof", is_published=True)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="topic-completion-spoof", title="Completion spoof", is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Items", section_type="items", order=1)
            db.add(section)
            await db.flush()
            video = TopicItem(topic_id=topic.id, section_id=section.id, title="Video", item_type="video", duration_seconds=120)
            quiz = TopicItem(topic_id=topic.id, section_id=section.id, title="Quiz", item_type="checkpoint_quiz")
            db.add_all([video, quiz, UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active")])
            await db.commit()
            return video.id, quiz.id

    video_id, quiz_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    video_response = app_client.post(f"/api/courses/topic-items/{video_id}/complete", headers=headers, json={"watched_seconds": 120})
    quiz_response = app_client.post(f"/api/courses/topic-items/{quiz_id}/complete", headers=headers, json={"watched_seconds": 0, "score": 100})

    assert video_response.status_code == 409
    assert quiz_response.status_code == 400


def _contains_any_key(value, keys: set[str]) -> bool:
    if isinstance(value, dict):
        return any(key in keys or _contains_any_key(item, keys) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_any_key(item, keys) for item in value)
    return False
