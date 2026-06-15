from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import (
    PAYMENT_RAIL_ASHPLUS,
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_PROVIDER_ASHPLUS,
    PAYMENT_PROVIDER_BANK_TRANSFER,
    PAYMENT_PROVIDER_CASHPLUS,
    PaymentReconciliationRow,
)
from app.schemas.payments import PaymentReconciliationRowOut

RECONCILIATION_ROW_STATUSES = {"matched", "mismatch", "unmatched", "duplicate", "error"}
PROBLEM_RECONCILIATION_ROW_STATUSES = {"mismatch", "unmatched", "duplicate", "error"}
MANUAL_PAYMENT_RAILS = {PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_ASHPLUS}
MANUAL_PAYMENT_PROVIDERS = {PAYMENT_PROVIDER_BANK_TRANSFER, PAYMENT_PROVIDER_CASHPLUS, PAYMENT_PROVIDER_ASHPLUS}


async def list_payment_reconciliation_rows(
    db: AsyncSession,
    *,
    status: str | None = None,
    provider: str | None = None,
    payment_method: str | None = None,
    import_id: int | None = None,
    transaction_id: int | None = None,
    limit: int = 100,
) -> list[PaymentReconciliationRowOut]:
    statement = select(PaymentReconciliationRow).order_by(
        PaymentReconciliationRow.created_at.desc(),
        PaymentReconciliationRow.id.desc(),
    )
    normalized_status = status.strip().lower() if status is not None else None
    if normalized_status is None:
        statement = statement.where(PaymentReconciliationRow.status.in_(PROBLEM_RECONCILIATION_ROW_STATUSES))
    elif normalized_status == "problem":
        statement = statement.where(PaymentReconciliationRow.status.in_(PROBLEM_RECONCILIATION_ROW_STATUSES))
    elif normalized_status != "all":
        if normalized_status not in RECONCILIATION_ROW_STATUSES:
            supported = ", ".join([*sorted(RECONCILIATION_ROW_STATUSES), "all", "problem"])
            raise HTTPException(status_code=400, detail=f"status must be one of: {supported}")
        statement = statement.where(PaymentReconciliationRow.status == normalized_status)
    if provider is not None:
        normalized_provider = provider.strip().lower().replace("-", "_")
        if normalized_provider not in MANUAL_PAYMENT_PROVIDERS:
            supported = ", ".join(sorted(MANUAL_PAYMENT_PROVIDERS))
            raise HTTPException(status_code=400, detail=f"provider must be one of: {supported}")
        statement = statement.where(PaymentReconciliationRow.provider == normalized_provider)
    if payment_method is not None:
        normalized_payment_method = payment_method.strip().lower().replace("-", "_")
        if normalized_payment_method not in MANUAL_PAYMENT_RAILS:
            supported = ", ".join(sorted(MANUAL_PAYMENT_RAILS))
            raise HTTPException(status_code=400, detail=f"payment_method must be one of: {supported}")
        statement = statement.where(PaymentReconciliationRow.rail == normalized_payment_method)
    if import_id is not None:
        statement = statement.where(PaymentReconciliationRow.import_id == int(import_id))
    if transaction_id is not None:
        statement = statement.where(PaymentReconciliationRow.matched_transaction_id == int(transaction_id))

    result = await db.execute(statement.limit(max(1, min(int(limit), 200))))
    return [payment_reconciliation_row_out(row) for row in result.scalars().all()]


def payment_reconciliation_row_out(row: PaymentReconciliationRow) -> PaymentReconciliationRowOut:
    return PaymentReconciliationRowOut(
        id=int(row.id),
        import_id=int(row.import_id),
        row_number=int(row.row_number),
        provider=row.provider,
        payment_method=row.rail,
        status=row.status,
        reference_code=row.reference_code,
        amount_centimes=int(row.amount_centimes),
        currency=row.currency,
        provider_reference=row.provider_reference,
        matched_transaction_id=int(row.matched_transaction_id) if row.matched_transaction_id is not None else None,
        failure_reason=row.failure_reason,
        created_at=row.created_at,
    )
