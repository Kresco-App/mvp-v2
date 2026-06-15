import asyncio
from datetime import datetime, timedelta, timezone
import inspect
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import func, inspect as inspect_sa, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.payments import (
    PAYMENT_PROVIDER_ASHPLUS,
    PAYMENT_PROVIDER_CMI,
    PAYMENT_RAIL_ASHPLUS,
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_RAIL_CMI,
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_MISMATCH,
    PAYMENT_STATUS_PAID,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    PAYMENT_STATUS_PENDING_PROVIDER,
    FinanceLedgerEntry,
    PaymentProviderEvent,
    PaymentReconciliationImport,
    PaymentReconciliationRow,
    PaymentTransaction,
    PaymentTransactionProof,
    PaymentVerificationAttempt,
    StripeWebhookEvent,
)
from app.models.users import User, UserSubjectEntitlement
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME, create_token
from app.services import payment_gateway, payment_lifecycle
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

    proof_columns = PaymentTransactionProof.__table__.columns
    proof_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentTransactionProof.__table__.indexes
    }
    proof_constraints = {constraint.name for constraint in PaymentTransactionProof.__table__.constraints}
    assert proof_columns["transaction_id"].nullable is False
    assert proof_columns["user_id"].nullable is False
    assert proof_columns["status"].server_default.arg == "submitted"
    assert proof_columns["proof_digest"].nullable is False
    assert "uq_payment_transaction_proofs_transaction_digest" in proof_constraints
    assert "ck_payment_transaction_proofs_rail" in proof_constraints
    assert "ck_payment_transaction_proofs_status" in proof_constraints
    assert proof_indexes["ix_payment_transaction_proofs_transaction"] == ("transaction_id",)
    assert proof_indexes["ix_payment_transaction_proofs_user_created"] == ("user_id", "created_at")
    assert proof_indexes["ix_payment_transaction_proofs_rail_status"] == ("rail", "status")

    reconciliation_import_columns = PaymentReconciliationImport.__table__.columns
    reconciliation_import_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentReconciliationImport.__table__.indexes
    }
    reconciliation_import_constraints = {
        constraint.name for constraint in PaymentReconciliationImport.__table__.constraints
    }
    assert reconciliation_import_columns["provider"].nullable is False
    assert reconciliation_import_columns["rail"].nullable is False
    assert reconciliation_import_columns["row_count"].server_default.arg == "0"
    assert "ck_payment_reconciliation_imports_provider" in reconciliation_import_constraints
    assert "ck_payment_reconciliation_imports_rail" in reconciliation_import_constraints
    assert "ck_payment_reconciliation_imports_status" in reconciliation_import_constraints
    assert reconciliation_import_indexes["ix_payment_reconciliation_imports_provider_created"] == (
        "provider",
        "created_at",
    )

    reconciliation_row_columns = PaymentReconciliationRow.__table__.columns
    reconciliation_row_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentReconciliationRow.__table__.indexes
    }
    reconciliation_row_constraints = {constraint.name for constraint in PaymentReconciliationRow.__table__.constraints}
    assert reconciliation_row_columns["import_id"].nullable is False
    assert reconciliation_row_columns["row_number"].nullable is False
    assert reconciliation_row_columns["row_digest"].nullable is False
    assert "uq_payment_reconciliation_rows_import_row" in reconciliation_row_constraints
    assert "ck_payment_reconciliation_rows_provider" in reconciliation_row_constraints
    assert "ck_payment_reconciliation_rows_rail" in reconciliation_row_constraints
    assert "ck_payment_reconciliation_rows_status" in reconciliation_row_constraints
    assert reconciliation_row_indexes["ix_payment_reconciliation_rows_import"] == ("import_id",)
    assert reconciliation_row_indexes["ix_payment_reconciliation_rows_provider_reference"] == (
        "provider",
        "provider_reference",
    )

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0054_provider_neutral_payment_tables.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0053"' in migration_text
    assert "payment_transactions" in migration_text
    assert "open_request_key" in migration_text
    assert "ck_payment_transactions_status" in migration_text
    assert "payment_provider_events" in migration_text
    assert "finance_ledger_entries" in migration_text

    proof_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0059_payment_transaction_proofs.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0058"' in proof_migration_text
    assert "payment_transaction_proofs" in proof_migration_text
    assert "uq_payment_transaction_proofs_transaction_digest" in proof_migration_text

    ashplus_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0060_add_ashplus_payment_rail.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0059"' in ashplus_migration_text
    assert "'ashplus'" in ashplus_migration_text
    assert "get_check_constraints" in ashplus_migration_text
    assert "ck_payment_transactions_provider" in ashplus_migration_text
    assert "ck_payment_transactions_rail" in ashplus_migration_text
    assert "ck_payment_transaction_proofs_rail" in ashplus_migration_text

    reconciliation_migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0061_payment_reconciliation_imports.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0060"' in reconciliation_migration_text
    assert "payment_reconciliation_imports" in reconciliation_migration_text
    assert "payment_reconciliation_rows" in reconciliation_migration_text
    assert "uq_payment_reconciliation_rows_import_row" in reconciliation_migration_text


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


async def _seed_staff_user(email: str, *, is_superuser: bool = False) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Finance Staff",
            is_active=True,
            is_email_verified=True,
            is_staff=True,
            is_superuser=is_superuser,
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


async def _seed_subjects(*titles: str) -> list[int]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        subjects = [
            Subject(title=title, description="", is_published=True, order=index)
            for index, title in enumerate(titles, start=1)
        ]
        db.add_all(subjects)
        await db.commit()
        for subject in subjects:
            await db.refresh(subject)
        return [int(subject.id) for subject in subjects]


async def _subject_entitlements_for_user(user_id: int) -> list[UserSubjectEntitlement]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(UserSubjectEntitlement)
            .where(UserSubjectEntitlement.user_id == user_id)
            .order_by(UserSubjectEntitlement.subject_id.asc())
        )
        return list(result.scalars().all())


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


async def _set_payment_transaction_expired(transaction_id: int) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        transaction = await db.get(PaymentTransaction, transaction_id)
        transaction.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db.commit()


async def _payment_provider_events_for_transaction(transaction_id: int) -> list[PaymentProviderEvent]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(PaymentProviderEvent)
            .where(PaymentProviderEvent.transaction_id == transaction_id)
            .order_by(PaymentProviderEvent.id)
        )
        return list(result.scalars().all())


async def _finance_ledger_entries_for_transaction(transaction_id: int) -> list[FinanceLedgerEntry]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(FinanceLedgerEntry)
            .where(FinanceLedgerEntry.transaction_id == transaction_id)
            .order_by(FinanceLedgerEntry.id)
        )
        return list(result.scalars().all())


async def _payment_proofs_for_transaction(transaction_id: int) -> list[PaymentTransactionProof]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(PaymentTransactionProof)
            .where(PaymentTransactionProof.transaction_id == transaction_id)
            .order_by(PaymentTransactionProof.id)
        )
        return list(result.scalars().all())


async def _reconciliation_import(import_id: int) -> PaymentReconciliationImport | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.get(PaymentReconciliationImport, import_id)


async def _reconciliation_rows(import_id: int) -> list[PaymentReconciliationRow]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(PaymentReconciliationRow)
            .where(PaymentReconciliationRow.import_id == import_id)
            .order_by(PaymentReconciliationRow.row_number)
        )
        return list(result.scalars().all())


def _install_cookie_session(app_client, test_settings, token: str, user_id: int, *, with_csrf: bool) -> str:
    app_client.cookies.set(AUTH_COOKIE_NAME, token)
    if not with_csrf:
        app_client.cookies.set(CSRF_COOKIE_NAME, "")
        return ""

    csrf_token = csrf_token_for_user(SimpleNamespace(id=user_id, auth_token_version=0), test_settings)
    app_client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    return csrf_token


def _set_cmi_settings(test_settings, **overrides):
    original = {
        "cmi_client_id": test_settings.cmi_client_id,
        "cmi_store_key": test_settings.cmi_store_key,
        "cmi_payment_url": test_settings.cmi_payment_url,
        "cmi_ok_url": test_settings.cmi_ok_url,
        "cmi_fail_url": test_settings.cmi_fail_url,
        "cmi_callback_url": test_settings.cmi_callback_url,
    }
    values = {
        "cmi_client_id": "cmi-client",
        "cmi_store_key": "super-secret-store-key",
        "cmi_payment_url": "https://testpayment.cmi.co.ma/fim/est3Dgate",
        "cmi_ok_url": "https://app.example.com/payment/cmi/ok",
        "cmi_fail_url": "https://app.example.com/payment/cmi/fail",
        "cmi_callback_url": "https://api.example.com/api/payments/cmi/callback",
        **overrides,
    }
    for key, value in values.items():
        setattr(test_settings, key, value)
    return original


def _restore_settings(test_settings, original: dict[str, str]) -> None:
    for key, value in original.items():
        setattr(test_settings, key, value)


def _cmi_callback_payload(reference_code: str, **overrides) -> dict[str, str]:
    payload = {
        "clientid": "cmi-client",
        "oid": reference_code,
        "amount": "99.00",
        "currency": "504",
        "ProcReturnCode": "00",
        "Response": "Approved",
        "mdStatus": "1",
        "TransId": f"txn-{reference_code}",
        "AuthCode": "auth-123",
        "hashAlgorithm": "ver3",
        **{key: str(value) for key, value in overrides.items()},
    }
    payload["HASH"] = payment_gateway._cmi_callback_hash_sorted(
        payload,
        store_key="super-secret-store-key",
    )
    return payload


def test_cmi_form_hash_matches_ver3_fixture(test_settings, monkeypatch):
    original = _set_cmi_settings(test_settings)
    monkeypatch.setattr(payment_gateway.secrets, "token_urlsafe", lambda _size: "fixed-rnd")
    try:
        form_fields = payment_gateway._cmi_form_fields(
            settings=test_settings,
            user=SimpleNamespace(email="cmi-configured@example.com", full_name="Student"),
            reference_code="KRESCO-CMI-123-FIXEDREF",
            amount_centimes=9900,
        )
    finally:
        _restore_settings(test_settings, original)

    assert form_fields == {
        "amount": "99.00",
        "BillToName": "Student",
        "callbackUrl": "https://api.example.com/api/payments/cmi/callback",
        "CallbackResponse": "true",
        "clientid": "cmi-client",
        "currency": "504",
        "email": "cmi-configured@example.com",
        "encoding": "UTF-8",
        "failUrl": "https://app.example.com/payment/cmi/fail",
        "hashAlgorithm": "ver3",
        "lang": "fr",
        "oid": "KRESCO-CMI-123-FIXEDREF",
        "okUrl": "https://app.example.com/payment/cmi/ok",
        "rnd": "fixed-rnd",
        "shopurl": "http://localhost:3000/pricing",
        "storetype": "3D_PAY_HOSTING",
        "TranType": "PreAuth",
        "hash": "/Qss9I+dh17bsR/lbaMSWgrcLfPGCWv3bf56NCFx535YuUkGPJA0jmk83ZAlMGsuROg2DTu1XhFOklKZwkp0RQ==",
    }


def test_cmi_callback_hash_matches_ver3_fixture():
    payload = {
        "clientid": "cmi-client",
        "oid": "KRESCO-CMI-123-CALLBACK",
        "amount": "99.00",
        "currency": "504",
        "ProcReturnCode": "00",
        "Response": "Approved",
        "mdStatus": "1",
        "TransId": "cmi-fixture-1",
        "AuthCode": "auth-123",
        "hashAlgorithm": "ver3",
    }

    assert payment_gateway._cmi_callback_hash_sorted(
        payload,
        store_key="super-secret-store-key",
    ) == "qTHX0sOSkacG6H4SJGzIJRxV8b5vQO1r8sB5GT7miNjhKHNViW6Kz17p5whMjrBe/dJwdSNQt1qRufr38HQpIg=="


def test_cmi_hashparams_variant_requires_payment_binding_fields():
    payload = {
        "HASHPARAMS": "clientid:oid:ProcReturnCode:Response:mdStatus:",
        "clientid": "cmi-client",
        "oid": "KRESCO-CMI-123-CALLBACK",
        "amount": "99.00",
        "currency": "504",
        "ProcReturnCode": "00",
        "Response": "Approved",
        "mdStatus": "1",
    }

    assert payment_gateway._cmi_hash_from_hashparams(payload, store_key="super-secret-store-key") == ""

    payload["HASHPARAMS"] = "clientid:oid:amount:currency:ProcReturnCode:Response:mdStatus:"
    assert payment_gateway._cmi_hash_from_hashparams(payload, store_key="super-secret-store-key")


def test_cmi_event_id_does_not_use_auth_code_as_global_identifier():
    payload = {
        "oid": "KRESCO-CMI-123-CALLBACK",
        "ProcReturnCode": "00",
        "Response": "Approved",
        "AuthCode": "auth-123",
        "rnd": "rnd-123",
    }

    assert payment_gateway._cmi_callback_event_id(payload).startswith("cmi:")
    assert payment_gateway._cmi_callback_event_id(payload) != "auth-123"


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


def test_cookie_cmi_callback_is_csrf_exempt(app_client, auth_token, test_settings):
    token, user_id = auth_token(email="cmi-callback-csrf@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=False)
        response = app_client.post(
            "/api/payments/cmi/callback",
            data=_cmi_callback_payload(create_response.json()["reference_code"], TransId="cmi-csrf-ok-1"),
        )
    finally:
        _restore_settings(test_settings, original)

    assert response.status_code == 200
    assert response.text == "ACTION=POSTAUTH"


def test_cookie_cmi_callback_rejects_untrusted_origin(app_client, auth_token, test_settings):
    token, user_id = auth_token(email="cmi-callback-csrf-origin@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        _install_cookie_session(app_client, test_settings, token, user_id, with_csrf=False)
        response = app_client.post(
            "/api/payments/cmi/callback",
            data=_cmi_callback_payload(create_response.json()["reference_code"], TransId="cmi-csrf-bad-origin-1"),
            headers={"Origin": "https://attacker.example"},
        )
    finally:
        _restore_settings(test_settings, original)

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF origin is not trusted"


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


def test_create_ashplus_payment_request_is_pending_and_does_not_grant_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="ashplus-request@example.com")

    response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "ashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_method"] == PAYMENT_RAIL_ASHPLUS
    assert payload["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert payload["reference_code"].startswith(f"KRESCO-ASH-{user_id}-")
    assert payload["instructions"]["title"] == "AshPlus"

    assert run_db(_get_user(user_id)).is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    assert transactions[0].provider == PAYMENT_PROVIDER_ASHPLUS
    assert transactions[0].rail == PAYMENT_RAIL_ASHPLUS
    assert transactions[0].status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW


def test_current_payment_request_recovers_student_pending_manual_request(app_client, auth_token):
    token, _user_id = auth_token(email="current-payment-pending@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers=headers,
    )

    current_response = app_client.get("/api/payments/payment-requests/current", headers=headers)

    assert create_response.status_code == 200
    assert current_response.status_code == 200
    payload = current_response.json()
    assert payload["id"] == create_response.json()["id"]
    assert payload["payment_method"] == PAYMENT_RAIL_CASHPLUS
    assert payload["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert payload["reference_code"] == create_response.json()["reference_code"]


def test_current_payment_request_is_scoped_to_authenticated_student(app_client, auth_token):
    owner_token, _owner_id = auth_token(email="current-payment-owner@example.com")
    other_token, _other_id = auth_token(email="current-payment-other@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    other_response = app_client.get(
        "/api/payments/payment-requests/current",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert create_response.status_code == 200
    assert other_response.status_code == 200
    assert other_response.json() is None


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


def test_create_payment_request_rejects_cmi_when_config_missing(app_client, auth_token, run_db):
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


def test_create_cmi_payment_request_is_pending_provider_and_does_not_grant_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-configured@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        _restore_settings(test_settings, original)

    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_method"] == PAYMENT_RAIL_CMI
    assert payload["status"] == PAYMENT_STATUS_PENDING_PROVIDER
    assert payload["plan"] == "pro"
    assert payload["amount_centimes"] == 9900
    assert payload["currency"] == "MAD"
    assert payload["reference_code"].startswith(f"KRESCO-CMI-{user_id}-")
    assert payload["instructions"]["action"] == "form_post"
    assert payload["instructions"]["action_url"] == "https://testpayment.cmi.co.ma/fim/est3Dgate"
    form_fields = payload["instructions"]["form_fields"]
    assert form_fields["clientid"] == "cmi-client"
    assert form_fields["email"] == "cmi-configured@example.com"
    assert form_fields["oid"] == payload["reference_code"]
    assert form_fields["amount"] == "99.00"
    assert form_fields["currency"] == "504"
    assert form_fields["hashAlgorithm"] == "ver3"
    assert form_fields["CallbackResponse"] == "true"
    assert form_fields["TranType"] == "PreAuth"
    assert form_fields["hash"]
    assert "super-secret-store-key" not in response.text

    assert run_db(_get_user(user_id)).is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    transaction = transactions[0]
    assert transaction.provider == PAYMENT_PROVIDER_CMI
    assert transaction.rail == PAYMENT_RAIL_CMI
    assert transaction.status == PAYMENT_STATUS_PENDING_PROVIDER
    assert transaction.open_request_key == f"cmi:{user_id}:pro"
    assert transaction.provider_payload_json["form_fields"]["hash"] == form_fields["hash"]
    assert "super-secret-store-key" not in str(transaction.provider_payload_json)


def test_create_cmi_payment_request_reuses_existing_open_provider_request(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-idempotent@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    body = {"payment_method": "cmi", "plan": "pro"}
    original = _set_cmi_settings(test_settings)

    try:
        first = app_client.post("/api/payments/payment-requests", json=body, headers=headers)
        second = app_client.post("/api/payments/payment-requests", json=body, headers=headers)
    finally:
        _restore_settings(test_settings, original)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["reference_code"] == first.json()["reference_code"]
    assert second.json()["instructions"]["form_fields"]["hash"] == first.json()["instructions"]["form_fields"]["hash"]

    transactions = run_db(_payment_transactions_for_user(user_id))
    assert len(transactions) == 1
    assert transactions[0].open_request_key == f"cmi:{user_id}:pro"
    assert run_db(_get_user(user_id)).is_pro is False


def test_create_cmi_payment_request_rejects_non_cmi_gateway_host(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-invalid-gateway@example.com")
    original = _set_cmi_settings(test_settings, cmi_payment_url="https://payments.example.com/fim/est3Dgate")

    try:
        response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        _restore_settings(test_settings, original)

    assert response.status_code == 503
    assert "CMI_PAYMENT_URL must use a CMI gateway host" in response.text
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_payment_transactions_for_user(user_id)) == []


def test_create_cmi_payment_request_rejects_local_callback_url(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-local-callback@example.com")
    original = _set_cmi_settings(test_settings, cmi_callback_url="https://localhost/api/payments/cmi/callback")

    try:
        response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        _restore_settings(test_settings, original)

    assert response.status_code == 503
    assert "CMI_CALLBACK_URL must be publicly reachable" in response.text
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_payment_transactions_for_user(user_id)) == []


def test_cmi_callback_approved_marks_paid_and_grants_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-approved@example.com")
    subject_ids = run_db(_seed_subjects("CMI Maths", "CMI Physique"))
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-approved-1")
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert create_response.status_code == 200
    assert callback_response.status_code == 200
    assert callback_response.text == "ACTION=POSTAUTH"
    assert run_db(_get_user(user_id)).is_pro is True
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    assert transaction.open_request_key is None
    assert transaction.confirmed_at is not None
    assert transaction.provider_reference == "cmi-approved-1"
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 1
    assert events[0].event_type == "cmi.callback.approved"
    assert events[0].event_id == "cmi-approved-1"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction.id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_confirmed"
    assert ledger_entries[0].amount_centimes == 9900
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert ledger_entries[0].metadata_json["entitlements_granted"] == len(entitlements)
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.source for entitlement in entitlements} == {
        f"payment:cmi:{transaction.reference_code.lower()}"
    }


def test_cmi_callback_duplicate_is_idempotent(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-duplicate@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-duplicate-1")
        first = app_client.post("/api/payments/cmi/callback", data=callback)
        second = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.text == "ACTION=POSTAUTH"
    assert second.text == "ACTION=POSTAUTH"
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    assert len(run_db(_payment_provider_events_for_transaction(transaction.id))) == 1
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction.id))) == 1


def test_cmi_callback_later_decline_cannot_downgrade_paid_transaction(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-no-downgrade@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        approved = _cmi_callback_payload(reference_code, TransId="cmi-no-downgrade-approved")
        decline = _cmi_callback_payload(
            reference_code,
            TransId="cmi-no-downgrade-declined",
            ProcReturnCode="05",
            Response="Declined",
            ErrMsg="Late decline",
        )
        approved_response = app_client.post("/api/payments/cmi/callback", data=approved)
        decline_response = app_client.post("/api/payments/cmi/callback", data=decline)
    finally:
        _restore_settings(test_settings, original)

    assert approved_response.status_code == 200
    assert approved_response.text == "ACTION=POSTAUTH"
    assert decline_response.status_code == 200
    assert decline_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is True
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    assert transaction.provider_reference == "cmi-no-downgrade-approved"
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 2
    assert events[0].status == "processed"
    assert events[1].status == "ignored"
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction.id))) == 1


def test_cmi_callback_later_approved_event_does_not_postauth_paid_transaction(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-no-second-postauth@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        approved = _cmi_callback_payload(reference_code, TransId="cmi-second-postauth-approved")
        later_approved = _cmi_callback_payload(reference_code, TransId="cmi-second-postauth-new-event")
        approved_response = app_client.post("/api/payments/cmi/callback", data=approved)
        later_response = app_client.post("/api/payments/cmi/callback", data=later_approved)
    finally:
        _restore_settings(test_settings, original)

    assert approved_response.status_code == 200
    assert approved_response.text == "ACTION=POSTAUTH"
    assert later_response.status_code == 200
    assert later_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is True
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 2
    assert events[0].event_id == "cmi-second-postauth-approved"
    assert events[0].status == "processed"
    assert events[1].event_id == "cmi-second-postauth-new-event"
    assert events[1].status == "ignored"
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction.id))) == 1


def test_cmi_callback_invalid_hash_does_not_mutate_pending_transaction(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-invalid-hash@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-invalid-hash-1")
        callback["HASH"] = "tampered"
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PENDING_PROVIDER
    assert transaction.open_request_key == f"cmi:{user_id}:pro"
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 1
    assert events[0].event_type == "cmi.callback.invalid"
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction.id))) == 0


def test_cmi_callback_invalid_hash_replay_is_idempotent(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-invalid-replay@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-invalid-replay-1")
        callback["HASH"] = "tampered"
        first = app_client.post("/api/payments/cmi/callback", data=callback)
        second = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.text == "FAILURE"
    assert second.text == "FAILURE"
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PENDING_PROVIDER
    assert len(run_db(_payment_provider_events_for_transaction(transaction.id))) == 1
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction.id))) == 0


def test_cmi_callback_declined_marks_failed_without_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-declined@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(
            reference_code,
            TransId="cmi-declined-1",
            ProcReturnCode="05",
            Response="Declined",
            ErrMsg="Do not honor",
        )
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_FAILED
    assert transaction.open_request_key is None
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 1
    assert events[0].event_type == "cmi.callback.failed"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction.id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_failed"


def test_cmi_callback_missing_success_fields_fails_without_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-missing-success@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-missing-success-1")
        callback.pop("Response")
        callback.pop("mdStatus")
        callback["HASH"] = payment_gateway._cmi_callback_hash_sorted(
            callback,
            store_key="super-secret-store-key",
        )
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_FAILED
    assert transaction.open_request_key is None


def test_cmi_callback_amount_mismatch_marks_mismatch_without_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    token, user_id = auth_token(email="cmi-callback-mismatch@example.com")
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers={"Authorization": f"Bearer {token}"},
        )
        reference_code = create_response.json()["reference_code"]
        callback = _cmi_callback_payload(reference_code, TransId="cmi-mismatch-1", amount="1.00")
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_MISMATCH
    assert transaction.open_request_key is None
    events = run_db(_payment_provider_events_for_transaction(transaction.id))
    assert len(events) == 1
    assert events[0].status == "failed"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction.id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_mismatch"


def test_cmi_callback_unknown_order_is_ignored_without_access(
    app_client,
    run_db,
    test_settings,
):
    user_id = run_db(_seed_user("cmi-callback-unknown@example.com"))
    original = _set_cmi_settings(test_settings)

    try:
        callback = _cmi_callback_payload("KRESCO-CMI-999-MISSING", TransId="cmi-unknown-1")
        callback_response = app_client.post("/api/payments/cmi/callback", data=callback)
    finally:
        _restore_settings(test_settings, original)

    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert run_db(_get_user(user_id)).is_pro is False


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


def test_manual_payment_review_requires_verified_staff(app_client, auth_token, run_db, test_settings):
    student_token, _user_id = auth_token(email="manual-review-student@example.com")
    staff_id = run_db(_seed_staff_user("manual-review-staff@example.com"))
    staff_token = create_token(staff_id, test_settings)

    student_response = app_client.get(
        "/api/payments/manual-payment-requests",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    staff_response = app_client.get(
        "/api/payments/manual-payment-requests",
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert student_response.status_code == 403
    assert student_response.json()["detail"] == "Staff access required"
    assert staff_response.status_code == 200
    assert isinstance(staff_response.json(), list)


def test_staff_can_list_pending_manual_payment_requests(app_client, auth_token, run_db, test_settings):
    student_token, user_id = auth_token(email="manual-list-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    staff_id = run_db(_seed_staff_user("manual-list-staff@example.com"))
    staff_token = create_token(staff_id, test_settings)

    list_response = app_client.get(
        "/api/payments/manual-payment-requests",
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert create_response.status_code == 200
    assert list_response.status_code == 200
    payload = list_response.json()
    transaction = next(item for item in payload if item["id"] == create_response.json()["id"])
    assert transaction["user_id"] == user_id
    assert transaction["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert transaction["payment_method"] == PAYMENT_RAIL_BANK_TRANSFER


def test_finance_audit_endpoints_require_verified_staff(app_client, auth_token, run_db, test_settings):
    student_token, _user_id = auth_token(email="finance-audit-student@example.com")
    staff_id = run_db(_seed_staff_user("finance-audit-staff@example.com"))
    staff_token = create_token(staff_id, test_settings)

    for path in (
        "/api/payments/finance/ledger",
        "/api/payments/finance/provider-events",
        "/api/payments/manual-payment-reconciliation-imports",
    ):
        student_response = app_client.get(path, headers={"Authorization": f"Bearer {student_token}"})
        staff_response = app_client.get(path, headers={"Authorization": f"Bearer {staff_token}"})

        assert student_response.status_code == 403
        assert student_response.json()["detail"] == "Staff access required"
        assert staff_response.status_code == 200
        assert isinstance(staff_response.json(), list)


def test_finance_write_endpoints_require_superuser(app_client, auth_token, run_db, test_settings):
    student_token, user_id = auth_token(email="finance-write-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    reference_code = create_response.json()["reference_code"]
    staff_id = run_db(_seed_staff_user("finance-write-staff@example.com"))
    staff_token = create_token(staff_id, test_settings)
    headers = {"Authorization": f"Bearer {staff_token}"}

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "Plain staff should not approve"},
        headers=headers,
    )
    reject_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/reject",
        json={"reason": "Plain staff should not reject"},
        headers=headers,
    )
    reconcile_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "bank_transfer",
            "reference_code": reference_code,
            "amount_centimes": 9900,
            "provider_reference": "BANK-PLAIN-STAFF-DENIED",
            "reason": "Plain staff should not reconcile",
        },
        headers=headers,
    )
    import_response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "bank_transfer",
            "source_name": "plain-staff-denied.csv",
            "rows": [
                {
                    "reference_code": reference_code,
                    "amount_centimes": 9900,
                    "provider_reference": "BANK-PLAIN-STAFF-IMPORT-DENIED",
                    "reason": "Plain staff should not import",
                }
            ],
        },
        headers=headers,
    )

    assert create_response.status_code == 200
    for response in (approve_response, reject_response, reconcile_response, import_response):
        assert response.status_code == 403
        assert response.json()["detail"] == "Superuser access required"

    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert len(run_db(_payment_provider_events_for_transaction(transaction_id))) == 0
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction_id))) == 0


def test_staff_can_read_finance_ledger_and_provider_events_for_transaction(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="finance-audit-records-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    staff_id = run_db(_seed_staff_user("finance-audit-records-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)
    headers = {"Authorization": f"Bearer {staff_token}"}

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "CashPlus finance audit check"},
        headers=headers,
    )
    ledger_response = app_client.get(
        f"/api/payments/finance/ledger?transaction_id={transaction_id}",
        headers=headers,
    )
    events_response = app_client.get(
        f"/api/payments/finance/provider-events?transaction_id={transaction_id}",
        headers=headers,
    )

    assert create_response.status_code == 200
    assert approve_response.status_code == 200
    assert ledger_response.status_code == 200
    ledger = ledger_response.json()
    assert len(ledger) == 1
    assert ledger[0]["transaction_id"] == transaction_id
    assert ledger[0]["user_id"] == user_id
    assert ledger[0]["entry_type"] == "payment_confirmed"
    assert ledger[0]["amount_centimes"] == 9900
    assert ledger[0]["reason"] == "CashPlus finance audit check"
    assert ledger[0]["metadata"]["actor_user_id"] == staff_id
    assert ledger[0]["metadata"]["rail"] == PAYMENT_RAIL_CASHPLUS
    assert ledger[0]["metadata"]["entitlements_granted"] >= 0

    assert events_response.status_code == 200
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["transaction_id"] == transaction_id
    assert events[0]["event_type"] == "manual.approved"
    assert events[0]["status"] == "processed"
    assert events[0]["payload"] == {"actor_user_id": staff_id, "reason": "CashPlus finance audit check"}


def test_staff_can_read_reconciliation_import_history(app_client, auth_token, run_db, test_settings):
    student_token, _user_id = auth_token(email="finance-import-history-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    staff_id = run_db(_seed_staff_user("finance-import-history-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)
    headers = {"Authorization": f"Bearer {staff_token}"}
    import_response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "bank_transfer",
            "source_name": "audit-bank-import",
            "rows": [
                {
                    "reference_code": create_response.json()["reference_code"],
                    "amount_centimes": 9900,
                    "provider_reference": "BANK-AUDIT-001",
                    "reason": "Bank statement row",
                }
            ],
        },
        headers=headers,
    )

    history_response = app_client.get(
        "/api/payments/manual-payment-reconciliation-imports?limit=10",
        headers=headers,
    )

    assert create_response.status_code == 200
    assert import_response.status_code == 200
    assert history_response.status_code == 200
    history = history_response.json()
    item = next(row for row in history if row["id"] == import_response.json()["id"])
    assert item["payment_method"] == PAYMENT_RAIL_BANK_TRANSFER
    assert item["source_name"] == "audit-bank-import"
    assert item["row_count"] == 1
    assert item["matched_count"] == 1
    assert item["mismatch_count"] == 0
    assert item["created_by_user_id"] == staff_id


def test_staff_approve_manual_payment_grants_access_and_records_audit(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-approve-student@example.com")
    subject_ids = run_db(_seed_subjects("Manual Maths", "Manual SVT"))
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    staff_id = run_db(_seed_staff_user("manual-approve-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "CashPlus receipt verified"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    second_approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "CashPlus receipt verified"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert create_response.status_code == 200
    assert approve_response.status_code == 200
    payload = approve_response.json()
    assert payload["status"] == PAYMENT_STATUS_PAID
    assert payload["confirmed_at"] is not None
    assert second_approve_response.status_code == 200
    assert second_approve_response.json()["status"] == PAYMENT_STATUS_PAID

    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    assert transaction.open_request_key is None
    assert transaction.metadata_json["confirmed_by_user_id"] == staff_id
    assert transaction.metadata_json["confirmation_reason"] == "CashPlus receipt verified"

    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert len(events) == 1
    assert events[0].event_type == "manual.approved"
    assert events[0].payload_json == {"actor_user_id": staff_id, "reason": "CashPlus receipt verified"}
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction_id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_confirmed"
    assert ledger_entries[0].amount_centimes == 9900
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert ledger_entries[0].metadata_json == {
        "actor_user_id": staff_id,
        "rail": PAYMENT_RAIL_CASHPLUS,
        "entitlements_granted": len(entitlements),
    }
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.source for entitlement in entitlements} == {
        f"payment:cashplus:{transaction.reference_code.lower()}"
    }
    current_response = app_client.get(
        "/api/payments/payment-requests/current",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert current_response.status_code == 200
    assert current_response.json() is None


def test_staff_cannot_approve_own_manual_payment_request(app_client, run_db, test_settings):
    staff_id = run_db(_seed_staff_user("manual-self-approve-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)
    headers = {"Authorization": f"Bearer {staff_token}"}
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers=headers,
    )
    transaction_id = create_response.json()["id"]

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "Self approval attempt"},
        headers=headers,
    )

    assert create_response.status_code == 200
    assert approve_response.status_code == 403
    assert approve_response.json()["detail"] == "Staff cannot approve their own manual payment"
    assert run_db(_get_user(staff_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(staff_id))[0]
    assert transaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert len(run_db(_payment_provider_events_for_transaction(transaction_id))) == 0
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction_id))) == 0


def test_staff_cannot_approve_expired_manual_payment_request(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-expired-approve-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    run_db(_set_payment_transaction_expired(transaction_id))
    staff_id = run_db(_seed_staff_user("manual-expired-approve-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "Late finance approval attempt"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    retry_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert create_response.status_code == 200
    assert approve_response.status_code == 409
    assert approve_response.json()["detail"] == "Manual payment request is expired"
    assert retry_response.status_code == 200
    assert retry_response.json()["id"] != transaction_id
    assert run_db(_get_user(user_id)).is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    expired_transaction = next(transaction for transaction in transactions if transaction.id == transaction_id)
    assert expired_transaction.status == PAYMENT_STATUS_EXPIRED
    assert expired_transaction.open_request_key is None
    assert len(run_db(_payment_provider_events_for_transaction(transaction_id))) == 0
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction_id))) == 0


def test_staff_reject_manual_payment_keeps_access_locked_and_allows_retry(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-reject-student@example.com")
    headers = {"Authorization": f"Bearer {student_token}"}
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers=headers,
    )
    transaction_id = create_response.json()["id"]
    staff_id = run_db(_seed_staff_user("manual-reject-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    reject_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/reject",
        json={"reason": "Reference not found"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    retry_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers=headers,
    )

    assert create_response.status_code == 200
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == PAYMENT_STATUS_FAILED
    assert retry_response.status_code == 200
    assert retry_response.json()["id"] != transaction_id

    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    transactions = run_db(_payment_transactions_for_user(user_id))
    failed_transaction = next(transaction for transaction in transactions if transaction.id == transaction_id)
    assert failed_transaction.status == PAYMENT_STATUS_FAILED
    assert failed_transaction.open_request_key is None
    assert failed_transaction.metadata_json["rejected_by_user_id"] == staff_id
    assert failed_transaction.metadata_json["rejection_reason"] == "Reference not found"

    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert len(events) == 1
    assert events[0].event_type == "manual.rejected"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction_id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_rejected"
    assert ledger_entries[0].amount_centimes == 0


def test_current_payment_request_exposes_latest_failed_request_without_granting_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="current-payment-failed@example.com")
    headers = {"Authorization": f"Bearer {student_token}"}
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers=headers,
    )
    transaction_id = create_response.json()["id"]
    staff_id = run_db(_seed_staff_user("current-payment-failed-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)
    reject_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/reject",
        json={"reason": "Reference not found"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    current_response = app_client.get("/api/payments/payment-requests/current", headers=headers)

    assert create_response.status_code == 200
    assert reject_response.status_code == 200
    assert current_response.status_code == 200
    payload = current_response.json()
    assert payload["id"] == transaction_id
    assert payload["status"] == PAYMENT_STATUS_FAILED
    assert payload["payment_method"] == PAYMENT_RAIL_BANK_TRANSFER
    assert payload["instructions"] == {}
    assert run_db(_get_user(user_id)).is_pro is False


def test_current_payment_request_strips_closed_cmi_form_fields(
    app_client,
    auth_token,
    test_settings,
):
    student_token, _user_id = auth_token(email="current-cmi-failed-safe@example.com")
    headers = {"Authorization": f"Bearer {student_token}"}
    original = _set_cmi_settings(test_settings)

    try:
        create_response = app_client.post(
            "/api/payments/payment-requests",
            json={"payment_method": "cmi", "plan": "pro"},
            headers=headers,
        )
        callback_response = app_client.post(
            "/api/payments/cmi/callback",
            data=_cmi_callback_payload(
                create_response.json()["reference_code"],
                ProcReturnCode="05",
                Response="Declined",
                TransId="current-cmi-failed-safe-1",
            ),
        )
        current_response = app_client.get("/api/payments/payment-requests/current", headers=headers)
    finally:
        _restore_settings(test_settings, original)

    assert create_response.status_code == 200
    assert create_response.json()["instructions"]["form_fields"]["hash"]
    assert callback_response.status_code == 200
    assert callback_response.text == "FAILURE"
    assert current_response.status_code == 200
    payload = current_response.json()
    assert payload["status"] == PAYMENT_STATUS_FAILED
    assert payload["payment_method"] == PAYMENT_RAIL_CMI
    assert payload["instructions"] == {}


def test_student_submits_manual_payment_proof_without_unlocking_access(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-proof-student@example.com")
    headers = {"Authorization": f"Bearer {student_token}"}
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers=headers,
    )
    transaction_id = create_response.json()["id"]
    proof_payload = {
        "proof_kind": "bank_transfer_receipt",
        "provider_reference": "VIR-RECEIPT-001",
        "proof_url": "https://uploads.example.com/proofs/receipt-001.pdf",
        "payer_name": "Student Parent",
        "paid_at": "2026-06-15T12:30:00Z",
        "notes": "Transfer sent from CIH",
    }

    first_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/proof",
        json=proof_payload,
        headers=headers,
    )
    duplicate_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/proof",
        json=proof_payload,
        headers=headers,
    )

    assert first_response.status_code == 200
    assert duplicate_response.status_code == 200
    assert first_response.json()["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert first_response.json()["metadata"]["proofs"][0]["provider_reference"] == "VIR-RECEIPT-001"
    assert run_db(_get_user(user_id)).is_pro is False

    proofs = run_db(_payment_proofs_for_transaction(transaction_id))
    assert len(proofs) == 1
    assert proofs[0].rail == PAYMENT_RAIL_BANK_TRANSFER
    assert proofs[0].status == "submitted"
    assert proofs[0].provider_reference == "VIR-RECEIPT-001"
    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert len(events) == 1
    assert events[0].event_type == "manual.proof_submitted"
    assert events[0].status == "received"
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction_id))) == 0


def test_student_cannot_submit_proof_for_another_users_manual_payment(
    app_client,
    auth_token,
):
    owner_token, _owner_id = auth_token(email="manual-proof-owner@example.com")
    other_token, _other_id = auth_token(email="manual-proof-other@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    response = app_client.post(
        f"/api/payments/manual-payment-requests/{create_response.json()['id']}/proof",
        json={"proof_kind": "cash_receipt", "provider_reference": "CASH-OTHER-001"},
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Manual payment transaction not found"


def test_staff_reconciles_manual_payment_by_reference_once(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-reconcile-student@example.com")
    subject_ids = run_db(_seed_subjects("Reconcile Maths", "Reconcile Chimie"))
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    reference_code = create_response.json()["reference_code"]
    staff_id = run_db(_seed_staff_user("manual-reconcile-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)
    reconciliation_payload = {
        "payment_method": "cashplus",
        "reference_code": reference_code,
        "amount_centimes": 9900,
        "provider_reference": "CASHPLUS-REPORT-001",
        "reason": "CashPlus report row matched",
        "collected_at": "2026-06-15T13:00:00Z",
    }

    first_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json=reconciliation_payload,
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    duplicate_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json=reconciliation_payload,
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert first_response.status_code == 200
    assert duplicate_response.status_code == 200
    assert first_response.json()["status"] == PAYMENT_STATUS_PAID
    assert first_response.json()["provider_reference"] == "CASHPLUS-REPORT-001"
    assert run_db(_get_user(user_id)).is_pro is True

    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_PAID
    assert transaction.open_request_key is None
    assert transaction.metadata_json["reconciled_by_user_id"] == staff_id
    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert len(events) == 1
    assert events[0].event_type == "manual.reconciled"
    assert events[0].status == "processed"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction_id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_confirmed"
    assert ledger_entries[0].amount_centimes == 9900
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert ledger_entries[0].metadata_json["entitlements_granted"] == len(entitlements)
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.source for entitlement in entitlements} == {
        f"payment:cashplus:{reference_code.lower()}"
    }


def test_ashplus_proof_and_reconciliation_use_manual_cash_agency_workflow(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="ashplus-workflow-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "ashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    reference_code = create_response.json()["reference_code"]
    proof_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/proof",
        json={"proof_kind": "ashplus_receipt", "provider_reference": "ASHPLUS-RECEIPT-001"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert proof_response.status_code == 200
    assert proof_response.json()["status"] == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert run_db(_get_user(user_id)).is_pro is False

    staff_id = run_db(_seed_staff_user("ashplus-workflow-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    reconcile_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "ashplus",
            "reference_code": reference_code,
            "amount_centimes": 9900,
            "provider_reference": "ASHPLUS-RECEIPT-001",
            "reason": "AshPlus receipt matched",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert reconcile_response.status_code == 200
    assert reconcile_response.json()["status"] == PAYMENT_STATUS_PAID
    assert reconcile_response.json()["provider"] == PAYMENT_PROVIDER_ASHPLUS
    assert reconcile_response.json()["payment_method"] == PAYMENT_RAIL_ASHPLUS
    assert run_db(_get_user(user_id)).is_pro is True

    proofs = run_db(_payment_proofs_for_transaction(transaction_id))
    assert len(proofs) == 1
    assert proofs[0].rail == PAYMENT_RAIL_ASHPLUS
    assert proofs[0].provider_reference == "ASHPLUS-RECEIPT-001"
    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert [event.event_type for event in events] == ["manual.proof_submitted", "manual.reconciled"]
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction_id))
    assert len(ledger_entries) == 1
    assert ledger_entries[0].entry_type == "payment_confirmed"
    assert ledger_entries[0].metadata_json["rail"] == PAYMENT_RAIL_ASHPLUS


def test_staff_reconciliation_amount_mismatch_stays_locked_and_filterable(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    student_token, user_id = auth_token(email="manual-reconcile-mismatch@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    reference_code = create_response.json()["reference_code"]
    staff_id = run_db(_seed_staff_user("manual-reconcile-mismatch-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "bank_transfer",
            "reference_code": reference_code,
            "amount_centimes": 1200,
            "provider_reference": "BANK-STMT-LOW-AMOUNT",
            "reason": "Bank statement row imported",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    list_response = app_client.get(
        "/api/payments/manual-payment-requests?status=mismatch",
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == PAYMENT_STATUS_MISMATCH
    assert run_db(_get_user(user_id)).is_pro is False
    transaction = run_db(_payment_transactions_for_user(user_id))[0]
    assert transaction.status == PAYMENT_STATUS_MISMATCH
    assert transaction.open_request_key is None
    assert transaction.metadata_json["expected_amount_centimes"] == 9900
    assert transaction.metadata_json["received_amount_centimes"] == 1200
    events = run_db(_payment_provider_events_for_transaction(transaction_id))
    assert events[0].event_type == "manual.reconciliation_mismatch"
    assert events[0].status == "failed"
    ledger_entries = run_db(_finance_ledger_entries_for_transaction(transaction_id))
    assert ledger_entries[0].entry_type == "payment_mismatch"
    assert list_response.status_code == 200
    assert any(item["id"] == transaction_id for item in list_response.json())


def test_staff_reconciliation_external_reference_cannot_unlock_two_transactions(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    first_token, first_user_id = auth_token(email="manual-reconcile-first@example.com")
    second_token, second_user_id = auth_token(email="manual-reconcile-second@example.com")
    first_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    second_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    first_transaction_id = first_create.json()["id"]
    second_transaction_id = second_create.json()["id"]
    staff_id = run_db(_seed_staff_user("manual-reconcile-reused-reference-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    first_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "cashplus",
            "reference_code": first_create.json()["reference_code"],
            "amount_centimes": 9900,
            "provider_reference": "CASHPLUS-REUSED-EXT-REF",
            "reason": "CashPlus report row matched",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    second_response = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "cashplus",
            "reference_code": second_create.json()["reference_code"],
            "amount_centimes": 9900,
            "provider_reference": "CASHPLUS-REUSED-EXT-REF",
            "reason": "Same report row attempted against another user",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert first_response.status_code == 200
    assert first_response.json()["id"] == first_transaction_id
    assert first_response.json()["status"] == PAYMENT_STATUS_PAID
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Provider reference is already reconciled to another manual payment"
    assert run_db(_get_user(first_user_id)).is_pro is True
    assert run_db(_get_user(second_user_id)).is_pro is False

    second_transaction = run_db(_payment_transactions_for_user(second_user_id))[0]
    assert second_transaction.id == second_transaction_id
    assert second_transaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert len(run_db(_payment_provider_events_for_transaction(first_transaction_id))) == 1
    assert len(run_db(_finance_ledger_entries_for_transaction(first_transaction_id))) == 1
    assert len(run_db(_payment_provider_events_for_transaction(second_transaction_id))) == 0
    assert len(run_db(_finance_ledger_entries_for_transaction(second_transaction_id))) == 0


def test_staff_imports_manual_payment_reconciliation_batch_with_audited_rows(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    first_token, first_user_id = auth_token(email="manual-import-match@example.com")
    second_token, second_user_id = auth_token(email="manual-import-mismatch@example.com")
    first_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    second_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    first_transaction_id = first_create.json()["id"]
    second_transaction_id = second_create.json()["id"]
    staff_id = run_db(_seed_staff_user("manual-import-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "cashplus",
            "source_name": "cashplus-week-24.json",
            "rows": [
                {
                    "reference_code": first_create.json()["reference_code"],
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-IMPORT-MATCH",
                    "reason": "CashPlus import row matched",
                    "raw_row": {"line": 1},
                },
                {
                    "reference_code": second_create.json()["reference_code"],
                    "amount_centimes": 1200,
                    "provider_reference": "CASHPLUS-IMPORT-MISMATCH",
                    "reason": "CashPlus import row amount mismatch",
                    "raw_row": {"line": 2},
                },
                {
                    "reference_code": "KRESCO-CASH-999-MISSING",
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-IMPORT-UNMATCHED",
                    "reason": "CashPlus import row missing app reference",
                    "raw_row": {"line": 3},
                },
                {
                    "reference_code": first_create.json()["reference_code"],
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-IMPORT-MATCH",
                    "reason": "Duplicate row from same provider report",
                    "raw_row": {"line": 4},
                },
            ],
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_method"] == PAYMENT_RAIL_CASHPLUS
    assert payload["source_name"] == "cashplus-week-24.json"
    assert payload["row_count"] == 4
    assert payload["matched_count"] == 1
    assert payload["mismatch_count"] == 1
    assert payload["unmatched_count"] == 1
    assert payload["duplicate_count"] == 1
    assert payload["error_count"] == 0
    assert [row["status"] for row in payload["rows"]] == ["matched", "mismatch", "unmatched", "duplicate"]
    assert payload["rows"][0]["matched_transaction_id"] == first_transaction_id
    assert payload["rows"][1]["matched_transaction_id"] == second_transaction_id
    assert payload["rows"][2]["matched_transaction_id"] is None
    assert payload["rows"][3]["matched_transaction_id"] == first_transaction_id

    import_record = run_db(_reconciliation_import(payload["id"]))
    assert import_record.row_count == 4
    assert import_record.matched_count == 1
    assert import_record.mismatch_count == 1
    rows = run_db(_reconciliation_rows(payload["id"]))
    assert [row.status for row in rows] == ["matched", "mismatch", "unmatched", "duplicate"]
    assert rows[0].raw_row_json == {"line": 1}
    assert run_db(_get_user(first_user_id)).is_pro is True
    assert run_db(_get_user(second_user_id)).is_pro is False
    first_transaction = run_db(_payment_transactions_for_user(first_user_id))[0]
    second_transaction = run_db(_payment_transactions_for_user(second_user_id))[0]
    assert first_transaction.status == PAYMENT_STATUS_PAID
    assert second_transaction.status == PAYMENT_STATUS_MISMATCH
    assert len(run_db(_finance_ledger_entries_for_transaction(first_transaction_id))) == 1
    assert len(run_db(_finance_ledger_entries_for_transaction(second_transaction_id))) == 1


def test_import_consumes_new_provider_reference_aimed_at_paid_transaction(
    app_client,
    auth_token,
    run_db,
    test_settings,
):
    first_token, first_user_id = auth_token(email="manual-import-paid-first@example.com")
    second_token, second_user_id = auth_token(email="manual-import-paid-second@example.com")
    first_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    second_create = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "cashplus", "plan": "pro"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    staff_id = run_db(_seed_staff_user("manual-import-paid-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    first_reconcile = app_client.post(
        "/api/payments/manual-payment-requests/reconcile",
        json={
            "payment_method": "cashplus",
            "reference_code": first_create.json()["reference_code"],
            "amount_centimes": 9900,
            "provider_reference": "CASHPLUS-PAID-ORIGINAL",
            "reason": "Initial report row matched",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    import_response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "cashplus",
            "rows": [
                {
                    "reference_code": first_create.json()["reference_code"],
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-PAID-NEW-REF",
                    "reason": "New external reference pointed at already-paid transaction",
                },
                {
                    "reference_code": second_create.json()["reference_code"],
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-PAID-NEW-REF",
                    "reason": "Same external reference attempted on another pending transaction",
                },
            ],
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert first_reconcile.status_code == 200
    assert import_response.status_code == 200
    payload = import_response.json()
    assert payload["matched_count"] == 0
    assert payload["duplicate_count"] == 2
    assert [row["status"] for row in payload["rows"]] == ["duplicate", "duplicate"]
    assert run_db(_get_user(first_user_id)).is_pro is True
    assert run_db(_get_user(second_user_id)).is_pro is False
    second_transaction = run_db(_payment_transactions_for_user(second_user_id))[0]
    assert second_transaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    first_events = run_db(_payment_provider_events_for_transaction(first_create.json()["id"]))
    assert [event.event_type for event in first_events] == ["manual.reconciled", "manual.reconciliation_duplicate"]
    assert len(run_db(_finance_ledger_entries_for_transaction(second_create.json()["id"]))) == 0


def test_import_records_error_row_when_row_processing_raises(
    app_client,
    auth_token,
    run_db,
    test_settings,
    monkeypatch,
):
    staff_id = run_db(_seed_staff_user("manual-import-error-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    async def fail_reconcile(*args, **kwargs):
        raise RuntimeError("synthetic row failure")

    monkeypatch.setattr(payment_gateway, "reconcile_manual_payment_transaction", fail_reconcile)
    response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "cashplus",
            "source_name": "broken-import.json",
            "rows": [
                {
                    "reference_code": "KRESCO-CASH-1-BROKEN",
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-BROKEN-ROW",
                    "reason": "Synthetic failure",
                }
            ],
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "processed"
    assert payload["row_count"] == 1
    assert payload["error_count"] == 1
    assert payload["rows"][0]["status"] == "error"
    assert payload["rows"][0]["failure_reason"] == "synthetic row failure"
    rows = run_db(_reconciliation_rows(payload["id"]))
    assert len(rows) == 1
    assert rows[0].status == "error"
    assert rows[0].failure_reason == "synthetic row failure"


def test_student_cannot_import_manual_payment_reconciliation_batch(
    app_client,
    auth_token,
):
    student_token, _user_id = auth_token(email="manual-import-denied@example.com")

    response = app_client.post(
        "/api/payments/manual-payment-reconciliation-imports",
        json={
            "payment_method": "cashplus",
            "rows": [
                {
                    "reference_code": "KRESCO-CASH-1-ABC",
                    "amount_centimes": 9900,
                    "provider_reference": "CASHPLUS-DENIED-1",
                }
            ],
        },
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403


def test_create_payment_request_releases_expired_open_request_for_retry(app_client, auth_token, run_db):
    token, user_id = auth_token(email="manual-expired-retry-student@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    body = {"payment_method": "cashplus", "plan": "pro"}
    first_response = app_client.post("/api/payments/payment-requests", json=body, headers=headers)
    transaction_id = first_response.json()["id"]
    run_db(_set_payment_transaction_expired(transaction_id))

    retry_response = app_client.post("/api/payments/payment-requests", json=body, headers=headers)

    assert first_response.status_code == 200
    assert retry_response.status_code == 200
    assert retry_response.json()["id"] != transaction_id
    transactions = run_db(_payment_transactions_for_user(user_id))
    expired_transaction = next(transaction for transaction in transactions if transaction.id == transaction_id)
    open_transaction = next(transaction for transaction in transactions if transaction.id == retry_response.json()["id"])
    assert expired_transaction.status == PAYMENT_STATUS_EXPIRED
    assert expired_transaction.open_request_key is None
    assert open_transaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW
    assert open_transaction.open_request_key == f"manual:{user_id}:cashplus:pro"


def test_staff_cannot_reject_paid_manual_payment(app_client, auth_token, run_db, test_settings):
    student_token, _user_id = auth_token(email="manual-paid-reject-student@example.com")
    create_response = app_client.post(
        "/api/payments/payment-requests",
        json={"payment_method": "bank_transfer", "plan": "pro"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    transaction_id = create_response.json()["id"]
    staff_id = run_db(_seed_staff_user("manual-paid-reject-staff@example.com", is_superuser=True))
    staff_token = create_token(staff_id, test_settings)

    approve_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/approve",
        json={"reason": "Bank transfer verified"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    reject_response = app_client.post(
        f"/api/payments/manual-payment-requests/{transaction_id}/reject",
        json={"reason": "Late mismatch"},
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert create_response.status_code == 200
    assert approve_response.status_code == 200
    assert reject_response.status_code == 409
    assert reject_response.json()["detail"] == "Manual payment is not pending review"
    assert len(run_db(_payment_provider_events_for_transaction(transaction_id))) == 1
    assert len(run_db(_finance_ledger_entries_for_transaction(transaction_id))) == 1


def test_manual_payment_list_rejects_invalid_status_filter(app_client, run_db, test_settings):
    staff_id = run_db(_seed_staff_user("manual-invalid-filter-staff@example.com"))
    staff_token = create_token(staff_id, test_settings)

    response = app_client.get(
        "/api/payments/manual-payment-requests?status=cancelled",
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported manual payment status filter"


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
