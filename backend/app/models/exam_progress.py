from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

EXAM_PROBLEM_PROGRESS_NOT_STARTED = "not_started"
EXAM_PROBLEM_PROGRESS_OPENED = "opened"
EXAM_PROBLEM_PROGRESS_COMPLETED = "completed"


class UserExamProblemProgress(Base):
    __tablename__ = "user_exam_problem_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "exam_problem_id", name="uq_user_exam_problem_progress_user_problem"),
        CheckConstraint(
            "status IN ('not_started', 'opened', 'completed')",
            name="ck_user_exam_problem_progress_status",
        ),
        Index("ix_user_exam_problem_progress_user_status", "user_id", "status"),
        Index("ix_user_exam_problem_progress_problem", "exam_problem_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    exam_problem_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("exam_problems.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(
        String(30),
        default=EXAM_PROBLEM_PROGRESS_NOT_STARTED,
        server_default=EXAM_PROBLEM_PROGRESS_NOT_STARTED,
    )
    saved: Mapped[bool] = mapped_column(default=False, server_default="false")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
