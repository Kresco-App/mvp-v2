from datetime import datetime, timezone

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.gamification import QuizAttempt
from app.models.quizzes import Question, QuestionSet
from app.models.users import UserSubjectEntitlement


def test_quiz_attempt_history_is_student_scoped_and_does_not_leak_answers(app_client, auth_token, run_db):
    owner_token, owner_id = auth_token(email="quiz-history-owner@example.com", is_pro=True)
    other_token, other_id = auth_token(email="quiz-history-other@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physique", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(subject_id=subject.id, title="Quiz historique", pass_score=80)
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                type="short_answer",
                title="Amplitude",
                prompt="Donner l'amplitude.",
                answer_json={"answer": "SECRET_ANSWER"},
            )
            db.add(question)
            await db.flush()
            now = datetime.now(timezone.utc)
            db.add_all(
                [
                    QuizAttempt(
                        user_id=owner_id,
                        question_set_id=question_set.id,
                        subject_id=subject.id,
                        source_type="bank",
                        score=0,
                        passed=False,
                        answers={str(question.id): "wrong"},
                        grading={
                            "questions": [
                                {
                                    "id": question.id,
                                    "type": "short_answer",
                                    "correct": False,
                                    "expected": "SECRET_ANSWER",
                                }
                            ]
                        },
                        attempt_number=1,
                        duration_seconds=12,
                        completed_at=now,
                    ),
                    QuizAttempt(
                        user_id=owner_id,
                        question_set_id=question_set.id,
                        subject_id=subject.id,
                        source_type="bank",
                        score=100,
                        passed=True,
                        answers={str(question.id): "SECRET_ANSWER"},
                        grading={
                            "questions": [
                                {
                                    "id": question.id,
                                    "type": "short_answer",
                                    "correct": True,
                                    "expected": "SECRET_ANSWER",
                                }
                            ]
                        },
                        attempt_number=2,
                        duration_seconds=18,
                        completed_at=now,
                    ),
                    QuizAttempt(
                        user_id=other_id,
                        question_set_id=question_set.id,
                        subject_id=subject.id,
                        source_type="bank",
                        score=100,
                        passed=True,
                        answers={str(question.id): "SECRET_ANSWER"},
                        grading={"questions": [{"id": question.id, "correct": True}]},
                        attempt_number=1,
                        completed_at=now,
                    ),
                ]
            )
            await db.commit()
            return question_set.id, question.id

    question_set_id, question_id = run_db(_seed())
    owner_response = app_client.get(
        f"/api/quizzes/{question_set_id}/attempts",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    other_response = app_client.get(
        f"/api/quizzes/{question_set_id}/attempts",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert owner_response.status_code == 200
    assert other_response.status_code == 200
    assert "SECRET_ANSWER" not in owner_response.text
    owner_payload = owner_response.json()
    assert owner_payload["question_set_id"] == question_set_id
    assert owner_payload["total"] == 2
    assert [item["attempt_number"] for item in owner_payload["items"]] == [2, 1]
    assert owner_payload["items"][0]["pass_score"] == 80
    assert owner_payload["items"][0]["duration_seconds"] == 18
    assert owner_payload["items"][0]["questions"] == [
        {
            "id": str(question_id),
            "type": "short_answer",
            "correct": True,
            "answered": True,
        }
    ]
    assert other_response.json()["total"] == 1


def test_quiz_attempt_history_preserves_type_from_real_submission(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="quiz-history-submit@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Chimie", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(subject_id=subject.id, title="Submission quiz", pass_score=100)
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                type="short_answer",
                title="Ion",
                prompt="Nommer l'ion.",
                answer_json={"answer": "Na+"},
            )
            db.add(question)
            await db.commit()
            return question_set.id, question.id

    question_set_id, question_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}
    submit = app_client.post(
        f"/api/quizzes/{question_set_id}/submit",
        headers=headers,
        json={"answers": {str(question_id): "Na+"}},
    )
    history = app_client.get(f"/api/quizzes/{question_set_id}/attempts", headers=headers)

    assert submit.status_code == 200
    assert history.status_code == 200
    item = history.json()["items"][0]
    assert item["questions"] == [
        {
            "id": str(question_id),
            "type": "short_answer",
            "correct": True,
            "answered": True,
        }
    ]


def test_quiz_attempt_history_uses_access_check_and_query_bounds(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="quiz-history-bounds@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Locked", is_published=True)
            allowed_subject = Subject(title="Allowed", is_published=True)
            db.add_all([subject, allowed_subject])
            await db.flush()
            db.add(UserSubjectEntitlement(user_id=_user_id, subject_id=allowed_subject.id, status="active"))
            await db.flush()
            question_set = QuestionSet(
                subject_id=subject.id,
                title="Locked quiz",
                status="published",
                source_type="bank",
            )
            db.add(question_set)
            await db.commit()
            return question_set.id

    question_set_id = run_db(_seed())
    invalid_limit = app_client.get(
        f"/api/quizzes/{question_set_id}/attempts?limit=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    response = app_client.get(
        f"/api/quizzes/{question_set_id}/attempts",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert invalid_limit.status_code == 422
    assert response.status_code == 403
