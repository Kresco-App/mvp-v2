from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.gamification import QuestionAttempt


class QuestionSet(Base):
    __tablename__ = "question_sets"
    __table_args__ = (
        UniqueConstraint("tab_content_id", name="uq_question_sets_tab_content"),
        Index("ix_question_sets_subject_topic", "subject_id", "topic_id"),
        Index("ix_question_sets_tab_content", "tab_content_id"),
        Index("ix_question_sets_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_section_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True, index=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(40), default="tab")
    pass_score: Mapped[int] = mapped_column(Integer, default=70)
    status: Mapped[str] = mapped_column(String(30), default="published")
    order: Mapped[int] = mapped_column(Integer, default=0)
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    questions: Mapped[list["Question"]] = relationship("Question", back_populates="question_set", order_by="Question.order")


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        UniqueConstraint("question_set_id", "external_id", name="uq_questions_set_external_id"),
        Index("ix_questions_set_order", "question_set_id", "order"),
        Index("ix_questions_type", "type"),
        Index("ix_questions_difficulty", "difficulty"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_set_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("question_sets.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(255), default="")
    prompt: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[str] = mapped_column(String(60), default="")
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    answer_json: Mapped[dict] = mapped_column(JSON, default=dict)
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="published")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    question_set: Mapped["QuestionSet"] = relationship("QuestionSet", back_populates="questions")
    attempts: Mapped[list["QuestionAttempt"]] = relationship("QuestionAttempt", back_populates="question")
