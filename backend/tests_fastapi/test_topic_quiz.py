from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.gamification import QuestionAttempt, QuizAttempt, XPTransaction
from app.models.quizzes import Question, QuestionSet
from app.models.users import UserSubjectEntitlement


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

    async def _assert_submit_tracking():
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

    run_db(_assert_submit_tracking())


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
    assert question_loads[0].count("?") == 1 or "$1" in question_loads[0], question_loads[0]


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
