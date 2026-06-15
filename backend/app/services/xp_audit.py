from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserXP, XPTransaction
from app.models.users import User
from app.schemas.gamification import (
    XPAdminAuditOut,
    XPAdminTransactionOut,
    XPReasonBreakdownOut,
)

XP_ADMIN_ADJUSTMENT_REASON = "admin_adjustment"


async def build_admin_xp_audit(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 100,
) -> XPAdminAuditOut:
    target_user_id = int(user_id)
    if target_user_id <= 0:
        raise HTTPException(status_code=400, detail="user_id must be positive")
    if await db.get(User, target_user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")

    summary = (
        await db.execute(
            select(
                func.coalesce(
                    select(UserXP.total_xp)
                    .where(UserXP.user_id == target_user_id)
                    .scalar_subquery(),
                    0,
                ).label("stored_total"),
                func.coalesce(func.sum(XPTransaction.amount), 0).label(
                    "transaction_sum"
                ),
                func.count(XPTransaction.id).label("transaction_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (XPTransaction.reason == XP_ADMIN_ADJUSTMENT_REASON, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("adjustment_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                XPTransaction.reason == XP_ADMIN_ADJUSTMENT_REASON,
                                XPTransaction.amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("adjustment_sum"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                XPTransaction.cap_applied.is_(True),
                                XPTransaction.requested_amount - XPTransaction.amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("capped_amount"),
            ).where(XPTransaction.user_id == target_user_id)
        )
    ).one()

    stored_total_int = int(summary.stored_total or 0)
    transaction_sum = int(summary.transaction_sum or 0)
    transaction_count = int(summary.transaction_count or 0)
    adjustment_count = int(summary.adjustment_count or 0)
    adjustment_sum = int(summary.adjustment_sum or 0)
    capped_amount = int(summary.capped_amount or 0)

    breakdown_result = await db.execute(
        select(
            XPTransaction.reason,
            func.count().label("count"),
            func.coalesce(func.sum(XPTransaction.amount), 0).label("amount"),
            func.coalesce(func.sum(XPTransaction.requested_amount), 0).label(
                "requested_amount"
            ),
        )
        .where(XPTransaction.user_id == target_user_id)
        .group_by(XPTransaction.reason)
        .order_by(XPTransaction.reason.asc())
    )
    reason_breakdown = [
        XPReasonBreakdownOut(
            reason=str(reason),
            count=int(count),
            amount=int(amount or 0),
            requested_amount=int(requested_amount or 0),
        )
        for reason, count, amount, requested_amount in breakdown_result.all()
    ]

    bounded_limit = max(1, min(int(limit), 200))
    transaction_result = await db.execute(
        select(XPTransaction)
        .where(XPTransaction.user_id == target_user_id)
        .order_by(XPTransaction.created_at.desc(), XPTransaction.id.desc())
        .limit(bounded_limit)
    )
    transactions = [
        _admin_transaction_out(transaction)
        for transaction in transaction_result.scalars().all()
    ]
    delta = stored_total_int - transaction_sum
    return XPAdminAuditOut(
        user_id=target_user_id,
        stored_total_xp=stored_total_int,
        transaction_sum_xp=transaction_sum,
        delta_xp=delta,
        transaction_count=transaction_count,
        adjustment_count=adjustment_count,
        adjustment_sum_xp=adjustment_sum,
        capped_amount_xp=capped_amount,
        has_total_mismatch=delta != 0,
        reason_breakdown=reason_breakdown,
        transactions=transactions,
    )


def _admin_transaction_out(transaction: XPTransaction) -> XPAdminTransactionOut:
    return XPAdminTransactionOut(
        transaction_id=int(transaction.id),
        user_id=int(transaction.user_id),
        amount=int(transaction.amount),
        requested_amount=int(transaction.requested_amount or 0),
        reason=transaction.reason,
        description=transaction.description,
        subject_id=transaction.subject_id,
        topic_id=transaction.topic_id,
        topic_section_id=transaction.topic_section_id,
        topic_item_id=transaction.topic_item_id,
        question_set_id=transaction.question_set_id,
        question_id=transaction.question_id,
        quiz_attempt_id=transaction.quiz_attempt_id,
        question_attempt_id=transaction.question_attempt_id,
        idempotency_key=transaction.idempotency_key,
        daily_cap_category=transaction.daily_cap_category,
        daily_cap_date=transaction.daily_cap_date,
        cap_applied=bool(transaction.cap_applied),
        created_at=transaction.created_at,
    )
