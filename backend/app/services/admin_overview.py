import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.views import ALL_VIEWS
from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import (
    ConceptTag, Exam,
    ExamProblem, Resource, Subject, TabContent, Topic, TopicItem, TopicSection,
    )
from app.models.gamification import (
    DailyQuest, QuestionAttempt, QuizAttempt, TopicItemProgress, UserXP, XPTransaction,
)
from app.models.interactions import Comment, SavedItem, UserNote
from app.models.notifications import Notification
from app.models.payments import (
    FinanceLedgerEntry,
    PaymentProviderEvent,
    PaymentReconciliationImport,
    PaymentTransaction,
    RefundRequest,
)
from app.models.professor import (
    LiveSession,
    LiveSessionInteraction,
    ProfessorChatConversation,
    ProfessorChatMessage,
)
from app.models.quizzes import Question, QuestionSet
from app.models.reports import ContentReport
from app.models.users import User, UserSubjectEntitlement
from app.schemas.admin import AdminCrudActionsOut, AdminCrudCatalogItemOut, AdminOverviewOut
from app.services.access import FEATURES_BY_TIER, TIER_RANK

ADMIN_OVERVIEW_PARALLELISM = 2
ReadOperation = Callable[[AsyncSession], Awaitable[Any]]
logger = logging.getLogger("kresco.admin_overview")

MODEL_DOMAINS = {
    "User": "users-access",
    "UserSubjectEntitlement": "access-billing",
    "Subject": "knowledge-base",
    "QuestionSet": "quiz",
    "Question": "quiz",
    "UserXP": "progress-xp",
    "XPTransaction": "progress-xp",
    "DailyQuest": "progress-xp",
    "CalendarEvent": "calendar",
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
    "TopicItemProgress": "progress-xp",
    "QuizAttempt": "progress-xp",
    "QuestionAttempt": "progress-xp",
    "Comment": "notes-saves-comments",
    "Notification": "notifications",
    "AdminAuditLog": "admin-audit",
    "PaymentTransaction": "finance",
    "PaymentProviderEvent": "finance",
    "PaymentReconciliationImport": "finance",
    "FinanceLedgerEntry": "finance",
    "RefundRequest": "finance",
    "ProfessorChatConversation": "messages",
    "ProfessorChatMessage": "messages",
    "LiveSession": "messages",
    "LiveSessionInteraction": "messages",
    "ContentReport": "support",
}

COUNT_MODELS: tuple[tuple[str, type[Any]], ...] = (
    ("subjects", Subject),
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
    ("topic_item_progress_records", TopicItemProgress),
    ("xp_transactions", XPTransaction),
    ("question_attempts", QuestionAttempt),
    ("payment_transactions", PaymentTransaction),
    ("payment_provider_events", PaymentProviderEvent),
    ("payment_reconciliation_imports", PaymentReconciliationImport),
    ("finance_ledger_entries", FinanceLedgerEntry),
    ("refund_requests", RefundRequest),
    ("professor_chat_conversations", ProfessorChatConversation),
    ("professor_chat_messages", ProfessorChatMessage),
    ("live_sessions", LiveSession),
    ("live_session_interactions", LiveSessionInteraction),
    ("content_reports", ContentReport),
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


async def _zero(_db: AsyncSession) -> int:
    return 0


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


async def _run_read(operation: ReadOperation) -> Any:
    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Database not initialized. Call init_engine() first.")
    async with session_factory() as session:
        return await operation(session)


async def _gather_reads(*operations: ReadOperation) -> list[Any]:
    async def _run_group(session: AsyncSession) -> list[Any]:
        values: list[Any] = []
        for index, operation in enumerate(operations):
            try:
                values.append(await operation(session))
            except asyncio.CancelledError:
                raise
            except BaseException as exc:
                logger.warning(
                    "Admin overview read operation %s failed; using zero fallback",
                    index,
                    exc_info=(type(exc), exc, exc.__traceback__),
                )
                values.append(0)
        return values

    return await _run_read(_run_group)


async def _model_counts(db: AsyncSession, specs: tuple[tuple[str, type[Any]], ...]) -> dict[str, int]:
    counts = await _gather_reads(
        *(lambda session, model=model: _count(session, model) for _, model in specs)
    )
    return {key: int(count) for (key, _), count in zip(specs, counts)}


async def _breakdowns(
    db: AsyncSession,
    specs: tuple[tuple[str, type[Any], Any], ...],
) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for key, model, column in specs:
        result[key] = await _breakdown(db, model, column)
    return result


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
        operations: list[ReadOperation] = [
            lambda session, model=model: _count(session, model, model.required_tier != ""),
            lambda session, model=model: _count(session, model, model.required_feature_key != ""),
        ]
        if has_free_preview:
            operations.append(lambda session, model=model: _count(session, model, model.is_free_preview == True))  # noqa: E712
        results = await _gather_reads(*operations)
        summary[f"{key}_with_required_tier"] = results[0]
        summary[f"{key}_with_required_feature"] = results[1]
        if has_free_preview:
            summary[f"free_preview_{key}"] = results[2]
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
    (
        entitlements_active_now,
        users_with_entitlements,
        expired_entitlements,
        entitlements_expiring_7d,
        subjects_without_topics,
        topics_without_sections,
        topics_without_items,
        topic_items_without_tabs,
        topic_items_without_primary_tab,
        topic_items_without_primary_resource,
        video_resources,
        video_resources_with_provider_id,
        video_resources_missing_provider_id,
        provider_resources_missing_provider_id,
    ) = await _gather_reads(
        lambda session: _count(session, UserSubjectEntitlement, *entitlement_active),
        lambda session: _count_distinct(session, UserSubjectEntitlement.user_id),
        lambda session: _count(
            session,
            UserSubjectEntitlement,
            UserSubjectEntitlement.ends_at.is_not(None),
            UserSubjectEntitlement.ends_at < now,
        ),
        lambda session: _count(
            session,
            UserSubjectEntitlement,
            UserSubjectEntitlement.status == "active",
            UserSubjectEntitlement.ends_at.is_not(None),
            UserSubjectEntitlement.ends_at >= now,
            UserSubjectEntitlement.ends_at <= now + timedelta(days=7),
        ),
        lambda session: _count_without_child(session, Subject, Topic, Topic.subject_id, Subject.id),
        lambda session: _count_without_child(session, Topic, TopicSection, TopicSection.topic_id, Topic.id),
        lambda session: _count_without_child(session, Topic, TopicItem, TopicItem.topic_id, Topic.id),
        lambda session: _count_without_child(session, TopicItem, TabContent, TabContent.topic_item_id, TopicItem.id),
        lambda session: _count(session, TopicItem, TopicItem.primary_tab_content_id.is_(None)),
        lambda session: _count(session, TopicItem, TopicItem.primary_resource_id.is_(None)),
        lambda session: _count(session, Resource, Resource.resource_type == "video"),
        lambda session: _count(
            session,
            Resource,
            Resource.resource_type == "video",
            Resource.provider_resource_id != "",
        ),
        lambda session: _count(
            session,
            Resource,
            Resource.resource_type == "video",
            Resource.provider_resource_id == "",
        ),
        lambda session: _count(
            session,
            Resource,
            Resource.provider != "",
            Resource.provider_resource_id == "",
        ),
    )
    resources_by_type = await _breakdown(db, Resource, Resource.resource_type)
    resources_by_provider = await _breakdown(db, Resource, Resource.provider)
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
            "expired_entitlements": expired_entitlements,
            "entitlements_expiring_7d": entitlements_expiring_7d,
            "users_with_entitlement_rows": users_with_entitlements,
            "users_without_entitlement_rows": max(users_total - users_with_entitlements, 0),
            "subject_scope_coverage_percent": _percent(users_with_entitlements, users_total),
            "unknown_tier_gate_values": unknown_tier_gates,
            "unknown_feature_gate_values": unknown_feature_gates,
        },
        "content_gaps": {
            "subjects_without_topics": subjects_without_topics,
            "topics_without_sections": topics_without_sections,
            "topics_without_items": topics_without_items,
            "topic_items_without_tabs": topic_items_without_tabs,
            "topic_items_without_primary_tab": topic_items_without_primary_tab,
            "topic_items_without_primary_resource": topic_items_without_primary_resource,
        },
        "provider_readiness": {
            "resources_by_type": resources_by_type,
            "resources_by_provider": resources_by_provider,
            "video_resources": video_resources,
            "video_resources_with_provider_id": video_resources_with_provider_id,
            "video_resources_missing_provider_id": video_resources_missing_provider_id,
            "provider_resources_missing_provider_id": provider_resources_missing_provider_id,
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


async def build_admin_overview(db: AsyncSession) -> AdminOverviewOut:
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=7)

    (
        users_total,
        quiz_attempts_total,
        quiz_attempts_passed,
        quiz_results_total,
        quiz_results_passed,
        topic_items_completed,
        lesson_progress_completed,
        staff_users,
        pro_users,
        subject_entitlements,
        question_attempts_total,
    ) = await _gather_reads(
        lambda session: _count(session, User),
        lambda session: _count(session, QuizAttempt),
        lambda session: _count(session, QuizAttempt, QuizAttempt.passed == True),  # noqa: E712
        lambda session: _count(session, QuizAttempt),
        lambda session: _count(session, QuizAttempt, QuizAttempt.passed == True),  # noqa: E712
        lambda session: _count(session, TopicItemProgress, TopicItemProgress.status == "completed"),
        _zero,
        lambda session: _count(session, User, User.is_staff == True),  # noqa: E712
        lambda session: _count(session, User, User.is_pro == True),  # noqa: E712
        lambda session: _count(session, UserSubjectEntitlement),
        lambda session: _count(session, QuestionAttempt),
    )

    totals = {
        "users": users_total,
        "staff_users": staff_users,
        "pro_users": pro_users,
        "subject_entitlements": subject_entitlements,
        "quiz_attempts": quiz_attempts_total,
        "question_attempts": question_attempts_total,
        "quiz_results": quiz_results_total,
    }
    totals.update(await _model_counts(db, COUNT_MODELS))

    subjects_published, subjects_unpublished = await _gather_reads(
        lambda session: _count(session, Subject, Subject.is_published == True),  # noqa: E712
        lambda session: _count(session, Subject, Subject.is_published == False),  # noqa: E712
    )
    content_status = {
        "subjects": {
            "published": subjects_published,
            "unpublished": subjects_unpublished,
        },
    }
    content_status.update(await _breakdowns(db, STATUS_BREAKDOWN_MODELS))

    gated_content, gated_content_by_required_tier, gated_content_by_feature = await _gated_content_rollups(db)

    access_breakdowns = await _breakdowns(db, (
        ("users_by_role", User, User.role),
        ("users_by_pro_status", User, User.is_pro),
        ("entitlements_by_status", UserSubjectEntitlement, UserSubjectEntitlement.status),
        ("entitlements_by_source", UserSubjectEntitlement, UserSubjectEntitlement.source),
    ))
    access_billing = {
        "users_by_role": access_breakdowns["users_by_role"],
        "users_by_pro_status": access_breakdowns["users_by_pro_status"],
        "entitlements_by_status": access_breakdowns["entitlements_by_status"],
        "entitlements_by_source": access_breakdowns["entitlements_by_source"],
        "policy": {
            "tier_order": ["basic", "pro", "vip"],
            "implemented_feature_keys_by_tier": {
                tier: sorted(keys) for tier, keys in FEATURES_BY_TIER.items()
            },
            "subject_scope_rule": "enforced_for_users_with_entitlement_rows",
            "fallback_without_entitlement_rows": "subject_unrestricted_for_global_tier_users",
        },
        "gated_content": gated_content,
        "gated_content_by_required_tier": gated_content_by_required_tier,
        "gated_content_by_feature": gated_content_by_feature,
    }

    progress_breakdowns = await _breakdowns(db, (
        ("topic_item_progress_by_status", TopicItemProgress, TopicItemProgress.status),
        ("xp_transactions_by_reason", XPTransaction, XPTransaction.reason),
        ("daily_quests_by_completion", DailyQuest, DailyQuest.completed),
    ))
    (
        total_xp,
        average_xp_per_user_with_xp,
        average_streak_days,
    ) = await _gather_reads(
        lambda session: _sum(session, UserXP.total_xp),
        lambda session: _avg(session, UserXP.total_xp),
        lambda session: _avg(session, UserXP.streak_days),
    )
    progress_xp = {
        "lesson_progress_by_status": {},
        "topic_item_progress_by_status": progress_breakdowns.get("topic_item_progress_by_status", {}),
        "content_progress_by_type": {},
        "xp_transactions_by_reason": progress_breakdowns.get("xp_transactions_by_reason", {}),
        "daily_quests_by_completion": progress_breakdowns.get("daily_quests_by_completion", {}),
        "total_xp": total_xp,
        "average_xp_per_user_with_xp": average_xp_per_user_with_xp,
        "average_streak_days": average_streak_days,
        "completed_topic_items": topic_items_completed,
        "completed_lessons": lesson_progress_completed,
    }

    problems_by_difficulty = await _breakdown(db, ExamProblem, ExamProblem.difficulty)
    (
        problems_with_written_solution,
        problems_with_written_solution_file,
        problems_with_video_solution,
        free_preview_problems,
    ) = await _gather_reads(
        lambda session: _count(session, ExamProblem, ExamProblem.written_solution != ""),
        lambda session: _count(session, ExamProblem, ExamProblem.written_solution_url != ""),
        lambda session: _count(session, ExamProblem, ExamProblem.video_resource_id.is_not(None)),
        lambda session: _count(session, ExamProblem, ExamProblem.is_free_preview == True),  # noqa: E712
    )
    exam_bank = {
        "exams_by_status": content_status["exams"],
        "exam_problems_by_status": content_status["exam_problems"],
        "problems_by_difficulty": problems_by_difficulty,
        "problems_with_written_solution": problems_with_written_solution,
        "problems_with_written_solution_file": problems_with_written_solution_file,
        "problems_with_video_solution": problems_with_video_solution,
        "free_preview_problems": free_preview_problems,
    }

    events_by_type = await _breakdown(db, CalendarEvent, CalendarEvent.event_type)
    upcoming_events, live_events = await _gather_reads(
        lambda session: _count(session, CalendarEvent, CalendarEvent.ends_at >= now),
        lambda session: _count(session, CalendarEvent, CalendarEvent.status == "live"),
    )
    calendar = {
        "events_by_status": content_status["calendar_events"],
        "events_by_type": events_by_type,
        "upcoming_events": upcoming_events,
        "live_events": live_events,
    }

    (
        activity_events_7d,
        active_users_7d,
        question_attempts_correct,
        average_quiz_attempt_score,
        lesson_watch_seconds,
        topic_watch_seconds,
        notes_7d,
        saves_7d,
        comments_7d,
    ) = await _gather_reads(
        _zero,
        lambda session: _count_distinct(
            session,
            TopicItemProgress.user_id,
            TopicItemProgress.updated_at >= recent_since,
        ),
        lambda session: _count(session, QuestionAttempt, QuestionAttempt.is_correct == True),  # noqa: E712
        lambda session: _avg(session, QuizAttempt.score),
        _zero,
        lambda session: _sum(session, TopicItemProgress.watched_seconds),
        lambda session: _count(session, UserNote, UserNote.created_at >= recent_since),
        lambda session: _count(session, SavedItem, SavedItem.created_at >= recent_since),
        lambda session: _count(session, Comment, Comment.created_at >= recent_since),
    )
    activity_breakdowns = {}
    engagement = {
        "active_users_7d": active_users_7d,
        "activity_events_7d": activity_events_7d,
        "activity_events_by_type": {},
        "activity_events_by_target": {},
        "quiz_attempts": quiz_attempts_total,
        "question_attempts": totals["question_attempts"],
        "question_attempts_correct": question_attempts_correct,
        "quiz_attempt_pass_rate": _pass_rate(quiz_attempts_passed, quiz_attempts_total),
        "quiz_result_pass_rate": _pass_rate(quiz_results_passed, quiz_results_total),
        "average_quiz_attempt_score": average_quiz_attempt_score,
        "total_watch_minutes": (lesson_watch_seconds + topic_watch_seconds) // 60,
        "notes_7d": notes_7d,
        "saves_7d": saves_7d,
        "comments_7d": comments_7d,
    }

    saves_by_target = await _breakdown(db, SavedItem, SavedItem.target_type)
    comments_with_topic_item, notes_with_topic, notes_with_topic_item = await _gather_reads(
        lambda session: _count(session, Comment, Comment.topic_item_id.is_not(None)),
        lambda session: _count(session, UserNote, UserNote.topic_id.is_not(None)),
        lambda session: _count(session, UserNote, UserNote.topic_item_id.is_not(None)),
    )
    interactions = {
        "notes": totals["notes"],
        "saved_items": totals["saved_items"],
        "comments": totals["comments"],
        "saves_by_target": saves_by_target,
        "comments_with_topic_item": comments_with_topic_item,
        "notes_with_topic": notes_with_topic,
        "notes_with_topic_item": notes_with_topic_item,
    }

    notification_breakdowns = await _breakdowns(db, (
        ("notifications_by_type", Notification, Notification.type),
        ("notifications_by_read_status", Notification, Notification.is_read),
    ))
    notifications_unread, notifications_created_7d = await _gather_reads(
        lambda session: _count(session, Notification, Notification.is_read == False),  # noqa: E712
        lambda session: _count(session, Notification, Notification.created_at >= recent_since),
    )
    notifications = {
        "total": totals["notifications"],
        "unread": notifications_unread,
        "by_type": notification_breakdowns["notifications_by_type"],
        "by_read_status": notification_breakdowns["notifications_by_read_status"],
        "created_7d": notifications_created_7d,
    }

    finance_breakdowns = await _breakdowns(db, (
        ("transactions_by_status", PaymentTransaction, PaymentTransaction.status),
        ("transactions_by_provider", PaymentTransaction, PaymentTransaction.provider),
        ("transactions_by_rail", PaymentTransaction, PaymentTransaction.rail),
        ("provider_events_by_status", PaymentProviderEvent, PaymentProviderEvent.status),
        ("reconciliation_imports_by_status", PaymentReconciliationImport, PaymentReconciliationImport.status),
        ("refund_requests_by_status", RefundRequest, RefundRequest.status),
    ))
    (
        paid_revenue_centimes,
        paid_revenue_7d_centimes,
        pending_manual_review,
        pending_provider,
        failed_or_mismatch,
        provider_events_7d,
        failed_provider_events,
        open_refund_requests,
        ledger_entries_7d,
    ) = await _gather_reads(
        lambda session: _sum(session, PaymentTransaction.amount_centimes, PaymentTransaction.status == "paid"),
        lambda session: _sum(
            session,
            PaymentTransaction.amount_centimes,
            PaymentTransaction.status == "paid",
            PaymentTransaction.updated_at >= recent_since,
        ),
        lambda session: _count(session, PaymentTransaction, PaymentTransaction.status == "pending_manual_review"),
        lambda session: _count(session, PaymentTransaction, PaymentTransaction.status == "pending_provider"),
        lambda session: _count(
            session,
            PaymentTransaction,
            PaymentTransaction.status.in_(("failed", "mismatch")),
        ),
        lambda session: _count(session, PaymentProviderEvent, PaymentProviderEvent.received_at >= recent_since),
        lambda session: _count(session, PaymentProviderEvent, PaymentProviderEvent.status == "failed"),
        lambda session: _count(
            session,
            RefundRequest,
            RefundRequest.status.in_(("requested", "approved_pending_execution")),
        ),
        lambda session: _count(session, FinanceLedgerEntry, FinanceLedgerEntry.created_at >= recent_since),
    )
    finance = {
        "transactions_total": totals["payment_transactions"],
        "transactions_by_status": finance_breakdowns["transactions_by_status"],
        "transactions_by_provider": finance_breakdowns["transactions_by_provider"],
        "transactions_by_rail": finance_breakdowns["transactions_by_rail"],
        "provider_events_total": totals["payment_provider_events"],
        "provider_events_by_status": finance_breakdowns["provider_events_by_status"],
        "provider_events_7d": provider_events_7d,
        "failed_provider_events": failed_provider_events,
        "reconciliation_imports_by_status": finance_breakdowns["reconciliation_imports_by_status"],
        "refund_requests_by_status": finance_breakdowns["refund_requests_by_status"],
        "paid_revenue_centimes": paid_revenue_centimes,
        "paid_revenue_7d_centimes": paid_revenue_7d_centimes,
        "pending_manual_review": pending_manual_review,
        "pending_provider": pending_provider,
        "failed_or_mismatch": failed_or_mismatch,
        "open_refund_requests": open_refund_requests,
        "ledger_entries_7d": ledger_entries_7d,
        "success_rate_percent": _pass_rate(
            finance_breakdowns["transactions_by_status"].get("paid", 0),
            totals["payment_transactions"],
        ),
    }

    communications_breakdowns = await _breakdowns(db, (
        ("chat_conversations_by_status", ProfessorChatConversation, ProfessorChatConversation.status),
        ("chat_messages_by_status", ProfessorChatMessage, ProfessorChatMessage.status),
        ("live_sessions_by_status", LiveSession, LiveSession.status),
        ("live_interactions_by_status", LiveSessionInteraction, LiveSessionInteraction.status),
        ("live_interactions_by_kind", LiveSessionInteraction, LiveSessionInteraction.kind),
        ("reports_by_status", ContentReport, ContentReport.status),
        ("reports_by_priority", ContentReport, ContentReport.priority),
        ("reports_by_target_type", ContentReport, ContentReport.target_type),
    ))
    (
        chat_messages_7d,
        chat_unread_for_professors,
        chat_unread_for_students,
        open_chat_conversations,
        live_sessions_live,
        upcoming_live_sessions,
        pending_live_interactions,
        open_reports,
        urgent_open_reports,
        reports_created_7d,
    ) = await _gather_reads(
        lambda session: _count(session, ProfessorChatMessage, ProfessorChatMessage.created_at >= recent_since),
        lambda session: _sum(session, ProfessorChatConversation.unread_for_professor),
        lambda session: _sum(session, ProfessorChatConversation.unread_for_student),
        lambda session: _count(session, ProfessorChatConversation, ProfessorChatConversation.status == "open"),
        lambda session: _count(session, LiveSession, LiveSession.status == "live"),
        lambda session: _count(session, LiveSession, LiveSession.starts_at >= now),
        lambda session: _count(session, LiveSessionInteraction, LiveSessionInteraction.status == "pending"),
        lambda session: _count(session, ContentReport, ContentReport.status.in_(("open", "in_review"))),
        lambda session: _count(
            session,
            ContentReport,
            ContentReport.status.in_(("open", "in_review")),
            ContentReport.priority == "urgent",
        ),
        lambda session: _count(session, ContentReport, ContentReport.created_at >= recent_since),
    )
    communications = {
        "chat_conversations_total": totals["professor_chat_conversations"],
        "chat_messages_total": totals["professor_chat_messages"],
        "chat_conversations_by_status": communications_breakdowns["chat_conversations_by_status"],
        "chat_messages_by_status": communications_breakdowns["chat_messages_by_status"],
        "chat_messages_7d": chat_messages_7d,
        "chat_unread_for_professors": chat_unread_for_professors,
        "chat_unread_for_students": chat_unread_for_students,
        "open_chat_conversations": open_chat_conversations,
        "live_sessions_total": totals["live_sessions"],
        "live_sessions_by_status": communications_breakdowns["live_sessions_by_status"],
        "live_sessions_live": live_sessions_live,
        "upcoming_live_sessions": upcoming_live_sessions,
        "live_interactions_total": totals["live_session_interactions"],
        "live_interactions_by_status": communications_breakdowns["live_interactions_by_status"],
        "live_interactions_by_kind": communications_breakdowns["live_interactions_by_kind"],
        "pending_live_interactions": pending_live_interactions,
        "reports_total": totals["content_reports"],
        "reports_by_status": communications_breakdowns["reports_by_status"],
        "reports_by_priority": communications_breakdowns["reports_by_priority"],
        "reports_by_target_type": communications_breakdowns["reports_by_target_type"],
        "open_reports": open_reports,
        "urgent_open_reports": urgent_open_reports,
        "reports_created_7d": reports_created_7d,
    }

    admin_audit_breakdowns = await _breakdowns(db, (
        ("admin_audit_by_action", AdminAuditLog, AdminAuditLog.action),
        ("admin_audit_by_model", AdminAuditLog, AdminAuditLog.model_name),
    ))
    admin_audit_created_7d = await _run_read(
        lambda session: _count(session, AdminAuditLog, AdminAuditLog.created_at >= recent_since),
    )
    admin_audit = {
        "total": totals["admin_audit_logs"],
        "created_7d": admin_audit_created_7d,
        "by_action": admin_audit_breakdowns["admin_audit_by_action"],
        "by_model": admin_audit_breakdowns["admin_audit_by_model"],
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
        finance=finance,
        communications=communications,
        admin_audit=admin_audit,
        crud_catalog=_crud_catalog(),
    )
