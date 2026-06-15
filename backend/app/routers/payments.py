import stripe
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_staff_user, get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.payments import (
    CheckoutCreateIn,
    CheckoutOut,
    ManualPaymentReviewIn,
    ManualPaymentTransactionOut,
    PaymentRequestCreateIn,
    PaymentRequestOut,
    VerifyIn,
    VerifyOut,
)
from app.services.payment_gateway import (
    approve_manual_payment_transaction,
    create_payment_request as create_provider_payment_request,
    list_manual_payment_transactions,
    reject_manual_payment_transaction,
)
from app.services.payment_lifecycle import (
    create_checkout_state,
    process_stripe_webhook_event,
    record_stripe_webhook_event_once as _record_stripe_webhook_event_once,
    verify_checkout_session_state,
)
from app.services.stripe_service import create_checkout_session, customer_id_for_charge, verify_checkout_session

router = APIRouter(tags=["Payments"])


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


@router.get("/manual-payment-requests", response_model=list[ManualPaymentTransactionOut])
async def list_manual_payment_requests(
    status: str = "pending_manual_review",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await list_manual_payment_transactions(db, status=status, limit=limit)


@router.post("/manual-payment-requests/{transaction_id}/approve", response_model=ManualPaymentTransactionOut)
@limiter.limit("20/minute")
async def approve_manual_payment_request(
    request: Request,
    transaction_id: int,
    review: ManualPaymentReviewIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(get_current_staff_user),
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
    staff: User = Depends(get_current_staff_user),
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
