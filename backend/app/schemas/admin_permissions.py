from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.limits import StrictInputModel


class UserPermissionGrantIn(StrictInputModel):
    user_id: int = Field(gt=0)
    permission: str = Field(min_length=3, max_length=80)
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("permission")
    @classmethod
    def normalize_permission(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized or ":" not in normalized:
            raise ValueError("permission must be a namespaced value")
        return normalized

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class UserPermissionRevokeIn(StrictInputModel):
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class UserPermissionOut(BaseModel):
    id: int
    user_id: int
    permission: str
    status: str
    reason: str
    granted_by_user_id: int | None = None
    created_at: datetime
    revoked_at: datetime | None = None
