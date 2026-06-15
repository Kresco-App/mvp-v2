from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.courses import AccessControlMixin, FreePreviewMixin

EXERCISE_DIFFICULTY_EASY = "easy"
EXERCISE_DIFFICULTY_MEDIUM = "medium"
EXERCISE_DIFFICULTY_HARD = "hard"
EXERCISE_DIFFICULTY_BAC = "bac"

EXERCISE_STATUS_DRAFT = "draft"
EXERCISE_STATUS_PUBLISHED = "published"
EXERCISE_STATUS_ARCHIVED = "archived"

EXERCISE_SELF_GRADE_NOT_STARTED = "not_started"
EXERCISE_SELF_GRADE_AGAIN = "again"
EXERCISE_SELF_GRADE_PARTIAL = "partial"
EXERCISE_SELF_GRADE_MASTERED = "mastered"

EXERCISE_ASSET_IMAGE = "image"
EXERCISE_ASSET_DIAGRAM = "diagram"
EXERCISE_ASSET_GRAPH = "graph"
EXERCISE_ASSET_ATTACHMENT = "attachment"


class Exercise(AccessControlMixin, FreePreviewMixin, Base):
    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint(
            "difficulty IN ('easy', 'medium', 'hard', 'bac')",
            name="ck_exercises_difficulty",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_exercises_status",
        ),
        Index("ix_exercises_subject_topic_status", "subject_id", "topic_id", "status"),
        Index("ix_exercises_subject_difficulty", "subject_id", "difficulty"),
        Index("ix_exercises_status_order", "status", "order", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    statement_body: Mapped[str] = mapped_column(Text, default="")
    solution_body: Mapped[str] = mapped_column(Text, default="")
    solution_video_url: Mapped[str] = mapped_column(String(500), default="")
    difficulty: Mapped[str] = mapped_column(String(40), default=EXERCISE_DIFFICULTY_MEDIUM, server_default=EXERCISE_DIFFICULTY_MEDIUM)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    source_type: Mapped[str] = mapped_column(String(60), default="exercise_bank", server_default="exercise_bank")
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assets: Mapped[list["ExerciseAsset"]] = relationship(
        "ExerciseAsset",
        back_populates="exercise",
        order_by="ExerciseAsset.order",
    )
    progress_records: Mapped[list["UserExerciseProgress"]] = relationship(
        "UserExerciseProgress",
        back_populates="exercise",
    )


class ExerciseAsset(Base):
    __tablename__ = "exercise_assets"
    __table_args__ = (
        CheckConstraint(
            "asset_type IN ('image', 'diagram', 'graph', 'attachment')",
            name="ck_exercise_assets_type",
        ),
        Index("ix_exercise_assets_exercise_order", "exercise_id", "order", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exercise_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("exercises.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(40), default=EXERCISE_ASSET_IMAGE, server_default=EXERCISE_ASSET_IMAGE)
    url: Mapped[str] = mapped_column(String(500))
    alt_text: Mapped[str] = mapped_column(String(255), default="")
    caption: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercise: Mapped["Exercise"] = relationship("Exercise", back_populates="assets")


class UserExerciseProgress(Base):
    __tablename__ = "user_exercise_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "exercise_id", name="uq_user_exercise_progress_user_exercise"),
        CheckConstraint(
            "current_self_grade IN ('not_started', 'again', 'partial', 'mastered')",
            name="ck_user_exercise_progress_self_grade",
        ),
        Index("ix_user_exercise_progress_user_grade", "user_id", "current_self_grade"),
        Index("ix_user_exercise_progress_exercise", "exercise_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("exercises.id", ondelete="CASCADE"), index=True)
    current_self_grade: Mapped[str] = mapped_column(
        String(30),
        default=EXERCISE_SELF_GRADE_NOT_STARTED,
        server_default=EXERCISE_SELF_GRADE_NOT_STARTED,
    )
    reveal_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    first_revealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_revealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    self_grade_history_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    saved: Mapped[bool] = mapped_column(default=False, server_default="false")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exercise: Mapped["Exercise"] = relationship("Exercise", back_populates="progress_records")
