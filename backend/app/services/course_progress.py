from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import TabContent, TopicItem
from app.models.gamification import TopicItemProgress
from app.models.quizzes import Question, QuestionSet
from app.services.quiz_grading import question_answer, question_external_id

TOPIC_ITEM_COMPLETION_GRACE_SECONDS = 5
TOPIC_ITEM_COMPLETION_RATE_MULTIPLIER = 1.25


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def requires_timed_topic_completion(item: TopicItem) -> bool:
    return item.duration_seconds > 0 and (
        "video" in item.item_type or item.completion_policy in {"watch", "video", "timed"}
    )


def required_topic_watch_seconds(duration_seconds: int) -> int:
    return max(1, (duration_seconds * 9 + 9) // 10)


def bounded_topic_watch_seconds(
    *,
    item: TopicItem,
    progress: TopicItemProgress,
    requested_seconds: int,
    now: datetime,
) -> int:
    current_seconds = progress.watched_seconds or 0
    if item.duration_seconds <= 0:
        return current_seconds

    requested = min(max(0, requested_seconds), item.duration_seconds)
    if requested <= current_seconds:
        return current_seconds

    if current_seconds <= 0:
        return min(requested, TOPIC_ITEM_COMPLETION_GRACE_SECONDS)

    last_updated = coerce_utc(progress.updated_at)
    elapsed = max(0, int((now - last_updated).total_seconds())) if last_updated else 0
    max_increment = int(elapsed * TOPIC_ITEM_COMPLETION_RATE_MULTIPLIER)
    return min(requested, current_seconds + max_increment)


async def get_or_create_topic_item_progress(
    db: AsyncSession,
    *,
    user_id: int,
    topic_id: int,
    topic_item_id: int,
    status: str = "started",
) -> TopicItemProgress:
    progress = await db.scalar(
        select(TopicItemProgress)
        .where(
            TopicItemProgress.user_id == user_id,
            TopicItemProgress.topic_item_id == topic_item_id,
        )
        .with_for_update()
    )
    if progress is not None:
        return progress

    progress = TopicItemProgress(
        user_id=user_id,
        topic_id=topic_id,
        topic_item_id=topic_item_id,
        status=status,
    )
    try:
        async with db.begin_nested():
            db.add(progress)
            await db.flush()
    except IntegrityError:
        progress = await db.scalar(
            select(TopicItemProgress)
            .where(
                TopicItemProgress.user_id == user_id,
                TopicItemProgress.topic_item_id == topic_item_id,
            )
            .with_for_update()
        )
        if progress is None:
            raise
    return progress


async def ensure_question_set_for_tab(db: AsyncSession, tab: TabContent) -> tuple[QuestionSet, dict[str, Question]]:
    topic_item = tab.topic_item
    topic = topic_item.topic if topic_item else None
    questions = tab.config_json.get("questions", []) if isinstance(tab.config_json, dict) else []
    pass_score = int(tab.config_json.get("pass_score", 70)) if isinstance(tab.config_json, dict) else 70
    title = tab.label or f"Quiz tab {tab.id}"

    result = await db.execute(
        select(QuestionSet)
        .options(selectinload(QuestionSet.questions))
        .where(QuestionSet.tab_content_id == tab.id)
    )
    question_set = result.scalar_one_or_none()
    if question_set is None:
        question_set = QuestionSet(
            subject_id=topic.subject_id if topic else None,
            topic_id=topic_item.topic_id if topic_item else None,
            topic_section_id=topic_item.section_id if topic_item else None,
            topic_item_id=tab.topic_item_id,
            tab_content_id=tab.id,
            title=title,
            source_type="tab",
            pass_score=pass_score,
            status=tab.status,
            order=tab.order,
            concept_slugs=tab.concept_slugs or [],
        )
        db.add(question_set)
        await db.flush()
    else:
        question_set.subject_id = topic.subject_id if topic else question_set.subject_id
        question_set.topic_id = topic_item.topic_id if topic_item else question_set.topic_id
        question_set.topic_section_id = topic_item.section_id if topic_item else question_set.topic_section_id
        question_set.topic_item_id = tab.topic_item_id
        question_set.title = title
        question_set.pass_score = pass_score
        question_set.status = tab.status
        question_set.order = tab.order
        question_set.concept_slugs = tab.concept_slugs or []

    existing_questions = (
        await db.execute(select(Question).where(Question.question_set_id == question_set.id))
    ).scalars().all()
    by_external_id = {question.external_id: question for question in existing_questions}
    active_external_ids: set[str] = set()
    for index, raw_question in enumerate(questions):
        external_id = question_external_id(raw_question, index)
        active_external_ids.add(external_id)
        row = by_external_id.get(external_id)
        if row is None:
            row = Question(question_set_id=question_set.id, external_id=external_id, type=str(raw_question.get("type") or "multiple_choice"), prompt=str(raw_question.get("prompt") or ""))
            by_external_id[external_id] = row
            db.add(row)
        row.type = str(raw_question.get("type") or row.type or "multiple_choice")
        row.prompt = str(raw_question.get("prompt") or raw_question.get("title") or row.prompt or "")
        row.config_json = question_config(raw_question)
        row.answer_json = question_answer(raw_question)
        row.explanation = str(raw_question.get("explanation") or "")
        row.concept_slugs = question_concept_slugs(raw_question, tab.concept_slugs or [])
        row.difficulty = str(raw_question.get("difficulty") or "")
        row.order = index

    for external_id, row in by_external_id.items():
        if external_id not in active_external_ids:
            row.status = "archived"

    await db.flush()
    return question_set, by_external_id


def question_concept_slugs(question: dict, fallback: list[str] | None = None) -> list[str]:
    raw = question.get("concept_slugs")
    if isinstance(raw, list):
        return [str(item) for item in raw if str(item).strip()]
    if question.get("concept"):
        return [str(question["concept"])]
    return fallback or []


def question_config(question: dict) -> dict:
    answer_keys = {"answer", "accepted_answers"}
    scalar_columns = {"id", "type", "title", "prompt", "concept", "concept_slugs", "difficulty", "explanation"}
    return {
        key: value
        for key, value in question.items()
        if key not in answer_keys and key not in scalar_columns
    }
