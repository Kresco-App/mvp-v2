from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.models.gamification import UserXP
from app.models.operations import AnalyticsEvent
from app.models.payments import PaymentTransaction
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.schemas.admin import (
    AdminStudentAccountCreateIn,
    AdminStudentAccountUpdateIn,
    AdminUserAccessRowOut,
    AdminUserPermissionRowOut,
    AdminUsersAccessOut,
    AdminUsersAccessSummaryOut,
)


def _int(value: Any) -> int:
    return int(value or 0)


def _str(value: Any) -> str:
    return str(value or "")


async def _count(db: AsyncSession, model: type[Any], *filters: Any) -> int:
    statement = select(func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _sum(db: AsyncSession, column: Any, *filters: Any) -> int:
    statement = select(func.coalesce(func.sum(column), 0))
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


def _normalize_tier(value: Any, *, is_pro: bool = False) -> str:
    tier = str(value or "basic").strip().lower()
    if tier in {"basic", "pro", "vip"}:
        return tier
    return "vip" if is_pro else "basic"


def _month_window(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


async def build_admin_user_access_row(db: AsyncSession, *, user_id: int) -> AdminUserAccessRowOut:
    user = await db.get(User, int(user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    month_start, month_end = _month_window(now)
    active_entitlement = (
        UserSubjectEntitlement.user_id == int(user.id),
        UserSubjectEntitlement.status == "active",
        or_(UserSubjectEntitlement.ends_at.is_(None), UserSubjectEntitlement.ends_at >= now),
    )
    permissions_result = await db.execute(
        select(UserPermission)
        .where(
            UserPermission.user_id == int(user.id),
            UserPermission.status == "active",
        )
        .order_by(UserPermission.permission.asc())
    )
    permissions = [
        AdminUserPermissionRowOut(
            id=int(permission.id),
            permission=permission.permission,
            reason=permission.reason or "",
            created_at=permission.created_at,
        )
        for permission in permissions_result.scalars().all()
    ]
    payment_row = (
        await db.execute(
            select(
                func.count(PaymentTransaction.id).label("payment_count"),
                func.coalesce(
                    func.sum(case((PaymentTransaction.status == "paid", PaymentTransaction.amount_centimes), else_=0)),
                    0,
                ).label("paid_revenue_centimes"),
                func.max(PaymentTransaction.updated_at).label("latest_payment_at"),
            ).where(PaymentTransaction.user_id == int(user.id))
        )
    ).mappings().one()

    return AdminUserAccessRowOut(
        user_id=int(user.id),
        full_name=_str(user.full_name),
        email=_str(user.email),
        role=_str(user.role or "student"),
        tier=_normalize_tier(user.tier, is_pro=bool(user.is_pro)),
        niveau=_str(user.niveau),
        filiere=_str(user.filiere),
        is_active=bool(user.is_active),
        is_email_verified=bool(user.is_email_verified),
        is_staff=bool(user.is_staff),
        is_superuser=bool(user.is_superuser),
        is_pro=bool(user.is_pro),
        active_entitlements=await _count(db, UserSubjectEntitlement, *active_entitlement),
        total_entitlements=await _count(db, UserSubjectEntitlement, UserSubjectEntitlement.user_id == int(user.id)),
        active_permissions=len(permissions),
        active_permission_names=[permission.permission for permission in permissions],
        permissions=permissions,
        payment_count=_int(payment_row["payment_count"]),
        paid_revenue_centimes=_int(payment_row["paid_revenue_centimes"]),
        ai_quota_used_month=await _sum(
            db,
            AnalyticsEvent.value_int,
            AnalyticsEvent.user_id == int(user.id),
            AnalyticsEvent.event_name == "ai_quota_used",
            AnalyticsEvent.occurred_at >= month_start,
            AnalyticsEvent.occurred_at < month_end,
        ),
        latest_payment_at=payment_row["latest_payment_at"],
        last_login=user.last_login,
        created_at=user.created_at,
    )


async def create_admin_student_account(
    db: AsyncSession,
    *,
    actor: User,
    payload: AdminStudentAccountCreateIn,
    request_path: str = "",
    client_host: str = "",
) -> AdminUserAccessRowOut:
    email = str(payload.email).strip().lower()
    await _ensure_email_available(db, email=email)
    tier = _normalize_tier(payload.tier)
    target = User(
        email=email,
        full_name=payload.full_name.strip(),
        role="student",
        niveau=(payload.niveau or "").strip(),
        filiere=(payload.filiere or "").strip(),
        tier=tier,
        is_pro=tier != "basic",
        is_active=bool(payload.is_active),
        is_email_verified=bool(payload.is_email_verified),
        is_staff=False,
        is_superuser=False,
    )
    db.add(target)
    try:
        await db.flush()
        db.add(UserXP(user_id=int(target.id), total_xp=0, streak_days=0))
        db.add(
            AdminAuditLog(
                action="student_account_create",
                model_name="User",
                object_pk=str(target.id),
                object_repr=f"{target.full_name or target.email} <{target.email}>"[:500],
                changed_data={
                    "student_user_id": int(target.id),
                    "actor_user_id": int(actor.id),
                    "fields": ["email", "full_name", "niveau", "filiere", "tier", "is_active", "is_email_verified"],
                    "values": {
                        "email": target.email,
                        "full_name": target.full_name,
                        "niveau": target.niveau,
                        "filiere": target.filiere,
                        "tier": target.tier,
                        "is_active": bool(target.is_active),
                        "is_email_verified": bool(target.is_email_verified),
                    },
                },
                request_path=request_path,
                client_host=client_host,
                note=f"admin_user_id={int(actor.id)}",
            )
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already belongs to another account") from exc

    return await build_admin_user_access_row(db, user_id=int(target.id))


async def update_admin_student_account(
    db: AsyncSession,
    *,
    actor: User,
    user_id: int,
    payload: AdminStudentAccountUpdateIn,
    request_path: str = "",
    client_host: str = "",
) -> AdminUserAccessRowOut:
    target = await db.get(User, int(user_id))
    if target is None or target.is_staff or target.role != "student":
        raise HTTPException(status_code=404, detail="Student account not found")

    changes: dict[str, dict[str, Any]] = {}
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates:
        next_email = str(updates["email"]).strip().lower()
        await _ensure_email_available(db, email=next_email, exclude_user_id=int(target.id))
        _record_change(target, changes, "email", next_email)

    for field_name in ("full_name", "niveau", "filiere", "is_active", "is_email_verified"):
        if field_name in updates:
            _record_change(target, changes, field_name, updates[field_name])

    if "tier" in updates:
        tier = str(updates["tier"]).strip().lower()
        _record_change(target, changes, "tier", tier)
        _record_change(target, changes, "is_pro", tier != "basic")

    if changes:
        db.add(
            AdminAuditLog(
                action="student_account_update",
                model_name="User",
                object_pk=str(target.id),
                object_repr=f"{target.full_name or target.email} <{target.email}>"[:500],
                changed_data={
                    "student_user_id": int(target.id),
                    "actor_user_id": int(actor.id),
                    "fields": sorted(changes),
                    "changes": changes,
                },
                request_path=request_path,
                client_host=client_host,
                note=f"admin_user_id={int(actor.id)}",
            )
        )
        await db.commit()
        await db.refresh(target)

    return await build_admin_user_access_row(db, user_id=int(target.id))


async def _ensure_email_available(db: AsyncSession, *, email: str, exclude_user_id: int | None = None) -> None:
    filters: list[Any] = [func.lower(User.email) == email]
    if exclude_user_id is not None:
        filters.append(User.id != int(exclude_user_id))
    statement = select(User.id).where(*filters).limit(1)
    existing_user_id = await db.scalar(statement)
    if existing_user_id is not None:
        raise HTTPException(status_code=400, detail="Email already belongs to another account")


def _record_change(target: User, changes: dict[str, dict[str, Any]], field_name: str, next_value: Any) -> None:
    current_value = getattr(target, field_name)
    if current_value == next_value:
        return
    changes[field_name] = {"from": current_value, "to": next_value}
    setattr(target, field_name, next_value)


async def _breakdown(db: AsyncSession, model: type[Any], column: Any, *filters: Any, normalize: Any = None) -> dict[str, int]:
    statement = select(column, func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    rows = await db.execute(statement.group_by(column).order_by(column))
    values: dict[str, int] = {}
    for key, value in rows.all():
        normalized_key = normalize(key) if normalize else str(key or "unset").lower()
        values[normalized_key] = values.get(normalized_key, 0) + _int(value)
    return values


async def _student_tier_breakdown(db: AsyncSession, *filters: Any) -> dict[str, int]:
    statement = select(User.tier, User.is_pro, func.count()).select_from(User)
    if filters:
        statement = statement.where(*filters)
    rows = await db.execute(statement.group_by(User.tier, User.is_pro).order_by(User.tier, User.is_pro))
    values: dict[str, int] = {}
    for tier, is_pro, value in rows.all():
        normalized_key = _normalize_tier(tier, is_pro=bool(is_pro))
        values[normalized_key] = values.get(normalized_key, 0) + _int(value)
    return values


async def build_admin_users_access(db: AsyncSession, *, limit: int = 100) -> AdminUsersAccessOut:
    now = datetime.now(timezone.utc)
    month_start, month_end = _month_window(now)
    bounded_limit = max(1, min(int(limit or 100), 200))
    active_entitlement = (
        UserSubjectEntitlement.status == "active",
        or_(UserSubjectEntitlement.ends_at.is_(None), UserSubjectEntitlement.ends_at >= now),
    )

    entitlements_subquery = (
        select(
            UserSubjectEntitlement.user_id.label("user_id"),
            func.count(UserSubjectEntitlement.id).label("total_entitlements"),
            func.coalesce(func.sum(case((active_entitlement[0] & active_entitlement[1], 1), else_=0)), 0).label(
                "active_entitlements"
            ),
        )
        .group_by(UserSubjectEntitlement.user_id)
        .subquery()
    )
    permissions_subquery = (
        select(
            UserPermission.user_id.label("user_id"),
            func.coalesce(func.sum(case((UserPermission.status == "active", 1), else_=0)), 0).label(
                "active_permissions"
            ),
        )
        .group_by(UserPermission.user_id)
        .subquery()
    )
    payments_subquery = (
        select(
            PaymentTransaction.user_id.label("user_id"),
            func.count(PaymentTransaction.id).label("payment_count"),
            func.coalesce(
                func.sum(case((PaymentTransaction.status == "paid", PaymentTransaction.amount_centimes), else_=0)),
                0,
            ).label("paid_revenue_centimes"),
            func.max(PaymentTransaction.updated_at).label("latest_payment_at"),
        )
        .group_by(PaymentTransaction.user_id)
        .subquery()
    )
    ai_usage_subquery = (
        select(
            AnalyticsEvent.user_id.label("user_id"),
            func.coalesce(func.sum(AnalyticsEvent.value_int), 0).label("ai_quota_used_month"),
        )
        .where(
            AnalyticsEvent.event_name == "ai_quota_used",
            AnalyticsEvent.occurred_at >= month_start,
            AnalyticsEvent.occurred_at < month_end,
            AnalyticsEvent.user_id.is_not(None),
        )
        .group_by(AnalyticsEvent.user_id)
        .subquery()
    )

    rows_result = await db.execute(
        select(
            User.id.label("user_id"),
            User.full_name,
            User.email,
            User.role,
            User.tier,
            User.niveau,
            User.filiere,
            User.is_active,
            User.is_email_verified,
            User.is_staff,
            User.is_superuser,
            User.is_pro,
            User.last_login,
            User.created_at,
            func.coalesce(entitlements_subquery.c.active_entitlements, 0).label("active_entitlements"),
            func.coalesce(entitlements_subquery.c.total_entitlements, 0).label("total_entitlements"),
            func.coalesce(permissions_subquery.c.active_permissions, 0).label("active_permissions"),
            func.coalesce(payments_subquery.c.payment_count, 0).label("payment_count"),
            func.coalesce(payments_subquery.c.paid_revenue_centimes, 0).label("paid_revenue_centimes"),
            payments_subquery.c.latest_payment_at,
            func.coalesce(ai_usage_subquery.c.ai_quota_used_month, 0).label("ai_quota_used_month"),
        )
        .select_from(User)
        .outerjoin(entitlements_subquery, entitlements_subquery.c.user_id == User.id)
        .outerjoin(permissions_subquery, permissions_subquery.c.user_id == User.id)
        .outerjoin(payments_subquery, payments_subquery.c.user_id == User.id)
        .outerjoin(ai_usage_subquery, ai_usage_subquery.c.user_id == User.id)
        .order_by(
            User.is_staff.desc(),
            User.is_pro.desc(),
            func.coalesce(payments_subquery.c.paid_revenue_centimes, 0).desc(),
            User.created_at.desc(),
        )
        .limit(bounded_limit)
    )

    row_mappings = rows_result.mappings().all()
    permissions_by_user: dict[int, list[AdminUserPermissionRowOut]] = {}
    user_ids = [_int(row["user_id"]) for row in row_mappings]
    if user_ids:
        permissions_result = await db.execute(
            select(UserPermission)
            .where(
                UserPermission.user_id.in_(user_ids),
                UserPermission.status == "active",
            )
            .order_by(UserPermission.user_id.asc(), UserPermission.permission.asc())
        )
        for permission in permissions_result.scalars().all():
            permissions_by_user.setdefault(int(permission.user_id), []).append(
                AdminUserPermissionRowOut(
                    id=int(permission.id),
                    permission=permission.permission,
                    reason=permission.reason or "",
                    created_at=permission.created_at,
                )
            )

    users = [
        AdminUserAccessRowOut(
            user_id=_int(row["user_id"]),
            full_name=_str(row["full_name"]),
            email=_str(row["email"]),
            role=_str(row["role"] or "student"),
            tier=_normalize_tier(row["tier"], is_pro=bool(row["is_pro"])),
            niveau=_str(row["niveau"]),
            filiere=_str(row["filiere"]),
            is_active=bool(row["is_active"]),
            is_email_verified=bool(row["is_email_verified"]),
            is_staff=bool(row["is_staff"]),
            is_superuser=bool(row["is_superuser"]),
            is_pro=bool(row["is_pro"]),
            active_entitlements=_int(row["active_entitlements"]),
            total_entitlements=_int(row["total_entitlements"]),
            active_permissions=len(permissions_by_user.get(_int(row["user_id"]), [])),
            active_permission_names=[
                permission.permission for permission in permissions_by_user.get(_int(row["user_id"]), [])
            ],
            permissions=permissions_by_user.get(_int(row["user_id"]), []),
            payment_count=_int(row["payment_count"]),
            paid_revenue_centimes=_int(row["paid_revenue_centimes"]),
            ai_quota_used_month=_int(row["ai_quota_used_month"]),
            latest_payment_at=row["latest_payment_at"],
            last_login=row["last_login"],
            created_at=row["created_at"],
        )
        for row in row_mappings
    ]

    active_entitlements_count = await _count(db, UserSubjectEntitlement, *active_entitlement)
    users_with_active_entitlements = _int(
        await db.scalar(
            select(func.count(func.distinct(UserSubjectEntitlement.user_id)))
            .select_from(UserSubjectEntitlement)
            .where(*active_entitlement)
        )
    )

    non_staff_filter = User.is_staff == False  # noqa: E712

    return AdminUsersAccessOut(
        generated_at=now,
        summary=AdminUsersAccessSummaryOut(
            total_users=await _count(db, User, non_staff_filter),
            active_users=await _count(db, User, non_staff_filter, User.is_active == True),  # noqa: E712
            verified_users=await _count(db, User, non_staff_filter, User.is_email_verified == True),  # noqa: E712
            staff_users=await _count(db, User, User.is_staff == True),  # noqa: E712
            pro_users=await _count(db, User, non_staff_filter, User.is_pro == True),  # noqa: E712
            active_entitlements=active_entitlements_count,
            users_with_active_entitlements=users_with_active_entitlements,
            active_permissions=await _count(db, UserPermission, UserPermission.status == "active"),
            paid_users=_int(
                await db.scalar(
                    select(func.count(func.distinct(PaymentTransaction.user_id))).where(
                        PaymentTransaction.status == "paid",
                        PaymentTransaction.user_id.in_(select(User.id).where(non_staff_filter)),
                    )
                )
            ),
            paid_revenue_centimes=await _sum(
                db,
                PaymentTransaction.amount_centimes,
                PaymentTransaction.status == "paid",
                PaymentTransaction.user_id.in_(select(User.id).where(non_staff_filter)),
            ),
        ),
        users_by_role=await _breakdown(db, User, User.role, non_staff_filter),
        users_by_tier=await _student_tier_breakdown(db, non_staff_filter),
        entitlements_by_status=await _breakdown(db, UserSubjectEntitlement, UserSubjectEntitlement.status),
        permissions_by_status=await _breakdown(db, UserPermission, UserPermission.status),
        users=users,
    )
