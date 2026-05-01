from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.quizzes import Quiz


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    thumbnail_url: Mapped[str] = mapped_column(String(500), default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chapters: Mapped[list["Chapter"]] = relationship("Chapter", back_populates="subject", order_by="Chapter.order")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subject: Mapped["Subject"] = relationship("Subject", back_populates="chapters")
    lessons: Mapped[list["Lesson"]] = relationship("Lesson", back_populates="chapter", order_by="Lesson.order")
    blocks: Mapped[list["ChapterBlock"]] = relationship("ChapterBlock", back_populates="chapter", order_by="ChapterBlock.order")
    sections: Mapped[list["ChapterSection"]] = relationship("ChapterSection", back_populates="chapter", order_by="ChapterSection.order")


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chapter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chapters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    vdocipher_id: Mapped[str] = mapped_column(String(255), default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="lessons")
    activities: Mapped[list["Activity"]] = relationship("Activity", back_populates="lesson", order_by="Activity.order")
    pdfs: Mapped[list["CoursePDF"]] = relationship("CoursePDF", back_populates="lesson", order_by="CoursePDF.order")
    quiz: Mapped[Optional["Quiz"]] = relationship("Quiz", back_populates="lesson", uselist=False)
    quiz_triggers: Mapped[list["VideoQuizTrigger"]] = relationship("VideoQuizTrigger", back_populates="lesson", order_by="VideoQuizTrigger.timestamp_seconds")

    @property
    def duration_display(self) -> str:
        m, s = divmod(self.duration_seconds, 60)
        return f"{m}:{s:02d}"


class VideoQuizTrigger(Base):
    __tablename__ = "video_quiz_triggers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("lessons.id", ondelete="CASCADE"))
    timestamp_seconds: Mapped[int] = mapped_column(Integer)
    quiz_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("quizzes.id", ondelete="CASCADE"))
    is_blocking: Mapped[bool] = mapped_column(Boolean, default=True)

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="quiz_triggers")


class ChapterBlock(Base):
    __tablename__ = "chapter_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chapter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chapters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text)
    block_type: Mapped[str] = mapped_column(String(20), default="markdown")
    order: Mapped[int] = mapped_column(Integer, default=0)

    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="blocks")


class ChapterSection(Base):
    __tablename__ = "chapter_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chapter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chapters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    section_type: Mapped[str] = mapped_column(String(20))
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_gating: Mapped[bool] = mapped_column(Boolean, default=True)
    vdocipher_id: Mapped[str] = mapped_column(String(255), default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    content: Mapped[str] = mapped_column(Text, default="")
    quiz_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    pass_score: Mapped[int] = mapped_column(Integer, default=70)
    activity_type: Mapped[str] = mapped_column(String(30), default="")
    activity_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="sections")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("lessons.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    activity_type: Mapped[str] = mapped_column(String(30))
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    react_component_url: Mapped[str] = mapped_column(String(500), default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="activities")


class CoursePDF(Base):
    __tablename__ = "course_pdfs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("lessons.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(500))
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="pdfs")
