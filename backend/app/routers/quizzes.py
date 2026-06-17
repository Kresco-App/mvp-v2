from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.courses import Subject, TabContent, Topic, TopicItem
from app.models.gamification import QuestionAttempt
from app.models.quizzes import QuestionSet
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.quizzes import (
    QuizAttemptHistoryOut,
    QuizDiscoveryOut,
    QuizOptionOut,
    QuizOut,
    QuizQuestionOut,
    QuizResultOut,
    QuizSubmitIn,
)
from app.services.access import AccessContext, AccessDecision, build_access_context
from app.services.course_access import ORPHANED_PARENT_ACCESS_DECISION, access_for_tab, access_for_topic_item
from app.services.quiz_attempt_read_models import list_quiz_attempt_history
from app.services.quiz_attempt_submission import persist_quiz_submission
from app.services.quiz_grading import answer_payload, grade_quiz_question

router = APIRouter(tags=["Quizzes"])
QUIZ_DISCOVERY_BATCH_SIZE = 20


@router.get("/subjects/{subject_id}/discovery", response_model=QuizDiscoveryOut)
async def get_subject_quiz_discovery(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    access_context = await build_access_context(db, user)
    locked_reason = ""
    offset = 0
    while True:
        question_sets = await _load_quiz_discovery_batch(db, subject_id=subject_id, offset=offset)
        if not question_sets:
            break
        parents = await _question_set_parent_maps(db, question_sets)
        for question_set in question_sets:
            access = _question_set_access_from_maps(access_context, question_set, parents)
            if _is_orphaned_parent_access(access):
                continue
            if access.can_access:
                selected_question_set = await _get_question_set(db, question_set.id)
                return QuizDiscoveryOut(
                    subject_id=subject_id,
                    quiz=_quiz_out(selected_question_set),
                )
            locked_reason = access.locked_reason or locked_reason
        offset += len(question_sets)
    if locked_reason:
        raise HTTPException(status_code=403, detail=locked_reason)
    return QuizDiscoveryOut(
        subject_id=subject_id,
        quiz=None,
    )


async def _load_quiz_discovery_batch(
    db: AsyncSession,
    *,
    subject_id: int,
    offset: int,
) -> list[QuestionSet]:
    result = await db.execute(
        select(QuestionSet)
        .join(Subject, Subject.id == QuestionSet.subject_id)
        .where(QuestionSet.subject_id == subject_id, QuestionSet.status == "published")
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(QuestionSet.order, QuestionSet.id)
        .offset(offset)
        .limit(QUIZ_DISCOVERY_BATCH_SIZE)
    )
    return result.scalars().all()


@router.get("/{question_set_id}", response_model=QuizOut)
async def get_quiz(
    question_set_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    question_set = await _get_accessible_question_set(db, user, question_set_id)
    return _quiz_out(question_set)


@router.get("/{question_set_id}/attempts", response_model=QuizAttemptHistoryOut)
async def get_quiz_attempt_history(
    question_set_id: int,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    question_set = await _get_accessible_question_set(db, user, question_set_id)
    return await list_quiz_attempt_history(
        db,
        user=user,
        question_set=question_set,
        limit=limit,
        offset=offset,
    )


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
            return await _submit_quiz_attempt(db, user=user, question_set_id=question_set_id, body=body)
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
    if _is_orphaned_parent_access(access):
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return question_set


async def _submit_quiz_attempt(
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
    correct = 0
    grading = {"questions": []}
    pending_question_attempts: list[QuestionAttempt] = []

    for question, raw_question in zip(questions, raw_questions):
        submitted = _submitted_answer(body.answers, question.id)
        is_correct, expected = grade_quiz_question(raw_question, submitted)
        if is_correct:
            correct += 1
        grading["questions"].append({
            "id": question.id,
            "type": question.type,
            "correct": is_correct,
            "answered": submitted is not None,
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
    persisted = await persist_quiz_submission(
        db,
        user_id=user.id,
        question_set=question_set,
        raw_questions=raw_questions,
        answers=body.answers,
        hash_answers=answers_by_id,
        score=score,
        passed=passed,
        grading=grading,
        question_attempt_rows=pending_question_attempts,
    )
    if persisted.is_duplicate:
        return QuizResultOut(
            score=score,
            passed=passed,
            correct=correct,
            total=total,
            pass_score=question_set.pass_score,
            xp_earned=0,
        )

    await db.commit()
    return QuizResultOut(
        score=score,
        passed=passed,
        correct=correct,
        total=total,
        pass_score=question_set.pass_score,
        xp_earned=persisted.xp_earned,
    )


async def _question_set_access(db: AsyncSession, user: User, question_set: QuestionSet) -> AccessDecision:
    access_context = await build_access_context(db, user)
    if question_set.tab_content_id is not None:
        tab = await db.scalar(
            select(TabContent)
            .join(TopicItem, TopicItem.id == TabContent.topic_item_id)
            .join(Topic, Topic.id == TopicItem.topic_id)
            .join(Subject, Subject.id == Topic.subject_id)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(
                TabContent.id == question_set.tab_content_id,
                TabContent.status == "published",
                TopicItem.status == "published",
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
        if tab is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_tab(db, user, tab, access_context=access_context)

    if question_set.topic_item_id is not None:
        item = await db.scalar(
            select(TopicItem)
            .join(Topic, Topic.id == TopicItem.topic_id)
            .join(Subject, Subject.id == Topic.subject_id)
            .options(selectinload(TopicItem.topic))
            .where(
                TopicItem.id == question_set.topic_item_id,
                TopicItem.status == "published",
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
        if item is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_topic_item(db, user, item, access_context=access_context)

    if question_set.topic_id is not None:
        topic = await db.scalar(
            select(Topic)
            .join(Subject, Subject.id == Topic.subject_id)
            .where(
                Topic.id == question_set.topic_id,
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
        if topic is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return access_context.decide_for(topic, subject_id=topic.subject_id)

    if not await _subject_is_published(db, question_set.subject_id):
        return ORPHANED_PARENT_ACCESS_DECISION
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
            .join(TopicItem, TopicItem.id == TabContent.topic_item_id)
            .join(Topic, Topic.id == TopicItem.topic_id)
            .join(Subject, Subject.id == Topic.subject_id)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(
                TabContent.id.in_(tab_ids),
                TabContent.status == "published",
                TopicItem.status == "published",
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
        tabs = {tab.id: tab for tab in tab_result.scalars().all()}

    if item_ids:
        item_result = await db.execute(
            select(TopicItem)
            .join(Topic, Topic.id == TopicItem.topic_id)
            .join(Subject, Subject.id == Topic.subject_id)
            .options(selectinload(TopicItem.topic))
            .where(
                TopicItem.id.in_(item_ids),
                TopicItem.status == "published",
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
        items = {item.id: item for item in item_result.scalars().all()}

    if topic_ids:
        topic_result = await db.execute(
            select(Topic)
            .join(Subject, Subject.id == Topic.subject_id)
            .where(
                Topic.id.in_(topic_ids),
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
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


def _is_orphaned_parent_access(access: AccessDecision) -> bool:
    return access.reason == ORPHANED_PARENT_ACCESS_DECISION.reason


async def _subject_is_published(db: AsyncSession, subject_id: int) -> bool:
    return bool(
        await db.scalar(
            select(Subject.id).where(
                Subject.id == subject_id,
                Subject.is_published == True,  # noqa: E712
            )
        )
    )


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


def _submitted_answer(answers: dict, question_id: int):
    if question_id in answers:
        return answers[question_id]
    return answers.get(str(question_id))


def _raw_question(question) -> dict:
    return {
        "id": str(question.id),
        "type": question.type,
        "prompt": question.prompt,
        **(question.config_json or {}),
        **(question.answer_json or {}),
    }
