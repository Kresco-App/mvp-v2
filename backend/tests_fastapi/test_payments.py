from sqlalchemy import select

from app.database import get_session_factory
from app.models.users import User
from app.services.auth import create_token


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


def test_create_checkout_session_persists_new_customer_id(app_client, auth_token, monkeypatch, run_db):
    import app.routers.payments as payments_router

    token, user_id = auth_token(email="checkout-router-new@example.com")
    calls = []

    async def fake_create_checkout_session(user, plan, settings):
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
            "data": {"object": {"customer": "cus_checkout", "metadata": {"user_id": str(user_id)}}},
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
    response = app_client.get(
        "/api/payments/verify-session?session_id=cs_matching_user",
        headers={"Authorization": f"Bearer {token}"},
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
            "data": {"object": {"customer": "", "metadata": {"user_id": str(user_id)}}},
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
            "data": {"object": {"customer": "cus_malformed", "metadata": {"user_id": "not-a-number"}}},
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


def test_webhook_invoice_payment_failed_marks_user_not_pro(app_client, test_settings, monkeypatch, run_db):
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
    assert run_db(_get_user(user_id)).is_pro is False


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
