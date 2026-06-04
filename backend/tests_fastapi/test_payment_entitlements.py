import pytest
from sqlalchemy import select

from app.database import get_session_factory
from app.models.users import User
from app.services.payment_entitlements import (
    apply_paid_checkout_by_user_id,
    apply_paid_checkout_to_user,
    persist_created_stripe_customer,
    revoke_paid_access_by_customer_id,
    stripe_metadata_user_id,
)

pytestmark = pytest.mark.usefixtures("app_client")


async def _seed_user(email: str, *, is_pro: bool = False, stripe_customer_id: str = "") -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Entitlement User",
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


async def _apply_paid_to_loaded_user(user_id: int, customer_id: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = await db.get(User, user_id)
        changed = await apply_paid_checkout_to_user(db, user, customer_id=customer_id)
        return changed, user.is_pro, user.stripe_customer_id


async def _persist_new_customer(user_id: int):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = await db.get(User, user_id)
        previous_customer_id = user.stripe_customer_id
        user.stripe_customer_id = "cus_created"
        return await persist_created_stripe_customer(db, user, previous_customer_id=previous_customer_id)


async def _apply_paid_by_id(user_id: int, customer_id: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await apply_paid_checkout_by_user_id(db, user_id, customer_id=customer_id)


async def _revoke_by_customer(customer_id: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await revoke_paid_access_by_customer_id(db, customer_id=customer_id)


def test_apply_paid_checkout_to_user_sets_pro_and_customer(run_db):
    user_id = run_db(_seed_user("entitlement-loaded@example.com"))

    changed, is_pro, customer_id = run_db(_apply_paid_to_loaded_user(user_id, "cus_loaded"))

    assert changed is True
    assert is_pro is True
    assert customer_id == "cus_loaded"
    persisted = run_db(_get_user(user_id))
    assert persisted.is_pro is True
    assert persisted.stripe_customer_id == "cus_loaded"


def test_apply_paid_checkout_to_user_updates_customer_when_paid_checkout_returns_new_customer(run_db):
    user_id = run_db(_seed_user("entitlement-existing@example.com", is_pro=True, stripe_customer_id="cus_existing"))

    changed, is_pro, customer_id = run_db(_apply_paid_to_loaded_user(user_id, "cus_new"))

    assert changed is True
    assert is_pro is True
    assert customer_id == "cus_new"
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_new"


def test_apply_paid_checkout_to_user_is_noop_when_state_already_matches(run_db):
    user_id = run_db(_seed_user("entitlement-matching@example.com", is_pro=True, stripe_customer_id="cus_existing"))

    changed, is_pro, customer_id = run_db(_apply_paid_to_loaded_user(user_id, "cus_existing"))

    assert changed is False
    assert is_pro is True
    assert customer_id == "cus_existing"
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_existing"


def test_old_customer_webhook_cannot_revoke_after_new_checkout_customer_is_persisted(run_db):
    user_id = run_db(_seed_user("entitlement-replace-customer@example.com", is_pro=True, stripe_customer_id="cus_old"))

    changed, is_pro, customer_id = run_db(_apply_paid_to_loaded_user(user_id, "cus_new"))

    assert changed is True
    assert is_pro is True
    assert customer_id == "cus_new"
    assert run_db(_revoke_by_customer("cus_old")) is False

    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_new"


def test_apply_paid_checkout_by_user_id_preserves_customer_when_missing(run_db):
    user_id = run_db(_seed_user("entitlement-webhook-existing@example.com", stripe_customer_id="cus_existing"))

    assert run_db(_apply_paid_by_id(user_id, "")) is True

    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_existing"


def test_apply_paid_checkout_by_user_id_updates_customer_when_present(run_db):
    user_id = run_db(_seed_user("entitlement-webhook-new@example.com"))

    assert run_db(_apply_paid_by_id(user_id, "cus_webhook")) is True

    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_webhook"


def test_revoke_paid_access_by_customer_id(run_db):
    user_id = run_db(_seed_user("entitlement-revoke@example.com", is_pro=True, stripe_customer_id="cus_revoke"))

    assert run_db(_revoke_by_customer("cus_revoke")) is True

    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    assert user.stripe_customer_id == "cus_revoke"


def test_revoke_paid_access_ignores_blank_customer_id(run_db):
    user_id = run_db(_seed_user("entitlement-revoke-blank@example.com", is_pro=True, stripe_customer_id="cus_blank"))

    assert run_db(_revoke_by_customer("")) is False

    assert run_db(_get_user(user_id)).is_pro is True


def test_persist_created_stripe_customer_commits_created_customer_id(run_db):
    user_id = run_db(_seed_user("entitlement-customer-created@example.com"))

    assert run_db(_persist_new_customer(user_id)) is True

    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_created"


def test_stripe_metadata_user_id_is_strict():
    assert stripe_metadata_user_id({"user_id": "123"}) == 123
    assert stripe_metadata_user_id({"user_id": 0}) is None
    assert stripe_metadata_user_id({"user_id": "not-an-id"}) is None
    assert stripe_metadata_user_id({}) is None
    assert stripe_metadata_user_id(None) is None
