from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import (
    FinanceLedgerEntry,
    PAYMENT_STATUS_PAID,
    REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
    REFUND_REQUEST_STATUS_REJECTED,
    REFUND_REQUEST_STATUS_REQUESTED,
    PaymentTransaction,
    RefundRequest,
)
from app.models.users import User
from app.schemas.payments import RefundRequestCreateIn, RefundRequestOut, RefundRequestReviewIn

OPEN_REFUND_REQUEST_STATUSES = {
    REFUND_REQUEST_STATUS_REQUESTED,
    REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
}
REFUND_REQUEST_STATUSES = {
    REFUND_REQUEST_STATUS_REQUESTED,
    REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
    REFUND_REQUEST_STATUS_REJECTED,
    "cancelled",
}


async def list_refund_requests(
    db: AsyncSession,
    *,
    status: str | None = None,
    transaction_id: int | None = None,
    user_id: int | None = None,
    limit: int = 50,
) -> list[RefundRequestOut]:
    statement = select(RefundRequest).order_by(RefundRequest.created_at.desc(), RefundRequest.id.desc())
    if status:
        normalized_status = status.strip().lower()
        if normalized_status not in REFUND_REQUEST_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported refund request status")
        statement = statement.where(RefundRequest.status == normalized_status)
    if transaction_id is not None:
        statement = statement.where(RefundRequest.transaction_id == int(transaction_id))
    if user_id is not None:
        statement = statement.where(RefundRequest.user_id == int(user_id))
    result = await db.execute(statement.limit(max(1, min(int(limit), 100))))
    return [refund_request_out(record) for record in result.scalars().all()]


async def create_refund_request(
    db: AsyncSession,
    *,
    actor: User,
    request: RefundRequestCreateIn,
) -> RefundRequestOut:
    transaction = await db.get(PaymentTransaction, int(request.transaction_id))
    if transaction is None:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    if transaction.status != PAYMENT_STATUS_PAID:
        raise HTTPException(status_code=409, detail="Only paid transactions can have refund requests")
    if int(request.amount_centimes) > int(transaction.amount_centimes):
        raise HTTPException(status_code=400, detail="Refund amount cannot exceed transaction amount")
    if await _open_refund_request_exists(db, transaction_id=int(transaction.id)):
        raise HTTPException(status_code=409, detail="Open refund request already exists for transaction")

    refund_request = RefundRequest(
        transaction_id=int(transaction.id),
        user_id=int(transaction.user_id),
        provider=transaction.provider,
        rail=transaction.rail,
        amount_centimes=int(request.amount_centimes),
        currency=transaction.currency,
        status=REFUND_REQUEST_STATUS_REQUESTED,
        reason=request.reason,
        requested_by_user_id=int(actor.id),
        metadata_json={"execution_deferred": True},
    )
    db.add(refund_request)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Open refund request already exists for transaction") from exc
    _add_refund_ledger_entry(
        db,
        refund_request=refund_request,
        entry_type="refund_requested",
        actor=actor,
        reason=request.reason,
    )
    await db.commit()
    await db.refresh(refund_request)
    return refund_request_out(refund_request)


async def approve_refund_request(
    db: AsyncSession,
    *,
    actor: User,
    refund_request_id: int,
    review: RefundRequestReviewIn,
) -> RefundRequestOut:
    return await _review_refund_request(
        db,
        actor=actor,
        refund_request_id=refund_request_id,
        review=review,
        next_status=REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
        ledger_entry_type="refund_approved_pending_execution",
    )


async def reject_refund_request(
    db: AsyncSession,
    *,
    actor: User,
    refund_request_id: int,
    review: RefundRequestReviewIn,
) -> RefundRequestOut:
    return await _review_refund_request(
        db,
        actor=actor,
        refund_request_id=refund_request_id,
        review=review,
        next_status=REFUND_REQUEST_STATUS_REJECTED,
        ledger_entry_type="refund_rejected",
    )


async def _review_refund_request(
    db: AsyncSession,
    *,
    actor: User,
    refund_request_id: int,
    review: RefundRequestReviewIn,
    next_status: str,
    ledger_entry_type: str,
) -> RefundRequestOut:
    refund_request = await db.get(RefundRequest, int(refund_request_id))
    if refund_request is None:
        raise HTTPException(status_code=404, detail="Refund request not found")
    if refund_request.status != REFUND_REQUEST_STATUS_REQUESTED:
        raise HTTPException(status_code=409, detail="Refund request is not pending review")

    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(RefundRequest)
        .where(
            RefundRequest.id == int(refund_request_id),
            RefundRequest.status == REFUND_REQUEST_STATUS_REQUESTED,
        )
        .values(
            status=next_status,
            reviewed_by_user_id=int(actor.id),
            review_reason=review.reason,
            reviewed_at=now,
        )
    )
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Refund request is not pending review")
    await db.refresh(refund_request)
    _add_refund_ledger_entry(
        db,
        refund_request=refund_request,
        entry_type=ledger_entry_type,
        actor=actor,
        reason=review.reason,
    )
    await db.commit()
    await db.refresh(refund_request)
    return refund_request_out(refund_request)


async def _open_refund_request_exists(db: AsyncSession, *, transaction_id: int) -> bool:
    result = await db.execute(
        select(RefundRequest.id)
        .where(
            RefundRequest.transaction_id == transaction_id,
            RefundRequest.status.in_(OPEN_REFUND_REQUEST_STATUSES),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def _add_refund_ledger_entry(
    db: AsyncSession,
    *,
    refund_request: RefundRequest,
    entry_type: str,
    actor: User,
    reason: str,
) -> None:
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(refund_request.transaction_id) if refund_request.transaction_id is not None else None,
            user_id=int(refund_request.user_id),
            entry_type=entry_type,
            amount_centimes=0,
            currency=refund_request.currency,
            reason=reason,
            metadata_json={
                "actor_user_id": int(actor.id),
                "refund_request_id": int(refund_request.id),
                "refund_amount_centimes": int(refund_request.amount_centimes),
                "execution_deferred": True,
            },
        )
    )


def refund_request_out(record: RefundRequest) -> RefundRequestOut:
    return RefundRequestOut(
        id=int(record.id),
        transaction_id=int(record.transaction_id) if record.transaction_id is not None else None,
        user_id=int(record.user_id),
        provider=record.provider,
        payment_method=record.rail,
        amount_centimes=int(record.amount_centimes),
        currency=record.currency,
        status=record.status,
        reason=record.reason,
        requested_by_user_id=int(record.requested_by_user_id),
        reviewed_by_user_id=int(record.reviewed_by_user_id) if record.reviewed_by_user_id is not None else None,
        review_reason=record.review_reason,
        metadata=record.metadata_json or {},
        created_at=record.created_at,
        reviewed_at=record.reviewed_at,
    )
