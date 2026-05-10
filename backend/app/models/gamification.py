from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Integer, Boolean, Date, DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.courses import Lesson
    from app.models.quizzes import Quiz


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("lessons.id", ondelete="CASCADE"))
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="started")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="lesson_progress")
    lesson: Mapped["Lesson"] = relationship("Lesson")


class ContentProgress(Base):
    __tablename__ = "content_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    item_type: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="content_progress")


class UserXP(Base):
    __tablename__ = "user_xp"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    total_xp: Mapped[int] = mapped_column(Integer, default=0)
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="xp")


class XPTransaction(Base):
    __tablename__ = "xp_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="xp_transactions")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    quiz_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("quizzes.id", ondelete="CASCADE"))
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="quiz_results")
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="results")


class DailyQuest(Base):
    __tablename__ = "daily_quests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    quest_type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    target: Mapped[int] = mapped_column(Integer, default=1)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    xp_reward: Mapped[int] = mapped_column(Integer, default=25)
    date: Mapped[date] = mapped_column(Date)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="daily_quests")


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[int] = mapped_column(Integer)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class TopicItemProgress(Base):
    __tablename__ = "topic_item_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(Integer)
    topic_item_id: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="started")
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    best_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tab_content_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), default="tab")
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    grading: Mapped[dict] = mapped_column(JSON, default=dict)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")
