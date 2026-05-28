import logging

from fastapi import APIRouter, Request

from app.rate_limit import limiter
from app.schemas.limits import MediumText, ShortText, StrictInputModel
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
        "client_error_reported request_id=%s release_sha=%s source=%s route=%s digest=%s message=%s",
        request_id,
        release_sha,
        payload.source,
        payload.route or "",
        payload.digest or "",
        payload.message,
    )
    emit_client_error_metric(
        settings,
        release_sha=release_sha,
        source=payload.source,
        route=payload.route,
        digest=payload.digest,
    )
    return {"ok": True}
