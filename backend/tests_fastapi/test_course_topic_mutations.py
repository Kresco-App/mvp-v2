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
