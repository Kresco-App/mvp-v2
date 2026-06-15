from datetime import datetime, timezone

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Subject
from app.models.users import User
from app.models.users import UserSubjectEntitlement


PAID_ENTITLEMENT_SOURCE_PREFIX = "payment"


def _normalize_customer_id(customer_id: str | None) -> str:
    return str(customer_id or "").strip()


def stripe_metadata_user_id(metadata: object) -> int | None:
    if not isinstance(metadata, dict):
        return None
    raw_user_id = metadata.get("user_id")
    if raw_user_id in (None, ""):
        return None
    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return None
    return user_id if user_id > 0 else None


async def grant_paid_subject_entitlements(
    db: AsyncSession,
    *,
    user: User,
    source: str,
    starts_at: datetime | None = None,
) -> int:
    normalized_source = _normalize_entitlement_source(source)
    entitlement_start = starts_at or datetime.now(timezone.utc)
    subject_ids = list(
        (
            await db.execute(
                select(Subject.id)
                .order_by(Subject.id.asc())
            )
        ).scalars().all()
    )
    if not subject_ids:
        return 0

    existing_subject_ids = set(
        (
            await db.execute(
                select(UserSubjectEntitlement.subject_id)
                .where(
                    UserSubjectEntitlement.user_id == int(user.id),
                    UserSubjectEntitlement.subject_id.in_(subject_ids),
                    UserSubjectEntitlement.status == "active",
                    or_(
                        UserSubjectEntitlement.starts_at.is_(None),
                        UserSubjectEntitlement.starts_at <= entitlement_start,
                    ),
                    or_(
                        UserSubjectEntitlement.ends_at.is_(None),
                        UserSubjectEntitlement.ends_at >= entitlement_start,
                    ),
                )
            )
        ).scalars().all()
    )
    missing_subject_ids = [subject_id for subject_id in subject_ids if subject_id not in existing_subject_ids]
    for subject_id in missing_subject_ids:
        db.add(
            UserSubjectEntitlement(
                user_id=int(user.id),
                subject_id=int(subject_id),
                starts_at=entitlement_start,
                ends_at=None,
                source=normalized_source,
                status="active",
            )
        )
    return len(missing_subject_ids)


async def persist_created_stripe_customer(
    db: AsyncSession,
    user: User,
    *,
    previous_customer_id: str,
    customer_id: str | None = "",
) -> bool:
    normalized_customer_id = _normalize_customer_id(customer_id)
    if previous_customer_id or not normalized_customer_id:
        return False
    user.stripe_customer_id = normalized_customer_id
    await db.commit()
    return True


async def apply_paid_checkout_to_user(
    db: AsyncSession,
    user: User,
    *,
    customer_id: str | None = "",
) -> bool:
    changed = False
    normalized_customer_id = _normalize_customer_id(customer_id)

    if not user.is_pro:
        user.is_pro = True
        changed = True

    if normalized_customer_id and user.stripe_customer_id != normalized_customer_id:
        user.stripe_customer_id = normalized_customer_id
        changed = True

    entitlement_count = await grant_paid_subject_entitlements(
        db,
        user=user,
        source=f"stripe:{normalized_customer_id}" if normalized_customer_id else "stripe",
    )
    if entitlement_count > 0:
        changed = True

    if changed:
        await db.commit()
    return changed


async def apply_paid_checkout_by_user_id(
    db: AsyncSession,
    user_id: int,
    *,
    customer_id: str | None = "",
) -> bool:
    user = await db.get(User, int(user_id))
    if user is None:
        return False

    changed = False
    normalized_customer_id = _normalize_customer_id(customer_id)

    if not user.is_pro:
        user.is_pro = True
        changed = True

    if normalized_customer_id and user.stripe_customer_id != normalized_customer_id:
        user.stripe_customer_id = normalized_customer_id
        changed = True

    entitlement_count = await grant_paid_subject_entitlements(
        db,
        user=user,
        source=f"stripe:{normalized_customer_id}" if normalized_customer_id else "stripe",
    )
    if entitlement_count > 0:
        changed = True

    if changed:
        await db.commit()
    return changed


def _normalize_entitlement_source(source: str) -> str:
    normalized = source.strip().lower().replace(" ", "_")
    if not normalized:
        return PAID_ENTITLEMENT_SOURCE_PREFIX
    if normalized.startswith(f"{PAID_ENTITLEMENT_SOURCE_PREFIX}:"):
        return normalized[:60]
    return f"{PAID_ENTITLEMENT_SOURCE_PREFIX}:{normalized}"[:60]


async def revoke_paid_access_by_customer_id(
    db: AsyncSession,
    *,
    customer_id: str | None = "",
) -> bool:
    normalized_customer_id = _normalize_customer_id(customer_id)
    if not normalized_customer_id:
        return False

    result = await db.execute(
        select(User.id)
        .where(User.stripe_customer_id == normalized_customer_id)
    )
    user_ids = [int(user_id) for user_id in result.scalars().all()]
    if not user_ids:
        return False

    await db.execute(
        update(User)
        .where(User.id.in_(user_ids))
        .values(is_pro=False)
    )
    await db.execute(
        update(UserSubjectEntitlement)
        .where(
            UserSubjectEntitlement.user_id.in_(user_ids),
            UserSubjectEntitlement.status == "active",
            UserSubjectEntitlement.source.like(f"{PAID_ENTITLEMENT_SOURCE_PREFIX}:stripe%"),
        )
        .values(status="revoked", ends_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return True
