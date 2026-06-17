from pydantic import BaseModel


class RealtimeSubscriptionsOut(BaseModel):
    notification_channels: list[str]
