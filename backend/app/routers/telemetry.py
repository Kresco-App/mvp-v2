import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.founder_ops import AnalyticsEventIn, AnalyticsEventOut
from app.schemas.limits import MediumText, ShortText, StrictInputModel
from app.services.founder_ops import record_analytics_event
from app.services.telemetry import emit_client_error_metric

logger = logging.getLogger("kresco.client_errors")

router = APIRouter(tags=["Telemetry"])


class ClientErrorIn(StrictInputModel):
    source: ShortText = "client"
    message: MediumText
    route: MediumText | None = None
    digest: ShortText | None = None
    stack: MediumText | None = None
    component_stack: MediumText | None = None
    release_sha: ShortText | None = None
    user_agent: MediumText | None = None


@router.post("/client-errors", status_code=202)
@limiter.limit("60/minute")
async def record_client_error(request: Request, payload: ClientErrorIn):
    settings = request.app.state.settings
    release_sha = str(getattr(request.app.state, "release_sha", "") or payload.release_sha or "development")
    request_id = getattr(request.state, "request_id", "")

    logger.warning(
        "client_error_reported request_id=%s release_sha=%s source=%s digest=%s route_present=%s route_length=%s message_length=%s stack_present=%s component_stack_present=%s user_agent_present=%s",
        request_id,
        release_sha,
        payload.source,
        payload.digest or "",
        bool(payload.route),
        len(payload.route or ""),
        len(payload.message),
        bool(payload.stack),
        bool(payload.component_stack),
        bool(payload.user_agent),
    )
    emit_client_error_metric(
        settings,
        release_sha=release_sha,
        source=payload.source,
        digest=payload.digest,
        route_present=bool(payload.route),
        route_length=len(payload.route or ""),
        message_length=len(payload.message),
        stack_present=bool(payload.stack),
        component_stack_present=bool(payload.component_stack),
        user_agent_present=bool(payload.user_agent),
    )
    return {"ok": True}


@router.post("/client-events", response_model=AnalyticsEventOut, status_code=202)
@limiter.limit("120/minute")
async def record_client_event(
    request: Request,
    payload: AnalyticsEventIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await record_analytics_event(db, user=user, payload=payload)
