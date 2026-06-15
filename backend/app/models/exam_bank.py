from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.courses import AccessControlMixin, FreePreviewMixin

EXAM_PROBLEM_PART_STATUS_DRAFT = "draft"
EXAM_PROBLEM_PART_STATUS_PUBLISHED = "published"
EXAM_PROBLEM_PART_STATUS_ARCHIVED = "archived"


class ExamProblemPart(AccessControlMixin, FreePreviewMixin, Base):
    __tablename__ = "exam_problem_parts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_exam_problem_parts_status",
        ),
        Index("ix_exam_problem_parts_problem_order", "exam_problem_id", "status", "order", "id"),
        Index("ix_exam_problem_parts_topic_status", "topic_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_problem_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exam_problems.id", ondelete="CASCADE"),
        index=True,
    )
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("topics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    video_resource_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("resources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    part_label: Mapped[str] = mapped_column(String(40), default="", server_default="")
    title: Mapped[str] = mapped_column(String(255))
    statement_body: Mapped[str] = mapped_column(Text, default="")
    written_solution_body: Mapped[str] = mapped_column(Text, default="")
    written_solution_url: Mapped[str] = mapped_column(String(500), default="", server_default="")
    correction_video_url: Mapped[str] = mapped_column(String(500), default="", server_default="")
    order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    difficulty: Mapped[str] = mapped_column(String(40), default="bac", server_default="bac")
    concept_slugs: Mapped[list[str]] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exam_problem = relationship("ExamProblem")
    topic = relationship("Topic")
    video_resource = relationship("Resource")
