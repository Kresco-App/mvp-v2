from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CalendarEventOut(BaseModel):
    id: int
    event_type: str
    title: str
    subtitle: str = ""
    teacher_name: str = ""
    subject_id: Optional[int] = None
    subject_title: str = ""
    topic_id: Optional[int] = None
    topic_title: str = ""
    starts_at: datetime
    ends_at: datetime
    description: str = ""
    preparation_href: str = ""
    join_url: str = ""
    status: str
    color: str = "#5b60f9"


class CalendarEventDetailOut(CalendarEventOut):
    pass
