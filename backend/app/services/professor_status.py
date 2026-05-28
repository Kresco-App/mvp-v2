from enum import StrEnum


class LiveSessionStatus(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


ALLOWED_LIVE_STATUSES = {status.value for status in LiveSessionStatus}
