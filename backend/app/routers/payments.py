import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_staff_user, get_current_superuser, get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.payments import (
    CheckoutCreateIn,
    CheckoutOut,
    FinanceLedgerEntryOut,
    ManualPaymentProofIn,
    ManualPaymentReconciliationIn,
    ManualPaymentReviewIn,
    ManualPaymentTransactionOut,
    PaymentProviderEventOut,
    PaymentRequestCreateIn,
    PaymentRequestOut,
    PaymentReconciliationImportIn,
    PaymentReconciliationImportOut,
    PaymentReconciliationImportSummaryOut,
    VerifyIn,
    VerifyOut,
)
from app.services.payment_gateway import (
    approve_manual_payment_transaction,
    create_payment_request as create_provider_payment_request,
    get_current_payment_request as get_current_provider_payment_request,
    import_manual_payment_reconciliation,
    list_finance_ledger_entries,
    list_manual_payment_transactions,
    list_payment_provider_events,
    list_payment_reconciliation_imports,
    process_cmi_callback,
    reconcile_manual_payment_transaction,
    reject_manual_payment_transaction,
    submit_manual_payment_proof,
)
from app.services.payment_lifecycle import (
    create_checkout_state,
    process_stripe_webhook_event,
    record_stripe_webhook_event_once as _record_stripe_webhook_event_once,
    verify_checkout_session_state,
)
from app.services.stripe_service import create_checkout_session, customer_id_for_charge, verify_checkout_session

router = APIRouter(tags=["Payments"])
LEGACY_STRIPE_CHECKOUT_DISABLED_DETAIL = "Legacy Stripe checkout is disabled"


@router.post("/create-checkout-session", response_model=CheckoutOut)
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    plan: str = "pro",
    checkout: CheckoutCreateIn | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    if not settings.legacy_stripe_checkout_enabled:
        raise HTTPException(status_code=410, detail=LEGACY_STRIPE_CHECKOUT_DISABLED_DETAIL)
    return await create_checkout_state(
        db,
        user=user,
        plan=checkout.plan if checkout is not None else plan,
        success_path=checkout.success_path if checkout is not None else CheckoutCreateIn().success_path,
        cancel_path=checkout.cancel_path if checkout is not None else CheckoutCreateIn().cancel_path,
        settings=settings,
        create_checkout_session_fn=create_checkout_session,
    )


@router.post("/payment-requests", response_model=PaymentRequestOut)
@limiter.limit("10/minute")
async def create_payment_request(
    request: Request,
    payment_request: PaymentRequestCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await create_provider_payment_request(
        db,
        user=user,
        payment_method=payment_request.payment_method,
        plan=payment_request.plan,
        settings=settings,
    )


@router.get("/payment-requests/current", response_model=PaymentRequestOut | None)
async def get_current_payment_request(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_current_provider_payment_request(db, user=user, plan="pro")


@router.get("/manual-payment-requests", response_model=list[ManualPaymentTransactionOut])
async def list_manual_payment_requests(
    status: str = "pending_manual_review",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await list_manual_payment_transactions(db, status=status, limit=limit)


@router.get("/finance/ledger", response_model=list[FinanceLedgerEntryOut])
async def list_finance_ledger(
    transaction_id: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await list_finance_ledger_entries(db, transaction_id=transaction_id, limit=limit)


@router.get("/finance/provider-events", response_model=list[PaymentProviderEventOut])
async def list_finance_provider_events(
    transaction_id: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await list_payment_provider_events(db, transaction_id=transaction_id, limit=limit)


@router.get("/manual-payment-reconciliation-imports", response_model=list[PaymentReconciliationImportSummaryOut])
async def list_manual_payment_reconciliation_imports(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await list_payment_reconciliation_imports(db, limit=limit)


@router.post("/manual-payment-requests/reconcile", response_model=ManualPaymentTransactionOut)
@limiter.limit("20/minute")
async def reconcile_manual_payment_request(
    request: Request,
    reconciliation: ManualPaymentReconciliationIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(get_current_superuser),
):
    del request
    return await reconcile_manual_payment_transaction(
        db,
        actor=staff,
        reconciliation=reconciliation,
    )


@router.post("/manual-payment-reconciliation-imports", response_model=PaymentReconciliationImportOut)
@limiter.limit("5/minute")
async def import_manual_payment_reconciliation_request(
    request: Request,
    reconciliation_import: PaymentReconciliationImportIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(get_current_superuser),
):
    del request
    return await import_manual_payment_reconciliation(
        db,
        actor=staff,
        reconciliation_import=reconciliation_import,
    )


@router.post("/manual-payment-requests/{transaction_id}/proof", response_model=ManualPaymentTransactionOut)
@limiter.limit("10/minute")
async def submit_manual_payment_request_proof(
    request: Request,
    transaction_id: int,
    proof: ManualPaymentProofIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await submit_manual_payment_proof(
        db,
        transaction_id=transaction_id,
        user=user,
        proof=proof,
    )


@router.post("/manual-payment-requests/{transaction_id}/approve", response_model=ManualPaymentTransactionOut)
@limiter.limit("20/minute")
async def approve_manual_payment_request(
    request: Request,
    transaction_id: int,
    review: ManualPaymentReviewIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(get_current_superuser),
):
    del request
    return await approve_manual_payment_transaction(
        db,
        transaction_id=transaction_id,
        actor=staff,
        reason=review.reason,
    )


@router.post("/manual-payment-requests/{transaction_id}/reject", response_model=ManualPaymentTransactionOut)
@limiter.limit("20/minute")
async def reject_manual_payment_request(
    request: Request,
    transaction_id: int,
    review: ManualPaymentReviewIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(get_current_superuser),
):
    del request
    return await reject_manual_payment_transaction(
        db,
        transaction_id=transaction_id,
        actor=staff,
        reason=review.reason,
    )


@router.post("/verify-session", response_model=VerifyOut)
@limiter.limit("20/minute")
async def verify_session(
    request: Request,
    verification: VerifyIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await verify_checkout_session_state(
        db,
        user=user,
        session_id=verification.session_id,
        settings=settings,
        verify_checkout_session_fn=verify_checkout_session,
    )


@router.get("/verify-session", response_model=VerifyOut)
@limiter.limit("20/minute")
async def verify_session_status(
    request: Request,
    session_id: str = "",
    user: User = Depends(get_current_user),
):
    del request, session_id
    return VerifyOut(is_pro=bool(user.is_pro))


@router.post("/cmi/callback", response_class=PlainTextResponse)
async def cmi_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    form = await request.form()
    result = await process_cmi_callback(
        db,
        settings=settings,
        payload={key: str(value) for key, value in form.multi_items()},
    )
    return PlainTextResponse(result)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    return await process_stripe_webhook_event(
        db,
        settings=settings,
        payload=payload,
        signature=sig,
        construct_event_fn=stripe.Webhook.construct_event,
        customer_id_for_charge_fn=customer_id_for_charge,
        record_webhook_event_once_fn=_record_stripe_webhook_event_once,
    )
