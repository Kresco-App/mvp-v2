from dataclasses import dataclass

from app.models.professor import CourseOffering
from app.models.users import User
from app.services.access import effective_user_tier

PROFESSOR_CHAT_ALLOWED_TIERS = frozenset({"vip", "platinum"})
PROFESSOR_CHAT_ACCESS_DENIED_REASON = "VIP or Platinum access required for professor chat"
PROFESSOR_CHAT_TRACK_NOT_CONFIGURED_REASON = "Course offering track is not configured"
PROFESSOR_CHAT_LEVEL_MISMATCH_REASON = "Course offering does not match your level"
PROFESSOR_CHAT_FILIERE_MISMATCH_REASON = "Course offering does not match your filiere"


@dataclass(frozen=True)
class ProfessorChatEligibility:
    eligible: bool
    reason: str = ""


def normalize_track_value(value: str | None) -> str:
    return " ".join((value or "").strip().casefold().split())


def professor_chat_eligibility(user: User) -> ProfessorChatEligibility:
    if effective_user_tier(user) in PROFESSOR_CHAT_ALLOWED_TIERS:
        return ProfessorChatEligibility(eligible=True)
    return ProfessorChatEligibility(eligible=False, reason=PROFESSOR_CHAT_ACCESS_DENIED_REASON)


def professor_chat_offering_mismatch_reason(student: User, offering: CourseOffering) -> str | None:
    if not offering.track:
        return PROFESSOR_CHAT_TRACK_NOT_CONFIGURED_REASON
    if normalize_track_value(student.niveau) != normalize_track_value(offering.track.niveau):
        return PROFESSOR_CHAT_LEVEL_MISMATCH_REASON
    if normalize_track_value(student.filiere) != normalize_track_value(offering.track.filiere):
        return PROFESSOR_CHAT_FILIERE_MISMATCH_REASON
    return None
