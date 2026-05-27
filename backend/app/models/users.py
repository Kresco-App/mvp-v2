from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.gamification import LessonProgress, ContentProgress, UserXP, XPTransaction, QuizResult, DailyQuest
    from app.models.interactions import Comment
    from app.models.notifications import Notification


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    banner_url: Mapped[str] = mapped_column(String(500), default="")
    role: Mapped[str] = mapped_column(String(20), default="student")
    niveau: Mapped[str] = mapped_column(String(10), default="")
    filiere: Mapped[str] = mapped_column(String(100), default="")
    tier: Mapped[str] = mapped_column(String(30), default="basic")
    is_pro: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_customer_id: Mapped[str] = mapped_column(String(255), default="")
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    auth_token_version: Mapped[int] = mapped_column(Integer, default=0)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Django AbstractBaseUser columns — kept so SQLAlchemy doesn't error on existing RDS schema
    password: Mapped[str] = mapped_column(String(128), default="!")
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lesson_progress: Mapped[list["LessonProgress"]] = relationship("LessonProgress", back_populates="user")
    content_progress: Mapped[list["ContentProgress"]] = relationship("ContentProgress", back_populates="user")
    xp: Mapped[Optional["UserXP"]] = relationship("UserXP", back_populates="user", uselist=False)
    xp_transactions: Mapped[list["XPTransaction"]] = relationship("XPTransaction", back_populates="user")
    quiz_results: Mapped[list["QuizResult"]] = relationship("QuizResult", back_populates="user")
    daily_quests: Mapped[list["DailyQuest"]] = relationship("DailyQuest", back_populates="user")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")
    subject_entitlements: Mapped[list["UserSubjectEntitlement"]] = relationship("UserSubjectEntitlement", back_populates="user")


class UserSubjectEntitlement(Base):
    __tablename__ = "user_subject_entitlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(60), default="manual")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="subject_entitlements")
