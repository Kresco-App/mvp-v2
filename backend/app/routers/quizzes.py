from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.courses import TabContent, Topic, TopicItem
from app.models.gamification import QuestionAttempt, QuizAttempt, XPTransaction
from app.models.quizzes import QuestionSet
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.quizzes import QuizDiscoveryOut, QuizOptionOut, QuizOut, QuizQuestionOut, QuizResultOut, QuizSubmitIn
from app.services.access import AccessContext, AccessDecision, build_access_context
from app.services.course_access import ORPHANED_PARENT_ACCESS_DECISION, access_for_tab, access_for_topic_item
from app.services.gamification_stats import apply_quiz_pass_stats_delta
from app.services.quiz_grading import answer_payload, grade_quiz_question, tab_quiz_submission_hash
from app.services.xp import XPAward, award_xp_bulk

router = APIRouter(tags=["Quizzes"])


@router.get("/subjects/{subject_id}/discovery", response_model=QuizDiscoveryOut)
async def get_subject_quiz_discovery(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    access_context = await build_access_context(db, user)
    result = await db.execute(
        select(QuestionSet)
        .options(selectinload(QuestionSet.questions))
        .where(QuestionSet.subject_id == subject_id, QuestionSet.status == "published")
        .order_by(QuestionSet.order, QuestionSet.id)
    )
    question_sets = result.scalars().all()
    parents = await _question_set_parent_maps(db, question_sets)
    locked_reason = ""
    for question_set in question_sets:
        access = _question_set_access_from_maps(access_context, question_set, parents)
        if access.can_access:
            return QuizDiscoveryOut(
                subject_id=subject_id,
                lesson_id=None,
                quiz=_quiz_out(question_set),
            )
        locked_reason = access.locked_reason or locked_reason
    if locked_reason:
        raise HTTPException(status_code=403, detail=locked_reason)
    return QuizDiscoveryOut(
        subject_id=subject_id,
        lesson_id=None,
        quiz=None,
    )


@router.get("/{question_set_id}", response_model=QuizOut)
async def get_quiz(
    question_set_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    question_set = await _get_accessible_question_set(db, user, question_set_id)
    return _quiz_out(question_set)


@router.post("/{question_set_id}/submit", response_model=QuizResultOut)
@limiter.limit("20/minute")
async def submit_quiz(
    request: Request,
    question_set_id: int,
    body: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    for attempt_retry in range(2):
        try:
            return await _submit_legacy_quiz_attempt(db, user=user, question_set_id=question_set_id, body=body)
        except IntegrityError:
            await db.rollback()
            if attempt_retry == 1:
                raise

    raise HTTPException(status_code=409, detail="Quiz submission conflict")


async def _get_question_set(db: AsyncSession, question_set_id: int) -> QuestionSet:
    question_set = await db.scalar(
        select(QuestionSet)
        .options(selectinload(QuestionSet.questions))
        .where(QuestionSet.id == question_set_id, QuestionSet.status == "published")
    )
    if question_set is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return question_set


async def _get_accessible_question_set(db: AsyncSession, user: User, question_set_id: int) -> QuestionSet:
    question_set = await _get_question_set(db, question_set_id)
    access = await _question_set_access(db, user, question_set)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return question_set


async def _submit_legacy_quiz_attempt(
    db: AsyncSession,
    *,
    user: User,
    question_set_id: int,
    body: QuizSubmitIn,
) -> QuizResultOut:
    question_set = await _get_accessible_question_set(db, user, question_set_id)
    questions = [question for question in question_set.questions if question.status == "published"]
    answers_by_id = {str(key): value for key, value in body.answers.items()}
    raw_questions = [_raw_question(question) for question in questions]
    submission_hash = tab_quiz_submission_hash(raw_questions, answers_by_id)
    correct = 0
    grading = {"questions": []}
    pending_question_attempts: list[QuestionAttempt] = []

    for question, raw_question in zip(questions, raw_questions):
        submitted = body.answers.get(question.id)
        is_correct, expected = grade_quiz_question(raw_question, submitted)
        if is_correct:
            correct += 1
        grading["questions"].append({
            "id": question.id,
            "correct": is_correct,
            "expected": expected,
        })
        pending_question_attempts.append(QuestionAttempt(
            quiz_attempt_id=0,
            question_id=question.id,
            user_id=user.id,
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
                "id": question.id,
                "type": question.type,
                "correct": is_correct,
            },
        ))

    total = len(questions)
    score = round((correct / total) * 100) if total else 0
    passed = score >= question_set.pass_score
    existing_attempt = await db.scalar(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.question_set_id == question_set.id,
            QuizAttempt.submission_hash == submission_hash,
        )
        .order_by(QuizAttempt.id.asc())
        .limit(1)
        .with_for_update()
    )
    if existing_attempt is not None:
        await db.rollback()
        return QuizResultOut(
            score=score,
            passed=passed,
            correct=correct,
            total=total,
            pass_score=question_set.pass_score,
            xp_earned=0,
        )

    attempts_count = await db.scalar(
        select(func.max(QuizAttempt.attempt_number)).where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.question_set_id == question_set.id,
        )
    )
    now = datetime.now(timezone.utc)
    attempt = QuizAttempt(
        user_id=user.id,
        question_set_id=question_set.id,
        subject_id=question_set.subject_id,
        topic_id=question_set.topic_id,
        topic_section_id=question_set.topic_section_id,
        topic_item_id=question_set.topic_item_id,
        tab_content_id=question_set.tab_content_id,
        source_type=question_set.source_type,
        submission_hash=submission_hash,
        score=score,
        passed=passed,
        answers=body.answers,
        grading=grading,
        attempt_number=(attempts_count or 0) + 1,
        started_at=now,
        completed_at=now,
    )
    db.add(attempt)
    await db.flush()

    inserted_question_attempts: list[dict] = []
    if pending_question_attempts:
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
            for question_attempt in pending_question_attempts
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
            idempotency_key=f"quiz_correct:user:{user.id}:question:{question_attempt['question_id']}",
        ))
    quiz_pass_idempotency_key = f"quiz_pass:user:{user.id}:question_set:{question_set.id}"
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
    xp_earned = await award_xp_bulk(user.id, xp_awards, db)

    if passed:
        quiz_pass_transaction = await db.scalar(
            select(XPTransaction).where(
                XPTransaction.user_id == user.id,
                XPTransaction.idempotency_key == quiz_pass_idempotency_key,
            )
        )
        if quiz_pass_transaction is not None and quiz_pass_transaction.quiz_attempt_id == attempt.id:
            await apply_quiz_pass_stats_delta(db, user_id=user.id, quizzes_passed_delta=1)

    await db.commit()
    return QuizResultOut(
        score=score,
        passed=passed,
        correct=correct,
        total=total,
        pass_score=question_set.pass_score,
        xp_earned=xp_earned,
    )


async def _question_set_access(db: AsyncSession, user: User, question_set: QuestionSet) -> AccessDecision:
    access_context = await build_access_context(db, user)
    if question_set.tab_content_id is not None:
        tab = await db.scalar(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id == question_set.tab_content_id)
        )
        if tab is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_tab(db, user, tab, access_context=access_context)

    if question_set.topic_item_id is not None:
        item = await db.scalar(
            select(TopicItem)
            .options(selectinload(TopicItem.topic))
            .where(TopicItem.id == question_set.topic_item_id)
        )
        if item is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_topic_item(db, user, item, access_context=access_context)

    if question_set.topic_id is not None:
        topic = await db.scalar(select(Topic).where(Topic.id == question_set.topic_id))
        if topic is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return access_context.decide_for(topic, subject_id=topic.subject_id)

    return access_context.decide_for(question_set, subject_id=question_set.subject_id)


async def _question_set_parent_maps(
    db: AsyncSession,
    question_sets: list[QuestionSet],
) -> dict[str, dict[int, TabContent | TopicItem | Topic]]:
    tab_ids = {question_set.tab_content_id for question_set in question_sets if question_set.tab_content_id is not None}
    item_ids = {question_set.topic_item_id for question_set in question_sets if question_set.topic_item_id is not None}
    topic_ids = {question_set.topic_id for question_set in question_sets if question_set.topic_id is not None}
    tabs: dict[int, TabContent] = {}
    items: dict[int, TopicItem] = {}
    topics: dict[int, Topic] = {}

    if tab_ids:
        tab_result = await db.execute(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id.in_(tab_ids))
        )
        tabs = {tab.id: tab for tab in tab_result.scalars().all()}

    if item_ids:
        item_result = await db.execute(
            select(TopicItem)
            .options(selectinload(TopicItem.topic))
            .where(TopicItem.id.in_(item_ids))
        )
        items = {item.id: item for item in item_result.scalars().all()}

    if topic_ids:
        topic_result = await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        topics = {topic.id: topic for topic in topic_result.scalars().all()}

    return {
        "tabs": tabs,
        "items": items,
        "topics": topics,
    }


def _question_set_access_from_maps(
    access_context: AccessContext,
    question_set: QuestionSet,
    parents: dict[str, dict[int, TabContent | TopicItem | Topic]],
) -> AccessDecision:
    if question_set.tab_content_id is not None:
        tab = parents["tabs"].get(question_set.tab_content_id)
        if not isinstance(tab, TabContent) or tab.topic_item is None or tab.topic_item.topic is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        topic = tab.topic_item.topic
        topic_access = access_context.decide_for(topic, subject_id=topic.subject_id)
        item_access = access_context.decide_child(topic_access, tab.topic_item, subject_id=topic.subject_id)
        return access_context.decide_child(item_access, tab, subject_id=topic.subject_id)

    if question_set.topic_item_id is not None:
        item = parents["items"].get(question_set.topic_item_id)
        if not isinstance(item, TopicItem) or item.topic is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        topic_access = access_context.decide_for(item.topic, subject_id=item.topic.subject_id)
        return access_context.decide_child(topic_access, item, subject_id=item.topic.subject_id)

    if question_set.topic_id is not None:
        topic = parents["topics"].get(question_set.topic_id)
        if not isinstance(topic, Topic):
            return ORPHANED_PARENT_ACCESS_DECISION
        return access_context.decide_for(topic, subject_id=topic.subject_id)

    return access_context.decide_for(question_set, subject_id=question_set.subject_id)


def _quiz_out(question_set: QuestionSet) -> QuizOut:
    return QuizOut(
        id=question_set.id,
        title=question_set.title,
        pass_score=question_set.pass_score,
        questions=[
            QuizQuestionOut(
                id=question.id,
                text=question.prompt,
                order=question.order,
                options=_options_out(question.config_json or {}),
            )
            for question in question_set.questions
            if question.status == "published"
        ],
    )


def _options_out(config: dict) -> list[QuizOptionOut]:
    raw_options = config.get("options") or config.get("choices") or []
    output: list[QuizOptionOut] = []
    for index, raw in enumerate(raw_options, start=1):
        if isinstance(raw, dict):
            raw_id = raw.get("id", index)
            text = str(raw.get("text") or raw.get("label") or raw.get("value") or raw_id)
        else:
            raw_id = index
            text = str(raw)
        try:
            option_id = int(raw_id)
        except (TypeError, ValueError):
            option_id = index
        output.append(QuizOptionOut(id=option_id, text=text))
    return output


def _raw_question(question) -> dict:
    return {
        "id": str(question.id),
        "type": question.type,
        "prompt": question.prompt,
        **(question.config_json or {}),
        **(question.answer_json or {}),
    }
