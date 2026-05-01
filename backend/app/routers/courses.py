from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.courses import Activity, Chapter, ChapterSection, CoursePDF, Lesson, Subject
from app.models.users import User
from app.schemas.courses import (
    ActivityOut, ChapterOut, ChapterSectionOut, CoursePDFOut,
    LessonDetailOut, StreamOut, SubjectDetailOut, SubjectListOut, VideoQuizTriggerOut,
)
from app.services.vdocipher import get_video_otp

router = APIRouter(tags=["Courses"])


@router.get("/subjects", response_model=list[SubjectListOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subject)
        .options(selectinload(Subject.chapters).selectinload(Chapter.lessons))
        .where(Subject.is_published == True)  # noqa: E712
        .order_by(Subject.order, Subject.title)
    )
    subjects = result.scalars().unique().all()

    out = []
    for s in subjects:
        chapter_count = len(s.chapters)
        lesson_count = sum(len(c.lessons) for c in s.chapters)
        out.append(SubjectListOut(
            id=s.id, title=s.title, description=s.description,
            thumbnail_url=s.thumbnail_url, is_published=s.is_published,
            order=s.order, chapter_count=chapter_count, lesson_count=lesson_count,
        ))
    return out


@router.get("/subjects/{subject_id}", response_model=SubjectDetailOut)
async def get_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subject)
        .options(
            selectinload(Subject.chapters).selectinload(Chapter.lessons),
            selectinload(Subject.chapters).selectinload(Chapter.blocks),
            selectinload(Subject.chapters).selectinload(Chapter.sections),
        )
        .where(Subject.id == subject_id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return SubjectDetailOut.model_validate(subject)


@router.get("/chapters/{chapter_id}", response_model=ChapterOut)
async def get_chapter(chapter_id: int, db: AsyncSession = Depends(get_db)):
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


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut)
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
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
    return LessonDetailOut(
        id=lesson.id, title=lesson.title, vdocipher_id=lesson.vdocipher_id,
        duration_seconds=lesson.duration_seconds, is_free_preview=lesson.is_free_preview,
        order=lesson.order, chapter_id=chapter.id if chapter else 0,
        chapter_title=chapter.title if chapter else "",
        subject_id=subject.id if subject else 0,
        subject_title=subject.title if subject else "",
    )


@router.get("/lessons/{lesson_id}/activities", response_model=list[ActivityOut])
async def get_lesson_activities(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Activity).where(Activity.lesson_id == lesson_id).order_by(Activity.order)
    )
    return [ActivityOut.model_validate(a) for a in result.scalars().all()]


@router.get("/lessons/{lesson_id}/stream", response_model=StreamOut)
async def get_lesson_stream(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if not lesson.is_free_preview and not user.is_pro:
        raise HTTPException(status_code=403, detail="Pro subscription required")
    otp_data = await get_video_otp(lesson.vdocipher_id, settings)
    return StreamOut(**otp_data)


@router.get("/lessons/{lesson_id}/pdfs", response_model=list[CoursePDFOut])
async def get_lesson_pdfs(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CoursePDF).where(CoursePDF.lesson_id == lesson_id).order_by(CoursePDF.order)
    )
    return [CoursePDFOut.model_validate(p) for p in result.scalars().all()]


@router.get("/chapters/{chapter_id}/sections", response_model=list[ChapterSectionOut])
async def get_chapter_sections(chapter_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChapterSection)
        .where(ChapterSection.chapter_id == chapter_id)
        .order_by(ChapterSection.order)
    )
    sections = result.scalars().all()
    return [
        ChapterSectionOut(
            id=s.id, title=s.title, section_type=s.section_type, order=s.order,
            is_gating=s.is_gating, is_free_preview=s.is_free_preview,
            vdocipher_id=s.vdocipher_id, duration_seconds=s.duration_seconds,
            content=s.content, quiz_data=s.quiz_data, pass_score=s.pass_score,
            activity_type=s.activity_type, activity_data=s.activity_data,
            chapter_id=s.chapter_id,
        )
        for s in sections
    ]


@router.get("/sections/{section_id}/stream", response_model=StreamOut)
async def get_section_stream(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(ChapterSection).where(ChapterSection.id == section_id))
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    if not section.is_free_preview and not user.is_pro:
        raise HTTPException(status_code=403, detail="Pro subscription required")
    otp_data = await get_video_otp(section.vdocipher_id, settings)
    return StreamOut(**otp_data)
