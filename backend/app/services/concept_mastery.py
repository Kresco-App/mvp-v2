from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import case, cast, func, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.sqltypes import Integer

from app.models.gamification import UserConceptMastery
from app.models.quizzes import Question
from app.models.users import User
from app.schemas.gamification import ConceptMasteryEntryOut, ConceptMasteryListOut

MASTERY_WEAK_THRESHOLD = 70
MASTERY_CONFIDENCE_STEP = 20
MASTERY_CONFIDENCE_MAX_ATTEMPTS = 5


@dataclass
class _ConceptDelta:
    concept_slug: str
    context_key: str
    subject_id: int | None = None
    topic_id: int | None = None
    last_question_attempt_id: int | None = None
    last_quiz_attempt_id: int | None = None
    correct_count: int = 0
    incorrect_count: int = 0

    @property
    def attempts_count(self) -> int:
        return self.correct_count + self.incorrect_count

    @property
    def mastery_score(self) -> int:
        if self.attempts_count <= 0:
            return 0
        return rounded_mastery_score(self.correct_count, self.attempts_count)

    @property
    def confidence(self) -> int:
        return min(100, self.attempts_count * MASTERY_CONFIDENCE_STEP)

    @property
    def last_result(self) -> str:
        if self.correct_count > 0 and self.incorrect_count > 0:
            return "mixed"
        if self.correct_count > 0:
            return "correct"
        if self.incorrect_count > 0:
            return "incorrect"
        return "unknown"

    @property
    def status(self) -> str:
        return concept_mastery_status(self.mastery_score, self.confidence)


async def update_concept_mastery_from_question_attempts(
    db: AsyncSession,
    *,
    user_id: int,
    quiz_attempt_id: int | None,
    question_attempts: list[dict],
    fallback_concept_slugs: list[str] | None = None,
    practiced_at: datetime | None = None,
) -> None:
    if not question_attempts:
        return

    question_ids = sorted({
        int(attempt["question_id"])
        for attempt in question_attempts
        if attempt.get("question_id") is not None
    })
    if not question_ids:
        return

    concept_result = await db.execute(
        select(Question.id, Question.concept_slugs).where(Question.id.in_(question_ids))
    )
    fallback_concepts = _normalize_concept_slugs(fallback_concept_slugs or [])
    concepts_by_question = {
        int(question_id): _normalize_concept_slugs(concept_slugs) or fallback_concepts
        for question_id, concept_slugs in concept_result.all()
    }

    deltas: dict[tuple[str, str], _ConceptDelta] = {}
    for attempt in question_attempts:
        concepts = concepts_by_question.get(int(attempt["question_id"]), [])
        if not concepts:
            continue
        subject_id = attempt.get("subject_id")
        topic_id = attempt.get("topic_id")
        context_key = _concept_context_key(subject_id=subject_id, topic_id=topic_id)
        for concept_slug in concepts:
            delta_key = (context_key, concept_slug)
            delta = deltas.setdefault(
                delta_key,
                _ConceptDelta(
                    concept_slug=concept_slug,
                    context_key=context_key,
                    subject_id=subject_id,
                    topic_id=topic_id,
                    last_quiz_attempt_id=quiz_attempt_id,
                ),
            )
            delta.last_question_attempt_id = attempt.get("id")
            delta.last_quiz_attempt_id = quiz_attempt_id
            if delta.subject_id is None:
                delta.subject_id = subject_id
            if delta.topic_id is None:
                delta.topic_id = topic_id
            if attempt.get("is_correct"):
                delta.correct_count += 1
            else:
                delta.incorrect_count += 1

    if not deltas:
        return

    await _upsert_concept_mastery_deltas(
        db,
        user_id=user_id,
        deltas=list(deltas.values()),
        practiced_at=practiced_at or datetime.now(timezone.utc),
    )


async def list_concept_mastery_entries(
    db: AsyncSession,
    *,
    user: User,
    subject_id: int | None = None,
    topic_id: int | None = None,
    weak_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> ConceptMasteryListOut:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    filters = [UserConceptMastery.user_id == user.id]
    if subject_id is not None:
        filters.append(UserConceptMastery.subject_id == subject_id)
    if topic_id is not None:
        filters.append(UserConceptMastery.topic_id == topic_id)
    if weak_only:
        filters.append(UserConceptMastery.status == "weak")

    total = int(
        await db.scalar(
            select(func.count()).select_from(UserConceptMastery).where(*filters)
        )
        or 0
    )
    rows = (
        await db.execute(
            select(UserConceptMastery)
            .where(*filters)
            .order_by(
                UserConceptMastery.mastery_score.asc(),
                UserConceptMastery.confidence.desc(),
                UserConceptMastery.updated_at.desc(),
                UserConceptMastery.id.asc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    return ConceptMasteryListOut(
        total=total,
        limit=limit,
        offset=offset,
        weak_threshold=MASTERY_WEAK_THRESHOLD,
        items=[
            ConceptMasteryEntryOut(
                id=row.id,
                concept_slug=row.concept_slug,
                context_key=row.context_key,
                subject_id=row.subject_id,
                topic_id=row.topic_id,
                attempts_count=row.attempts_count,
                correct_count=row.correct_count,
                incorrect_count=row.incorrect_count,
                mastery_score=row.mastery_score,
                confidence=row.confidence,
                status=row.status,
                is_weak=row.status == "weak",
                last_result=row.last_result,
                last_source=row.last_source,
                last_question_attempt_id=row.last_question_attempt_id,
                last_quiz_attempt_id=row.last_quiz_attempt_id,
                last_practiced_at=row.last_practiced_at,
                last_correct_at=row.last_correct_at,
                last_incorrect_at=row.last_incorrect_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ],
    )


async def _upsert_concept_mastery_deltas(
    db: AsyncSession,
    *,
    user_id: int,
    deltas: list[_ConceptDelta],
    practiced_at: datetime,
) -> None:
    rows = [
        {
            "user_id": user_id,
            "subject_id": delta.subject_id,
            "topic_id": delta.topic_id,
            "context_key": delta.context_key,
            "concept_slug": delta.concept_slug,
            "attempts_count": delta.attempts_count,
            "correct_count": delta.correct_count,
            "incorrect_count": delta.incorrect_count,
            "mastery_score": delta.mastery_score,
            "confidence": delta.confidence,
            "status": delta.status,
            "last_result": delta.last_result,
            "last_source": "quiz",
            "last_question_attempt_id": delta.last_question_attempt_id,
            "last_quiz_attempt_id": delta.last_quiz_attempt_id,
            "last_practiced_at": practiced_at,
            "last_correct_at": practiced_at if delta.correct_count > 0 else None,
            "last_incorrect_at": practiced_at if delta.incorrect_count > 0 else None,
        }
        for delta in deltas
        if delta.attempts_count > 0
    ]
    if not rows:
        return

    dialect_name = db.get_bind().dialect.name
    insert_factory = sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
    if insert_factory is None:
        await _upsert_concept_mastery_deltas_fallback(
            db,
            user_id=user_id,
            deltas=deltas,
            practiced_at=practiced_at,
        )
        return

    stmt = insert_factory(UserConceptMastery).values(rows)
    excluded = stmt.excluded
    attempts_total = UserConceptMastery.attempts_count + excluded.attempts_count
    correct_total = UserConceptMastery.correct_count + excluded.correct_count
    incorrect_total = UserConceptMastery.incorrect_count + excluded.incorrect_count
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "context_key", "concept_slug"],
        set_={
            "subject_id": func.coalesce(excluded.subject_id, UserConceptMastery.subject_id),
            "topic_id": func.coalesce(excluded.topic_id, UserConceptMastery.topic_id),
            "attempts_count": attempts_total,
            "correct_count": correct_total,
            "incorrect_count": incorrect_total,
            "mastery_score": _rounded_mastery_score_sql(correct_total, attempts_total),
            "confidence": case(
                (attempts_total >= MASTERY_CONFIDENCE_MAX_ATTEMPTS, 100),
                else_=attempts_total * MASTERY_CONFIDENCE_STEP,
            ),
            "status": _status_sql_expression(correct_total, attempts_total),
            "last_result": excluded.last_result,
            "last_source": excluded.last_source,
            "last_question_attempt_id": excluded.last_question_attempt_id,
            "last_quiz_attempt_id": excluded.last_quiz_attempt_id,
            "last_practiced_at": excluded.last_practiced_at,
            "last_correct_at": func.coalesce(excluded.last_correct_at, UserConceptMastery.last_correct_at),
            "last_incorrect_at": func.coalesce(excluded.last_incorrect_at, UserConceptMastery.last_incorrect_at),
            "updated_at": func.now(),
        },
    )
    await db.execute(stmt)


async def _upsert_concept_mastery_deltas_fallback(
    db: AsyncSession,
    *,
    user_id: int,
    deltas: list[_ConceptDelta],
    practiced_at: datetime,
) -> None:
    for delta in deltas:
        if delta.attempts_count <= 0:
            continue
        row = await db.scalar(
            select(UserConceptMastery)
            .where(
                UserConceptMastery.user_id == user_id,
                UserConceptMastery.context_key == delta.context_key,
                UserConceptMastery.concept_slug == delta.concept_slug,
            )
            .with_for_update()
        )
        if row is None:
            row = UserConceptMastery(
                user_id=user_id,
                subject_id=delta.subject_id,
                topic_id=delta.topic_id,
                context_key=delta.context_key,
                concept_slug=delta.concept_slug,
            )
            db.add(row)
        row.subject_id = delta.subject_id if delta.subject_id is not None else row.subject_id
        row.topic_id = delta.topic_id if delta.topic_id is not None else row.topic_id
        row.attempts_count += delta.attempts_count
        row.correct_count += delta.correct_count
        row.incorrect_count += delta.incorrect_count
        row.mastery_score = rounded_mastery_score(row.correct_count, row.attempts_count)
        row.confidence = min(100, row.attempts_count * MASTERY_CONFIDENCE_STEP)
        row.status = concept_mastery_status(row.mastery_score, row.confidence)
        row.last_result = delta.last_result
        row.last_source = "quiz"
        row.last_question_attempt_id = delta.last_question_attempt_id
        row.last_quiz_attempt_id = delta.last_quiz_attempt_id
        row.last_practiced_at = practiced_at
        if delta.correct_count > 0:
            row.last_correct_at = practiced_at
        if delta.incorrect_count > 0:
            row.last_incorrect_at = practiced_at
    await db.flush()


def concept_mastery_status(mastery_score: int, confidence: int) -> str:
    if mastery_score < MASTERY_WEAK_THRESHOLD:
        return "weak"
    if mastery_score >= 85 and confidence >= 60:
        return "mastered"
    return "developing"


def rounded_mastery_score(correct_count: int, attempts_count: int) -> int:
    if attempts_count <= 0:
        return 0
    return int((correct_count / attempts_count) * 100 + 0.5)


def _rounded_mastery_score_sql(correct_total, attempts_total):
    return cast(func.round((correct_total * 100.0) / attempts_total), Integer)


def _status_sql_expression(correct_total, attempts_total):
    mastery_score = _rounded_mastery_score_sql(correct_total, attempts_total)
    confidence = case(
        (attempts_total >= MASTERY_CONFIDENCE_MAX_ATTEMPTS, 100),
        else_=attempts_total * MASTERY_CONFIDENCE_STEP,
    )
    return case(
        (mastery_score < MASTERY_WEAK_THRESHOLD, "weak"),
        ((mastery_score >= 85) & (confidence >= 60), "mastered"),
        else_="developing",
    )


def _concept_context_key(*, subject_id: int | None, topic_id: int | None) -> str:
    if subject_id is not None and topic_id is not None:
        return f"subject:{subject_id}:topic:{topic_id}"
    if subject_id is not None:
        return f"subject:{subject_id}"
    if topic_id is not None:
        return f"topic:{topic_id}"
    return "global"


def _normalize_concept_slugs(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    grouped: dict[str, None] = {}
    for item in value:
        slug = str(item).strip()
        if slug:
            grouped[slug] = None
    return sorted(grouped.keys())
