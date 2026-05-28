from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AdminCrudActionsOut(BaseModel):
    create: bool
    read: bool
    update: bool
    delete: bool


class AdminCrudCatalogItemOut(BaseModel):
    domain: str
    slug: str
    name: str
    name_plural: str
    model: str
    admin_url: str
    actions: AdminCrudActionsOut


class AdminOverviewOut(BaseModel):
    generated_at: datetime
    totals: dict[str, int]
    content_status: dict[str, dict[str, int]]
    access_billing: dict[str, Any]
    ops_readiness: dict[str, Any] = Field(default_factory=dict)
    progress_xp: dict[str, Any]
    exam_bank: dict[str, Any]
    calendar: dict[str, Any]
    engagement: dict[str, Any]
    interactions: dict[str, Any]
    notifications: dict[str, Any]
    admin_audit: dict[str, Any] = Field(default_factory=dict)
    crud_catalog: list[AdminCrudCatalogItemOut]
