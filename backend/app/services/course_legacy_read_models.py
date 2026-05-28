from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.config import Settings
from app.models.courses import Activity, Chapter, ChapterSection, CoursePDF, Exam, ExamProblem, Lesson, Resource, Subject
from app.models.users import User
from app.schemas.courses import (
    ActivityOut,
    ChapterOut,
    ChapterSectionOut,
    ChapterWithSectionsOut,
    CoursePDFOut,
    ExamOut,
    LessonDetailOut,
    SectionWatchContextOut,
    StreamOut,
    SubjectDetailOut,
    SubjectListOut,
)
from app.services.access import build_access_context
from app.services.course_access import chapter_section_out, exam_out, require_lesson_access
from app.services.vdocipher import get_video_otp


async def list_subject_summaries(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
) -> list[SubjectListOut]:
    result = await db.execute(
        select(Subject)
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(Subject.order, Subject.title)
        .offset(offset)
        .limit(limit)
    )
    subjects = result.scalars().all()
    subject_ids = [subject.id for subject in subjects]

    chapter_counts: dict[int, int] = {}
    lesson_counts: dict[int, int] = {}
    if subject_ids:
        chapter_count_result = await db.execute(
            select(Chapter.subject_id, func.count(Chapter.id))
            .where(Chapter.subject_id.in_(subject_ids))
            .group_by(Chapter.subject_id)
        )
        chapter_counts = {subject_id: count for subject_id, count in chapter_count_result.all()}

        lesson_count_result = await db.execute(
            select(Chapter.subject_id, func.count(Lesson.id))
            .join(Lesson, Lesson.chapter_id == Chapter.id)
            .where(Chapter.subject_id.in_(subject_ids))
            .group_by(Chapter.subject_id)
        )
        lesson_counts = {subject_id: count for subject_id, count in lesson_count_result.all()}

    return [
        SubjectListOut(
            id=subject.id,
            title=subject.title,
            description=subject.description,
            thumbnail_url=subject.thumbnail_url,
            is_published=subject.is_published,
            order=subject.order,
            chapter_count=chapter_counts.get(subject.id, 0),
            lesson_count=lesson_counts.get(subject.id, 0),
        )
        for subject in subjects
    ]


async def get_subject_detail(db: AsyncSession, subject_id: int) -> SubjectDetailOut:
    result = await db.execute(
        select(Subject)
        .options(
            selectinload(Subject.chapters).selectinload(Chapter.lessons),
            selectinload(Subject.chapters).selectinload(Chapter.blocks),
            selectinload(Subject.chapters).selectinload(Chapter.sections),
        )
        .where(Subject.id == subject_id, Subject.is_published == True)  # noqa: E712
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return SubjectDetailOut.model_validate(subject)


async def get_chapter_detail(db: AsyncSession, chapter_id: int) -> ChapterOut:
    result = await db.execute(
        select(Chapter)
        .options(
            selectinload(Chapter.lessons),
            selectinload(Chapter.blocks),
            selectinload(Chapter.sections),
        )
        .where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return ChapterOut.model_validate(chapter)


async def get_lesson_detail(
    db: AsyncSession,
    *,
    user: User,
    lesson_id: int,
) -> LessonDetailOut:
    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.chapter).selectinload(Chapter.subject))
        .where(Lesson.id == lesson_id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    chapter = lesson.chapter
    subject = chapter.subject if chapter else None
    access_context = await build_access_context(db, user)
    access = access_context.decide_for(lesson, subject_id=subject.id if subject else None, fallback_required_tier="pro")
    return LessonDetailOut(
        id=lesson.id,
        title=lesson.title,
        vdocipher_id=lesson.vdocipher_id if access.can_access else "",
        duration_seconds=lesson.duration_seconds,
        is_free_preview=lesson.is_free_preview,
        order=lesson.order,
        chapter_id=chapter.id if chapter else 0,
        chapter_title=chapter.title if chapter else "",
        subject_id=subject.id if subject else 0,
        subject_title=subject.title if subject else "",
    )


async def list_lesson_activities(
    db: AsyncSession,
    *,
    user: User,
    lesson_id: int,
) -> list[ActivityOut]:
    await require_lesson_access(db, user, lesson_id)
    result = await db.execute(
        select(Activity).where(Activity.lesson_id == lesson_id).order_by(Activity.order)
    )
    return [ActivityOut.model_validate(activity) for activity in result.scalars().all()]


async def build_lesson_stream(
    db: AsyncSession,
    *,
    user: User,
    lesson_id: int,
    settings: Settings,
) -> StreamOut:
    lesson = await require_lesson_access(db, user, lesson_id)
    otp_data = await get_video_otp(lesson.vdocipher_id, settings)
    return StreamOut(**otp_data)


async def list_lesson_pdfs(
    db: AsyncSession,
    *,
    user: User,
    lesson_id: int,
) -> list[CoursePDFOut]:
    await require_lesson_access(db, user, lesson_id)
    result = await db.execute(
        select(CoursePDF).where(CoursePDF.lesson_id == lesson_id).order_by(CoursePDF.order)
    )
    return [CoursePDFOut.model_validate(pdf) for pdf in result.scalars().all()]


async def list_chapter_sections(
    db: AsyncSession,
    *,
    user: User,
    chapter_id: int,
) -> list[ChapterSectionOut]:
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.chapter_id == chapter_id)
        .order_by(ChapterSection.order)
    )
    sections = result.scalars().all()
    access_context = await build_access_context(db, user)
    return [
        chapter_section_out(section, access_context)
        for section in sections
    ]


async def build_section_stream(
    db: AsyncSession,
    *,
    user: User,
    section_id: int,
    settings: Settings,
) -> StreamOut:
    result = await db.execute(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter))
        .where(ChapterSection.id == section_id)
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    access_context = await build_access_context(db, user)
    subject_id = section.chapter.subject_id if section.chapter else None
    access = access_context.decide_for(section, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    otp_data = await get_video_otp(section.vdocipher_id, settings)
    return StreamOut(**otp_data)


async def list_exam_bank_entries(
    db: AsyncSession,
    *,
    user: User,
    subject_id: int | None = None,
    topic_id: int | None = None,
    year: int | None = None,
    q: str = "",
) -> list[ExamOut]:
    stmt = (
        select(Exam)
        .options(
            selectinload(Exam.subject),
            selectinload(Exam.problems).selectinload(ExamProblem.video_resource),
            with_loader_criteria(ExamProblem, ExamProblem.status == "published"),
            with_loader_criteria(Resource, Resource.status == "published"),
        )
        .join(Subject, Subject.id == Exam.subject_id)
        .where(Exam.status == "published", Subject.is_published == True)  # noqa: E712
        .order_by(Exam.year.desc(), Exam.title)
    )
    if subject_id:
        stmt = stmt.where(Exam.subject_id == subject_id)
    if year:
        stmt = stmt.where(Exam.year == year)

    result = await db.execute(stmt)
    exams = result.scalars().unique().all()
    access_context = await build_access_context(db, user)
    out: list[ExamOut] = []
    for exam in exams:
        problems = [problem for problem in exam.problems if problem.status == "published"]
        if topic_id:
            problems = [problem for problem in problems if problem.topic_id == topic_id]
        if q:
            q_lower = q.lower()
            exam_text = f"{exam.title} {exam.subject.title if exam.subject else ''} {exam.year} {exam.session}".lower()
            if q_lower not in exam_text:
                problems = [
                    problem
                    for problem in problems
                    if q_lower in (
                        problem.title
                        + " "
                        + problem.statement
                        + " "
                        + problem.difficulty
                        + " "
                        + " ".join(problem.concept_slugs or [])
                    ).lower()
                ]
        if topic_id or q:
            if not problems:
                continue
        out.append(exam_out(exam, problems, access_context))
    return out


async def build_section_watch_context(
    db: AsyncSession,
    *,
    user: User,
    section_id: int,
) -> SectionWatchContextOut:
    section = await db.scalar(
        select(ChapterSection)
        .options(selectinload(ChapterSection.chapter).selectinload(Chapter.subject))
        .where(ChapterSection.id == section_id)
    )
    if section is None or section.chapter is None:
        raise HTTPException(status_code=404, detail="Section not found")

    chapter = section.chapter
    subject = chapter.subject
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    chapters_result = await db.execute(
        select(Chapter)
        .options(selectinload(Chapter.sections))
        .where(Chapter.subject_id == subject.id)
        .order_by(Chapter.order)
    )
    chapters = chapters_result.scalars().all()
    access_context = await build_access_context(db, user)

    chapter_outputs = [
        ChapterWithSectionsOut(
            id=item.id,
            title=item.title,
            description=item.description,
            order=item.order,
            sections=[
                chapter_section_out(child, access_context, fallback_subject_id=subject.id)
                for child in item.sections
            ],
        )
        for item in chapters
    ]
    current_chapter = next((item for item in chapter_outputs if item.id == chapter.id), None)
    if current_chapter is None:
        current_chapter = ChapterWithSectionsOut(
            id=chapter.id,
            title=chapter.title,
            description=chapter.description,
            order=chapter.order,
            sections=[chapter_section_out(section, access_context, fallback_subject_id=subject.id)],
        )

    return SectionWatchContextOut(
        section=chapter_section_out(section, access_context, fallback_subject_id=subject.id),
        chapter=current_chapter,
        subject_id=subject.id,
        subject_title=subject.title,
        chapters=chapter_outputs,
    )
