from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_db
from app.rate_limit import limiter
from app.services.diagnostics import build_production_diagnostics
from app.services.realtime_outbox import process_realtime_outbox, requeue_failed_realtime_outbox

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
@limiter.limit("30/minute")
async def process_realtime_outbox_endpoint(
    request: Request,
    _: None = Depends(_require_internal_secret),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    result = await process_realtime_outbox(db, settings, limit=limit)
    return {"ok": True, **result}


@router.post("/realtime/requeue-failed-outbox")
@limiter.limit("10/minute")
async def requeue_failed_realtime_outbox_endpoint(
    request: Request,
    _: None = Depends(_require_internal_secret),
    limit: int = Query(default=500, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    del request
    result = await requeue_failed_realtime_outbox(db, limit=limit)
    return {"ok": True, **result}


@router.get("/diagnostics")
@limiter.limit("30/minute")
async def production_diagnostics_endpoint(
    request: Request,
    _: None = Depends(_require_internal_secret),
    include_provider_reachability: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    return await build_production_diagnostics(
        db,
        settings,
        include_provider_reachability=include_provider_reachability,
    )
