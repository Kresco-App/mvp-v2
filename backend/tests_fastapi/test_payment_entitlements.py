from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.database import get_session_factory
from app.models.courses import Subject
from app.models.users import User, UserSubjectEntitlement
from app.services.payment_entitlements import (
    grant_paid_subject_entitlements,
)

pytestmark = pytest.mark.usefixtures("app_client")


async def _seed_user(email: str, *, is_pro: bool = False) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=email,
            full_name="Entitlement User",
            is_active=True,
            is_email_verified=True,
            is_pro=is_pro,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


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
