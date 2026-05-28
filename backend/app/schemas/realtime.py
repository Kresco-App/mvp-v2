from datetime import datetime

from pydantic import BaseModel


class AblyTokenOut(BaseModel):
    token: str
    client_id: str
    expires_at: datetime
    capability: dict[str, list[str]]


class RealtimeSubscriptionsOut(BaseModel):
    notification_channels: list[str]
