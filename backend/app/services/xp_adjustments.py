from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.models.gamification import UserXP, XPTransaction
from app.models.users import User
from app.schemas.gamification import XPAdjustmentCreateIn, XPAdjustmentOut

XP_ADMIN_ADJUSTMENT_REASON = "admin_adjustment"

async def create_xp_adjustment(
    db: AsyncSession,
    *,
    actor: User,
    request: XPAdjustmentCreateIn,
    request_path: str = "",
    client_host: str = "",
) -> XPAdjustmentOut:
    actor_id = int(actor.id)
    target_user_id = int(request.user_id)
    if target_user_id == actor_id:
        raise HTTPException(status_code=400, detail="Cannot adjust your own XP")
    target = await db.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await _load_adjustment_by_idempotency_key(
        db,
        user_id=target_user_id,
        idempotency_key=request.idempotency_key,
    )
    if existing is not None:
        _validate_existing_adjustment(existing, request)
        total_xp = await _current_total_xp(db, user_id=target_user_id)
        original_actor_id = await _actor_id_for_adjustment(db, adjustment_id=int(existing.id)) or actor_id
        return xp_adjustment_out(existing, actor_id=original_actor_id, total_xp=total_xp)

    xp_record = await db.scalar(select(UserXP).where(UserXP.user_id == target_user_id).with_for_update())
    current_total = int(xp_record.total_xp) if xp_record is not None else 0
    next_total = current_total + int(request.amount)
    if next_total < 0:
        raise HTTPException(status_code=400, detail="XP adjustment cannot make total XP negative")

    if xp_record is None:
        xp_record = UserXP(user_id=target_user_id, total_xp=0, streak_days=0)
        db.add(xp_record)
        await db.flush()

    adjustment = XPTransaction(
        user_id=target_user_id,
        amount=int(request.amount),
        requested_amount=int(request.amount),
        reason=XP_ADMIN_ADJUSTMENT_REASON,
        description=request.reason,
        idempotency_key=request.idempotency_key,
        daily_cap_category=None,
        daily_cap_date=None,
        cap_applied=False,
    )
    db.add(adjustment)
    xp_record.total_xp = next_total
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await _load_adjustment_by_idempotency_key(
            db,
            user_id=target_user_id,
            idempotency_key=request.idempotency_key,
        )
        if existing is None:
            raise
        _validate_existing_adjustment(existing, request)
        total_xp = await _current_total_xp(db, user_id=target_user_id)
        original_actor_id = await _actor_id_for_adjustment(db, adjustment_id=int(existing.id)) or actor_id
        return xp_adjustment_out(existing, actor_id=original_actor_id, total_xp=total_xp)
    _add_adjustment_audit(
        db,
        adjustment=adjustment,
        actor_id=actor_id,
        target_user_id=target_user_id,
        previous_total=current_total,
        next_total=next_total,
        request_path=request_path,
        client_host=client_host,
    )
    await db.commit()
    await db.refresh(adjustment)
    return xp_adjustment_out(adjustment, actor_id=actor_id, total_xp=next_total)


async def _load_adjustment_by_idempotency_key(
    db: AsyncSession,
    *,
    user_id: int,
    idempotency_key: str,
) -> XPTransaction | None:
    return await db.scalar(
        select(XPTransaction)
        .where(
            XPTransaction.user_id == int(user_id),
            XPTransaction.idempotency_key == idempotency_key,
        )
        .limit(1)
    )


async def _current_total_xp(db: AsyncSession, *, user_id: int) -> int:
    total = await db.scalar(select(UserXP.total_xp).where(UserXP.user_id == int(user_id)))
    return int(total or 0)


def _validate_existing_adjustment(existing: XPTransaction, request: XPAdjustmentCreateIn) -> None:
    if existing.reason != XP_ADMIN_ADJUSTMENT_REASON:
        raise HTTPException(status_code=409, detail="XP idempotency key already belongs to another XP transaction")
    if int(existing.amount) != int(request.amount) or existing.description != request.reason:
        raise HTTPException(status_code=409, detail="XP adjustment idempotency key payload mismatch")


async def _actor_id_for_adjustment(db: AsyncSession, *, adjustment_id: int) -> int | None:
    audit = await db.scalar(
        select(AdminAuditLog)
        .where(
            AdminAuditLog.action == "xp_adjustment",
            AdminAuditLog.model_name == "XPTransaction",
            AdminAuditLog.object_pk == str(adjustment_id),
        )
        .order_by(AdminAuditLog.id.asc())
        .limit(1)
    )
    if audit is None:
        return None
    actor_id = (audit.changed_data or {}).get("actor_user_id")
    return int(actor_id) if actor_id is not None else None


def _add_adjustment_audit(
    db: AsyncSession,
    *,
    adjustment: XPTransaction,
    actor_id: int,
    target_user_id: int,
    previous_total: int,
    next_total: int,
    request_path: str,
    client_host: str,
) -> None:
    db.add(
        AdminAuditLog(
            action="xp_adjustment",
            model_name="XPTransaction",
            object_pk=str(adjustment.id or ""),
            object_repr=f"{target_user_id}:{adjustment.amount}"[:500],
            changed_data={
                "user_id": target_user_id,
                "amount": int(adjustment.amount),
                "reason": adjustment.description,
                "idempotency_key": adjustment.idempotency_key,
                "previous_total_xp": previous_total,
                "next_total_xp": next_total,
                "actor_user_id": actor_id,
            },
            request_path=request_path,
            client_host=client_host,
            note=f"admin_user_id={actor_id}",
        )
    )


def xp_adjustment_out(adjustment: XPTransaction, *, actor_id: int, total_xp: int) -> XPAdjustmentOut:
    return XPAdjustmentOut(
        transaction_id=int(adjustment.id),
        user_id=int(adjustment.user_id),
        amount=int(adjustment.amount),
        requested_amount=int(adjustment.requested_amount),
        reason=adjustment.reason,
        description=adjustment.description,
        idempotency_key=str(adjustment.idempotency_key or ""),
        actor_user_id=actor_id,
        total_xp=int(total_xp),
        created_at=adjustment.created_at,
    )
