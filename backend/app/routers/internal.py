from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_db
from app.services.diagnostics import build_production_diagnostics
from app.services.realtime_outbox import process_realtime_outbox

router = APIRouter(tags=["Internal"])


def _require_internal_secret(
    x_kresco_internal_secret: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    configured = settings.realtime_outbox_secret.strip()
    if len(configured) < 32:
        raise HTTPException(status_code=503, detail="Internal worker secret is not configured")
    if not hmac.compare_digest(x_kresco_internal_secret.strip(), configured):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/realtime/process-outbox")
async def process_realtime_outbox_endpoint(
    _: None = Depends(_require_internal_secret),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await process_realtime_outbox(db, settings, limit=limit)
    return {"ok": True, **result}


@router.get("/diagnostics")
async def production_diagnostics_endpoint(
    _: None = Depends(_require_internal_secret),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return await build_production_diagnostics(db, settings)
