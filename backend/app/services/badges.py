from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserBadge, UserXP, XPTransaction
from app.models.users import User
from app.schemas.gamification import UserBadgeInventoryOut, UserBadgeOut


@dataclass(frozen=True)
class BadgeDefinition:
    slug: str
    title: str
    description: str
    category: str
    rarity: str


BADGE_DEFINITIONS: tuple[BadgeDefinition, ...] = (
    BadgeDefinition(
        slug="xp_100",
        title="Premiers 100 XP",
        description="Atteindre 100 XP au total.",
        category="xp",
        rarity="common",
    ),
    BadgeDefinition(
        slug="xp_500",
        title="Rythme solide",
        description="Atteindre 500 XP au total.",
        category="xp",
        rarity="rare",
    ),
    BadgeDefinition(
        slug="streak_7",
        title="Semaine active",
        description="Maintenir 7 jours d'activite.",
        category="streak",
        rarity="rare",
    ),
    BadgeDefinition(
        slug="first_exercise_mastered",
        title="Premier exercice maitrise",
        description="Marquer un exercice comme maitrise.",
        category="exercise",
        rarity="common",
    ),
    BadgeDefinition(
        slug="first_exam_completed",
        title="Premiere capsule Bac terminee",
        description="Terminer une capsule de probleme d'examen.",
        category="exam",
        rarity="rare",
    ),
    BadgeDefinition(
        slug="first_mistake_corrected",
        title="Erreur corrigee",
        description="Corriger une question precedemment ratee.",
        category="revision",
        rarity="rare",
    ),
)

XP_REASON_BADGES = {
    "first_exercise_mastered": "exercise_mastered",
    "first_exam_completed": "exam_complete",
    "first_mistake_corrected": "mistake_corrected",
}


async def build_user_badge_inventory(
    db: AsyncSession,
    *,
    user: User,
) -> tuple[UserBadgeInventoryOut, bool]:
    existing = await _user_badges(db, user_id=int(user.id))
    criteria = await _badge_criteria(db, user_id=int(user.id))
    changed = False
    saw_conflict = False
    now = datetime.now(timezone.utc)

    for definition in BADGE_DEFINITIONS:
        if definition.slug in existing or definition.slug not in criteria:
            continue
        inserted = await _insert_badge(
            db,
            user_id=int(user.id),
            slug=definition.slug,
            evidence=criteria[definition.slug],
            earned_at=now,
        )
        if inserted:
            changed = True
        else:
            saw_conflict = True

    if changed or saw_conflict:
        existing = await _user_badges(db, user_id=int(user.id))

    badges = [
        _badge_out(definition, existing.get(definition.slug))
        for definition in BADGE_DEFINITIONS
    ]
    earned_count = sum(1 for badge in badges if badge.earned)
    return (
        UserBadgeInventoryOut(
            badges=badges,
            earned_count=earned_count,
            total_count=len(BADGE_DEFINITIONS),
        ),
        changed,
    )


async def _badge_criteria(db: AsyncSession, *, user_id: int) -> dict[str, dict]:
    xp = await db.scalar(select(UserXP).where(UserXP.user_id == user_id))
    total_xp = int(xp.total_xp or 0) if xp else 0
    streak_days = int(xp.streak_days or 0) if xp else 0
    reason_counts = await _xp_reason_counts(db, user_id=user_id)

    criteria: dict[str, dict] = {}
    if total_xp >= 100:
        criteria["xp_100"] = {"total_xp": total_xp, "threshold": 100}
    if total_xp >= 500:
        criteria["xp_500"] = {"total_xp": total_xp, "threshold": 500}
    if streak_days >= 7:
        criteria["streak_7"] = {"streak_days": streak_days, "threshold": 7}
    for badge_slug, reason in XP_REASON_BADGES.items():
        count = int(reason_counts.get(reason, 0))
        if count > 0:
            criteria[badge_slug] = {"reason": reason, "transaction_count": count}
    return criteria


async def _xp_reason_counts(db: AsyncSession, *, user_id: int) -> dict[str, int]:
    result = await db.execute(
        select(XPTransaction.reason, func.count())
        .where(
            XPTransaction.user_id == user_id,
            XPTransaction.reason.in_(list(XP_REASON_BADGES.values())),
        )
        .group_by(XPTransaction.reason)
    )
    return {str(reason): int(count) for reason, count in result.all()}


async def _user_badges(db: AsyncSession, *, user_id: int) -> dict[str, UserBadge]:
    result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.asc(), UserBadge.id.asc())
    )
    return {badge.badge_slug: badge for badge in result.scalars().all()}


async def _insert_badge(
    db: AsyncSession,
    *,
    user_id: int,
    slug: str,
    evidence: dict,
    earned_at: datetime,
) -> bool:
    try:
        async with db.begin_nested():
            db.add(
                UserBadge(
                    user_id=user_id,
                    badge_slug=slug,
                    evidence_json=evidence,
                    earned_at=earned_at,
                )
            )
            await db.flush()
    except IntegrityError:
        return False
    return True


def _badge_out(definition: BadgeDefinition, earned: UserBadge | None) -> UserBadgeOut:
    return UserBadgeOut(
        slug=definition.slug,
        title=definition.title,
        description=definition.description,
        category=definition.category,
        rarity=definition.rarity,
        earned=earned is not None,
        earned_at=earned.earned_at if earned else None,
        evidence=dict(earned.evidence_json or {}) if earned else {},
    )
