from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User, UserSubjectEntitlement


TIER_RANK: dict[str, int] = {
    "": 0,
    "free": 0,
    "basic": 0,
    "pro": 10,
    "vip": 20,
    "platinum": 30,
}

# Current compatibility mapping while feature-specific entitlements are not yet
# persisted. New feature gates should be added here or moved behind a real
# user-feature table without changing router code.
FEATURES_BY_TIER: dict[str, set[str]] = {
    "basic": set(),
    "pro": {
        "advanced_quizzes",
        "downloads",
        "exam_bank_video_solutions",
        "interactive_course",
        "simulated_exams",
    },
    "vip": {
        "advanced_quizzes",
        "ai_tutor",
        "downloads",
        "exam_bank_video_solutions",
        "forum_posting",
        "interactive_course",
        "live_sessions",
        "simulated_exams",
        "teacher_chat",
    },
    "platinum": {
        "advanced_quizzes",
        "ai_tutor",
        "downloads",
        "exam_bank_video_solutions",
        "forum_posting",
        "interactive_course",
        "live_sessions",
        "simulated_exams",
        "teacher_chat",
    },
}


@dataclass(frozen=True)
class AccessDecision:
    can_access: bool
    reason: str = "unlocked"
    required_subject_id: int | None = None
    required_tier: str = ""
    required_feature_key: str = ""
    effective_tier: str = "basic"
    is_free_preview: bool = False
    subject_scope_enforced: bool = False

    @property
    def locked_reason(self) -> str:
        return "" if self.can_access else self.reason

    def inherit_parent_lock(self, parent: "AccessDecision") -> "AccessDecision":
        if parent.can_access:
            return self
        if self.is_free_preview and parent.reason != "subject_access_required":
            return self
        return replace(
            parent,
            is_free_preview=False,
            required_tier=self.required_tier or parent.required_tier,
            required_feature_key=self.required_feature_key or parent.required_feature_key,
        )


@dataclass(frozen=True)
class FeatureAccessRequirement:
    required_feature_key: str
    required_tier: str = ""
    is_free_preview: bool = False


@dataclass(frozen=True)
class AccessContext:
    user_id: int
    effective_tier: str
    feature_keys: frozenset[str]
    active_subject_ids: frozenset[int]

    @property
    def subject_scope_enforced(self) -> bool:
        return bool(self.active_subject_ids)

    def decide_for(
        self,
        obj,
        *,
        subject_id: int | None = None,
        fallback_required_tier: str = "",
    ) -> AccessDecision:
        required_tier = _normalize_tier(getattr(obj, "required_tier", "") or fallback_required_tier)
        required_feature_key = _normalize_feature(getattr(obj, "required_feature_key", "") or "")
        is_free_preview = bool(getattr(obj, "is_free_preview", False))

        if subject_id is not None and self.subject_scope_enforced and subject_id not in self.active_subject_ids:
            return AccessDecision(
                can_access=False,
                reason="subject_access_required",
                required_subject_id=subject_id,
                required_tier=required_tier,
                required_feature_key=required_feature_key,
                effective_tier=self.effective_tier,
                subject_scope_enforced=True,
            )

        if is_free_preview:
            return AccessDecision(
                can_access=True,
                reason="free_preview",
                required_subject_id=subject_id,
                required_tier=required_tier,
                required_feature_key=required_feature_key,
                effective_tier=self.effective_tier,
                is_free_preview=True,
                subject_scope_enforced=self.subject_scope_enforced,
            )

        if required_tier and TIER_RANK.get(self.effective_tier, 0) < TIER_RANK.get(required_tier, 999):
            return AccessDecision(
                can_access=False,
                reason=f"{required_tier}_required",
                required_subject_id=subject_id,
                required_tier=required_tier,
                required_feature_key=required_feature_key,
                effective_tier=self.effective_tier,
                subject_scope_enforced=self.subject_scope_enforced,
            )

        if required_feature_key and required_feature_key not in self.feature_keys:
            return AccessDecision(
                can_access=False,
                reason=f"feature_required:{required_feature_key}",
                required_subject_id=subject_id,
                required_tier=required_tier,
                required_feature_key=required_feature_key,
                effective_tier=self.effective_tier,
                subject_scope_enforced=self.subject_scope_enforced,
            )

        return AccessDecision(
            can_access=True,
            reason="unlocked",
            required_subject_id=subject_id,
            required_tier=required_tier,
            required_feature_key=required_feature_key,
            effective_tier=self.effective_tier,
            subject_scope_enforced=self.subject_scope_enforced,
        )

    def decide_child(
        self,
        parent: AccessDecision,
        obj,
        *,
        subject_id: int | None = None,
        fallback_required_tier: str = "",
    ) -> AccessDecision:
        return self.decide_for(
            obj,
            subject_id=subject_id,
            fallback_required_tier=fallback_required_tier,
        ).inherit_parent_lock(parent)


async def build_access_context(db: AsyncSession, user: User) -> AccessContext:
    result = await db.execute(
        select(UserSubjectEntitlement).where(UserSubjectEntitlement.user_id == user.id)
    )
    entitlements = list(result.scalars().all())
    effective_tier = effective_user_tier(user)
    active_subject_ids = frozenset(
        entitlement.subject_id
        for entitlement in entitlements
        if _is_active_entitlement(entitlement)
    )
    return AccessContext(
        user_id=user.id,
        effective_tier=effective_tier,
        feature_keys=frozenset(_feature_keys_for_user(user, effective_tier)),
        active_subject_ids=active_subject_ids,
    )


def effective_user_tier(user: User) -> str:
    explicit_tier = _normalize_tier(str(getattr(user, "tier", "") or ""))
    if explicit_tier and explicit_tier != "basic":
        return explicit_tier
    return "pro" if bool(getattr(user, "is_pro", False)) else "basic"


def _feature_keys_for_user(user: User, tier: str) -> set[str]:
    keys = set(FEATURES_BY_TIER.get(tier, set()))
    for key in _iter_user_feature_values(getattr(user, "feature_keys", None)):
        keys.add(_normalize_feature(key))
    for key in _iter_user_feature_values(getattr(user, "enabled_features", None)):
        keys.add(_normalize_feature(key))
    return {key for key in keys if key}


def _iter_user_feature_values(value) -> Iterable[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",")]
    if isinstance(value, dict):
        return [str(key) for key, enabled in value.items() if enabled]
    if isinstance(value, Iterable):
        return [str(item) for item in value]
    return []


def _is_active_entitlement(entitlement: UserSubjectEntitlement) -> bool:
    if entitlement.status != "active":
        return False
    now = datetime.now(timezone.utc)
    starts_at = entitlement.starts_at
    ends_at = entitlement.ends_at
    if starts_at is not None and starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    if ends_at is not None and ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return (starts_at is None or starts_at <= now) and (ends_at is None or ends_at >= now)


def _normalize_tier(value: str) -> str:
    return value.strip().lower()


def _normalize_feature(value: str) -> str:
    return value.strip().lower()
