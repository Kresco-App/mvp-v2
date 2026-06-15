from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.payments import (
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_MISMATCH,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    PAYMENT_STATUS_PENDING_PROVIDER,
    REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
    REFUND_REQUEST_STATUS_REQUESTED,
    PaymentProviderEvent,
    PaymentReconciliationImport,
    PaymentTransaction,
    RefundRequest,
)
from app.schemas.payments import (
    FinanceMonitoringBucketOut,
    FinanceMonitoringProblemIndicatorOut,
    FinancePaymentMonitoringOut,
)

OPEN_REFUND_REQUEST_STATUSES = {
    REFUND_REQUEST_STATUS_REQUESTED,
    REFUND_REQUEST_STATUS_APPROVED_PENDING_EXECUTION,
}
PROBLEM_TRANSACTION_STATUSES = {
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_MISMATCH,
}
PROBLEM_PROVIDER_EVENT_STATUSES = {"failed", "ignored"}


async def build_finance_payment_monitoring_summary(
    db: AsyncSession,
    *,
    problem_limit: int = 20,
) -> FinancePaymentMonitoringOut:
    return FinancePaymentMonitoringOut(
        generated_at=datetime.now(timezone.utc),
        total_transactions=await _count_rows(db, PaymentTransaction),
        total_provider_events=await _count_rows(db, PaymentProviderEvent),
        transaction_statuses=await _group_count(db, PaymentTransaction.status),
        transaction_providers=await _group_count(db, PaymentTransaction.provider),
        transaction_rails=await _group_count(db, PaymentTransaction.rail),
        provider_event_statuses=await _group_count(db, PaymentProviderEvent.status),
        provider_event_types=await _group_count(db, PaymentProviderEvent.event_type),
        reconciliation_import_statuses=await _group_count(db, PaymentReconciliationImport.status),
        refund_request_statuses=await _group_count(db, RefundRequest.status),
        open_manual_review_count=await _count_where(
            db,
            PaymentTransaction,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
        ),
        open_provider_count=await _count_where(
            db,
            PaymentTransaction,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_PROVIDER,
        ),
        failed_or_mismatch_count=await _count_where(
            db,
            PaymentTransaction,
            PaymentTransaction.status.in_({PAYMENT_STATUS_FAILED, PAYMENT_STATUS_MISMATCH}),
        ),
        open_refund_request_count=await _count_where(
            db,
            RefundRequest,
            RefundRequest.status.in_(OPEN_REFUND_REQUEST_STATUSES),
        ),
        latest_problem_indicators=await _latest_problem_indicators(db, limit=problem_limit),
    )


async def _count_rows(db: AsyncSession, model: type) -> int:
    count = await db.scalar(select(func.count()).select_from(model))
    return int(count or 0)


async def _count_where(db: AsyncSession, model: type, *criteria: ColumnElement[bool]) -> int:
    count = await db.scalar(select(func.count()).select_from(model).where(*criteria))
    return int(count or 0)


async def _group_count(db: AsyncSession, column) -> list[FinanceMonitoringBucketOut]:
    result = await db.execute(select(column, func.count()).group_by(column).order_by(column.asc()))
    return [FinanceMonitoringBucketOut(key=str(key or ""), count=int(count)) for key, count in result.all()]


async def _latest_problem_indicators(
    db: AsyncSession,
    *,
    limit: int,
) -> list[FinanceMonitoringProblemIndicatorOut]:
    bounded_limit = max(1, min(int(limit), 50))
    indicators: list[FinanceMonitoringProblemIndicatorOut] = []

    transaction_result = await db.execute(
        select(PaymentTransaction)
        .where(PaymentTransaction.status.in_(PROBLEM_TRANSACTION_STATUSES))
        .order_by(PaymentTransaction.updated_at.desc(), PaymentTransaction.id.desc())
        .limit(bounded_limit)
    )
    for transaction in transaction_result.scalars().all():
        indicators.append(
            FinanceMonitoringProblemIndicatorOut(
                kind="payment_transaction",
                id=int(transaction.id),
                transaction_id=int(transaction.id),
                status=transaction.status,
                label=f"{transaction.provider}:{transaction.reference_code}",
                created_at=transaction.updated_at or transaction.created_at,
            )
        )

    provider_event_result = await db.execute(
        select(PaymentProviderEvent)
        .where(PaymentProviderEvent.status.in_(PROBLEM_PROVIDER_EVENT_STATUSES))
        .order_by(PaymentProviderEvent.received_at.desc(), PaymentProviderEvent.id.desc())
        .limit(bounded_limit)
    )
    for event in provider_event_result.scalars().all():
        indicators.append(
            FinanceMonitoringProblemIndicatorOut(
                kind="payment_provider_event",
                id=int(event.id),
                transaction_id=int(event.transaction_id) if event.transaction_id is not None else None,
                status=event.status,
                label=f"{event.provider}:{event.event_type}",
                created_at=event.received_at,
            )
        )

    reconciliation_result = await db.execute(
        select(PaymentReconciliationImport)
        .where(
            or_(
                PaymentReconciliationImport.status == "failed",
                PaymentReconciliationImport.mismatch_count > 0,
                PaymentReconciliationImport.unmatched_count > 0,
                PaymentReconciliationImport.duplicate_count > 0,
                PaymentReconciliationImport.error_count > 0,
            )
        )
        .order_by(PaymentReconciliationImport.created_at.desc(), PaymentReconciliationImport.id.desc())
        .limit(bounded_limit)
    )
    for reconciliation_import in reconciliation_result.scalars().all():
        indicators.append(
            FinanceMonitoringProblemIndicatorOut(
                kind="payment_reconciliation_import",
                id=int(reconciliation_import.id),
                transaction_id=None,
                status=reconciliation_import.status,
                label=f"{reconciliation_import.provider}:import-{reconciliation_import.id}",
                created_at=reconciliation_import.created_at,
            )
        )

    refund_result = await db.execute(
        select(RefundRequest)
        .where(RefundRequest.status.in_(OPEN_REFUND_REQUEST_STATUSES))
        .order_by(RefundRequest.created_at.desc(), RefundRequest.id.desc())
        .limit(bounded_limit)
    )
    for refund_request in refund_result.scalars().all():
        indicators.append(
            FinanceMonitoringProblemIndicatorOut(
                kind="refund_request",
                id=int(refund_request.id),
                transaction_id=int(refund_request.transaction_id)
                if refund_request.transaction_id is not None
                else None,
                status=refund_request.status,
                label=f"{refund_request.provider}:{refund_request.amount_centimes}",
                created_at=refund_request.created_at,
            )
        )

    indicators.sort(key=_indicator_sort_key, reverse=True)
    return indicators[:bounded_limit]


def _indicator_sort_key(indicator: FinanceMonitoringProblemIndicatorOut) -> tuple[datetime, str, int]:
    created_at = indicator.created_at or datetime.min
    if created_at.tzinfo is not None:
        created_at = created_at.replace(tzinfo=None)
    return (created_at, indicator.kind, indicator.id)
