from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import TabContent, TopicItem
from app.models.gamification import QuestionAttempt, QuizAttempt, XPTransaction
from app.models.users import User
from app.schemas.courses import (
    TabQuizAttemptSummaryOut,
    TabQuizGradingOut,
    TabQuizQuestionGradeOut,
    TabQuizResultOut,
    TabQuizSubmitIn,
)
from app.services.course_access import access_for_tab
from app.services.course_progress import ensure_question_set_for_tab, get_or_create_topic_item_progress
from app.services.gamification_stats import apply_quiz_pass_stats_delta
from app.services.quiz_grading import (
    answer_payload,
    grade_quiz_question,
    question_external_id,
    tab_quiz_submission_hash,
)
from app.services.xp import XPAward, award_xp_bulk

QUIZ_ATTEMPT_HISTORY_LIMIT = 5


async def get_accessible_quiz_tab(
    db: AsyncSession,
    *,
    user: User,
    tab_id: int,
) -> TabContent:
    result = await db.execute(
        select(TabContent)
        .options(
            selectinload(TabContent.topic_item).selectinload(TopicItem.topic),
            selectinload(TabContent.topic_item).selectinload(TopicItem.section),
        )
        .where(TabContent.id == tab_id, TabContent.tab_type == "quiz")
    )
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=404, detail="Quiz tab not found")

    access = await access_for_tab(db, user, tab)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return tab


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


def _quiz_grading_out(grading: dict | None, answers: dict | None = None) -> TabQuizGradingOut:
    raw_questions = grading.get("questions", []) if isinstance(grading, dict) else []
    raw_answers = answers if isinstance(answers, dict) else {}
    safe_questions: list[TabQuizQuestionGradeOut] = []
    for index, raw_question in enumerate(raw_questions):
        if not isinstance(raw_question, dict):
            continue
        question_id = str(raw_question.get("id") or f"q{index + 1}")
        safe_questions.append(TabQuizQuestionGradeOut(
            id=question_id,
            type=str(raw_question.get("type") or "multiple_choice"),
            correct=bool(raw_question.get("correct")),
            answered=bool(raw_question.get("answered")) if "answered" in raw_question else _answer_present(raw_answers.get(question_id)),
        ))
    return TabQuizGradingOut(questions=safe_questions)


def _quiz_attempt_summary(attempt: QuizAttempt, *, pass_score: int) -> TabQuizAttemptSummaryOut:
    grading = _quiz_grading_out(attempt.grading, attempt.answers)
    correct = sum(1 for question in grading.questions if question.correct)
    return TabQuizAttemptSummaryOut(
        id=attempt.id,
        attempt_number=attempt.attempt_number,
        score=int(attempt.score or 0),
        passed=bool(attempt.passed),
        correct=correct,
        total=len(grading.questions),
        pass_score=pass_score,
        submitted_at=attempt.completed_at or attempt.created_at,
        grading=grading,
    )


async def list_recent_quiz_attempt_summaries(
    db: AsyncSession,
    *,
    user_id: int,
    pass_score: int,
    tab_id: int | None = None,
    question_set_id: int | None = None,
    limit: int = QUIZ_ATTEMPT_HISTORY_LIMIT,
) -> list[TabQuizAttemptSummaryOut]:
    filters = [QuizAttempt.user_id == user_id]
    if tab_id is not None:
        filters.append(QuizAttempt.tab_content_id == tab_id)
    if question_set_id is not None:
        filters.append(QuizAttempt.question_set_id == question_set_id)
    if len(filters) == 1:
        raise ValueError("quiz attempt summary query requires a tab_id or question_set_id")

    attempts = (
        await db.execute(
            select(QuizAttempt)
            .where(*filters)
            .order_by(QuizAttempt.created_at.desc(), QuizAttempt.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_quiz_attempt_summary(attempt, pass_score=pass_score) for attempt in attempts]


async def get_recent_tab_quiz_attempts(
    db: AsyncSession,
    *,
    user: User,
    tab_id: int,
) -> list[TabQuizAttemptSummaryOut]:
    tab = await get_accessible_quiz_tab(db, user=user, tab_id=tab_id)
    pass_score = int(tab.config_json.get("pass_score", 70)) if isinstance(tab.config_json, dict) else 70
    return await list_recent_quiz_attempt_summaries(
        db,
        user_id=user.id,
        tab_id=tab.id,
        pass_score=pass_score,
    )


async def find_existing_tab_quiz_submission(
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


async def submit_tab_quiz_attempt(
    db: AsyncSession,
    *,
    user: User,
    tab_id: int,
    body: TabQuizSubmitIn,
) -> TabQuizResultOut:
    user_id = user.id
    for attempt_retry in range(2):
        try:
            fresh_user = await db.get(User, user_id)
            if fresh_user is None:
                raise HTTPException(status_code=404, detail="User not found")
            tab = await get_accessible_quiz_tab(db, user=fresh_user, tab_id=tab_id)
            question_set, questions_by_external_id = await ensure_question_set_for_tab(db, tab)
            questions = tab.config_json.get("questions", [])
            pass_score = question_set.pass_score
            grading_questions: list[TabQuizQuestionGradeOut] = []
            correct = 0
            question_attempt_rows: list[QuestionAttempt] = []
            for question in questions:
                qid = question_external_id(question, len(grading_questions))
                submitted = body.answers.get(qid)
                is_correct, expected = grade_quiz_question(question, submitted)
                question_row = questions_by_external_id.get(qid)
                if is_correct:
                    correct += 1
                grading_questions.append(TabQuizQuestionGradeOut(
                    id=qid,
                    type=str(question.get("type", "multiple_choice")),
                    correct=is_correct,
                    answered=_answer_present(submitted),
                ))
                if question_row is not None:
                    question_attempt_rows.append(QuestionAttempt(
                        quiz_attempt_id=0,
                        question_id=question_row.id,
                        user_id=user_id,
                        subject_id=question_set.subject_id,
                        topic_id=question_set.topic_id,
                        topic_section_id=question_set.topic_section_id,
                        topic_item_id=question_set.topic_item_id,
                        tab_content_id=question_set.tab_content_id,
                        selected_answer_json=answer_payload(submitted),
                        correct_answer_json=answer_payload(expected),
                        is_correct=is_correct,
                        score_awarded=1 if is_correct else 0,
                        max_score=1,
                        grading_json={
                            "external_id": qid,
                            "type": question.get("type", "multiple_choice"),
                            "correct": is_correct,
                        },
                    ))

            total = len(questions)
            score = round((correct / total) * 100) if total else 0
            passed = score >= pass_score
            grading = TabQuizGradingOut(questions=grading_questions)
            result_payload = {
                "score": score,
                "passed": passed,
                "correct": correct,
                "total": total,
                "pass_score": pass_score,
                "grading": grading,
            }
            submission_hash = tab_quiz_submission_hash(questions, body.answers)

            existing_attempt = await find_existing_tab_quiz_submission(
                db,
                user_id=user_id,
                question_set_id=question_set.id,
                submission_hash=submission_hash,
            )
            if existing_attempt is not None:
                existing_summary = _quiz_attempt_summary(existing_attempt, pass_score=pass_score)
                await db.rollback()
                return TabQuizResultOut(**result_payload, xp_earned=0, attempt=existing_summary)

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
                topic_item_id=tab.topic_item_id,
                tab_content_id=tab.id,
                source_type="tab",
                submission_hash=submission_hash,
                score=score,
                passed=passed,
                answers=body.answers,
                grading=grading.model_dump(mode="json"),
                attempt_number=(attempts_count or 0) + 1,
                duration_seconds=body.duration_seconds,
                started_at=now,
                completed_at=now,
            )
            db.add(attempt)
            await db.flush()

            inserted_question_attempts: list[dict] = []
            if question_attempt_rows:
                question_attempt_payloads = [
                    {
                        "quiz_attempt_id": attempt.id,
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
                        QuestionAttempt.is_correct,
                    ),
                    question_attempt_payloads,
                )
                inserted_question_attempts = [dict(row) for row in inserted_result.mappings().all()]

            xp_awards: list[XPAward] = []
            for question_attempt in inserted_question_attempts:
                if not question_attempt["is_correct"]:
                    continue
                xp_awards.append(XPAward(
                    reason="quiz_correct",
                    description=f"Question {question_attempt['question_id']} first correct",
                    subject_id=question_attempt["subject_id"],
                    topic_id=question_attempt["topic_id"],
                    topic_section_id=question_attempt["topic_section_id"],
                    topic_item_id=question_attempt["topic_item_id"],
                    question_set_id=question_set.id,
                    question_id=question_attempt["question_id"],
                    quiz_attempt_id=attempt.id,
                    question_attempt_id=question_attempt["id"],
                    idempotency_key=f"quiz_correct:user:{user_id}:question:{question_attempt['question_id']}",
                ))
            quiz_pass_idempotency_key = f"quiz_pass:user:{user_id}:question_set:{question_set.id}"
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
                    idempotency_key=quiz_pass_idempotency_key,
                ))
            xp_earned = await award_xp_bulk(user_id, xp_awards, db)

            if passed:
                quiz_pass_transaction = await db.scalar(
                    select(XPTransaction).where(
                        XPTransaction.user_id == user_id,
                        XPTransaction.idempotency_key == quiz_pass_idempotency_key,
                    )
                )
                if quiz_pass_transaction is not None and quiz_pass_transaction.quiz_attempt_id == attempt.id:
                    await apply_quiz_pass_stats_delta(db, user_id=user_id, quizzes_passed_delta=1)
                progress = await get_or_create_topic_item_progress(
                    db,
                    user_id=user_id,
                    topic_id=tab.topic_item.topic_id,
                    topic_item_id=tab.topic_item_id,
                )
                progress.latest_score = score
                progress.best_score = max(progress.best_score or 0, score)
                progress.status = "completed"
                progress.completed_at = datetime.now(timezone.utc)
            attempt_summary = _quiz_attempt_summary(attempt, pass_score=pass_score)
            await db.commit()
            return TabQuizResultOut(**result_payload, xp_earned=xp_earned, attempt=attempt_summary)
        except IntegrityError:
            await db.rollback()
            if attempt_retry == 1:
                raise
