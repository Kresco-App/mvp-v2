import csv
import hashlib
import io
import json
import unicodedata
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import FinanceExport, FinanceLedgerEntry, PaymentProviderEvent, PaymentReconciliationImport
from app.models.users import User
from app.schemas.payments import FinanceExportCreateIn, FinanceExportOut, FinanceExportSummaryOut

FINANCE_EXPORT_LEDGER = "ledger"
FINANCE_EXPORT_PROVIDER_EVENTS = "provider_events"
FINANCE_EXPORT_RECONCILIATION_IMPORTS = "reconciliation_imports"
FINANCE_EXPORT_KINDS = {
    FINANCE_EXPORT_LEDGER,
    FINANCE_EXPORT_PROVIDER_EVENTS,
    FINANCE_EXPORT_RECONCILIATION_IMPORTS,
}
FINANCE_EXPORT_MAX_ROWS = 500
CSV_CONTENT_TYPE = "text/csv; charset=utf-8"


async def create_finance_export(
    db: AsyncSession,
    *,
    actor: User,
    request: FinanceExportCreateIn,
) -> FinanceExportOut:
    export_kind = request.export_kind
    if export_kind not in FINANCE_EXPORT_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported finance export kind")

    limit = _bounded_export_limit(request.limit)
    filters: dict[str, Any] = {"limit": limit}
    if request.transaction_id is not None:
        filters["transaction_id"] = int(request.transaction_id)

    headers, rows = await _load_export_rows(
        db,
        export_kind=export_kind,
        transaction_id=request.transaction_id,
        limit=limit,
    )
    csv_text = _render_csv(headers, rows)
    checksum = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
    record = FinanceExport(
        export_kind=export_kind,
        status="completed",
        filters_json=filters,
        row_count=len(rows),
        checksum_sha256=checksum,
        created_by_user_id=int(actor.id),
        metadata_json={
            "filename": _export_filename(export_kind=export_kind),
            "content_type": CSV_CONTENT_TYPE,
        },
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return finance_export_out(record, csv_text=csv_text)


async def list_finance_exports(
    db: AsyncSession,
    *,
    limit: int = 50,
) -> list[FinanceExportSummaryOut]:
    result = await db.execute(
        select(FinanceExport)
        .order_by(FinanceExport.created_at.desc(), FinanceExport.id.desc())
        .limit(max(1, min(int(limit), 100)))
    )
    return [finance_export_summary_out(export) for export in result.scalars().all()]


async def _load_export_rows(
    db: AsyncSession,
    *,
    export_kind: str,
    transaction_id: int | None,
    limit: int,
) -> tuple[list[str], list[list[Any]]]:
    if export_kind == FINANCE_EXPORT_LEDGER:
        statement = select(FinanceLedgerEntry).order_by(FinanceLedgerEntry.created_at.desc(), FinanceLedgerEntry.id.desc())
        if transaction_id is not None:
            statement = statement.where(FinanceLedgerEntry.transaction_id == transaction_id)
        result = await db.execute(statement.limit(limit))
        headers = [
            "id",
            "transaction_id",
            "user_id",
            "entry_type",
            "amount_centimes",
            "currency",
            "reason",
            "metadata_json",
            "created_at",
        ]
        rows = [
            [
                entry.id,
                entry.transaction_id,
                entry.user_id,
                entry.entry_type,
                entry.amount_centimes,
                entry.currency,
                entry.reason,
                _json_cell(entry.metadata_json or {}),
                _datetime_cell(entry.created_at),
            ]
            for entry in result.scalars().all()
        ]
        return headers, rows

    if export_kind == FINANCE_EXPORT_PROVIDER_EVENTS:
        statement = select(PaymentProviderEvent).order_by(
            PaymentProviderEvent.received_at.desc(), PaymentProviderEvent.id.desc()
        )
        if transaction_id is not None:
            statement = statement.where(PaymentProviderEvent.transaction_id == transaction_id)
        result = await db.execute(statement.limit(limit))
        headers = [
            "id",
            "transaction_id",
            "provider",
            "event_id",
            "event_type",
            "status",
            "payload_json",
            "received_at",
            "processed_at",
        ]
        rows = [
            [
                event.id,
                event.transaction_id,
                event.provider,
                event.event_id,
                event.event_type,
                event.status,
                _json_cell(event.payload_json or {}),
                _datetime_cell(event.received_at),
                _datetime_cell(event.processed_at),
            ]
            for event in result.scalars().all()
        ]
        return headers, rows

    result = await db.execute(
        select(PaymentReconciliationImport)
        .order_by(PaymentReconciliationImport.created_at.desc(), PaymentReconciliationImport.id.desc())
        .limit(limit)
    )
    headers = [
        "id",
        "provider",
        "payment_method",
        "source_name",
        "status",
        "row_count",
        "matched_count",
        "mismatch_count",
        "unmatched_count",
        "duplicate_count",
        "error_count",
        "created_by_user_id",
        "metadata_json",
        "created_at",
    ]
    rows = [
        [
            item.id,
            item.provider,
            item.rail,
            item.source_name,
            item.status,
            item.row_count,
            item.matched_count,
            item.mismatch_count,
            item.unmatched_count,
            item.duplicate_count,
            item.error_count,
            item.created_by_user_id,
            _json_cell(item.metadata_json or {}),
            _datetime_cell(item.created_at),
        ]
        for item in result.scalars().all()
    ]
    return headers, rows


def finance_export_out(export: FinanceExport, *, csv_text: str) -> FinanceExportOut:
    metadata = export.metadata_json or {}
    return FinanceExportOut(
        **finance_export_summary_out(export).model_dump(),
        filename=str(metadata.get("filename") or _export_filename(export_kind=export.export_kind)),
        content_type=str(metadata.get("content_type") or CSV_CONTENT_TYPE),
        csv_text=csv_text,
    )


def finance_export_summary_out(export: FinanceExport) -> FinanceExportSummaryOut:
    return FinanceExportSummaryOut(
        id=int(export.id),
        export_kind=export.export_kind,
        status=export.status,
        filters=export.filters_json or {},
        row_count=int(export.row_count),
        checksum_sha256=export.checksum_sha256,
        created_by_user_id=int(export.created_by_user_id),
        metadata=export.metadata_json or {},
        created_at=export.created_at,
    )


def _render_csv(headers: list[str], rows: list[list[Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_safe_csv_cell(value) for value in row])
    return output.getvalue()


def _safe_csv_cell(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if _first_csv_significant_character(text) in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


def _first_csv_significant_character(text: str) -> str:
    for character in text:
        if character.isspace() or unicodedata.category(character).startswith("C"):
            continue
        return character
    return ""


def _json_cell(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _datetime_cell(value: datetime | None) -> str:
    return value.isoformat() if value is not None else ""


def _bounded_export_limit(limit: int) -> int:
    return max(1, min(int(limit), FINANCE_EXPORT_MAX_ROWS))


def _export_filename(*, export_kind: str) -> str:
    return f"finance-{export_kind}.csv"
