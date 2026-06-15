from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


MISTAKE_NOTEBOOK_STATUS_OPEN = "open"
MISTAKE_NOTEBOOK_STATUS_CORRECTED = "corrected"
MISTAKE_NOTEBOOK_STATUSES = (
    MISTAKE_NOTEBOOK_STATUS_OPEN,
    MISTAKE_NOTEBOOK_STATUS_CORRECTED,
)


class MistakeNotebookEntry(Base):
    __tablename__ = "mistake_notebook_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_mistake_notebook_entries_user_question"),
        CheckConstraint(
            "status IN ('open', 'corrected')",
            name="ck_mistake_notebook_entries_status",
        ),
        CheckConstraint("mistake_count >= 0", name="ck_mistake_notebook_entries_mistake_count_nonnegative"),
        CheckConstraint("corrected_count >= 0", name="ck_mistake_notebook_entries_corrected_count_nonnegative"),
        Index("ix_mistake_notebook_entries_user_status_updated", "user_id", "status", "updated_at"),
        Index("ix_mistake_notebook_entries_user_subject_status", "user_id", "subject_id", "status"),
        Index("ix_mistake_notebook_entries_user_topic_status", "user_id", "topic_id", "status"),
        Index("ix_mistake_notebook_entries_question", "question_id"),
        Index("ix_mistake_notebook_entries_user_id", "user_id"),
        Index("ix_mistake_notebook_entries_question_set_id", "question_set_id"),
        Index("ix_mistake_notebook_entries_subject_id", "subject_id"),
        Index("ix_mistake_notebook_entries_topic_id", "topic_id"),
        Index("ix_mistake_notebook_entries_topic_section_id", "topic_section_id"),
        Index("ix_mistake_notebook_entries_topic_item_id", "topic_item_id"),
        Index("ix_mistake_notebook_entries_tab_content_id", "tab_content_id"),
        Index("ix_mistake_notebook_entries_first_quiz_attempt_id", "first_quiz_attempt_id"),
        Index("ix_mistake_notebook_entries_last_quiz_attempt_id", "last_quiz_attempt_id"),
        Index("ix_mistake_notebook_entries_first_question_attempt_id", "first_question_attempt_id"),
        Index("ix_mistake_notebook_entries_last_question_attempt_id", "last_question_attempt_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("questions.id", ondelete="CASCADE"))
    question_set_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("question_sets.id", ondelete="SET NULL"), nullable=True
    )
    subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    topic_section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True
    )
    topic_item_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True
    )
    tab_content_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True
    )
    first_quiz_attempt_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("quiz_attempts.id", ondelete="SET NULL"), nullable=True
    )
    last_quiz_attempt_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("quiz_attempts.id", ondelete="SET NULL"), nullable=True
    )
    first_question_attempt_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("question_attempts.id", ondelete="SET NULL"), nullable=True
    )
    last_question_attempt_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("question_attempts.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default=MISTAKE_NOTEBOOK_STATUS_OPEN,
        server_default=MISTAKE_NOTEBOOK_STATUS_OPEN,
    )
    mistake_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    corrected_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_answer_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    last_correct_answer_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    last_grading_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    last_mistake_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_correct_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    question = relationship("Question")
    question_set = relationship("QuestionSet")
