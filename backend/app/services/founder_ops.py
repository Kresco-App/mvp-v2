from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import QuizAttempt, TopicItemProgress, UserXP
from app.models.operations import AnalyticsEvent, FinanceExpense, RedemptionCode, StaffPaymentRequest
from app.models.payments import PAYMENT_STATUS_PAID, PaymentTransaction, RefundRequest
from app.models.professor import LiveSession, LiveSessionInteraction, ProfessorChatConversation, ProfessorChatMessage
from app.models.users import User, UserSubjectEntitlement
from app.schemas.founder_ops import (
    AnalyticsEventIn,
    AnalyticsEventOut,
    FinanceExpenseIn,
    FinanceExpenseOut,
    FounderDashboardOut,
    FounderMetricOut,
)


def _int(value: Any) -> int:
    return int(value or 0)


def _float(value: Any) -> float:
    return round(float(value or 0), 2)


def _payment_booked_at():
    return func.coalesce(PaymentTransaction.confirmed_at, PaymentTransaction.created_at)


def _non_staff_redemption_payment():
    return ~PaymentTransaction.reference_code.like("CODE-%")


def month_start(value: date | None = None) -> date:
    target = value or datetime.now(timezone.utc).date()
    return date(target.year, target.month, 1)


def next_month_start(value: date) -> date:
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    return date(year, month, 1)


def month_bounds(value: date | None = None) -> tuple[datetime, datetime, date]:
    start_date = month_start(value)
    end_date = next_month_start(start_date)
    return (
        datetime(start_date.year, start_date.month, 1, tzinfo=timezone.utc),
        datetime(end_date.year, end_date.month, 1, tzinfo=timezone.utc),
        start_date,
    )


async def record_analytics_event(
    db: AsyncSession,
    *,
    user: User | None,
    payload: AnalyticsEventIn,
) -> AnalyticsEventOut:
    now = datetime.now(timezone.utc)
    event = AnalyticsEvent(
        event_name=payload.event_name,
        user_id=int(user.id) if user is not None else None,
        anonymous_id=payload.anonymous_id or "",
        session_id=payload.session_id or "",
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        topic_item_id=payload.topic_item_id,
        resource_id=payload.resource_id,
        live_session_id=payload.live_session_id,
        professor_user_id=payload.professor_user_id,
        value_int=int(payload.value_int),
        duration_seconds=int(payload.duration_seconds),
        properties_json=payload.properties,
        occurred_at=payload.occurred_at or now,
        received_at=now,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return AnalyticsEventOut(
        id=int(event.id),
        event_name=event.event_name,
        user_id=int(event.user_id) if event.user_id is not None else None,
        occurred_at=event.occurred_at,
        received_at=event.received_at,
    )


async def create_finance_expense(
    db: AsyncSession,
    *,
    actor: User,
    payload: FinanceExpenseIn,
) -> FinanceExpenseOut:
    expense_month = month_start(payload.expense_month or payload.expense_date)
    expense = FinanceExpense(
        expense_month=expense_month,
        expense_date=payload.expense_date,
        category=payload.category.strip().lower(),
        vendor=payload.vendor or "",
        description=payload.description or "",
        amount_centimes=int(payload.amount_centimes),
        source=payload.source,
        status=payload.status,
        created_by_user_id=int(actor.id),
        metadata_json=payload.metadata,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return finance_expense_out(expense)


async def list_finance_expenses(db: AsyncSession, *, month: date | None = None, limit: int = 100) -> list[FinanceExpenseOut]:
    selected_month = month_start(month)
    statement = (
        select(FinanceExpense)
        .where(FinanceExpense.expense_month == selected_month)
        .order_by(FinanceExpense.expense_date.desc(), FinanceExpense.id.desc())
        .limit(max(1, min(int(limit or 100), 300)))
    )
    return [finance_expense_out(row) for row in (await db.execute(statement)).scalars().all()]


async def build_founder_dashboard(db: AsyncSession, *, month: date | None = None) -> FounderDashboardOut:
    start, end, selected_month = month_bounds(month)
    previous_start_date = date(selected_month.year - 1, 12, 1) if selected_month.month == 1 else date(selected_month.year, selected_month.month - 1, 1)
    previous_start, previous_end, _ = month_bounds(previous_start_date)
    now = datetime.now(timezone.utc)

    paid_revenue = await _sum(
        db,
        PaymentTransaction.amount_centimes,
        PaymentTransaction.status == PAYMENT_STATUS_PAID,
        _non_staff_redemption_payment(),
        _payment_booked_at() >= start,
        _payment_booked_at() < end,
    )
    previous_paid_revenue = await _sum(
        db,
        PaymentTransaction.amount_centimes,
        PaymentTransaction.status == PAYMENT_STATUS_PAID,
        _non_staff_redemption_payment(),
        _payment_booked_at() >= previous_start,
        _payment_booked_at() < previous_end,
    )
    previous_collected_staff_revenue = await _sum(
        db,
        StaffPaymentRequest.amount_centimes,
        StaffPaymentRequest.created_at >= previous_start,
        StaffPaymentRequest.created_at < previous_end,
        StaffPaymentRequest.status.in_(("code_generated", "redeemed")),
    )
    collected_staff_revenue = await _sum(
        db,
        StaffPaymentRequest.amount_centimes,
        StaffPaymentRequest.created_at >= start,
        StaffPaymentRequest.created_at < end,
        StaffPaymentRequest.status.in_(("code_generated", "redeemed")),
    )
    redeemed_staff_revenue = await _sum(
        db,
        StaffPaymentRequest.amount_centimes,
        StaffPaymentRequest.updated_at >= start,
        StaffPaymentRequest.updated_at < end,
        StaffPaymentRequest.status == "redeemed",
    )
    expenses_total = await _sum(
        db,
        FinanceExpense.amount_centimes,
        FinanceExpense.expense_month == selected_month,
        FinanceExpense.status != "cancelled",
    )
    refunds_total = await _sum(
        db,
        RefundRequest.amount_centimes,
        RefundRequest.created_at >= start,
        RefundRequest.created_at < end,
        RefundRequest.status.in_(("requested", "approved_pending_execution")),
    )
    students_total = await _count(db, User, User.role == "student", User.is_staff == False)  # noqa: E712
    previous_students_total = await _count(db, User, User.role == "student", User.is_staff == False, User.created_at < start)  # noqa: E712
    new_students = await _count(db, User, User.role == "student", User.is_staff == False, User.created_at >= start, User.created_at < end)  # noqa: E712
    active_students_7d = await _count_distinct(
        db,
        TopicItemProgress.user_id,
        TopicItemProgress.updated_at >= now - timedelta(days=7),
    )
    paid_users = await _count_distinct(db, PaymentTransaction.user_id, PaymentTransaction.status == PAYMENT_STATUS_PAID)
    active_entitlements = await _count(
        db,
        UserSubjectEntitlement,
        UserSubjectEntitlement.status == "active",
        (UserSubjectEntitlement.ends_at.is_(None)) | (UserSubjectEntitlement.ends_at >= now),
    )
    ai_events = await _sum(db, AnalyticsEvent.value_int, AnalyticsEvent.event_name == "ai_quota_used", AnalyticsEvent.occurred_at >= start, AnalyticsEvent.occurred_at < end)
    video_events = await _count(db, AnalyticsEvent, AnalyticsEvent.event_name.in_(("video_started", "video_progress", "video_completed")), AnalyticsEvent.occurred_at >= start, AnalyticsEvent.occurred_at < end)
    video_seconds = await _sum(
        db,
        TopicItemProgress.watched_seconds,
        TopicItemProgress.updated_at >= start,
        TopicItemProgress.updated_at < end,
    )
    live_joined = await _count_distinct(
        db,
        AnalyticsEvent.user_id,
        AnalyticsEvent.event_name == "live_joined",
        AnalyticsEvent.duration_seconds >= 30,
        AnalyticsEvent.occurred_at >= start,
        AnalyticsEvent.occurred_at < end,
    )

    messages = {
        "private_conversations": await _count(db, ProfessorChatConversation),
        "private_messages_month": await _count(db, ProfessorChatMessage, ProfessorChatMessage.created_at >= start, ProfessorChatMessage.created_at < end),
        "unread_for_professors": await _sum(db, ProfessorChatConversation.unread_for_professor),
        "professors_with_chats": await _count_distinct(db, ProfessorChatConversation.professor_user_id),
    }
    engagement = {
        "active_students_7d": active_students_7d,
        "video_events_month": video_events,
        "approx_video_watch_minutes": video_seconds // 60,
        "live_sessions_month": await _count(db, LiveSession, LiveSession.starts_at >= start, LiveSession.starts_at < end),
        "live_joined_students_month": live_joined,
        "live_questions_month": await _count(db, LiveSessionInteraction, LiveSessionInteraction.created_at >= start, LiveSessionInteraction.created_at < end),
        "quiz_attempts_month": await _count(db, QuizAttempt, QuizAttempt.created_at >= start, QuizAttempt.created_at < end),
        "total_xp": await _sum(db, UserXP.total_xp),
        "ai_quota_units_month": ai_events,
    }
    staff_codes = {
        "generated_month": await _count(db, RedemptionCode, RedemptionCode.created_at >= start, RedemptionCode.created_at < end),
        "redeemed_month": await _count(db, RedemptionCode, RedemptionCode.redeemed_at >= start, RedemptionCode.redeemed_at < end),
        "unused_total": await _count(db, RedemptionCode, RedemptionCode.status == "generated"),
        "collected_staff_revenue_centimes": collected_staff_revenue,
        "redeemed_staff_revenue_centimes": redeemed_staff_revenue,
    }
    finance = {
        "paid_revenue_centimes": paid_revenue,
        "previous_paid_revenue_centimes": previous_paid_revenue,
        "staff_collected_revenue_centimes": collected_staff_revenue,
        "staff_redeemed_revenue_centimes": redeemed_staff_revenue,
        "expenses_centimes": expenses_total,
        "open_refunds_centimes": refunds_total,
        "profit_centimes": paid_revenue + collected_staff_revenue - expenses_total - refunds_total,
        "mrr_centimes": paid_revenue + collected_staff_revenue,
        "arr_centimes": (paid_revenue + collected_staff_revenue) * 12,
        "paid_users": paid_users,
        "active_entitlements": active_entitlements,
        "expenses_by_category": await _expense_breakdown(db, selected_month),
        "revenue_by_rail": await _payment_breakdown(db, PaymentTransaction.rail, start, end),
        "revenue_by_plan": await _payment_breakdown(db, PaymentTransaction.plan, start, end),
    }

    metrics = [
        FounderMetricOut(key="students", label="Students", value=students_total, previous_value=previous_students_total),
        FounderMetricOut(key="new_students", label="New students", value=new_students, previous_value=0),
        FounderMetricOut(key="mrr", label="MRR", value=finance["mrr_centimes"], previous_value=previous_paid_revenue + previous_collected_staff_revenue, unit="centimes"),
        FounderMetricOut(key="profit", label="Profit", value=finance["profit_centimes"], previous_value=0, unit="centimes"),
        FounderMetricOut(key="active_7d", label="Active 7d", value=active_students_7d, previous_value=0),
        FounderMetricOut(key="private_messages", label="Private messages", value=messages["private_messages_month"], previous_value=0),
    ]

    return FounderDashboardOut(
        generated_at=now,
        month=selected_month,
        metrics=metrics,
        growth_by_day=await _growth_by_day(db, start, end),
        students_by_status=await _students_by_status(db, now),
        students_by_tier=await _breakdown(db, User, User.tier, User.role == "student", User.is_staff == False),  # noqa: E712
        students_by_track=await _students_by_track(db),
        finance=finance,
        engagement=engagement,
        messages=messages,
        staff_codes=staff_codes,
        expenses=await list_finance_expenses(db, month=selected_month),
    )


def finance_expense_out(expense: FinanceExpense) -> FinanceExpenseOut:
    return FinanceExpenseOut(
        id=int(expense.id),
        expense_month=expense.expense_month,
        expense_date=expense.expense_date,
        category=expense.category,
        vendor=expense.vendor,
        description=expense.description,
        amount_centimes=int(expense.amount_centimes),
        currency=expense.currency,
        source=expense.source,
        status=expense.status,
        created_by_user_id=int(expense.created_by_user_id),
        metadata=expense.metadata_json or {},
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


async def _count(db: AsyncSession, model: type[Any], *filters: Any) -> int:
    statement = select(func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _count_distinct(db: AsyncSession, column: Any, *filters: Any) -> int:
    statement = select(func.count(func.distinct(column)))
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _sum(db: AsyncSession, column: Any, *filters: Any) -> int:
    statement = select(func.coalesce(func.sum(column), 0))
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _breakdown(db: AsyncSession, model: type[Any], column: Any, *filters: Any) -> dict[str, int]:
    statement = select(column, func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    rows = await db.execute(statement.group_by(column).order_by(column))
    return {str(key or "unset").lower(): _int(value) for key, value in rows.all()}


async def _payment_breakdown(db: AsyncSession, column: Any, start: datetime, end: datetime) -> dict[str, int]:
    rows = await db.execute(
        select(column, func.coalesce(func.sum(PaymentTransaction.amount_centimes), 0))
        .select_from(PaymentTransaction)
        .where(
            PaymentTransaction.status == PAYMENT_STATUS_PAID,
            _non_staff_redemption_payment(),
            _payment_booked_at() >= start,
            _payment_booked_at() < end,
        )
        .group_by(column)
        .order_by(column)
    )
    return {str(key or "unset").lower(): _int(value) for key, value in rows.all()}


async def _expense_breakdown(db: AsyncSession, selected_month: date) -> dict[str, int]:
    rows = await db.execute(
        select(FinanceExpense.category, func.coalesce(func.sum(FinanceExpense.amount_centimes), 0))
        .where(FinanceExpense.expense_month == selected_month, FinanceExpense.status != "cancelled")
        .group_by(FinanceExpense.category)
        .order_by(FinanceExpense.category)
    )
    return {str(key or "other").lower(): _int(value) for key, value in rows.all()}


async def _growth_by_day(db: AsyncSession, start: datetime, end: datetime) -> list[dict[str, Any]]:
    opening_total = await _count(db, User, User.role == "student", User.is_staff == False, User.created_at < start)  # noqa: E712
    rows = await db.execute(
        select(func.date(User.created_at), func.count())
        .where(User.role == "student", User.is_staff == False, User.created_at >= start, User.created_at < end)  # noqa: E712
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
    )
    values_by_day = {str(day): _int(count) for day, count in rows.all()}
    days_in_month = monthrange(start.year, start.month)[1]
    total_students = opening_total
    growth_rows = []
    for day in range(1, days_in_month + 1):
        if datetime(start.year, start.month, day, tzinfo=timezone.utc) >= end:
            continue
        day_key = date(start.year, start.month, day).isoformat()
        new_students = values_by_day.get(day_key, 0)
        total_students += new_students
        growth_rows.append({
            "date": day_key,
            "new_students": new_students,
            "total_students": total_students,
        })
    return growth_rows


async def _students_by_track(db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        select(User.niveau, User.filiere, func.count())
        .where(User.role == "student", User.is_staff == False)  # noqa: E712
        .group_by(User.niveau, User.filiere)
        .order_by(User.niveau, User.filiere)
    )
    return {f"{niveau or 'unset'}:{filiere or 'unset'}".lower(): _int(count) for niveau, filiere, count in rows.all()}


async def _students_by_status(db: AsyncSession, now: datetime) -> dict[str, int]:
    normalized_tier = func.lower(func.coalesce(User.tier, ""))
    active_entitlement_exists = (
        select(UserSubjectEntitlement.id)
        .where(
            UserSubjectEntitlement.user_id == User.id,
            UserSubjectEntitlement.status == "active",
            (UserSubjectEntitlement.ends_at.is_(None)) | (UserSubjectEntitlement.ends_at >= now),
        )
        .exists()
    )
    progress_exists = (
        select(TopicItemProgress.id)
        .where(
            TopicItemProgress.user_id == User.id,
            TopicItemProgress.updated_at >= now - timedelta(days=14),
        )
        .exists()
    )
    status_case = case(
        (User.is_active == False, "registered"),  # noqa: E712
        (active_entitlement_exists & normalized_tier.in_(("vip",)), "vip"),
        (active_entitlement_exists & ((normalized_tier == "pro") | (User.is_pro == True)), "pro"),  # noqa: E712
        (active_entitlement_exists | progress_exists, "active_basic"),
        else_="registered",
    )
    rows = await db.execute(
        select(
            status_case,
            func.count(),
        )
        .select_from(User)
        .where(User.role == "student", User.is_staff == False)  # noqa: E712
        .group_by(status_case)
    )
    values = {"registered": 0, "active_basic": 0, "pro": 0, "vip": 0}
    values.update({str(status): _int(count) for status, count in rows.all()})
    return values
