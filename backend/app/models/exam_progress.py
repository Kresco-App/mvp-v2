from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

EXAM_PROBLEM_PROGRESS_NOT_STARTED = "not_started"
EXAM_PROBLEM_PROGRESS_OPENED = "opened"
EXAM_PROBLEM_PROGRESS_COMPLETED = "completed"

EXAM_PROBLEM_PART_PROGRESS_NOT_STARTED = "not_started"
EXAM_PROBLEM_PART_PROGRESS_OPENED = "opened"

EXAM_PROBLEM_PART_SELF_GRADE_NOT_STARTED = "not_started"
EXAM_PROBLEM_PART_SELF_GRADE_AGAIN = "again"
EXAM_PROBLEM_PART_SELF_GRADE_PARTIAL = "partial"
EXAM_PROBLEM_PART_SELF_GRADE_MASTERED = "mastered"


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


class UserExamProblemPartProgress(Base):
    __tablename__ = "user_exam_problem_part_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "exam_problem_part_id", name="uq_user_exam_problem_part_progress_user_part"),
        CheckConstraint(
            "status IN ('not_started', 'opened')",
            name="ck_user_exam_problem_part_progress_status",
        ),
        CheckConstraint(
            "current_self_grade IN ('not_started', 'again', 'partial', 'mastered')",
            name="ck_user_exam_problem_part_progress_self_grade",
        ),
        Index("ix_user_exam_problem_part_progress_user_status", "user_id", "status"),
        Index("ix_user_exam_problem_part_progress_user_grade", "user_id", "current_self_grade"),
        Index("ix_user_exam_problem_part_progress_part", "exam_problem_part_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    exam_problem_part_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exam_problem_parts.id", ondelete="CASCADE"),
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default=EXAM_PROBLEM_PART_PROGRESS_NOT_STARTED,
        server_default=EXAM_PROBLEM_PART_PROGRESS_NOT_STARTED,
    )
    current_self_grade: Mapped[str] = mapped_column(
        String(30),
        default=EXAM_PROBLEM_PART_SELF_GRADE_NOT_STARTED,
        server_default=EXAM_PROBLEM_PART_SELF_GRADE_NOT_STARTED,
    )
    correction_reveal_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    video_watch_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    retry_later: Mapped[bool] = mapped_column(default=False, server_default="false")
    self_grade_history_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_correction_revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_correction_revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_video_watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
