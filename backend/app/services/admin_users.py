from datetime import datetime, timezone
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import PaymentTransaction
from app.models.users import User, UserPermission, UserSubjectEntitlement
from app.schemas.admin import (
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


async def _breakdown(db: AsyncSession, model: type[Any], column: Any) -> dict[str, int]:
    rows = await db.execute(
        select(column, func.count())
        .select_from(model)
        .group_by(column)
        .order_by(column)
    )
    return {str(key or "unset").lower(): _int(value) for key, value in rows.all()}


async def build_admin_users_access(db: AsyncSession, *, limit: int = 100) -> AdminUsersAccessOut:
    now = datetime.now(timezone.utc)
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
        )
        .select_from(User)
        .outerjoin(entitlements_subquery, entitlements_subquery.c.user_id == User.id)
        .outerjoin(permissions_subquery, permissions_subquery.c.user_id == User.id)
        .outerjoin(payments_subquery, payments_subquery.c.user_id == User.id)
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
            tier=_str(row["tier"] or "basic"),
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

    return AdminUsersAccessOut(
        generated_at=now,
        summary=AdminUsersAccessSummaryOut(
            total_users=await _count(db, User),
            active_users=await _count(db, User, User.is_active == True),  # noqa: E712
            verified_users=await _count(db, User, User.is_email_verified == True),  # noqa: E712
            staff_users=await _count(db, User, User.is_staff == True),  # noqa: E712
            pro_users=await _count(db, User, User.is_pro == True),  # noqa: E712
            active_entitlements=active_entitlements_count,
            users_with_active_entitlements=users_with_active_entitlements,
            active_permissions=await _count(db, UserPermission, UserPermission.status == "active"),
            paid_users=_int(
                await db.scalar(
                    select(func.count(func.distinct(PaymentTransaction.user_id))).where(
                        PaymentTransaction.status == "paid"
                    )
                )
            ),
            paid_revenue_centimes=await _sum(
                db,
                PaymentTransaction.amount_centimes,
                PaymentTransaction.status == "paid",
            ),
        ),
        users_by_role=await _breakdown(db, User, User.role),
        users_by_tier=await _breakdown(db, User, User.tier),
        entitlements_by_status=await _breakdown(db, UserSubjectEntitlement, UserSubjectEntitlement.status),
        permissions_by_status=await _breakdown(db, UserPermission, UserPermission.status),
        users=users,
    )
