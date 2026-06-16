from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import case, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import QuestionAttempt, QuizAttempt, XPTransaction
from app.models.quizzes import QuestionSet
from app.services.concept_mastery import update_concept_mastery_from_question_attempts
from app.services.gamification_stats import apply_quiz_pass_stats_delta
from app.services.mistake_notebook import update_mistake_notebook_from_question_attempts
from app.services.quiz_grading import quiz_submission_answer_hash
from app.services.quiz_snapshots import (
    QUIZ_SNAPSHOT_SCHEMA_VERSION,
    build_question_set_snapshot,
    quiz_attempt_submission_hash,
    question_snapshot_hash,
)
from app.services.xp import XPAward, award_xp_bulk


@dataclass(frozen=True)
class PersistedQuizSubmission:
    attempt: QuizAttempt | None
    existing_attempt: QuizAttempt | None
    xp_earned: int
    quiz_pass_awarded: bool = False

    @property
    def is_duplicate(self) -> bool:
        return self.existing_attempt is not None


async def find_existing_quiz_submission(
    db: AsyncSession,
    *,
    user_id: int,
    question_set_id: int,
    submission_hash: str,
) -> QuizAttempt | None:
    return await db.scalar(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.question_set_id == question_set_id,
            QuizAttempt.submission_hash == submission_hash,
        )
        .order_by(QuizAttempt.id.asc())
        .limit(1)
        .with_for_update()
    )


async def persist_quiz_submission(
    db: AsyncSession,
    *,
    user_id: int,
    question_set: QuestionSet,
    raw_questions: list[dict],
    answers: dict,
    score: int,
    passed: bool,
    grading: dict,
    question_attempt_rows: list[QuestionAttempt],
    hash_answers: dict | None = None,
    source_type: str | None = None,
    topic_item_id: int | None = None,
    tab_content_id: int | None = None,
    duration_seconds: int | None = None,
) -> PersistedQuizSubmission:
    question_snapshot = build_question_set_snapshot(question_set, raw_questions)
    snapshot_hash = question_snapshot_hash(question_snapshot)
    answer_hash = quiz_submission_answer_hash(raw_questions, hash_answers if hash_answers is not None else answers)
    submission_hash = quiz_attempt_submission_hash(answer_hash=answer_hash, snapshot_hash=snapshot_hash)
    existing_attempt = await find_existing_quiz_submission(
        db,
        user_id=user_id,
        question_set_id=question_set.id,
        submission_hash=submission_hash,
    )
    if existing_attempt is not None:
        existing_attempt_id = existing_attempt.id
        await db.rollback()
        existing_attempt = await db.get(QuizAttempt, existing_attempt_id)
        return PersistedQuizSubmission(attempt=None, existing_attempt=existing_attempt, xp_earned=0)

    attempts_count = await db.scalar(
        select(func.max(QuizAttempt.attempt_number)).where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.question_set_id == question_set.id,
        )
    )
    now = datetime.now(timezone.utc)
    attempt = QuizAttempt(
        user_id=user_id,
        question_set_id=question_set.id,
        subject_id=question_set.subject_id,
        topic_id=question_set.topic_id,
        topic_section_id=question_set.topic_section_id,
        topic_item_id=topic_item_id if topic_item_id is not None else question_set.topic_item_id,
        tab_content_id=tab_content_id if tab_content_id is not None else question_set.tab_content_id,
        source_type=source_type or question_set.source_type,
        submission_hash=submission_hash,
        score=score,
        passed=passed,
        answers=answers,
        grading=grading,
        question_snapshot_json=question_snapshot,
        question_snapshot_hash=snapshot_hash,
        question_snapshot_version=QUIZ_SNAPSHOT_SCHEMA_VERSION,
        attempt_number=(attempts_count or 0) + 1,
        duration_seconds=duration_seconds,
        started_at=now,
        completed_at=now,
    )
    db.add(attempt)
    await db.flush()

    inserted_question_attempts = await _insert_question_attempts(db, attempt.id, question_attempt_rows)
    await update_concept_mastery_from_question_attempts(
        db,
        user_id=user_id,
        quiz_attempt_id=attempt.id,
        question_attempts=inserted_question_attempts,
        fallback_concept_slugs=question_set.concept_slugs or [],
        practiced_at=attempt.completed_at,
    )
    corrected_mistake_question_ids = await update_mistake_notebook_from_question_attempts(
        db,
        user_id=user_id,
        question_set=question_set,
        quiz_attempt_id=attempt.id,
        question_attempts=inserted_question_attempts,
    )
    xp_earned = await _award_quiz_xp(
        db,
        user_id=user_id,
        question_set=question_set,
        attempt=attempt,
        inserted_question_attempts=inserted_question_attempts,
        expected_question_count=len(raw_questions),
        corrected_mistake_question_ids=corrected_mistake_question_ids,
        score=score,
        passed=passed,
    )
    quiz_pass_awarded = await _apply_pass_stats_if_first_pass(
        db,
        user_id=user_id,
        question_set_id=question_set.id,
        attempt_id=attempt.id,
        passed=passed,
    )
    return PersistedQuizSubmission(
        attempt=attempt,
        existing_attempt=None,
        xp_earned=xp_earned,
        quiz_pass_awarded=quiz_pass_awarded,
    )


async def _insert_question_attempts(
    db: AsyncSession,
    quiz_attempt_id: int,
    question_attempt_rows: list[QuestionAttempt],
) -> list[dict]:
    if not question_attempt_rows:
        return []

    question_attempt_payloads = [
        {
            "quiz_attempt_id": quiz_attempt_id,
            "question_id": question_attempt.question_id,
            "user_id": question_attempt.user_id,
            "subject_id": question_attempt.subject_id,
            "topic_id": question_attempt.topic_id,
            "topic_section_id": question_attempt.topic_section_id,
            "topic_item_id": question_attempt.topic_item_id,
            "tab_content_id": question_attempt.tab_content_id,
            "selected_answer_json": question_attempt.selected_answer_json,
            "correct_answer_json": question_attempt.correct_answer_json,
            "is_correct": question_attempt.is_correct,
            "score_awarded": question_attempt.score_awarded,
            "max_score": question_attempt.max_score,
            "grading_json": question_attempt.grading_json,
        }
        for question_attempt in question_attempt_rows
    ]
    inserted_result = await db.execute(
        insert(QuestionAttempt)
        .returning(
            QuestionAttempt.id,
            QuestionAttempt.question_id,
            QuestionAttempt.subject_id,
            QuestionAttempt.topic_id,
            QuestionAttempt.topic_section_id,
            QuestionAttempt.topic_item_id,
            QuestionAttempt.tab_content_id,
            QuestionAttempt.selected_answer_json,
            QuestionAttempt.correct_answer_json,
            QuestionAttempt.is_correct,
            QuestionAttempt.score_awarded,
            QuestionAttempt.max_score,
            QuestionAttempt.grading_json,
        ),
        question_attempt_payloads,
    )
    return [dict(row) for row in inserted_result.mappings().all()]


async def _award_quiz_xp(
    db: AsyncSession,
    *,
    user_id: int,
    question_set: QuestionSet,
    attempt: QuizAttempt,
    inserted_question_attempts: list[dict],
    expected_question_count: int,
    corrected_mistake_question_ids: list[int],
    score: int,
    passed: bool,
) -> int:
    xp_awards: list[XPAward] = []
    correct_question_ids = [
        question_attempt["question_id"]
        for question_attempt in inserted_question_attempts
        if question_attempt["is_correct"]
    ]
    prior_correctness = await _prior_question_correctness(
        db,
        user_id=user_id,
        quiz_attempt_id=attempt.id,
        question_ids=correct_question_ids,
    )
    for question_attempt in inserted_question_attempts:
        if not question_attempt["is_correct"]:
            continue
        question_id = question_attempt["question_id"]
        prior = prior_correctness.get(question_id, {"correct": False, "incorrect": False})
        if not prior["correct"]:
            reason = "quiz_retry_correct" if prior["incorrect"] else "quiz_correct"
            xp_awards.append(XPAward(
                reason=reason,
                description=(
                    f"Question {question_id} retry correct"
                    if reason == "quiz_retry_correct"
                    else f"Question {question_id} first correct"
                ),
                subject_id=question_attempt["subject_id"],
                topic_id=question_attempt["topic_id"],
                topic_section_id=question_attempt["topic_section_id"],
                topic_item_id=question_attempt["topic_item_id"],
                question_set_id=question_set.id,
                question_id=question_id,
                quiz_attempt_id=attempt.id,
                question_attempt_id=question_attempt["id"],
                idempotency_key=f"{reason}:user:{user_id}:question:{question_id}",
            ))
        if question_id in corrected_mistake_question_ids:
            xp_awards.append(XPAward(
                reason="mistake_corrected",
                description=f"Mistake question {question_id} corrected",
                subject_id=question_attempt["subject_id"],
                topic_id=question_attempt["topic_id"],
                topic_section_id=question_attempt["topic_section_id"],
                topic_item_id=question_attempt["topic_item_id"],
                question_set_id=question_set.id,
                question_id=question_id,
                quiz_attempt_id=attempt.id,
                question_attempt_id=question_attempt["id"],
                idempotency_key=f"mistake_corrected:user:{user_id}:question:{question_id}",
            ))

    if passed:
        xp_awards.append(XPAward(
            reason="quiz_pass",
            description=f"QuestionSet {question_set.id} passed",
            subject_id=question_set.subject_id,
            topic_id=question_set.topic_id,
            topic_section_id=question_set.topic_section_id,
            topic_item_id=question_set.topic_item_id,
            question_set_id=question_set.id,
            quiz_attempt_id=attempt.id,
            idempotency_key=quiz_pass_idempotency_key(user_id, question_set.id),
        ))
    if passed and _is_perfect_quiz_submission(
        inserted_question_attempts,
        score,
        expected_question_count=expected_question_count,
    ):
        xp_awards.append(XPAward(
            reason="quiz_perfect",
            description=f"QuestionSet {question_set.id} first perfect",
            subject_id=question_set.subject_id,
            topic_id=question_set.topic_id,
            topic_section_id=question_set.topic_section_id,
            topic_item_id=question_set.topic_item_id,
            question_set_id=question_set.id,
            quiz_attempt_id=attempt.id,
            idempotency_key=quiz_perfect_idempotency_key(user_id, question_set.id),
        ))
    return await award_xp_bulk(user_id, xp_awards, db)


async def _prior_question_correctness(
    db: AsyncSession,
    *,
    user_id: int,
    quiz_attempt_id: int,
    question_ids: list[int],
) -> dict[int, dict[str, bool]]:
    if not question_ids:
        return {}
    result = await db.execute(
        select(
            QuestionAttempt.question_id,
            func.max(case((QuestionAttempt.is_correct.is_(True), 1), else_=0)).label("has_correct"),
            func.max(case((QuestionAttempt.is_correct.is_(False), 1), else_=0)).label("has_incorrect"),
        )
        .where(
            QuestionAttempt.user_id == user_id,
            QuestionAttempt.question_id.in_(question_ids),
            QuestionAttempt.quiz_attempt_id != quiz_attempt_id,
        )
        .group_by(QuestionAttempt.question_id)
    )
    return {
        int(question_id): {"correct": bool(has_correct), "incorrect": bool(has_incorrect)}
        for question_id, has_correct, has_incorrect in result.all()
    }


async def _apply_pass_stats_if_first_pass(
    db: AsyncSession,
    *,
    user_id: int,
    question_set_id: int,
    attempt_id: int,
    passed: bool,
) -> bool:
    if not passed:
        return False

    quiz_pass_transaction = await db.scalar(
        select(XPTransaction).where(
            XPTransaction.user_id == user_id,
            XPTransaction.idempotency_key == quiz_pass_idempotency_key(user_id, question_set_id),
        )
    )
    if quiz_pass_transaction is None or quiz_pass_transaction.quiz_attempt_id != attempt_id:
        return False

    await apply_quiz_pass_stats_delta(db, user_id=user_id, quizzes_passed_delta=1)
    return True


def quiz_pass_idempotency_key(user_id: int, question_set_id: int) -> str:
    return f"quiz_pass:user:{user_id}:question_set:{question_set_id}"


def quiz_perfect_idempotency_key(user_id: int, question_set_id: int) -> str:
    return f"quiz_perfect:user:{user_id}:question_set:{question_set_id}"


def _is_perfect_quiz_submission(
    inserted_question_attempts: list[dict],
    score: int,
    *,
    expected_question_count: int,
) -> bool:
    return (
        expected_question_count > 0
        and len(inserted_question_attempts) == expected_question_count
        and score == 100
        and all(bool(question_attempt["is_correct"]) for question_attempt in inserted_question_attempts)
    )
