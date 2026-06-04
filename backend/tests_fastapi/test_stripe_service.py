import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.users import User
from app.services import stripe_service
from app.services.stripe_service import create_checkout_session, customer_id_for_charge, verify_checkout_session


class FakeCustomers:
    def __init__(self):
        self.created_params = None

    def create(self, params):
        self.created_params = params
        return SimpleNamespace(id="cus_new")


class FakeSessions:
    def __init__(self, payment_status="paid", retrieve_error=None, create_error=None, metadata=None, customer="cus_test"):
        self.created_params = None
        self.payment_status = payment_status
        self.retrieve_error = retrieve_error
        self.create_error = create_error
        self.metadata = metadata or {}
        self.customer = customer

    def create(self, params):
        if self.create_error:
            raise self.create_error
        self.created_params = params
        return SimpleNamespace(url="https://checkout.example/session")

    def retrieve(self, session_id):
        if self.retrieve_error:
            raise self.retrieve_error
        return SimpleNamespace(id=session_id, payment_status=self.payment_status, metadata=self.metadata, customer=self.customer)


class FakeCharges:
    def __init__(self, customer="cus_charge", retrieve_error=None):
        self.customer = customer
        self.retrieve_error = retrieve_error
        self.retrieved_charge_id = None

    def retrieve(self, charge_id):
        self.retrieved_charge_id = charge_id
        if self.retrieve_error:
            raise self.retrieve_error
        return SimpleNamespace(id=charge_id, customer=self.customer)


class FakeStripeClient:
    def __init__(self, sessions=None, charges=None):
        self.v1 = SimpleNamespace(
            customers=FakeCustomers(),
            checkout=SimpleNamespace(sessions=sessions or FakeSessions()),
            charges=charges or FakeCharges(),
        )


def test_create_checkout_session_creates_customer_and_assigns_user_id(monkeypatch, test_settings):
    client = FakeStripeClient()
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    settings = test_settings.model_copy(
        update={
            "frontend_url": "https://app.example",
            "stripe_product_id": "prod_kresco",
            "stripe_sk": "sk_test",
        }
    )
    user = User(id=123, email="buyer@example.com", full_name="Buyer", stripe_customer_id="")

    checkout_url = asyncio.run(create_checkout_session(user, "pro", settings))

    assert checkout_url == "https://checkout.example/session"
    assert user.stripe_customer_id == "cus_new"
    assert client.v1.customers.created_params == {
        "email": "buyer@example.com",
        "name": "Buyer",
        "metadata": {"user_id": "123"},
    }
    assert client.v1.checkout.sessions.created_params["customer"] == "cus_new"
    assert client.v1.checkout.sessions.created_params["line_items"][0]["price_data"] == {
        "currency": "mad",
        "unit_amount": 9900,
        "product": "prod_kresco",
    }
    assert client.v1.checkout.sessions.created_params["success_url"] == (
        "https://app.example/payment-success?session_id={CHECKOUT_SESSION_ID}"
    )
    assert client.v1.checkout.sessions.created_params["cancel_url"] == "https://app.example/pricing"
    assert client.v1.checkout.sessions.created_params["metadata"] == {
        "user_id": "123",
        "plan": "pro",
        "access_model": "one_time_pro_unlock",
    }


def test_create_checkout_session_reuses_existing_customer_and_normalizes_return_urls(monkeypatch, test_settings):
    client = FakeStripeClient()
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    settings = test_settings.model_copy(
        update={
            "frontend_url": "https://app.example/",
            "stripe_product_id": "prod_kresco",
            "stripe_sk": "sk_test",
        }
    )
    user = User(id=124, email="existing-buyer@example.com", full_name="Existing Buyer", stripe_customer_id="cus_existing")

    checkout_url = asyncio.run(create_checkout_session(user, "pro", settings))

    assert checkout_url == "https://checkout.example/session"
    assert user.stripe_customer_id == "cus_existing"
    assert client.v1.customers.created_params is None
    assert client.v1.checkout.sessions.created_params["customer"] == "cus_existing"
    assert client.v1.checkout.sessions.created_params["line_items"][0]["price_data"]["unit_amount"] == 9900
    assert client.v1.checkout.sessions.created_params["success_url"] == (
        "https://app.example/payment-success?session_id={CHECKOUT_SESSION_ID}"
    )
    assert client.v1.checkout.sessions.created_params["cancel_url"] == "https://app.example/pricing"
    assert client.v1.checkout.sessions.created_params["metadata"] == {
        "user_id": "124",
        "plan": "pro",
        "access_model": "one_time_pro_unlock",
    }


def test_create_checkout_session_uses_safe_relative_return_paths(monkeypatch, test_settings):
    client = FakeStripeClient()
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    settings = test_settings.model_copy(
        update={
            "frontend_url": "https://app.example/",
            "stripe_product_id": "prod_kresco",
            "stripe_sk": "sk_test",
        }
    )
    user = User(id=125, email="return-path-buyer@example.com", full_name="Return Buyer", stripe_customer_id="cus_existing")

    checkout_url = asyncio.run(create_checkout_session(
        user,
        "pro",
        settings,
        success_path="/payment-success?return_to=/topics/42",
        cancel_path="/topics/42",
    ))

    assert checkout_url == "https://checkout.example/session"
    assert client.v1.checkout.sessions.created_params["success_url"] == (
        "https://app.example/payment-success?return_to=/topics/42&session_id={CHECKOUT_SESSION_ID}"
    )
    assert client.v1.checkout.sessions.created_params["cancel_url"] == "https://app.example/topics/42"


@pytest.mark.parametrize("return_path", ["https://evil.example/pay", "//evil.example/pay", "/\\evil"])
def test_create_checkout_session_rejects_unsafe_return_paths(monkeypatch, test_settings, return_path):
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: pytest.fail("Stripe client should not be created"))
    settings = test_settings.model_copy(
        update={
            "frontend_url": "https://app.example/",
            "stripe_product_id": "prod_kresco",
            "stripe_sk": "sk_test",
        }
    )
    user = User(id=126, email="unsafe-return@example.com", full_name="Unsafe Buyer", stripe_customer_id="cus_existing")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_checkout_session(user, "pro", settings, success_path=return_path))

    assert exc.value.status_code == 400
    assert "safe relative URLs" in exc.value.detail


def test_create_checkout_session_rejects_unknown_plan(test_settings):
    user = User(id=123, email="buyer@example.com", full_name="Buyer")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_checkout_session(user, "yearly", test_settings))

    assert exc.value.status_code == 400
    assert "Invalid plan" in exc.value.detail


def test_create_checkout_session_fails_fast_when_checkout_config_is_missing(monkeypatch, test_settings):
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: pytest.fail("Stripe client should not be created"))
    settings = test_settings.model_copy(update={"stripe_sk": "", "stripe_product_id": ""})
    user = User(id=123, email="buyer@example.com", full_name="Buyer")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_checkout_session(user, "pro", settings))

    assert exc.value.status_code == 503
    assert "Stripe checkout is not configured" in exc.value.detail


def test_create_checkout_session_returns_unavailable_on_stripe_error(monkeypatch, test_settings):
    client = FakeStripeClient(
        sessions=FakeSessions(create_error=stripe_service.stripe.APIConnectionError("temporary transport failure"))
    )
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    settings = test_settings.model_copy(
        update={
            "frontend_url": "https://app.example",
            "stripe_product_id": "prod_kresco",
            "stripe_sk": "sk_test",
        }
    )
    user = User(id=123, email="buyer@example.com", full_name="Buyer", stripe_customer_id="cus_existing")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_checkout_session(user, "pro", settings))

    assert exc.value.status_code == 503
    assert exc.value.detail == stripe_service.CHECKOUT_UNAVAILABLE_DETAIL


def test_stripe_client_uses_bounded_network_timeout(monkeypatch, test_settings):
    captured = {}

    class FakeRequestsClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

    class FakeStripeClient:
        def __init__(self, api_key, *, max_network_retries, http_client):
            captured["api_key"] = api_key
            captured["max_network_retries"] = max_network_retries
            captured["http_client"] = http_client

    monkeypatch.setattr(stripe_service.stripe, "RequestsClient", FakeRequestsClient)
    monkeypatch.setattr(stripe_service.stripe, "StripeClient", FakeStripeClient)

    client = stripe_service._stripe_client(test_settings.model_copy(update={"stripe_sk": "sk_test"}))

    assert client is captured["http_client"] or isinstance(captured["http_client"], FakeRequestsClient)
    assert captured["api_key"] == "sk_test"
    assert captured["max_network_retries"] == 0
    assert captured["timeout"] == (
        stripe_service.STRIPE_CONNECT_TIMEOUT_SECONDS,
        stripe_service.STRIPE_READ_TIMEOUT_SECONDS,
    )


@pytest.mark.parametrize(("payment_status", "expected"), [("paid", True), ("unpaid", False)])
def test_verify_checkout_session_maps_payment_status(monkeypatch, test_settings, payment_status, expected):
    client = FakeStripeClient(sessions=FakeSessions(payment_status=payment_status, metadata={"user_id": "123"}))
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)

    verification = asyncio.run(verify_checkout_session("cs_test", test_settings))
    assert verification.is_paid is expected
    assert verification.user_id == 123
    assert verification.customer_id == "cus_test"


def test_verify_checkout_session_returns_false_on_stripe_error(monkeypatch, test_settings):
    client = FakeStripeClient(sessions=FakeSessions(retrieve_error=stripe_service.stripe.StripeError("boom")))
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)

    verification = asyncio.run(verify_checkout_session("cs_test", test_settings))
    assert verification.is_paid is False
    assert verification.user_id is None


def test_verify_checkout_session_retries_transient_fetch_errors(monkeypatch, test_settings):
    calls = {"count": 0}

    class RetryOnceSessions(FakeSessions):
        def retrieve(self, session_id):
            calls["count"] += 1
            if calls["count"] == 1:
                raise stripe_service.stripe.APIConnectionError("temporary transport failure", should_retry=True)
            return SimpleNamespace(
                id=session_id,
                payment_status="paid",
                metadata={"user_id": "123"},
                customer="cus_retry",
            )

    client = FakeStripeClient(sessions=RetryOnceSessions())
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    monkeypatch.setattr(stripe_service, "STRIPE_FETCH_RETRY_BASE_SECONDS", 0)

    verification = asyncio.run(verify_checkout_session("cs_retry", test_settings))

    assert verification.is_paid is True
    assert verification.user_id == 123
    assert verification.customer_id == "cus_retry"
    assert calls["count"] == 2


def test_customer_id_for_charge_retrieves_charge_customer(monkeypatch, test_settings):
    charges = FakeCharges(customer="cus_from_charge")
    client = FakeStripeClient(charges=charges)
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    settings = test_settings.model_copy(update={"stripe_sk": "sk_test"})

    customer_id = asyncio.run(customer_id_for_charge("ch_test", settings))

    assert customer_id == "cus_from_charge"
    assert charges.retrieved_charge_id == "ch_test"


def test_customer_id_for_charge_retries_transient_fetch_errors(monkeypatch, test_settings):
    calls = {"count": 0}

    class RetryOnceCharges(FakeCharges):
        def retrieve(self, charge_id):
            calls["count"] += 1
            if calls["count"] == 1:
                raise stripe_service.stripe.APIConnectionError("temporary transport failure", should_retry=True)
            self.retrieved_charge_id = charge_id
            return SimpleNamespace(id=charge_id, customer="cus_retry_charge")

    charges = RetryOnceCharges()
    client = FakeStripeClient(charges=charges)
    monkeypatch.setattr(stripe_service, "_stripe_client", lambda settings: client)
    monkeypatch.setattr(stripe_service, "STRIPE_FETCH_RETRY_BASE_SECONDS", 0)
    settings = test_settings.model_copy(update={"stripe_sk": "sk_test"})

    customer_id = asyncio.run(customer_id_for_charge("ch_retry", settings))

    assert customer_id == "cus_retry_charge"
    assert charges.retrieved_charge_id == "ch_retry"
    assert calls["count"] == 2
