from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

REPORT_TARGET_TYPES = {
    "access",
    "ai_answer",
    "app",
    "comment",
    "exam",
    "exam_problem",
    "exam_problem_part",
    "exercise",
    "live_message",
    "live_session",
    "payment",
    "question",
    "question_set",
    "quiz_attempt",
    "resource",
    "tab_content",
    "topic",
    "topic_item",
}
REPORT_REASONS = {
    "broken_content",
    "bug",
    "inappropriate",
    "missing_answer",
    "other",
    "payment_access",
    "spam",
    "wrong_answer",
}
REPORT_STATUSES = {"open", "in_review", "resolved", "dismissed"}
REPORT_PRIORITIES = {"low", "normal", "high", "urgent"}


class ContentReport(Base):
    __tablename__ = "content_reports"
    __table_args__ = (
        UniqueConstraint("reporter_user_id", "idempotency_key", name="uq_content_reports_reporter_idempotency"),
        CheckConstraint(
            "target_type IN ('access', 'ai_answer', 'app', 'comment', 'exam', 'exam_problem', "
            "'exam_problem_part', 'exercise', 'live_message', 'live_session', 'payment', 'question', "
            "'question_set', 'quiz_attempt', 'resource', 'tab_content', 'topic', 'topic_item')",
            name="ck_content_reports_target_type",
        ),
        CheckConstraint(
            "reason IN ('broken_content', 'bug', 'inappropriate', 'missing_answer', 'other', "
            "'payment_access', 'spam', 'wrong_answer')",
            name="ck_content_reports_reason",
        ),
        CheckConstraint(
            "status IN ('open', 'in_review', 'resolved', 'dismissed')",
            name="ck_content_reports_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name="ck_content_reports_priority",
        ),
        Index("ix_content_reports_status_created", "status", "created_at"),
        Index("ix_content_reports_target", "target_type", "target_id"),
        Index("ix_content_reports_reporter_created", "reporter_user_id", "created_at"),
        Index("ix_content_reports_assignee_status", "assigned_to_user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open", server_default="open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal", server_default="normal")
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="", server_default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    idempotency_key: Mapped[str] = mapped_column(String(180), nullable=False)
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolution_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
