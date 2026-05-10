from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.users import User

ALLOWED_TARGET_TYPES = {"lesson", "chapter", "section", "topic_item", "resource", "quiz", "question", "exam_problem", "tab_content"}


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    # Replaces Django ContentType GenericForeignKey (see Alembic migration 0001)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="comments")
    replies: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="parent", foreign_keys=[parent_id]
    )
    parent: Mapped[Optional["Comment"]] = relationship(
        "Comment", back_populates="replies", remote_side=[id], foreign_keys=[parent_id]
    )


class UserNote(Base):
    __tablename__ = "user_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User")


class SavedItem(Base):
    __tablename__ = "saved_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[int] = mapped_column(Integer)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    label: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")
