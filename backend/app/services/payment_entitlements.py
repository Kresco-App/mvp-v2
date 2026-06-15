from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User


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

    if changed:
        await db.commit()
    return changed


async def apply_paid_checkout_by_user_id(
    db: AsyncSession,
    user_id: int,
    *,
    customer_id: str | None = "",
) -> bool:
    values: dict[str, object] = {"is_pro": True}
    normalized_customer_id = _normalize_customer_id(customer_id)
    if normalized_customer_id:
        values["stripe_customer_id"] = normalized_customer_id

    result = await db.execute(update(User).where(User.id == user_id).values(**values))
    await db.commit()
    return result.rowcount > 0


async def revoke_paid_access_by_customer_id(
    db: AsyncSession,
    *,
    customer_id: str | None = "",
) -> bool:
    normalized_customer_id = _normalize_customer_id(customer_id)
    if not normalized_customer_id:
        return False

    result = await db.execute(
        update(User)
        .where(User.stripe_customer_id == normalized_customer_id)
        .values(is_pro=False)
    )
    await db.commit()
    return result.rowcount > 0
