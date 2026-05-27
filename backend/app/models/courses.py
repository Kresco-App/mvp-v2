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


class ConceptTag(Base):
    __tablename__ = "concept_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(160))
    tag_type: Mapped[str] = mapped_column(String(40), default="concept")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"))
    course_offering_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("course_offerings.id", ondelete="SET NULL"), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="published")
    order: Mapped[int] = mapped_column(Integer, default=0)
    progress_weight_main: Mapped[int] = mapped_column(Integer, default=75)
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subject: Mapped["Subject"] = relationship("Subject")
    course_offering = relationship("CourseOffering")
    sections: Mapped[list["TopicSection"]] = relationship("TopicSection", back_populates="topic", order_by="TopicSection.order")
    resources: Mapped[list["Resource"]] = relationship("Resource", back_populates="topic")


class TopicSection(Base):
    __tablename__ = "topic_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    section_type: Mapped[str] = mapped_column(String(40))
    order: Mapped[int] = mapped_column(Integer, default=0)

    topic: Mapped["Topic"] = relationship("Topic", back_populates="sections")
    items: Mapped[list["TopicItem"]] = relationship("TopicItem", back_populates="section", order_by="TopicItem.order")


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    resource_type: Mapped[str] = mapped_column(String(60))
    provider: Mapped[str] = mapped_column(String(60), default="")
    provider_resource_id: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="published")
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    topic: Mapped[Optional["Topic"]] = relationship("Topic", back_populates="resources")


class TopicItem(Base):
    __tablename__ = "topic_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="CASCADE"))
    section_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topic_sections.id", ondelete="CASCADE"))
    primary_resource_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    item_type: Mapped[str] = mapped_column(String(60))
    renderer_key: Mapped[str] = mapped_column(String(120), default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="published")
    completion_policy: Mapped[str] = mapped_column(String(40), default="manual")
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    topic: Mapped["Topic"] = relationship("Topic")
    section: Mapped["TopicSection"] = relationship("TopicSection", back_populates="items")
    primary_resource: Mapped[Optional["Resource"]] = relationship("Resource")
    tabs: Mapped[list["TabContent"]] = relationship("TabContent", back_populates="topic_item", order_by="TabContent.order")


class TabContent(Base):
    __tablename__ = "tab_contents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topic_items.id", ondelete="CASCADE"))
    resource_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True)
    label: Mapped[str] = mapped_column(String(80))
    tab_type: Mapped[str] = mapped_column(String(60))
    content: Mapped[str] = mapped_column(Text, default="")
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    renderer_key: Mapped[str] = mapped_column(String(120), default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="published")
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)

    topic_item: Mapped["TopicItem"] = relationship("TopicItem", back_populates="tabs")
    resource: Mapped[Optional["Resource"]] = relationship("Resource")


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    year: Mapped[int] = mapped_column(Integer)
    session: Mapped[str] = mapped_column(String(120), default="National")
    statement_url: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(30), default="published")
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)

    subject: Mapped["Subject"] = relationship("Subject")
    problems: Mapped[list["ExamProblem"]] = relationship("ExamProblem", back_populates="exam", order_by="ExamProblem.order")


class ExamProblem(Base):
    __tablename__ = "exam_problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("exams.id", ondelete="CASCADE"))
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    video_resource_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    statement: Mapped[str] = mapped_column(Text, default="")
    written_solution: Mapped[str] = mapped_column(Text, default="")
    written_solution_url: Mapped[str] = mapped_column(String(500), default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    difficulty: Mapped[str] = mapped_column(String(40), default="bac")
    status: Mapped[str] = mapped_column(String(30), default="published")
    required_tier: Mapped[str] = mapped_column(String(40), default="")
    required_feature_key: Mapped[str] = mapped_column(String(80), default="")
    is_free_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)

    exam: Mapped["Exam"] = relationship("Exam", back_populates="problems")
    topic: Mapped[Optional["Topic"]] = relationship("Topic")
    video_resource: Mapped[Optional["Resource"]] = relationship("Resource")
