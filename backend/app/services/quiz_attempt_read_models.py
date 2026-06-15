from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import QuizAttempt
from app.models.quizzes import QuestionSet
from app.models.users import User
from app.schemas.quizzes import (
    QuizAttemptHistoryOut,
    QuizAttemptQuestionResultOut,
    QuizAttemptSummaryOut,
)


def _answer_present(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return any(_answer_present(item) for item in value.values())
    return True


def _safe_question_results(attempt: QuizAttempt) -> list[QuizAttemptQuestionResultOut]:
    raw_grading = attempt.grading if isinstance(attempt.grading, dict) else {}
    raw_questions = raw_grading.get("questions") if isinstance(raw_grading.get("questions"), list) else []
    raw_answers = attempt.answers if isinstance(attempt.answers, dict) else {}
    results: list[QuizAttemptQuestionResultOut] = []
    for index, raw_question in enumerate(raw_questions):
        if not isinstance(raw_question, dict):
            continue
        question_id = str(raw_question.get("id") or f"q{index + 1}")
        raw_answer = raw_answers.get(question_id)
        if raw_answer is None and isinstance(raw_question.get("id"), int):
            raw_answer = raw_answers.get(raw_question["id"])
        results.append(
            QuizAttemptQuestionResultOut(
                id=question_id,
                type=str(raw_question.get("type") or "multiple_choice"),
                correct=bool(raw_question.get("correct")),
                answered=(
                    bool(raw_question.get("answered"))
                    if "answered" in raw_question
                    else _answer_present(raw_answer)
                ),
            )
        )
    return results


def quiz_attempt_summary(attempt: QuizAttempt, *, pass_score: int) -> QuizAttemptSummaryOut:
    questions = _safe_question_results(attempt)
    return QuizAttemptSummaryOut(
        id=attempt.id,
        attempt_number=attempt.attempt_number,
        score=int(attempt.score or 0),
        passed=bool(attempt.passed),
        correct=sum(1 for question in questions if question.correct),
        total=len(questions),
        pass_score=pass_score,
        duration_seconds=int(attempt.duration_seconds or 0),
        submitted_at=attempt.completed_at or attempt.created_at,
        questions=questions,
    )


async def list_quiz_attempt_history(
    db: AsyncSession,
    *,
    user: User,
    question_set: QuestionSet,
    limit: int = 20,
    offset: int = 0,
) -> QuizAttemptHistoryOut:
    filters = [
        QuizAttempt.user_id == user.id,
        QuizAttempt.question_set_id == question_set.id,
    ]
    total = await db.scalar(select(func.count()).select_from(QuizAttempt).where(*filters))
    result = await db.execute(
        select(QuizAttempt)
        .where(*filters)
        .order_by(QuizAttempt.created_at.desc(), QuizAttempt.id.desc())
        .offset(offset)
        .limit(limit)
    )
    attempts = result.scalars().all()
    return QuizAttemptHistoryOut(
        question_set_id=question_set.id,
        total=int(total or 0),
        limit=limit,
        offset=offset,
        items=[
            quiz_attempt_summary(attempt, pass_score=int(question_set.pass_score or 70))
            for attempt in attempts
        ],
    )
