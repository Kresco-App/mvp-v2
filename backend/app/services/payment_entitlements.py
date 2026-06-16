from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Subject
from app.models.users import User
from app.models.users import UserSubjectEntitlement


PAID_ENTITLEMENT_SOURCE_PREFIX = "payment"


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


def _normalize_entitlement_source(source: str) -> str:
    normalized = source.strip().lower().replace(" ", "_")
    if not normalized:
        return PAID_ENTITLEMENT_SOURCE_PREFIX
    if normalized.startswith(f"{PAID_ENTITLEMENT_SOURCE_PREFIX}:"):
        return normalized[:60]
    return f"{PAID_ENTITLEMENT_SOURCE_PREFIX}:{normalized}"[:60]
