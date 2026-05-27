from types import SimpleNamespace

from app.services.access import AccessContext, effective_user_tier
from app.models.users import User


def access_context(*, tier: str = "basic", subjects: set[int] | None = None) -> AccessContext:
    return AccessContext(
        user_id=1,
        effective_tier=tier,
        feature_keys=frozenset(),
        active_subject_ids=frozenset(subjects or set()),
    )


def test_subject_scope_takes_precedence_over_free_preview():
    context = access_context(tier="pro", subjects={10})
    decision = context.decide_for(SimpleNamespace(is_free_preview=True), subject_id=20)

    assert decision.can_access is False
    assert decision.reason == "subject_access_required"
    assert decision.locked_reason == "subject_access_required"


def test_free_preview_still_bypasses_tier_when_subject_scope_allows_it():
    context = access_context(tier="basic", subjects={10})
    decision = context.decide_for(
        SimpleNamespace(is_free_preview=True, required_tier="pro"),
        subject_id=10,
    )

    assert decision.can_access is True
    assert decision.reason == "free_preview"
    assert decision.required_tier == "pro"


def test_free_preview_child_does_not_bypass_parent_subject_lock():
    context = access_context(tier="pro", subjects={10})
    parent = context.decide_for(SimpleNamespace(), subject_id=20)
    child = context.decide_child(
        parent,
        SimpleNamespace(is_free_preview=True),
        subject_id=20,
    )

    assert parent.reason == "subject_access_required"
    assert child.can_access is False
    assert child.reason == "subject_access_required"


def test_effective_user_tier_prefers_explicit_paid_tier_over_legacy_pro_flag():
    assert effective_user_tier(User(tier="vip", is_pro=False)) == "vip"
    assert effective_user_tier(User(tier="basic", is_pro=True)) == "pro"
