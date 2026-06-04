import inspect
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import func, inspect as inspect_sa, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.payments import PaymentVerificationAttempt, StripeWebhookEvent
from app.models.users import User
from app.security.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrf_token_for_user
from app.services.auth import AUTH_COOKIE_NAME, create_token
from app.services import payment_lifecycle

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
    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in PaymentVerificationAttempt.__table__.indexes
    }

    assert "uq_payment_verification_attempts_user_session_key" in constraints
    assert indexes["ix_payment_verification_attempts_user_created"] == ("user_id", "created_at")

    migration_text = (
        BACKEND_ROOT / "alembic" / "versions" / "0041_payment_verification_attempts.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "0040"' in migration_text
    assert "payment_verification_attempts" in migration_text
    assert "uq_payment_verification_attempts_user_session_key" in migration_text


def test_webhook_requires_secret(app_client):
    response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "x"})
    assert response.status_code == 500
    assert "Webhook secret not configured" in response.text


def _with_webhook_secret(test_settings):
    original = test_settings.stripe_webhook_secret
    test_settings.stripe_webhook_secret = "whsec_test"
    return original


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


async def _webhook_event_count(event_id: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        rows = await db.execute(select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event_id))
        return len(rows.scalars().all())


async def _payment_attempt_count(user_id: int, session_id: str, idempotency_key: str) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await db.scalar(
            select(func.count())
            .select_from(PaymentVerificationAttempt)
            .where(
                PaymentVerificationAttempt.user_id == user_id,
                PaymentVerificationAttempt.session_id == session_id,
                PaymentVerificationAttempt.idempotency_key == idempotency_key,
            )
        )


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

    async def fake_create_checkout_session(user, plan, settings):
        orm_session = inspect_sa(user).session
        assert orm_session is None or not orm_session.in_transaction()
        calls.append({"user_id": user.id, "plan": plan})
        user.stripe_customer_id = "cus_router_created"
        return "https://checkout.example/router-created"

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    response = app_client.post(
        "/api/payments/create-checkout-session?plan=pro",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.example/router-created"}
    assert calls == [{"user_id": user_id, "plan": "pro"}]
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_router_created"


def test_cookie_checkout_session_requires_and_accepts_csrf_token(app_client, auth_token, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="checkout-router-csrf@example.com")
    calls = []

    async def fake_create_checkout_session(user, plan, settings):
        del settings
        calls.append({"user_id": user.id, "plan": plan})
        return "https://checkout.example/csrf"

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
    assert calls == [{"user_id": user_id, "plan": "pro"}]


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

    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_test_commit",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "verify-cs_test_commit"},
    )

    assert response.status_code == 200


def test_verify_session_requires_idempotency_key(app_client, auth_token):
    token, _user_id = auth_token(email="verify-missing-idempotency@example.com")

    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_missing_idempotency",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_verify_session_duplicate_idempotency_key_suppresses_remote_replay(
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
    headers = {"Authorization": f"Bearer {token}", "Idempotency-Key": "verify-cs_idempotent"}

    first = app_client.get("/api/payments/verify-session?session_id=cs_idempotent", headers=headers)
    second = app_client.get("/api/payments/verify-session?session_id=cs_idempotent", headers=headers)

    assert first.status_code == 200
    assert first.json()["is_pro"] is True
    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 1

    assert run_db(_payment_attempt_count(user_id, "cs_idempotent", "verify-cs_idempotent")) == 1


def test_verify_session_retryable_stripe_failure_is_retried_without_releasing_idempotency_attempt(
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
    headers = {"Authorization": f"Bearer {token}", "Idempotency-Key": "verify-cs_retryable"}

    first = app_client.get("/api/payments/verify-session?session_id=cs_retryable", headers=headers)

    assert first.status_code == 200
    assert first.json()["is_pro"] is True
    assert calls["count"] == 2
    assert run_db(_payment_attempt_count(user_id, "cs_retryable", "verify-cs_retryable")) == 1

    second = app_client.get("/api/payments/verify-session?session_id=cs_retryable", headers=headers)

    assert second.status_code == 200
    assert second.json()["is_pro"] is True
    assert calls["count"] == 2
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_retryable"
    assert run_db(_payment_attempt_count(user_id, "cs_retryable", "verify-cs_retryable")) == 1


def test_create_checkout_session_reuses_existing_customer_id(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-router-existing@example.com", stripe_customer_id="cus_existing"))
    token = create_token(user_id, test_settings)
    calls = []

    async def fake_create_checkout_session(user, plan, settings):
        calls.append({"customer_id": user.stripe_customer_id, "plan": plan})
        return "https://checkout.example/router-existing"

    monkeypatch.setattr(payments_router, "create_checkout_session", fake_create_checkout_session)
    response = app_client.post(
        "/api/payments/create-checkout-session",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": "https://checkout.example/router-existing"}
    assert calls == [{"customer_id": "cus_existing", "plan": "pro"}]
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
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-completed@example.com"))

    def fake_construct_event(payload, sig, secret):
        assert payload == b"{}"
        assert sig == "sig"
        assert secret == "whsec_test"
        return {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_checkout", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
        }

    monkeypatch.setattr(payments_router.stripe.Webhook, "construct_event", fake_construct_event)
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_checkout"


def test_webhook_checkout_completed_ignores_unpaid_session(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-unpaid@example.com"))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_unpaid", "payment_status": "unpaid", "metadata": {"user_id": str(user_id)}}},
        },
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

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
    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_wrong_user",
        headers={"Authorization": f"Bearer {caller_token}", "Idempotency-Key": "verify-cs_wrong_user"},
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
    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_matching_user",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "verify-cs_matching_user"},
    )

    assert response.status_code == 200
    assert response.json()["is_pro"] is True
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_matching"


def test_webhook_checkout_completed_preserves_existing_customer_when_missing(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-existing-customer@example.com", stripe_customer_id="cus_existing"))

    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
        },
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_existing"


def test_webhook_checkout_completed_ignores_malformed_user_id(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-malformed-user@example.com", is_pro=False))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_malformed", "payment_status": "paid", "metadata": {"user_id": "not-a-number"}}},
        },
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200
    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    assert user.stripe_customer_id == ""


def test_webhook_subscription_deleted_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("subscription-deleted@example.com", is_pro=True, stripe_customer_id="cus_deleted"))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {"type": "customer.subscription.deleted", "data": {"object": {"customer": "cus_deleted"}}},
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200
    assert run_db(_get_user(user_id)).is_pro is False


def test_webhook_invoice_payment_failed_does_not_revoke_during_dunning(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("invoice-failed@example.com", is_pro=True, stripe_customer_id="cus_failed"))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {"type": "invoice.payment_failed", "data": {"object": {"customer": "cus_failed"}}},
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200
    assert run_db(_get_user(user_id)).is_pro is True


def test_webhook_charge_refunded_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("charge-refunded@example.com", is_pro=True, stripe_customer_id="cus_refunded"))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {"type": "charge.refunded", "data": {"object": {"customer": "cus_refunded"}}},
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

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
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {"type": "charge.dispute.created", "data": {"object": {"charge": "ch_disputed"}}},
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

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
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "id": "evt_dispute_retry",
            "type": "charge.dispute.created",
            "data": {"object": {"charge": "ch_retry"}},
        },
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        first = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
        second = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert first.status_code == 503
    assert "temporarily unavailable" in first.text
    assert second.status_code == 200
    assert lookups["count"] == 2
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_webhook_event_count("evt_dispute_retry")) == 1


def test_webhook_resolves_dispute_customer_before_recording_event(app_client, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    original_secret = _with_webhook_secret(test_settings)
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
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "id": "evt_dispute_order",
            "type": "charge.dispute.created",
            "data": {"object": {"customer": "", "charge": "ch_order"}},
        },
    )

    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 200


def test_webhook_duplicate_event_id_does_not_replay_side_effects(app_client, test_settings, monkeypatch, run_db):
    import app.routers.payments as payments_router

    user_id = run_db(_seed_user("checkout-duplicate-event@example.com"))
    monkeypatch.setattr(
        payments_router.stripe.Webhook,
        "construct_event",
        lambda *_: {
            "id": "evt_duplicate_checkout",
            "type": "checkout.session.completed",
            "data": {"object": {"customer": "cus_duplicate", "payment_status": "paid", "metadata": {"user_id": str(user_id)}}},
        },
    )
    original_secret = _with_webhook_secret(test_settings)
    try:
        first = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
        run_db(_set_user_pro(user_id, False))
        duplicate = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert run_db(_get_user(user_id)).is_pro is False
    assert run_db(_webhook_event_count("evt_duplicate_checkout")) == 1


def test_webhook_rejects_invalid_signature(app_client, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    def raise_signature_error(*_):
        raise payments_router.stripe.SignatureVerificationError("bad signature", "sig")

    monkeypatch.setattr(payments_router.stripe.Webhook, "construct_event", raise_signature_error)
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 400
    assert "Invalid Stripe signature" in response.text


def test_webhook_rejects_invalid_payload(app_client, test_settings, monkeypatch):
    import app.routers.payments as payments_router

    monkeypatch.setattr(payments_router.stripe.Webhook, "construct_event", lambda *_: (_ for _ in ()).throw(ValueError()))
    original_secret = _with_webhook_secret(test_settings)
    try:
        response = app_client.post("/api/payments/webhook", content=b"not-json", headers={"stripe-signature": "sig"})
    finally:
        test_settings.stripe_webhook_secret = original_secret

    assert response.status_code == 400
    assert "Invalid payload" in response.text
