from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.users import User, UserSubjectEntitlement
from app.services.payment_entitlements import (
    apply_paid_checkout_by_user_id,
    apply_paid_checkout_to_user,
    grant_paid_subject_entitlements,
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


async def _grant_paid_subjects(user_id: int, source: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = await db.get(User, user_id)
        count = await grant_paid_subject_entitlements(db, user=user, source=source)
        await db.commit()
        return count


async def _subject_entitlements_for_user(user_id: int) -> list[UserSubjectEntitlement]:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(UserSubjectEntitlement)
            .where(UserSubjectEntitlement.user_id == user_id)
            .order_by(UserSubjectEntitlement.subject_id.asc())
        )
        return list(result.scalars().all())


async def _seed_future_entitlement(user_id: int, subject_id: int) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        db.add(
            UserSubjectEntitlement(
                user_id=user_id,
                subject_id=subject_id,
                starts_at=datetime.now(timezone.utc) + timedelta(days=7),
                ends_at=None,
                source="scheduled",
                status="active",
            )
        )
        await db.commit()


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
        return await persist_created_stripe_customer(
            db,
            user,
            previous_customer_id=previous_customer_id,
            customer_id="cus_created",
        )


async def _apply_paid_by_id(user_id: int, customer_id: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await apply_paid_checkout_by_user_id(db, user_id, customer_id=customer_id)


async def _revoke_by_customer(customer_id: str):
    session_factory = get_session_factory()
    async with session_factory() as db:
        return await revoke_paid_access_by_customer_id(db, customer_id=customer_id)


def test_grant_paid_subject_entitlements_creates_rows_for_existing_subjects(run_db):
    user_id = run_db(_seed_user("entitlement-subjects@example.com"))
    subject_ids = run_db(_seed_subjects("Math", "Physique"))

    assert run_db(_grant_paid_subjects(user_id, "cmi:KRESCO-CMI-1")) >= 2

    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.status for entitlement in entitlements} == {"active"}
    assert {entitlement.source for entitlement in entitlements} == {"payment:cmi:kresco-cmi-1"}
    assert all(entitlement.starts_at is not None for entitlement in entitlements)
    assert all(entitlement.ends_at is None for entitlement in entitlements)


def test_grant_paid_subject_entitlements_is_idempotent_for_active_subject_rows(run_db):
    user_id = run_db(_seed_user("entitlement-subjects-idempotent@example.com"))
    run_db(_seed_subjects("SVT", "Chimie"))

    assert run_db(_grant_paid_subjects(user_id, "cashplus:KRESCO-CASH-1")) >= 2
    assert run_db(_grant_paid_subjects(user_id, "cashplus:KRESCO-CASH-1")) == 0

    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert len(entitlements) >= 2


def test_grant_paid_subject_entitlements_does_not_treat_future_rows_as_current(run_db):
    user_id = run_db(_seed_user("entitlement-future-row@example.com"))
    subject_id = run_db(_seed_subjects("Future Maths"))[-1]
    run_db(_seed_future_entitlement(user_id, subject_id))

    assert run_db(_grant_paid_subjects(user_id, "cmi:KRESCO-CMI-FUTURE")) >= 1

    entitlements = run_db(_subject_entitlements_for_user(user_id))
    subject_entitlements = [item for item in entitlements if item.subject_id == subject_id]
    assert len(subject_entitlements) == 2
    assert {item.source for item in subject_entitlements} == {"scheduled", "payment:cmi:kresco-cmi-future"}


def test_apply_paid_checkout_to_user_sets_pro_and_customer(run_db):
    user_id = run_db(_seed_user("entitlement-loaded@example.com"))
    subject_ids = run_db(_seed_subjects("Stripe Loaded Maths"))

    changed, is_pro, customer_id = run_db(_apply_paid_to_loaded_user(user_id, "cus_loaded"))

    assert changed is True
    assert is_pro is True
    assert customer_id == "cus_loaded"
    persisted = run_db(_get_user(user_id))
    assert persisted.is_pro is True
    assert persisted.stripe_customer_id == "cus_loaded"
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.source for entitlement in entitlements} == {"payment:stripe:cus_loaded"}


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

    assert is_pro is True
    assert customer_id == "cus_existing"
    assert run_db(_get_user(user_id)).stripe_customer_id == "cus_existing"
    if run_db(_subject_entitlements_for_user(user_id)):
        assert changed is True
    else:
        assert changed is False


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
    subject_ids = run_db(_seed_subjects("Stripe Webhook Maths"))

    assert run_db(_apply_paid_by_id(user_id, "cus_webhook")) is True

    user = run_db(_get_user(user_id))
    assert user.is_pro is True
    assert user.stripe_customer_id == "cus_webhook"
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert set(subject_ids).issubset({entitlement.subject_id for entitlement in entitlements})
    assert {entitlement.source for entitlement in entitlements} == {"payment:stripe:cus_webhook"}


def test_revoke_paid_access_by_customer_id(run_db):
    user_id = run_db(_seed_user("entitlement-revoke@example.com", is_pro=True, stripe_customer_id="cus_revoke"))
    run_db(_seed_subjects("Stripe Revoke Maths"))
    assert run_db(_grant_paid_subjects(user_id, "stripe:cus_revoke")) >= 1
    later_cash_subject_id = run_db(_seed_subjects("Later CashPlus Subject"))[-1]
    assert run_db(_grant_paid_subjects(user_id, "cashplus:KRESCO-CASH-LATER")) == 1

    assert run_db(_revoke_by_customer("cus_revoke")) is True

    user = run_db(_get_user(user_id))
    assert user.is_pro is False
    assert user.stripe_customer_id == "cus_revoke"
    entitlements = run_db(_subject_entitlements_for_user(user_id))
    assert entitlements
    stripe_entitlements = [item for item in entitlements if item.source.startswith("payment:stripe")]
    cash_entitlements = [item for item in entitlements if item.source.startswith("payment:cashplus")]
    assert stripe_entitlements
    assert {entitlement.status for entitlement in stripe_entitlements} == {"revoked"}
    assert all(entitlement.ends_at is not None for entitlement in stripe_entitlements)
    assert [entitlement.subject_id for entitlement in cash_entitlements] == [later_cash_subject_id]
    assert {entitlement.status for entitlement in cash_entitlements} == {"active"}
    assert all(entitlement.ends_at is None for entitlement in cash_entitlements)


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
