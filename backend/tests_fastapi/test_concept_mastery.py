from pathlib import Path

from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject, Topic
from app.models.gamification import QuestionAttempt, UserConceptMastery
from app.models.quizzes import Question, QuestionSet
from app.services.concept_mastery import update_concept_mastery_from_question_attempts
from app.services.quiz_attempt_submission import persist_quiz_submission


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_quiz_attempts_update_concept_mastery_without_duplicate_counting(app_client, auth_token, run_db):
    del app_client
    _token, user_id = auth_token(email="concept-mastery-quiz@example.com", is_pro=True)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physique", is_published=True)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="ondes-mastery", title="Ondes", status="published")
            db.add(topic)
            await db.flush()
            question_set = QuestionSet(
                subject_id=subject.id,
                topic_id=topic.id,
                title="Ondes mastery quiz",
                pass_score=70,
                concept_slugs=["ondes"],
            )
            db.add(question_set)
            await db.flush()
            first_question = Question(
                question_set_id=question_set.id,
                external_id="amplitude",
                type="short_answer",
                title="Amplitude",
                prompt="Donner l'amplitude.",
                answer_json={"answer": "A"},
                concept_slugs=["ondes"],
                order=1,
            )
            second_question = Question(
                question_set_id=question_set.id,
                external_id="periode",
                type="short_answer",
                title="Periode",
                prompt="Donner la periode.",
                answer_json={"answer": "T"},
                concept_slugs=[],
                order=2,
            )
            db.add_all([first_question, second_question])
            await db.flush()
            subject_id = subject.id
            topic_id = topic.id
            question_set_id = question_set.id
            first_question_id = first_question.id
            second_question_id = second_question.id

            raw_questions = [
                {"id": str(first_question_id), "type": "short_answer", "answer": "A"},
                {"id": str(second_question_id), "type": "short_answer", "answer": "T"},
            ]
            first_answers = {str(first_question_id): "A", str(second_question_id): "wrong"}
            first_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=first_answers,
                hash_answers=first_answers,
                score=50,
                passed=False,
                grading={"questions": []},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=first_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        topic_id=topic_id,
                        selected_answer_json={"value": "A"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    ),
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=second_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        topic_id=topic_id,
                        selected_answer_json={"value": "wrong"},
                        correct_answer_json={"value": "T"},
                        is_correct=False,
                        score_awarded=0,
                        max_score=1,
                        grading_json={"correct": False},
                    ),
                ],
            )
            assert not first_result.is_duplicate
            await db.commit()

            duplicate_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=first_answers,
                hash_answers=first_answers,
                score=50,
                passed=False,
                grading={"questions": []},
                question_attempt_rows=[],
            )
            assert duplicate_result.is_duplicate
            question_set = await db.get(QuestionSet, question_set_id)
            assert question_set is not None

            second_answers = {str(first_question_id): "A", str(second_question_id): "T"}
            second_result = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers=second_answers,
                hash_answers=second_answers,
                score=100,
                passed=True,
                grading={"questions": []},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=first_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        topic_id=topic_id,
                        selected_answer_json={"value": "A"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    ),
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=second_question_id,
                        user_id=user_id,
                        subject_id=subject_id,
                        topic_id=topic_id,
                        selected_answer_json={"value": "T"},
                        correct_answer_json={"value": "T"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    ),
                ],
            )
            assert not second_result.is_duplicate
            await db.commit()

            row = await db.scalar(
                select(UserConceptMastery).where(
                    UserConceptMastery.user_id == user_id,
                    UserConceptMastery.concept_slug == "ondes",
                )
            )
            assert row is not None
            assert row.context_key == f"subject:{subject_id}:topic:{topic_id}"
            assert row.subject_id == subject_id
            assert row.topic_id == topic_id
            assert row.attempts_count == 4
            assert row.correct_count == 3
            assert row.incorrect_count == 1
            assert row.mastery_score == 75
            assert row.confidence == 80
            assert row.status == "developing"
            assert row.last_result == "correct"
            assert row.last_question_attempt_id is not None
            assert row.last_quiz_attempt_id is not None

    run_db(_exercise())


def test_concept_mastery_endpoint_scopes_filters_and_requires_auth(app_client, auth_token, run_db):
    token, user_id = auth_token(email="concept-mastery-route@example.com", is_pro=True)
    _other_token, other_user_id = auth_token(email="concept-mastery-other@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Concept route subject", is_published=True)
            db.add(subject)
            await db.flush()
            weak_topic = Topic(subject_id=subject.id, slug="weak-topic", title="Weak topic", status="published")
            mastered_topic = Topic(
                subject_id=subject.id,
                slug="mastered-topic",
                title="Mastered topic",
                status="published",
            )
            db.add_all([weak_topic, mastered_topic])
            await db.flush()
            db.add_all([
                UserConceptMastery(
                    user_id=user_id,
                    subject_id=subject.id,
                    topic_id=weak_topic.id,
                    context_key=f"subject:{subject.id}:topic:{weak_topic.id}",
                    concept_slug="weak-waves",
                    attempts_count=2,
                    correct_count=0,
                    incorrect_count=2,
                    mastery_score=0,
                    confidence=40,
                    status="weak",
                    last_result="incorrect",
                ),
                UserConceptMastery(
                    user_id=user_id,
                    subject_id=subject.id,
                    topic_id=mastered_topic.id,
                    context_key=f"subject:{subject.id}:topic:{mastered_topic.id}",
                    concept_slug="mastered-force",
                    attempts_count=5,
                    correct_count=5,
                    incorrect_count=0,
                    mastery_score=100,
                    confidence=100,
                    status="mastered",
                    last_result="correct",
                ),
                UserConceptMastery(
                    user_id=other_user_id,
                    subject_id=subject.id,
                    topic_id=weak_topic.id,
                    context_key=f"subject:{subject.id}:topic:{weak_topic.id}",
                    concept_slug="other-user",
                    attempts_count=1,
                    correct_count=0,
                    incorrect_count=1,
                    mastery_score=0,
                    confidence=20,
                    status="weak",
                    last_result="incorrect",
                ),
            ])
            await db.commit()
            return weak_topic.id, mastered_topic.id

    weak_topic_id, mastered_topic_id = run_db(_seed())

    unauthenticated = app_client.get("/api/progress/concept-mastery")
    weak = app_client.get(
        "/api/progress/concept-mastery?weak_only=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    topic_filtered = app_client.get(
        f"/api/progress/concept-mastery?topic_id={mastered_topic_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert unauthenticated.status_code == 401
    assert weak.status_code == 200
    weak_payload = weak.json()
    assert weak_payload["total"] == 1
    assert weak_payload["weak_threshold"] == 70
    assert [item["concept_slug"] for item in weak_payload["items"]] == ["weak-waves"]
    assert weak_payload["items"][0]["is_weak"] is True
    assert weak_payload["items"][0]["context_key"].endswith(f":topic:{weak_topic_id}")

    assert topic_filtered.status_code == 200
    assert topic_filtered.json()["total"] == 1
    assert topic_filtered.json()["items"][0]["concept_slug"] == "mastered-force"


def test_concept_mastery_conflict_upsert_rounds_mastery_threshold(app_client, auth_token, run_db):
    del app_client
    _token, user_id = auth_token(email="concept-mastery-rounding@example.com", is_pro=True)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Rounding subject", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(subject_id=subject.id, title="Rounding quiz")
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                external_id="rounding",
                type="short_answer",
                title="Rounding",
                prompt="Round mastery.",
                answer_json={"answer": "x"},
                concept_slugs=["rounding-threshold"],
                order=1,
            )
            db.add(question)
            await db.flush()
            db.add(
                UserConceptMastery(
                    user_id=user_id,
                    subject_id=subject.id,
                    context_key=f"subject:{subject.id}",
                    concept_slug="rounding-threshold",
                    attempts_count=12,
                    correct_count=10,
                    incorrect_count=2,
                    mastery_score=83,
                    confidence=100,
                    status="developing",
                    last_result="mixed",
                )
            )
            await db.flush()

            await update_concept_mastery_from_question_attempts(
                db,
                user_id=user_id,
                quiz_attempt_id=None,
                question_attempts=[
                    {
                        "id": None,
                        "question_id": question.id,
                        "subject_id": subject.id,
                        "topic_id": None,
                        "is_correct": True,
                    }
                ],
            )
            await db.commit()

            row = await db.scalar(
                select(UserConceptMastery).where(
                    UserConceptMastery.user_id == user_id,
                    UserConceptMastery.concept_slug == "rounding-threshold",
                )
            )
            assert row is not None
            return row.attempts_count, row.correct_count, row.mastery_score, row.status

    assert run_db(_exercise()) == (13, 11, 85, "mastered")


def test_concept_mastery_migration_and_model_are_declared():
    migration = (
        BACKEND_ROOT / "alembic" / "versions" / "0073_user_concept_mastery.py"
    ).read_text(encoding="utf-8")

    assert "user_concept_mastery" in migration
    assert "uq_user_concept_mastery_user_context_concept" in migration
    assert "ck_user_concept_mastery_status" in migration
    assert "ix_user_concept_mastery_user_status_score" in migration
    assert UserConceptMastery.__tablename__ == "user_concept_mastery"
    constraint_names = {constraint.name for constraint in UserConceptMastery.__table__.constraints}
    assert "uq_user_concept_mastery_user_context_concept" in constraint_names
    assert "ck_user_concept_mastery_status" in constraint_names
