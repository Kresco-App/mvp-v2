from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(20), index=True)
    model_name: Mapped[str] = mapped_column(String(120), index=True)
    object_pk: Mapped[str] = mapped_column(String(120), default="", index=True)
    object_repr: Mapped[str] = mapped_column(String(500), default="")
    changed_data: Mapped[dict] = mapped_column(JSON, default=dict)
    request_path: Mapped[str] = mapped_column(String(500), default="")
    client_host: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
