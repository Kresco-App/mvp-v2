from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.gamification import QuestionAttempt, XPTransaction
from app.models.quizzes import Question, QuestionSet
from app.services.quiz_attempt_submission import persist_quiz_submission
from app.services.xp import XP_REWARDS


def test_quiz_perfect_xp_awards_once_per_question_set(app_client, auth_token, run_db):
    _token, user_id = auth_token(email="quiz-perfect-xp@example.com", is_pro=True)

    async def _exercise():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Physique", is_published=True)
            db.add(subject)
            await db.flush()
            question_set = QuestionSet(subject_id=subject.id, title="Perfect quiz", pass_score=70)
            db.add(question_set)
            await db.flush()
            question = Question(
                question_set_id=question_set.id,
                type="short_answer",
                title="Amplitude",
                prompt="Donner l'amplitude.",
                answer_json={"answer": "A"},
            )
            db.add(question)
            await db.flush()
            raw_questions = [{"id": str(question.id), "type": "short_answer", "answer": "A"}]

            first = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers={str(question.id): "wrong"},
                hash_answers={str(question.id): "wrong"},
                score=0,
                passed=False,
                grading={"questions": [{"id": question.id, "correct": False}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=question.id,
                        user_id=user_id,
                        subject_id=subject.id,
                        selected_answer_json={"value": "wrong"},
                        correct_answer_json={"value": "A"},
                        is_correct=False,
                        score_awarded=0,
                        max_score=1,
                        grading_json={"correct": False},
                    )
                ],
            )
            assert first.xp_earned == 0
            await db.commit()

            question_set = await db.get(QuestionSet, question_set.id)
            assert question_set is not None
            second = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers={str(question.id): "A"},
                hash_answers={str(question.id): "A"},
                score=100,
                passed=True,
                grading={"questions": [{"id": question.id, "correct": True}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=question.id,
                        user_id=user_id,
                        subject_id=subject.id,
                        selected_answer_json={"value": "A"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    )
                ],
            )
            assert second.xp_earned == (
                XP_REWARDS["quiz_retry_correct"] + XP_REWARDS["quiz_pass"] + XP_REWARDS["quiz_perfect"]
            )
            await db.commit()

            question_set = await db.get(QuestionSet, question_set.id)
            assert question_set is not None
            third = await persist_quiz_submission(
                db,
                user_id=user_id,
                question_set=question_set,
                raw_questions=raw_questions,
                answers={str(question.id): "still perfect"},
                hash_answers={str(question.id): "still perfect"},
                score=100,
                passed=True,
                grading={"questions": [{"id": question.id, "correct": True}]},
                question_attempt_rows=[
                    QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=question.id,
                        user_id=user_id,
                        subject_id=subject.id,
                        selected_answer_json={"value": "still perfect"},
                        correct_answer_json={"value": "A"},
                        is_correct=True,
                        score_awarded=1,
                        max_score=1,
                        grading_json={"correct": True},
                    )
                ],
            )
            assert third.xp_earned == 0
            await db.commit()

            transactions = (
                await db.execute(
                    select(XPTransaction.reason, XPTransaction.amount, XPTransaction.requested_amount)
                    .where(XPTransaction.user_id == user_id)
                    .order_by(XPTransaction.reason)
                )
            ).all()
            return transactions

    transactions = run_db(_exercise())

    assert transactions == [
        ("quiz_pass", XP_REWARDS["quiz_pass"], XP_REWARDS["quiz_pass"]),
        ("quiz_perfect", XP_REWARDS["quiz_perfect"], XP_REWARDS["quiz_perfect"]),
        ("quiz_retry_correct", XP_REWARDS["quiz_retry_correct"], XP_REWARDS["quiz_retry_correct"]),
    ]


def test_quiz_perfect_xp_requires_inserted_correct_questions():
    from app.services.quiz_attempt_submission import _is_perfect_quiz_submission

    assert _is_perfect_quiz_submission([], 100, expected_question_count=1) is False
    assert _is_perfect_quiz_submission([{"is_correct": True}], 100, expected_question_count=2) is False
    assert _is_perfect_quiz_submission(
        [{"is_correct": True}, {"is_correct": False}],
        100,
        expected_question_count=2,
    ) is False
    assert _is_perfect_quiz_submission([{"is_correct": True}], 99, expected_question_count=1) is False
    assert _is_perfect_quiz_submission([{"is_correct": True}], 101, expected_question_count=1) is False
    assert _is_perfect_quiz_submission([{"is_correct": True}], 100, expected_question_count=1) is True
