import pytest

from app.models.professor import CourseOffering, ProgramTrack
from app.models.users import User
from app.services.professor_chat_access import (
    PROFESSOR_CHAT_ACCESS_DENIED_REASON,
    PROFESSOR_CHAT_FILIERE_MISMATCH_REASON,
    PROFESSOR_CHAT_LEVEL_MISMATCH_REASON,
    PROFESSOR_CHAT_TRACK_NOT_CONFIGURED_REASON,
    normalize_track_value,
    professor_chat_eligibility,
    professor_chat_offering_mismatch_reason,
)


def test_professor_chat_eligibility_allows_vip():
    eligibility = professor_chat_eligibility(User(role="student", tier="vip", is_pro=False))

    assert eligibility.eligible is True
    assert eligibility.reason == ""


@pytest.mark.parametrize("tier", ["basic", "pro", ""])
def test_professor_chat_eligibility_rejects_non_vip_tiers(tier):
    eligibility = professor_chat_eligibility(User(role="student", tier=tier, is_pro=(tier == "basic")))

    assert eligibility.eligible is False
    assert eligibility.reason == PROFESSOR_CHAT_ACCESS_DENIED_REASON


def test_normalize_track_value_handles_case_spacing_and_missing_values():
    assert normalize_track_value("  2BAC   Sciences  Math ") == "2bac sciences math"
    assert normalize_track_value(None) == ""


def test_professor_chat_offering_match_accepts_normalized_track_values():
    student = User(niveau=" 2bac ", filiere=" Sciences   Physiques ")
    offering = CourseOffering(track=ProgramTrack(niveau="2BAC", filiere="sciences physiques"))

    assert professor_chat_offering_mismatch_reason(student, offering) is None


def test_professor_chat_offering_match_requires_configured_track():
    student = User(niveau="2BAC", filiere="Sciences Physiques")
    offering = CourseOffering()

    assert professor_chat_offering_mismatch_reason(student, offering) == PROFESSOR_CHAT_TRACK_NOT_CONFIGURED_REASON


def test_professor_chat_offering_match_rejects_level_mismatch_first():
    student = User(niveau="1BAC", filiere="Sciences Physiques")
    offering = CourseOffering(track=ProgramTrack(niveau="2BAC", filiere="Sciences Math"))

    assert professor_chat_offering_mismatch_reason(student, offering) == PROFESSOR_CHAT_LEVEL_MISMATCH_REASON


def test_professor_chat_offering_match_rejects_filiere_mismatch():
    student = User(niveau="2BAC", filiere="Sciences Physiques")
    offering = CourseOffering(track=ProgramTrack(niveau="2BAC", filiere="Sciences Math"))

    assert professor_chat_offering_mismatch_reason(student, offering) == PROFESSOR_CHAT_FILIERE_MISMATCH_REASON
