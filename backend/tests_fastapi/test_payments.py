import asyncio
import inspect
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import func, inspect as inspect_sa, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.payments import (
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    FinanceLedgerEntry,
    PaymentProviderEvent,
    PaymentTransaction,
    PaymentVerificationAttempt,
    StripeWebhookEvent,
)
from app.models.users import User
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME, create_token
from app.services import payment_lifecycle
from app.services.stripe_service import CheckoutSessionCreation

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_payment_lifecycle_stays_out_of_router():
    import app.routers.payments as payments_router

    router_source = inspect.getsource(payments_router)
    lifecycle_source = inspect.getsource(payment_lifecycle)

    assert "create_checkout_state(" in inspect.getsource(payments_router.create_checkout)
    assert "verify_checkout_session_state(" in inspect.getsource(payments_router.verify_session)
    assert "process_stripe_webhook_event(" in inspect.getsource(payments_router.stripe_webhook)
    assert "StripeWebhookEvent(" not in router_source
    assert "PaymentVerificationAttempt(" not in router_source
    assert "IntegrityError" not in router_source
    assert "await db.commit()" not in router_source
    assert "db.add(" not in router_source
    assert "apply_paid_checkout_by_user_id" not in router_source
    assert "revoke_paid_access_by_customer_id" not in router_source
    assert "stripe_metadata_user_id" not in router_source
    assert "async def record_stripe_webhook_event_once" in lifecycle_source
    assert "async def record_payment_verification_attempt_once" in lifecycle_source
    assert "async def process_stripe_webhook_event" in lifecycle_source
    assert "charge.dispute.created" in lifecycle_source
    assert "stripe_metadata_user_id" in lifecycle_source


def test_payment_verification_attempt_model_and_migration_are_declared():
    constraints = {constraint.name for constraint in PaymentVerificationAttempt.__table__.constraints}
    columns = PaymentVerificationAttempt.__table__.columns
    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentVerificationAttempt.__table__.indexes
    }

    assert "uq_payment_verification_attempts_user_session" in constraints
    assert "idempotency_key" not in columns
    assert columns["status"].default.arg == "pending"
    assert columns["status"].server_default.arg == "pending"
    assert columns["is_pro_result"].nullable is True
    assert columns["response_status_code"].nullable is True
    assert columns["response_detail"].nullable is True
    assert columns["completed_at"].nullable is True
    assert indexes["ix_payment_verification_attempts_user_created"] == ("user_id", "created_at")

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0041_payment_verification_attempts.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0040"' in migration_text
    assert "payment_verification_attempts" in migration_text
    assert "uq_payment_verification_attempts_user_session_key" in migration_text

    result_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0051_payment_verification_attempt_results.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0050"' in result_migration_text
    assert "is_pro_result" in result_migration_text
    assert "response_status_code" in result_migration_text
    assert "UPDATE payment_verification_attempts" in result_migration_text

    session_key_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0053_payment_verification_session_key.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0052"' in session_key_migration_text
    assert "uq_payment_verification_attempts_user_session" in session_key_migration_text
    assert "idempotency_key" in session_key_migration_text


def test_provider_neutral_payment_models_and_migration_are_declared():
    transaction_columns = PaymentTransaction.__table__.columns
    transaction_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentTransaction.__table__.indexes
    }
    transaction_constraints = {constraint.name for constraint in PaymentTransaction.__table__.constraints}

    assert transaction_columns["provider"].nullable is False
    assert transaction_columns["rail"].nullable is False
    assert transaction_columns["status"].server_default.arg == "draft"
    assert transaction_columns["currency"].server_default.arg == "MAD"
    assert transaction_columns["open_request_key"].nullable is True
    assert transaction_columns["instructions_json"].nullable is True
    assert transaction_columns["provider_payload_json"].nullable is True
    assert transaction_columns["confirmed_at"].nullable is True
    assert "uq_payment_transactions_reference_code" in transaction_constraints
    assert "uq_payment_transactions_open_request_key" in transaction_constraints
    assert "ck_payment_transactions_provider" in transaction_constraints
    assert "ck_payment_transactions_rail" in transaction_constraints
    assert "ck_payment_transactions_status" in transaction_constraints
    assert "ck_payment_transactions_currency" in transaction_constraints
    assert transaction_indexes["ix_payment_transactions_user_status"] == ("user_id", "status")
    assert transaction_indexes["ix_payment_transactions_provider_status"] == ("provider", "status")
    assert transaction_indexes["ix_payment_transactions_rail_status"] == ("rail", "status")

    provider_event_constraints = {constraint.name for constraint in PaymentProviderEvent.__table__.constraints}
    provider_event_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentProviderEvent.__table__.indexes
    }
    assert "uq_payment_provider_events_provider_event" in provider_event_constraints
    assert "ck_payment_provider_events_provider" in provider_event_constraints
    assert "ck_payment_provider_events_status" in provider_event_constraints
    assert provider_event_indexes["ix_payment_provider_events_transaction"] == ("transaction_id",)
    assert provider_event_indexes["ix_payment_provider_events_provider_type"] == ("provider", "event_type")

    ledger_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in FinanceLedgerEntry.__table__.indexes
    }
    ledger_constraints = {constraint.name for constraint in FinanceLedgerEntry.__table__.constraints}
    assert ledger_indexes["ix_finance_ledger_entries_transaction"] == ("transaction_id",)
    assert ledger_indexes["ix_finance_ledger_entries_user_created"] == ("user_id", "created_at")
    assert "ck_finance_ledger_entries_currency" in ledger_constraints

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0054_provider_neutral_payment_tables.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0053"' in migration_text
    assert "payment_transactions" in migration_text
    assert "open_request_key" in migration_text
    assert "ck_payment_transactions_status" in migration_text
    assert "payment_provider_events" in migration_text
    assert "finance_ledger_entries" in migration_text


def test_webhook_requires_secret(app_client):
    response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "x"})
    assert response.status_code == 500
    assert "Webhook secret not configured" in response.text


def _with_webhook_secret(test_settings):
    original = test_settings.stripe_webhook_secret
    test_settings.stripe_webhook_secret = "whsec_test"
    return original


def simulate_stripe_webhook(
    app_client,
    test_settings,
    monkeypatch,
    event_payload: dict | None = None,
    *,
    construct_event_fn=None,
    content: bytes = b"{}",
    signature: str = "sig",
):
    import app.routers.payments as payments_router

    if event_payload is None and construct_event_fn is None:
        raise AssertionError("event_payload or construct_event_fn is required")

    def fake_construct_event(payload, sig, secret):
        assert payload == content
        assert sig == signature
        assert secret == "whsec_test"
        if construct_event_fn is not None:
            return construct_event_fn(payload, sig, secret)
        return event_payload

    monkeypatch.setattr(payments_router.stripe.Webhook, "construct_event", fake_construct_event)
    original_secret = _with_webhook_secret(test_settings)
    try:
        return app_client.post(
            "/api/payments/webhook",
            content=content,
            headers={"stripe-signature": signature},
        )
    finally:
        test_settings.stripe_webhook_secret = original_secret


async def _seed_user(email: str, *, is_pro: bool = False, stripe_customer_id: str = "") -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Payment User",
            is_active=True,
            is_email_verified=True,
            is_pro=is_pro,
            stripe_customer_id=stripe_customer_id,
            password="!",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _get_user(user_id: int) -> User:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one()


async def _set_user_pro(user_id: int, is_pro: bool) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = await db.get(User, user_id)
        user.is_pro = is_pro
        await db.commit()


async def _record_payment_attempt(user_id: int, session_id: str) -> bool:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await payment_lifecycle.record_payment_verification_attempt_once(
            db,
            user_id=user_id,
            session_id=session_id,
        )


async def _complete_payment_attempt(user_id: int, session_id: str, is_pro: bool) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        await payment_lifecycle.complete_payment_verification_attempt(
            db,
            user_id=user_id,
            session_id=session_id,
            is_pro=is_pro,
        )


async def _webhook_event_count(event_id: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        rows = await db.execute(select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event_id))
        return len(rows.scalars().all())


async def _payment_attempt_count(user_id: int, session_id: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(
            select(func.count())
            .select_from(PaymentVerificationAttempt)
            .where(
                PaymentVerificationAttempt.user_id == user_id,
                PaymentVerificationAttempt.session_id == session_id,
            )
        )


async def _payment_transactions_for_user(user_id: int) -> list[PaymentTransaction]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(PaymentTransaction).where(PaymentTransaction.user_id == user_id))
        return list(result.scalars().all())


def _install_cookie_session(app_client, test_settings, token: str, user_id: int, *, with_csrf: bool) -> str:
    app_client.cookies.set(AUTH_COOKIE_NAME, token)
    if not with_csrf:
        app_client.cookies.set(CSRF_COOKIE_NAME, "")
        return ""

    csrf_token = csrf_token_for_user(SimpleNamespace(id=user_id, auth_token_version=0), test_settings)
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    return csrf_token


def test_create_checkout_session_persists_new_customer_id(app_client, auth_token, monkeypatch, run_db):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="checkout-router-new@example.com")
    calls = []

    async def fake_create_checkout_session(user, plan, settings, **return_paths):
        orm_session = inspect_sa(user).session
        assert orm_session is None or not orm_session.in_transaction()
        calls.append({"user_id": user.id, "plan": plan, **return_paths})
        assert user.stripe_customer_id == ""
        return CheckoutSessionCreation(
            checkout_url="https://checkout.example/router-created",
            customer_id="cus_router_created",
        )

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    response = app_client.post(
        "/api/payments/create-checkout-session?plan=pro",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.example/router-created"}
    assert calls == [{
        "user_id": user_id,
        "plan": "pro",
        "success_path": "/payment-success?session_id={CHECKOUT_SESSION_ID}",
        "cancel_path": "/pricing",
    }]
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_router_created"


def test_create_checkout_session_accepts_return_paths_in_body(app_client, auth_token, monkeypatch):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="checkout-router-return-paths@example.com")
    calls = []

    async def fake_create_checkout_session(user, plan, settings, **return_paths):
        del settings
        calls.append({"user_id": user.id, "plan": plan, **return_paths})
        return CheckoutSessionCreation(checkout_url="https://checkout.example/return-paths")

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    response = app_client.post(
        "/api/payments/create-checkout-session",
        json={
            "plan": "pro",
            "success_path": "/payment-success?return_to=/topics/42",
            "cancel_path": "/topics/42",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.example/return-paths"}
    assert calls == [{
        "user_id": user_id,
        "plan": "pro",
        "success_path": "/payment-success?return_to=/topics/42",
        "cancel_path": "/topics/42",
    }]


def test_cookie_checkout_session_requires_and_accepts_csrf_token(app_client, auth_token, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="checkout-router-csrf@example.com")
    calls = []

    async def fake_create_checkout_session(user, plan, settings, **return_paths):
        del settings
        calls.append({"user_id": user.id, "plan": plan, **return_paths})
        return CheckoutSessionCreation(checkout_url="https://checkout.example/csrf")

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=False)

    missing = app_client.post(
        "/api/payments/create-checkout-session?plan=pro",
        headers={"Origin": "http://localhost:3000"},
    )

    assert missing.status_code == 403
    assert missing.json()["detail"] == "CSRF token is required for cookie-authenticated writes"
    assert calls == []

    csrf_token = _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=True)
    accepted = app_client.post(
        "/api/payments/create-checkout-session?plan=pro",
        headers={"Origin": "http://localhost:3000", CSRF_HEADER_NAME: csrf_token},
    )

    assert accepted.status_code == 200
    assert accepted.json() == {"checkout_url": "https://checkout.example/csrf"}
    assert calls == [{
        "user_id": user_id,
        "plan": "pro",
        "success_path": "/payment-success?session_id={CHECKOUT_SESSION_ID}",
        "cancel_path": "/pricing",
    }]


def test_cookie_verify_session_requires_and_accepts_csrf_token(app_client, auth_token, test_settings, monkeypatch):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    token, user_id = auth_token(email="verify-router-csrf@example.com")
    calls = []

    async def fake_verify_checkout_session(session_id, settings):
        del settings
        calls.append(session_id)
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_verify_csrf")

    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)
    _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=False)

    missing = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_verify_csrf"},
        headers={"Origin": "http://localhost:3000"},
    )

    assert missing.status_code == 403
    assert missing.json()["detail"] == "CSRF token is required for cookie-authenticated writes"
    assert calls == []

    csrf_token = _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=True)
    accepted = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_verify_csrf"},
        headers={
            "Origin": "http://localhost:3000",
            CSRF_HEADER_NAME: csrf_token,
        },
    )

    assert accepted.status_code == 200
    assert accepted.json()["is_pro"] is True
    assert calls == ["cs_verify_csrf"]


def test_create_bank_transfer_payment_request_is_pending_and_does_not_grant_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="bank-transfer-request@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_method"] == PAYMENT_RAIL_BANK_TRANSFER
    assert payload["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert payload["plan"] == "pro"
    assert payload["amount_centimes"] == 9900
    assert payload["currency"] == "MAD"
    assert payload["reference_code"].startswith(f"KRESCO-VIR-{user_id}-")
    assert payload["instructions"]["unlock_policy"] == (
        "Access is unlocked only after finance confirmation or matched reconciliation."
    )

    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    assert transactions[0].rail == PAYMENT_RAIL_BANK_TRANSFER
    assert transactions[0].status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert transactions[0].instructions_json["reference_code"] == payload["reference_code"]


def test_create_cashplus_payment_request_is_pending_and_does_not_grant_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="cashplus-request@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_method"] == PAYMENT_RAIL_CASHPLUS
    assert payload["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert payload["reference_code"].startswith(f"KRESCO-CASH-{user_id}-")
    assert payload["instructions"]["title"] == "CashPlus"

    assert run_db(_get_user(user_id)).is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    assert transactions[0].rail == PAYMENT_RAIL_CASHPLUS
    assert transactions[0].status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW


def test_create_payment_request_reuses_existing_open_manual_request(app_client, auth_token, run_db):
    token, user_id = auth_token(email="manual-payment-idempotent@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    body = {"payment_method": "bank-transfer", "plan": "pro"}

    first = app_client.post("/api/payments/payment-requests", json=body, headers=headers)
    second = app_client.post("/api/payments/payment-requests", json=body, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["reference_code"] == first.json()["reference_code"]

    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    assert transactions[0].open_request_key == f"manual:{user_id}:bank_transfer:pro"
    assert run_db(_get_user(user_id)).is_pro is False


def test_create_payment_request_rejects_cmi_until_adapter_is_configured(app_client, auth_token, run_db):
    token, user_id = auth_token(email="cmi-not-configured@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cmi", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503
    assert "CMI payments are not configured yet" in response.text
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_payment_transactions_for_user(user_id)) == []


def test_create_payment_request_rejects_unknown_method(app_client, auth_token):
    token, _user_id = auth_token(email="payment-request-invalid-method@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "crypto", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
    assert "payment_method must be one of" in response.text


def test_create_payment_request_rejects_unknown_plan(app_client, auth_token, run_db):
    token, user_id = auth_token(email="payment-request-invalid-plan@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "vip"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert "Invalid payment plan" in response.text
    assert run_db(_payment_transactions_for_user(user_id)) == []


def test_get_verify_session_is_non_mutating_compatibility_status(app_client, auth_token, monkeypatch, run_db):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="verify-router-get-compat@example.com")

    async def unexpected_verify_checkout_session(session_id, settings):
        del session_id, settings
        raise AssertionError("GET verification compatibility route must not call Stripe")

    monkeypatch.setattr(payments_router, "verify_checkout_session", unexpected_verify_checkout_session)

    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_get_compat",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"is_pro": False}
    assert run_db(_payment_attempt_count(user_id, "cs_get_compat")) == 0
    assert run_db(_get_user(user_id)).is_pro is False


def test_verify_session_commits_before_remote_stripe_lookup(app_client, auth_token, monkeypatch):
    import app.routers.payments as payments_router

    token, _user_id = auth_token(email="verify-router-commit@example.com")
    original_commit = AsyncSession.commit
    commits = {"count": 0}

    async def tracking_commit(self):
        commits["count"] += 1
        await original_commit(self)

    async def fake_verify_checkout_session(session_id, settings):
        del settings
        assert session_id == "cs_test_commit"
        assert commits["count"] >= 1
        return SimpleNamespace(is_paid=False, user_id=None, customer_id="")

    monkeypatch.setattr(AsyncSession, "commit", tracking_commit)
    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)

    response = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_test_commit"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200


def test_verify_session_accepts_request_without_idempotency_key(app_client, auth_token, monkeypatch):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    token, user_id = auth_token(email="verify-no-idempotency@example.com")

    async def fake_verify_checkout_session(session_id, settings):
        del settings
        assert session_id == "cs_no_idempotency"
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_no_idempotency")

    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)

    response = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_no_idempotency"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["is_pro"] is True


def test_verify_session_duplicate_session_suppresses_remote_replay(
    app_client,
    auth_token,
    monkeypatch,
    run_db,
):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    token, user_id = auth_token(email="verify-idempotent@example.com")
    calls = {"count": 0}

    async def fake_verify_checkout_session(session_id, settings):
        del settings
        calls["count"] += 1
        assert session_id == "cs_idempotent"
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_idempotent")

    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post("/api/payments/verify-session", json={"session_id": "cs_idempotent"}, headers=headers)
    second = app_client.post("/api/payments/verify-session", json={"session_id": "cs_idempotent"}, headers=headers)

    assert first.status_code == 200
    assert first.json()["is_pro"] is True
    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 1

    assert run_db(_payment_attempt_count(user_id, "cs_idempotent")) == 1


def test_verify_session_duplicate_session_replays_recorded_result(test_settings, run_db):
    user_id = run_db(_seed_user("verify-duplicate-refresh@example.com", is_pro=False))
    assert run_db(_record_payment_attempt(user_id, "cs_refresh")) is True
    run_db(_complete_payment_attempt(user_id, "cs_refresh", True))

    async def duplicate_verification_after_external_update() -> bool:
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            assert user is not None
            assert user.is_pro is False

            async def unexpected_verify_checkout_session(session_id, settings):
                del session_id, settings
                raise AssertionError("duplicate session verification must not replay Stripe verification")

            result = await payment_lifecycle.verify_checkout_session_state(
                db,
                user=user,
                session_id="cs_refresh",
                settings=test_settings,
                verify_checkout_session_fn=unexpected_verify_checkout_session,
            )
            return result.is_pro

    assert run_db(duplicate_verification_after_external_update()) is True


def test_verify_session_unpaid_result_can_be_retried_after_payment_completes(
    app_client,
    auth_token,
    monkeypatch,
    run_db,
):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    token, user_id = auth_token(email="verify-unpaid-then-paid@example.com")
    calls = {"count": 0}

    async def changing_verify_checkout_session(session_id, settings):
        del settings
        calls["count"] += 1
        assert session_id == "cs_unpaid_then_paid"
        if calls["count"] == 1:
            return CheckoutSessionVerification(is_paid=False, user_id=user_id, customer_id="cus_pending")
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_paid_later")

    monkeypatch.setattr(payments_router, "verify_checkout_session", changing_verify_checkout_session)
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post("/api/payments/verify-session", json={"session_id": "cs_unpaid_then_paid"}, headers=headers)

    assert first.status_code == 200
    assert first.json()["is_pro"] is False
    assert run_db(_payment_attempt_count(user_id, "cs_unpaid_then_paid")) == 0

    second = app_client.post("/api/payments/verify-session", json={"session_id": "cs_unpaid_then_paid"}, headers=headers)

    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 2
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_paid_later"


def test_verify_session_retryable_stripe_failure_replays_completed_attempt(
    app_client,
    auth_token,
    monkeypatch,
    run_db,
):
    import app.services.stripe_service as stripe_service

    token, user_id = auth_token(email="verify-retryable@example.com")
    calls = {"count": 0}

    class FakeRetryableSessions:
        def retrieve(self, session_id):
            calls["count"] += 1
            if calls["count"] == 1:
                raise stripe_service.stripe.APIConnectionError("temporary transport failure", should_retry=True)
            return SimpleNamespace(
                id=session_id,
                payment_status="paid",
                metadata={"user_id": str(user_id)},
                customer="cus_retryable",
            )

    fake_client = SimpleNamespace(
        v1=SimpleNamespace(
            checkout=SimpleNamespace(sessions=FakeRetryableSessions()),
        )
    )
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: fake_client)
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post("/api/payments/verify-session", json={"session_id": "cs_retryable"}, headers=headers)

    assert first.status_code == 200
    assert first.json()["is_pro"] is True
    assert calls["count"] == 2
    assert run_db(_payment_attempt_count(user_id, "cs_retryable")) == 1

    second = app_client.post("/api/payments/verify-session", json={"session_id": "cs_retryable"}, headers=headers)

    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 2
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_retryable"
    assert run_db(_payment_attempt_count(user_id, "cs_retryable")) == 1


def test_verify_session_provider_failure_releases_session_attempt_for_retry(
    app_client,
    auth_token,
    monkeypatch,
    run_db,
):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification, VERIFY_CHECKOUT_UNAVAILABLE_DETAIL

    token, user_id = auth_token(email="verify-provider-retry@example.com")
    calls = {"count": 0}

    async def flaky_verify_checkout_session(session_id, settings):
        del settings
        calls["count"] += 1
        assert session_id == "cs_provider_retry"
        if calls["count"] == 1:
            raise HTTPException(status_code=503, detail=VERIFY_CHECKOUT_UNAVAILABLE_DETAIL)
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_provider_retry")

    monkeypatch.setattr(payments_router, "verify_checkout_session", flaky_verify_checkout_session)
    headers = {"Authorization": f"Bearer {token}"}

    first = app_client.post("/api/payments/verify-session", json={"session_id": "cs_provider_retry"}, headers=headers)

    assert first.status_code == 503
    assert run_db(_payment_attempt_count(user_id, "cs_provider_retry")) == 0

    second = app_client.post("/api/payments/verify-session", json={"session_id": "cs_provider_retry"}, headers=headers)

    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 2
    assert run_db(_payment_attempt_count(user_id, "cs_provider_retry")) == 1


def test_concurrent_verify_session_duplicates_wait_for_recorded_result(test_settings, run_db):
    from app.services.stripe_service import CheckoutSessionVerification

    user_id = run_db(_seed_user("verify-concurrent@example.com"))

    async def scenario() -> tuple[list[bool], int]:
        session_factory = get_session_factory()
        remote_started = asyncio.Event()
        release_remote = asyncio.Event()
        calls = {"count": 0}

        async def fake_verify_checkout_session(session_id, settings):
            del settings
            calls["count"] += 1
            assert session_id == "cs_concurrent"
            remote_started.set()
            await release_remote.wait()
            return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_concurrent")

        async def call_verify() -> bool:
            async with session_factory() as db:
                user = await db.get(User, user_id)
                result = await payment_lifecycle.verify_checkout_session_state(
                    db,
                    user=user,
                    session_id="cs_concurrent",
                    settings=test_settings,
                    verify_checkout_session_fn=fake_verify_checkout_session,
                )
                return result.is_pro

        first = asyncio.create_task(call_verify())
        await remote_started.wait()
        second = asyncio.create_task(call_verify())
        await asyncio.sleep(0)
        release_remote.set()
        return list(await asyncio.gather(first, second)), calls["count"]

    results, call_count = run_db(scenario())

    assert results == [True, True]
    assert call_count == 1
    assert run_db(_payment_attempt_count(user_id, "cs_concurrent")) == 1


def test_create_checkout_session_reuses_existing_customer_id(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-router-existing@example.com", stripe_customer_id="cus_existing"))
    token = create_token(user_id, test_settings)
    calls = []

    async def fake_create_checkout_session(user, plan, settings, **return_paths):
        calls.append({"customer_id": user.stripe_customer_id, "plan": plan, **return_paths})
        return CheckoutSessionCreation(
            checkout_url="https://checkout.example/router-existing",
            customer_id="cus_existing",
        )

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    response = app_client.post(
        "/api/payments/create-checkout-session",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.example/router-existing"}
    assert calls == [{
        "customer_id": "cus_existing",
        "plan": "pro",
        "success_path": "/payment-success?session_id={CHECKOUT_SESSION_ID}",
        "cancel_path": "/pricing",
    }]
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_existing"


def test_create_checkout_session_rejects_unknown_plan(app_client, auth_token):
    token, _ = auth_token(email="checkout-router-plan@example.com")

    response = app_client.post(
        "/api/payments/create-checkout-session?plan=yearly",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert "Invalid plan" in response.text


def test_create_checkout_session_returns_unavailable_when_config_missing(app_client, auth_token, test_settings):
    token, _ = auth_token(email="checkout-router-config@example.com")
    original_sk = test_settings.stripe_sk
    original_product = test_settings.stripe_product_id

    try:
        test_settings.stripe_sk = ""
        test_settings.stripe_product_id = ""
        response = app_client.post(
            "/api/payments/create-checkout-session",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        test_settings.stripe_sk = original_sk
        test_settings.stripe_product_id = original_product

    assert response.status_code == 503
    assert "Stripe checkout is not configured" in response.text


def test_webhook_checkout_completed_marks_user_pro(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("checkout-completed@example.com"))

    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_checkout", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
        },
    )

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_checkout"


def test_webhook_checkout_completed_ignores_unpaid_session(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("checkout-unpaid@example.com"))

    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_unpaid", "payment_status": "unpaid", "metadata": {"user_id": str(user_id)}}},
        },
    )

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    assert user.stripe_customer_id == ""


def test_verify_session_rejects_paid_session_for_different_user(app_client, auth_token, monkeypatch, run_db):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    caller_token, caller_id = auth_token(email="verify-caller@example.com")
    other_user_id = run_db(_seed_user("verify-owner@example.com"))

    async def fake_verify_checkout_session(session_id, settings):
        assert session_id == "cs_wrong_user"
        return CheckoutSessionVerification(is_paid=True, user_id=other_user_id, customer_id="cus_other")

    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)
    response = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_wrong_user"},
        headers={"Authorization": f"Bearer {caller_token}"},
    )

    assert response.status_code == 403
    assert run_db(_get_user(caller_id)).is_pro is False


def test_verify_session_upgrades_matching_paid_user(app_client, auth_token, monkeypatch, run_db):
    import app.routers.payments as payments_router
    from app.services.stripe_service import CheckoutSessionVerification

    token, user_id = auth_token(email="verify-matching-user@example.com")

    async def fake_verify_checkout_session(session_id, settings):
        assert session_id == "cs_matching_user"
        return CheckoutSessionVerification(is_paid=True, user_id=user_id, customer_id="cus_matching")

    monkeypatch.setattr(payments_router, "verify_checkout_session", fake_verify_checkout_session)
    response = app_client.post(
        "/api/payments/verify-session",
        json={"session_id": "cs_matching_user"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["is_pro"] is True
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_matching"


def test_webhook_checkout_completed_preserves_existing_customer_when_missing(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("checkout-existing-customer@example.com", stripe_customer_id="cus_existing"))

    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
        },
    )

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_existing"


def test_webhook_checkout_completed_ignores_malformed_user_id(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("checkout-malformed-user@example.com", is_pro=False))
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_malformed", "payment_status": "paid", "metadata": {"user_id": "not-a-number"}}},
        },
    )

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    assert user.stripe_customer_id == ""


def test_webhook_subscription_deleted_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("subscription-deleted@example.com", is_pro=True, stripe_customer_id="cus_deleted"))
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {"type": "customer.subscription.deleted", "data": {"object": {"customer": "cus_deleted"}}},
    )

    assert response.status_code == 200
    assert run_db(_get_user(user_id)).is_pro is False


def test_webhook_invoice_payment_failed_does_not_revoke_during_dunning(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("invoice-failed@example.com", is_pro=True, stripe_customer_id="cus_failed"))
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {"type": "invoice.payment_failed", "data": {"object": {"customer": "cus_failed"}}},
    )

    assert response.status_code == 200
    assert run_db(_get_user(user_id)).is_pro is True


def test_webhook_charge_refunded_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("charge-refunded@example.com", is_pro=True, stripe_customer_id="cus_refunded"))
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {"type": "charge.refunded", "data": {"object": {"customer": "cus_refunded"}}},
    )

    assert response.status_code == 200
    assert run_db(_get_user(user_id)).is_pro is False


def test_webhook_charge_dispute_created_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("charge-dispute@example.com", is_pro=True, stripe_customer_id="cus_disputed"))
    lookups = []

    async def fake_customer_id_for_charge(charge_id, settings):
        lookups.append(charge_id)
        return "cus_disputed"

    monkeypatch.setattr(payments_router, "customer_id_for_charge", fake_customer_id_for_charge)
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {"type": "charge.dispute.created", "data": {"object": {"charge": "ch_disputed"}}},
    )

    assert response.status_code == 200
    assert lookups == ["ch_disputed"]
    assert run_db(_get_user(user_id)).is_pro is False


def test_webhook_charge_dispute_lookup_failure_retries_without_recording_event(
    app_client, test_settings, monkeypatch, run_db
):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("charge-dispute-retry@example.com", is_pro=True, stripe_customer_id="cus_retry"))
    lookups = {"count": 0}

    async def fake_customer_id_for_charge(charge_id, settings):
        del settings
        assert charge_id == "ch_retry"
        lookups["count"] += 1
        return "" if lookups["count"] == 1 else "cus_retry"

    monkeypatch.setattr(payments_router, "customer_id_for_charge", fake_customer_id_for_charge)
    dispute_event = {
        "id": "evt_dispute_retry",
        "type": "charge.dispute.created",
        "data": {"object": {"charge": "ch_retry"}},
    }
    first = simulate_stripe_webhook(app_client, test_settings, monkeypatch, dispute_event)
    second = simulate_stripe_webhook(app_client, test_settings, monkeypatch, dispute_event)

    assert first.status_code == 503
    assert "temporarily unavailable" in first.text
    assert second.status_code == 200
    assert lookups["count"] == 2
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_webhook_event_count("evt_dispute_retry")) == 1


def test_webhook_resolves_dispute_customer_before_recording_event(app_client, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    lookup_seen = {"value": False}

    async def fake_customer_id_for_charge(charge_id, settings):
        del settings
        assert charge_id == "ch_order"
        lookup_seen["value"] = True
        return "cus_order"

    async def fake_record_once(db, event_id, event_type):
        del db
        assert event_id == "evt_dispute_order"
        assert event_type == "charge.dispute.created"
        assert lookup_seen["value"] is True
        return True

    monkeypatch.setattr(payments_router, "customer_id_for_charge", fake_customer_id_for_charge)
    monkeypatch.setattr(payments_router, "_record_stripe_webhook_event_once", fake_record_once)
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        {
            "id": "evt_dispute_order",
            "type": "charge.dispute.created",
            "data": {"object": {"customer": "", "charge": "ch_order"}},
        },
    )

    assert response.status_code == 200


def test_webhook_duplicate_event_id_does_not_replay_side_effects(app_client, test_settings, monkeypatch, run_db):
    user_id = run_db(_seed_user("checkout-duplicate-event@example.com"))
    duplicate_event = {
        "id": "evt_duplicate_checkout",
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_duplicate", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
    }
    first = simulate_stripe_webhook(app_client, test_settings, monkeypatch, duplicate_event)
    run_db(_set_user_pro(user_id, False))
    duplicate = simulate_stripe_webhook(app_client, test_settings, monkeypatch, duplicate_event)

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_webhook_event_count("evt_duplicate_checkout")) == 1


def test_webhook_rejects_invalid_signature(app_client, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    def raise_signature_error(*_):
        raise payments_router.stripe.SignatureVerificationError("bad signature", "sig")

    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        construct_event_fn=raise_signature_error,
    )

    assert response.status_code == 400
    assert "Invalid Stripe signature" in response.text


def test_webhook_rejects_invalid_payload(app_client, test_settings, monkeypatch):
    response = simulate_stripe_webhook(
        app_client,
        test_settings,
        monkeypatch,
        construct_event_fn=lambda *_: (_ for _ in ()).throw(ValueError()),
        content=b"not-json",
    )

    assert response.status_code == 400
    assert "Invalid payload" in response.text
