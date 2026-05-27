from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.views import ALL_VIEWS
from app.dependencies import get_current_staff_user, get_db
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import (
    Activity, Chapter, ChapterBlock, ChapterSection, ConceptTag, CoursePDF, Exam,
    ExamProblem, Lesson, Resource, Subject, TabContent, Topic, TopicItem, TopicSection,
    VideoQuizTrigger,
)
from app.models.gamification import (
    ActivityEvent, ContentProgress, DailyQuest, LessonProgress, QuestionAttempt, QuizAttempt, QuizResult,
    TopicItemProgress, UserXP, XPTransaction,
)
from app.models.interactions import Comment, SavedItem, UserNote
from app.models.notifications import Notification
from app.models.quizzes import Question, QuestionSet, Quiz, QuizOption, QuizQuestion
from app.models.users import User, UserSubjectEntitlement
from app.schemas.admin import AdminCrudActionsOut, AdminCrudCatalogItemOut, AdminOverviewOut
from app.services.access import FEATURES_BY_TIER, TIER_RANK

router = APIRouter(tags=["Admin"])


MODEL_DOMAINS = {
    "User": "users-access",
    "UserSubjectEntitlement": "access-billing",
    "Subject": "knowledge-base",
    "Chapter": "legacy-course",
    "Lesson": "legacy-course",
    "ChapterSection": "legacy-course",
    "ChapterBlock": "legacy-course",
    "Activity": "learning-activities",
    "CoursePDF": "resources",
    "Quiz": "quiz",
    "QuizQuestion": "quiz",
    "QuizOption": "quiz",
    "QuestionSet": "quiz",
    "Question": "quiz",
    "LessonProgress": "progress-xp",
    "UserXP": "progress-xp",
    "XPTransaction": "progress-xp",
    "QuizResult": "progress-xp",
    "DailyQuest": "progress-xp",
    "CalendarEvent": "calendar",
    "ContentProgress": "progress-xp",
    "VideoQuizTrigger": "quiz",
    "Topic": "knowledge-base",
    "TopicSection": "knowledge-base",
    "TopicItem": "knowledge-base",
    "Resource": "resources",
    "TabContent": "knowledge-base",
    "ConceptTag": "knowledge-base",
    "Exam": "exam-bank",
    "ExamProblem": "exam-bank",
    "UserNote": "notes-saves-comments",
    "SavedItem": "notes-saves-comments",
    "ActivityEvent": "engagement",
    "TopicItemProgress": "progress-xp",
    "QuizAttempt": "progress-xp",
    "QuestionAttempt": "progress-xp",
    "Comment": "notes-saves-comments",
    "Notification": "notifications",
    "AdminAuditLog": "admin-audit",
}

COUNT_MODELS: tuple[tuple[str, type[Any]], ...] = (
    ("subjects", Subject),
    ("chapters", Chapter),
    ("lessons", Lesson),
    ("chapter_sections", ChapterSection),
    ("chapter_blocks", ChapterBlock),
    ("activities", Activity),
    ("course_pdfs", CoursePDF),
    ("video_quiz_triggers", VideoQuizTrigger),
    ("quizzes", Quiz),
    ("quiz_questions", QuizQuestion),
    ("quiz_options", QuizOption),
    ("question_sets", QuestionSet),
    ("questions", Question),
    ("topics", Topic),
    ("topic_sections", TopicSection),
    ("topic_items", TopicItem),
    ("resources", Resource),
    ("tab_contents", TabContent),
    ("concept_tags", ConceptTag),
    ("exams", Exam),
    ("exam_problems", ExamProblem),
    ("calendar_events", CalendarEvent),
    ("notes", UserNote),
    ("saved_items", SavedItem),
    ("comments", Comment),
    ("notifications", Notification),
    ("admin_audit_logs", AdminAuditLog),
    ("activity_events", ActivityEvent),
    ("lesson_progress_records", LessonProgress),
    ("topic_item_progress_records", TopicItemProgress),
    ("xp_transactions", XPTransaction),
    ("question_attempts", QuestionAttempt),
)

STATUS_BREAKDOWN_MODELS: tuple[tuple[str, type[Any], Any], ...] = (
    ("topics", Topic, Topic.status),
    ("topic_items", TopicItem, TopicItem.status),
    ("resources", Resource, Resource.status),
    ("tab_contents", TabContent, TabContent.status),
    ("exams", Exam, Exam.status),
    ("exam_problems", ExamProblem, ExamProblem.status),
    ("calendar_events", CalendarEvent, CalendarEvent.status),
)

GATED_CONTENT_MODELS: tuple[tuple[str, type[Any], bool], ...] = (
    ("topics", Topic, True),
    ("topic_items", TopicItem, True),
    ("resources", Resource, True),
    ("tabs", TabContent, False),
    ("exams", Exam, True),
    ("exam_problems", ExamProblem, True),
)


async def _count(db: AsyncSession, model: type[Any], *where) -> int:
    stmt = select(func.count()).select_from(model)
    if where:
        stmt = stmt.where(*where)
    return int(await db.scalar(stmt) or 0)


async def _count_distinct(db: AsyncSession, column, *where) -> int:
    stmt = select(func.count(func.distinct(column)))
    if where:
        stmt = stmt.where(*where)
    return int(await db.scalar(stmt) or 0)


async def _sum(db: AsyncSession, column, *where) -> int:
    stmt = select(func.sum(column))
    if where:
        stmt = stmt.where(*where)
    return int(await db.scalar(stmt) or 0)


async def _avg(db: AsyncSession, column, *where) -> float:
    stmt = select(func.avg(column))
    if where:
        stmt = stmt.where(*where)
    value = await db.scalar(stmt)
    return round(float(value or 0), 2)


async def _model_counts(db: AsyncSession, specs: tuple[tuple[str, type[Any]], ...]) -> dict[str, int]:
    return {key: await _count(db, model) for key, model in specs}


async def _breakdowns(
    db: AsyncSession,
    specs: tuple[tuple[str, type[Any], Any], ...],
) -> dict[str, dict[str, int]]:
    return {key: await _breakdown(db, model, column) for key, model, column in specs}


async def _breakdown(db: AsyncSession, model: type[Any], column) -> dict[str, int]:
    result = await db.execute(
        select(column, func.count())
        .select_from(model)
        .group_by(column)
        .order_by(column)
    )
    return {_key(key): int(count or 0) for key, count in result.all()}


async def _count_without_child(
    db: AsyncSession,
    parent_model: type[Any],
    child_model: type[Any],
    child_fk,
    parent_pk,
) -> int:
    child_exists = select(child_model.id).where(child_fk == parent_pk).exists()
    stmt = select(func.count()).select_from(parent_model).where(~child_exists)
    return int(await db.scalar(stmt) or 0)


def _key(value: Any) -> str:
    if value is None:
        return "none"
    if value == "":
        return "unset"
    return str(value).lower()


def _pass_rate(passed: int, total: int) -> float:
    return round((passed / total) * 100, 2) if total else 0.0


def _percent(part: int, total: int) -> float:
    return round((part / total) * 100, 2) if total else 0.0


def _sqladmin_slug(view: type[Any]) -> str:
    identity = getattr(view, "identity", "")
    if identity:
        return identity
    model = getattr(view, "model", None)
    if model is None:
        return view.__name__.removesuffix("Admin").lower()
    return model.__name__.lower()


def _crud_catalog() -> list[AdminCrudCatalogItemOut]:
    items = []
    for view in ALL_VIEWS:
        model = getattr(view, "model", None)
        model_name = model.__name__ if model is not None else view.__name__.removesuffix("Admin")
        slug = _sqladmin_slug(view)
        items.append(
            AdminCrudCatalogItemOut(
                domain=MODEL_DOMAINS.get(model_name, "admin"),
                slug=slug,
                name=getattr(view, "name", model_name),
                name_plural=getattr(view, "name_plural", f"{model_name}s"),
                model=model_name,
                admin_url=f"/admin/{slug}/list",
                actions=AdminCrudActionsOut(
                    create=bool(getattr(view, "can_create", False)),
                    read=bool(getattr(view, "can_view_details", True)),
                    update=bool(getattr(view, "can_edit", False)),
                    delete=bool(getattr(view, "can_delete", False)),
                ),
            )
        )
    return sorted(items, key=lambda item: (item.domain, item.name_plural))


async def _gated_content_rollups(db: AsyncSession) -> tuple[dict[str, int], dict[str, dict[str, int]], dict[str, dict[str, int]]]:
    summary: dict[str, int] = {}
    by_required_tier: dict[str, dict[str, int]] = {}
    by_feature: dict[str, dict[str, int]] = {}

    for key, model, has_free_preview in GATED_CONTENT_MODELS:
        summary[f"{key}_with_required_tier"] = await _count(db, model, model.required_tier != "")
        summary[f"{key}_with_required_feature"] = await _count(db, model, model.required_feature_key != "")
        if has_free_preview:
            summary[f"free_preview_{key}"] = await _count(db, model, model.is_free_preview == True)  # noqa: E712
        by_required_tier[key] = await _breakdown(db, model, model.required_tier)
        by_feature[key] = await _breakdown(db, model, model.required_feature_key)

    return summary, by_required_tier, by_feature


async def _ops_readiness(
    db: AsyncSession,
    *,
    now: datetime,
    users_total: int,
    totals: dict[str, int],
    admin_audit_created_7d: int,
    activity_events_7d: int,
    notifications_unread: int,
    gated_content_by_required_tier: dict[str, dict[str, int]],
    gated_content_by_feature: dict[str, dict[str, int]],
) -> dict[str, Any]:
    entitlement_active = (
        UserSubjectEntitlement.status == "active",
        (UserSubjectEntitlement.starts_at.is_(None)) | (UserSubjectEntitlement.starts_at <= now),
        (UserSubjectEntitlement.ends_at.is_(None)) | (UserSubjectEntitlement.ends_at >= now),
    )
    entitlements_active_now = await _count(db, UserSubjectEntitlement, *entitlement_active)
    users_with_entitlements = await _count_distinct(db, UserSubjectEntitlement.user_id)
    allowed_tiers = {tier for tier in TIER_RANK.keys() if tier}
    allowed_features = sorted({feature for features in FEATURES_BY_TIER.values() for feature in features})
    allowed_feature_set = set(allowed_features)

    unknown_tier_gates = sum(
        count
        for breakdown in gated_content_by_required_tier.values()
        for tier, count in breakdown.items()
        if tier != "unset" and tier not in allowed_tiers
    )
    unknown_feature_gates = sum(
        count
        for breakdown in gated_content_by_feature.values()
        for feature, count in breakdown.items()
        if feature != "unset" and feature not in allowed_feature_set
    )

    return {
        "access": {
            "active_entitlements_now": entitlements_active_now,
            "expired_entitlements": await _count(
                db,
                UserSubjectEntitlement,
                UserSubjectEntitlement.ends_at.is_not(None),
                UserSubjectEntitlement.ends_at < now,
            ),
            "entitlements_expiring_7d": await _count(
                db,
                UserSubjectEntitlement,
                UserSubjectEntitlement.status == "active",
                UserSubjectEntitlement.ends_at.is_not(None),
                UserSubjectEntitlement.ends_at >= now,
                UserSubjectEntitlement.ends_at <= now + timedelta(days=7),
            ),
            "users_with_entitlement_rows": users_with_entitlements,
            "users_without_entitlement_rows": max(users_total - users_with_entitlements, 0),
            "subject_scope_coverage_percent": _percent(users_with_entitlements, users_total),
            "unknown_tier_gate_values": unknown_tier_gates,
            "unknown_feature_gate_values": unknown_feature_gates,
        },
        "content_gaps": {
            "subjects_without_topics": await _count_without_child(db, Subject, Topic, Topic.subject_id, Subject.id),
            "topics_without_sections": await _count_without_child(db, Topic, TopicSection, TopicSection.topic_id, Topic.id),
            "topics_without_items": await _count_without_child(db, Topic, TopicItem, TopicItem.topic_id, Topic.id),
            "topic_items_without_tabs": await _count_without_child(db, TopicItem, TabContent, TabContent.topic_item_id, TopicItem.id),
            "topic_items_without_primary_resource": await _count(
                db,
                TopicItem,
                TopicItem.primary_resource_id.is_(None),
            ),
        },
        "provider_readiness": {
            "resources_by_type": await _breakdown(db, Resource, Resource.resource_type),
            "resources_by_provider": await _breakdown(db, Resource, Resource.provider),
            "video_resources": await _count(db, Resource, Resource.resource_type == "video"),
            "video_resources_with_provider_id": await _count(
                db,
                Resource,
                Resource.resource_type == "video",
                Resource.provider_resource_id != "",
            ),
            "video_resources_missing_provider_id": await _count(
                db,
                Resource,
                Resource.resource_type == "video",
                Resource.provider_resource_id == "",
            ),
            "provider_resources_missing_provider_id": await _count(
                db,
                Resource,
                Resource.provider != "",
                Resource.provider_resource_id == "",
            ),
        },
        "observability": {
            "admin_audit_logs_total": totals["admin_audit_logs"],
            "admin_audit_logs_7d": admin_audit_created_7d,
            "notifications_unread": notifications_unread,
            "activity_events_7d": activity_events_7d,
        },
        "local_validation": {
            "mode": "local_only",
            "deployment_checks": "paused",
            "build_check": "skipped_by_policy",
        },
    }


@router.get("/overview", response_model=AdminOverviewOut)
async def get_admin_overview(
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=7)

    users_total = await _count(db, User)
    quiz_attempts_total = await _count(db, QuizAttempt)
    quiz_attempts_passed = await _count(db, QuizAttempt, QuizAttempt.passed == True)  # noqa: E712
    quiz_results_total = await _count(db, QuizResult)
    quiz_results_passed = await _count(db, QuizResult, QuizResult.passed == True)  # noqa: E712
    topic_items_completed = await _count(
        db, TopicItemProgress, TopicItemProgress.status == "completed"
    )
    lesson_progress_completed = await _count(
        db, LessonProgress, LessonProgress.status == "completed"
    )

    totals = {
        "users": users_total,
        "staff_users": await _count(db, User, User.is_staff == True),  # noqa: E712
        "pro_users": await _count(db, User, User.is_pro == True),  # noqa: E712
        "subject_entitlements": await _count(db, UserSubjectEntitlement),
        "quiz_attempts": quiz_attempts_total,
        "question_attempts": await _count(db, QuestionAttempt),
        "quiz_results": quiz_results_total,
    }
    totals.update(await _model_counts(db, COUNT_MODELS))

    content_status = {
        "subjects": {
            "published": await _count(db, Subject, Subject.is_published == True),  # noqa: E712
            "unpublished": await _count(db, Subject, Subject.is_published == False),  # noqa: E712
        },
    }
    content_status.update(await _breakdowns(db, STATUS_BREAKDOWN_MODELS))

    gated_content, gated_content_by_required_tier, gated_content_by_feature = await _gated_content_rollups(db)

    access_billing = {
        "users_by_role": await _breakdown(db, User, User.role),
        "users_by_pro_status": await _breakdown(db, User, User.is_pro),
        "entitlements_by_status": await _breakdown(db, UserSubjectEntitlement, UserSubjectEntitlement.status),
        "entitlements_by_source": await _breakdown(db, UserSubjectEntitlement, UserSubjectEntitlement.source),
        "policy": {
            "tier_order": ["basic", "pro", "vip"],
            "implemented_feature_keys_by_tier": {
                tier: sorted(keys) for tier, keys in FEATURES_BY_TIER.items()
            },
            "subject_scope_rule": "enforced_for_users_with_active_entitlements",
            "fallback_without_active_entitlements": "subject_unrestricted_for_seed_data",
        },
        "gated_content": gated_content,
        "gated_content_by_required_tier": gated_content_by_required_tier,
        "gated_content_by_feature": gated_content_by_feature,
    }

    progress_xp = {
        "lesson_progress_by_status": await _breakdown(db, LessonProgress, LessonProgress.status),
        "topic_item_progress_by_status": await _breakdown(db, TopicItemProgress, TopicItemProgress.status),
        "content_progress_by_type": await _breakdown(db, ContentProgress, ContentProgress.item_type),
        "xp_transactions_by_reason": await _breakdown(db, XPTransaction, XPTransaction.reason),
        "daily_quests_by_completion": await _breakdown(db, DailyQuest, DailyQuest.completed),
        "total_xp": await _sum(db, UserXP.total_xp),
        "average_xp_per_user_with_xp": await _avg(db, UserXP.total_xp),
        "average_streak_days": await _avg(db, UserXP.streak_days),
        "completed_topic_items": topic_items_completed,
        "completed_lessons": lesson_progress_completed,
    }

    exam_bank = {
        "exams_by_status": content_status["exams"],
        "exam_problems_by_status": content_status["exam_problems"],
        "problems_by_difficulty": await _breakdown(db, ExamProblem, ExamProblem.difficulty),
        "problems_with_written_solution": await _count(db, ExamProblem, ExamProblem.written_solution != ""),
        "problems_with_written_solution_file": await _count(db, ExamProblem, ExamProblem.written_solution_url != ""),
        "problems_with_video_solution": await _count(db, ExamProblem, ExamProblem.video_resource_id.is_not(None)),
        "free_preview_problems": await _count(db, ExamProblem, ExamProblem.is_free_preview == True),  # noqa: E712
    }

    calendar = {
        "events_by_status": content_status["calendar_events"],
        "events_by_type": await _breakdown(db, CalendarEvent, CalendarEvent.event_type),
        "upcoming_events": await _count(db, CalendarEvent, CalendarEvent.ends_at >= now),
        "live_events": await _count(db, CalendarEvent, CalendarEvent.status == "live"),
    }

    activity_events_7d = await _count(db, ActivityEvent, ActivityEvent.created_at >= recent_since)
    engagement = {
        "active_users_7d": await _count_distinct(db, ActivityEvent.user_id, ActivityEvent.created_at >= recent_since),
        "activity_events_7d": activity_events_7d,
        "activity_events_by_type": await _breakdown(db, ActivityEvent, ActivityEvent.event_type),
        "activity_events_by_target": await _breakdown(db, ActivityEvent, ActivityEvent.target_type),
        "quiz_attempts": quiz_attempts_total,
        "question_attempts": totals["question_attempts"],
        "question_attempts_correct": await _count(db, QuestionAttempt, QuestionAttempt.is_correct == True),  # noqa: E712
        "quiz_attempt_pass_rate": _pass_rate(quiz_attempts_passed, quiz_attempts_total),
        "quiz_result_pass_rate": _pass_rate(quiz_results_passed, quiz_results_total),
        "average_quiz_attempt_score": await _avg(db, QuizAttempt.score),
        "total_watch_minutes": (await _sum(db, LessonProgress.watched_seconds) + await _sum(db, TopicItemProgress.watched_seconds)) // 60,
        "notes_7d": await _count(db, UserNote, UserNote.created_at >= recent_since),
        "saves_7d": await _count(db, SavedItem, SavedItem.created_at >= recent_since),
        "comments_7d": await _count(db, Comment, Comment.created_at >= recent_since),
    }

    interactions = {
        "notes": totals["notes"],
        "saved_items": totals["saved_items"],
        "comments": totals["comments"],
        "saves_by_target": await _breakdown(db, SavedItem, SavedItem.target_type),
        "comments_by_target": await _breakdown(db, Comment, Comment.target_type),
        "notes_with_topic": await _count(db, UserNote, UserNote.topic_id.is_not(None)),
        "notes_with_topic_item": await _count(db, UserNote, UserNote.topic_item_id.is_not(None)),
    }

    notifications_unread = await _count(db, Notification, Notification.is_read == False)  # noqa: E712
    notifications = {
        "total": totals["notifications"],
        "unread": notifications_unread,
        "by_type": await _breakdown(db, Notification, Notification.type),
        "by_read_status": await _breakdown(db, Notification, Notification.is_read),
        "created_7d": await _count(db, Notification, Notification.created_at >= recent_since),
    }

    admin_audit_created_7d = await _count(db, AdminAuditLog, AdminAuditLog.created_at >= recent_since)
    admin_audit = {
        "total": totals["admin_audit_logs"],
        "created_7d": admin_audit_created_7d,
        "by_action": await _breakdown(db, AdminAuditLog, AdminAuditLog.action),
        "by_model": await _breakdown(db, AdminAuditLog, AdminAuditLog.model_name),
    }
    ops_readiness = await _ops_readiness(
        db,
        now=now,
        users_total=users_total,
        totals=totals,
        admin_audit_created_7d=admin_audit_created_7d,
        activity_events_7d=activity_events_7d,
        notifications_unread=notifications_unread,
        gated_content_by_required_tier=gated_content_by_required_tier,
        gated_content_by_feature=gated_content_by_feature,
    )

    return AdminOverviewOut(
        generated_at=now,
        totals=totals,
        content_status=content_status,
        access_billing=access_billing,
        ops_readiness=ops_readiness,
        progress_xp=progress_xp,
        exam_bank=exam_bank,
        calendar=calendar,
        engagement=engagement,
        interactions=interactions,
        notifications=notifications,
        admin_audit=admin_audit,
        crud_catalog=_crud_catalog(),
    )
