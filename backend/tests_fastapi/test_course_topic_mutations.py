from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.course_progress import (
    TOPIC_ITEM_COMPLETION_GRACE_SECONDS,
    bounded_topic_watch_seconds,
)
from app.services.gamification_progress import INITIAL_PROGRESS_TRUST_SECONDS, bounded_watch_progress
from app.services.course_topic_mutations import _is_quiz_item_type, _xp_reason_for_item_type


def test_topic_item_xp_reason_uses_exact_item_type_mapping():
    assert _xp_reason_for_item_type("video") == "video_complete"
    assert _xp_reason_for_item_type("interactive") == "lab_complete"
    assert _xp_reason_for_item_type("lab") == "lab_complete"
    assert _xp_reason_for_item_type("reading") == "lesson_complete"


def test_topic_item_xp_reason_does_not_substring_match_future_types():
    assert _xp_reason_for_item_type("interactive_video") == "lesson_complete"
    assert _xp_reason_for_item_type("video_lab") == "lesson_complete"


def test_topic_item_quiz_detection_uses_exact_item_types():
    assert _is_quiz_item_type("quiz") is True
    assert _is_quiz_item_type("checkpoint_quiz") is True
    assert _is_quiz_item_type("quiz_set") is True
    assert _is_quiz_item_type("video_quiz_intro") is False


def test_topic_watch_progress_grace_is_not_reusable_without_elapsed_time():
    now = datetime(2026, 5, 31, 12, 0, tzinfo=timezone.utc)
    item = SimpleNamespace(duration_seconds=120)
    fresh_progress = SimpleNamespace(watched_seconds=0, updated_at=None)

    initial = bounded_topic_watch_seconds(
        item=item,
        progress=fresh_progress,
        requested_seconds=120,
        now=now,
    )

    assert initial == TOPIC_ITEM_COMPLETION_GRACE_SECONDS

    existing_progress = SimpleNamespace(watched_seconds=initial, updated_at=now)
    immediate_retry = bounded_topic_watch_seconds(
        item=item,
        progress=existing_progress,
        requested_seconds=120,
        now=now,
    )
    later_retry = bounded_topic_watch_seconds(
        item=item,
        progress=SimpleNamespace(watched_seconds=initial, updated_at=now - timedelta(seconds=8)),
        requested_seconds=120,
        now=now,
    )

    assert immediate_retry == initial
    assert later_retry == initial + 10


def test_topic_watch_progress_grace_is_user_wide_across_items():
    now = datetime(2026, 5, 31, 12, 0, tzinfo=timezone.utc)
    item = SimpleNamespace(duration_seconds=120)
    fresh_progress = SimpleNamespace(watched_seconds=0, updated_at=None)

    immediate_other_item = bounded_topic_watch_seconds(
        item=item,
        progress=fresh_progress,
        requested_seconds=120,
        now=now,
        latest_other_watch_updated_at=now,
    )
    later_other_item = bounded_topic_watch_seconds(
        item=item,
        progress=fresh_progress,
        requested_seconds=120,
        now=now,
        latest_other_watch_updated_at=now - timedelta(seconds=8),
    )

    assert immediate_other_item == 0
    assert later_other_item == TOPIC_ITEM_COMPLETION_GRACE_SECONDS


def test_legacy_watch_progress_grace_is_not_reusable_without_elapsed_time():
    now = datetime(2026, 5, 31, 12, 0, tzinfo=timezone.utc)

    initial = bounded_watch_progress(
        requested_seconds=120,
        current_seconds=0,
        duration_seconds=120,
        last_updated_at=None,
        is_new_progress=True,
        now=now,
    )
    immediate_retry = bounded_watch_progress(
        requested_seconds=120,
        current_seconds=initial,
        duration_seconds=120,
        last_updated_at=now,
        is_new_progress=False,
        now=now,
    )
    later_retry = bounded_watch_progress(
        requested_seconds=120,
        current_seconds=initial,
        duration_seconds=120,
        last_updated_at=now - timedelta(seconds=8),
        is_new_progress=False,
        now=now,
    )

    assert initial == INITIAL_PROGRESS_TRUST_SECONDS
    assert immediate_retry == initial
    assert later_retry == initial + 10
