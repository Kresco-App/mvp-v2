from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.courses import TabContent, Topic, TopicItem
from app.models.gamification import QuizAttempt
from app.models.quizzes import QuestionSet
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.quizzes import QuizDiscoveryOut, QuizOptionOut, QuizOut, QuizQuestionOut, QuizResultOut, QuizSubmitIn
from app.services.access import AccessDecision, build_access_context
from app.services.course_access import ORPHANED_PARENT_ACCESS_DECISION, access_for_tab, access_for_topic_item
from app.services.quiz_grading import grade_quiz_question

router = APIRouter(tags=["Quizzes"])


@router.get("/subjects/{subject_id}/discovery", response_model=QuizDiscoveryOut)
async def get_subject_quiz_discovery(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuestionSet)
        .options(selectinload(QuestionSet.questions))
        .where(QuestionSet.subject_id == subject_id, QuestionSet.status == "published")
        .order_by(QuestionSet.order, QuestionSet.id)
        .limit(25)
    )
    locked_reason = ""
    for question_set in result.scalars().all():
        access = await _question_set_access(db, user, question_set)
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
    question_set = await _get_accessible_question_set(db, user, question_set_id)
    questions = [question for question in question_set.questions if question.status == "published"]
    correct = 0
    grading = {"questions": []}
    for question in questions:
        submitted = body.answers.get(question.id)
        is_correct, expected = grade_quiz_question(_raw_question(question), submitted)
        if is_correct:
            correct += 1
        grading["questions"].append({
            "id": question.id,
            "correct": is_correct,
            "expected": expected,
        })
    total = len(questions)
    score = round((correct / total) * 100) if total else 0
    passed = score >= question_set.pass_score
    db.add(QuizAttempt(
        user_id=user.id,
        question_set_id=question_set.id,
        subject_id=question_set.subject_id,
        topic_id=question_set.topic_id,
        topic_section_id=question_set.topic_section_id,
        topic_item_id=question_set.topic_item_id,
        tab_content_id=question_set.tab_content_id,
        source_type=question_set.source_type,
        score=score,
        passed=passed,
        answers=body.answers,
        grading=grading,
        attempt_number=1,
    ))
    await db.commit()
    return QuizResultOut(
        score=score,
        passed=passed,
        correct=correct,
        total=total,
        pass_score=question_set.pass_score,
        xp_earned=0,
    )


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


async def _question_set_access(db: AsyncSession, user: User, question_set: QuestionSet) -> AccessDecision:
    if question_set.tab_content_id is not None:
        tab = await db.scalar(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id == question_set.tab_content_id)
        )
        if tab is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_tab(db, user, tab)

    if question_set.topic_item_id is not None:
        item = await db.scalar(
            select(TopicItem)
            .options(selectinload(TopicItem.topic))
            .where(TopicItem.id == question_set.topic_item_id)
        )
        if item is None:
            return ORPHANED_PARENT_ACCESS_DECISION
        return await access_for_topic_item(db, user, item)

    access_context = await build_access_context(db, user)
    if question_set.topic_id is not None:
        topic = await db.scalar(select(Topic).where(Topic.id == question_set.topic_id))
        if topic is None:
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
        "id": question.external_id or str(question.id),
        "type": question.type,
        "prompt": question.prompt,
        **(question.config_json or {}),
        **(question.answer_json or {}),
    }
