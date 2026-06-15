import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_professor_user, get_current_user, get_db, require_professor_active_offering
from app.models.users import User
from app.rate_limit import limiter
from app.services.realtime_outbox import drain_realtime_outbox_in_background
from app.schemas.professor import (
    ChatConversationPatchIn,
    ChatMessageIn,
    ChatMessagePatchIn,
    CourseOfferingOut,
    LiveSessionEmbedOut,
    LiveSessionCheckpointIn,
    LiveSessionCheckpointOut,
    LiveSessionCheckpointPatchIn,
    LiveSessionIn,
    LiveSessionInteractionIn,
    LiveSessionInteractionOut,
    LiveSessionInteractionPatchIn,
    LiveSessionOut,
    LiveSessionStreamCredentialsOut,
    LiveSessionUpdateIn,
    LiveSessionViewerOut,
    LiveProviderConfigOut,
    ProfessorLiveSessionOut,
    ProfessorChangeRequestIn,
    ProfessorChangeRequestOut,
    ProfessorChatConversationOut,
    ProfessorChatMessageOut,
    ProfessorDashboardOut,
    StudentProfessorChatStatusOut,
    StudentStartConversationIn,
)
from app.services.professor_chat_mutations import (
    delete_chat_message_state,
    list_professor_messages_for_conversation,
    list_student_messages_for_conversation,
    mark_student_conversation_read_state,
    patch_professor_conversation_state,
    send_professor_image_message_state,
    send_professor_message_state,
    send_student_image_message_state,
    send_student_message_state,
    start_student_conversation_state,
    update_chat_message_state,
)
from app.services.professor_change_requests import (
    create_professor_change_request,
    list_professor_change_requests,
)
from app.services.professor_queries import (
    professor_dashboard as _professor_dashboard,
    professor_conversations as _professor_conversations,
    professor_offerings as _professor_offerings,
    require_professor_live_session as _require_professor_live_session,
    require_student_live_session as _require_student_live_session,
    student_live_sessions as _student_live_sessions,
    student_professor_chat_status as _student_professor_chat_status,
)
from app.services.professor_serializers import (
    live_session_is_joinable as _live_session_is_joinable,
    offering_out as _offering_out,
)
from app.services.professor_live_sessions import (
    cancel_professor_live_session,
    create_professor_live_session,
    delete_professor_live_session,
    end_professor_live_session,
    list_professor_live_sessions,
    notify_professor_live_session,
    reveal_professor_live_stream_credentials_state,
    start_professor_live_session,
    update_professor_live_session,
)
from app.services.professor_live_interactions import (
    LIVE_INTERACTION_BURST_LIMIT,
    create_professor_live_checkpoint_state,
    create_student_live_interaction_state,
    delete_professor_live_interaction_state,
    list_professor_live_checkpoint_entries,
    list_professor_live_interaction_entries,
    list_student_live_checkpoint_entries,
    list_student_live_interaction_entries,
    update_professor_live_checkpoint_state,
    update_professor_live_interaction_state,
)
from app.services.vdocipher import get_live_embed_url

router = APIRouter(tags=["Professor"])
logger = logging.getLogger(__name__)
PROFESSOR_MUTATION_ROUTE_LIMIT = "60/minute"
PROFESSOR_CHAT_ROUTE_LIMIT = "30/minute"
PROFESSOR_CHAT_IMAGE_ROUTE_LIMIT = "10/minute"
STUDENT_CHAT_ROUTE_LIMIT = "20/minute"
STUDENT_CHAT_IMAGE_ROUTE_LIMIT = "6/minute"


@router.get("/dashboard", response_model=ProfessorDashboardOut)
async def get_professor_dashboard(
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await _professor_dashboard(db, professor)


@router.get("/offerings", response_model=list[CourseOfferingOut])
async def list_professor_offerings(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return [
        _offering_out(offering)
        for offering in await _professor_offerings(db, professor, limit=limit, offset=offset)
    ]


@router.get("/live-provider-config", response_model=LiveProviderConfigOut)
async def get_live_provider_config(
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    del professor
    missing: list[str] = []
    if not settings.vdocipher_api_secret:
        missing.append("VDOCIPHER_API_SECRET")
    if not settings.vdocipher_live_create_url:
        missing.append("VDOCIPHER_LIVE_CREATE_URL")
    return LiveProviderConfigOut(
        has_api_secret=bool(settings.vdocipher_api_secret),
        can_auto_create=not missing,
        missing=missing,
        create_endpoint_configured=bool(settings.vdocipher_live_create_url),
    )


@router.get("/live-sessions", response_model=list[ProfessorLiveSessionOut])
async def list_live_sessions(
    course_offering_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await list_professor_live_sessions(
        db,
        professor=professor,
        course_offering_id=course_offering_id,
        limit=limit,
        offset=offset,
    )


@router.get("/live-sessions/{live_session_id}/embed", response_model=LiveSessionEmbedOut)
async def get_professor_live_embed(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    return LiveSessionEmbedOut(
        id=session.id,
        title=session.title,
        status=session.status,
        embed_url=get_live_embed_url(session.vdocipher_live_id),
        chat_embed_url="",
        vdocipher_live_id=session.vdocipher_live_id,
    )


@router.post("/live-sessions/{live_session_id}/stream-credentials/reveal", response_model=LiveSessionStreamCredentialsOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def reveal_professor_live_stream_credentials(
    live_session_id: int,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return await reveal_professor_live_stream_credentials_state(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )


@router.post("/live-sessions", response_model=ProfessorLiveSessionOut, status_code=201)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def create_live_session(
    body: LiveSessionIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await create_professor_live_session(
        db,
        professor=professor,
        request=request,
        body=body,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.delete("/live-sessions/{live_session_id}")
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def delete_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await delete_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )


@router.patch("/live-sessions/{live_session_id}", response_model=ProfessorLiveSessionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def update_live_session(
    live_session_id: int,
    body: LiveSessionUpdateIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await update_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
        body=body,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.post("/live-sessions/{live_session_id}/cancel", response_model=ProfessorLiveSessionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def cancel_live_session(
    live_session_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await cancel_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/student-live-sessions", response_model=list[LiveSessionViewerOut])
async def list_student_live_sessions(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _student_live_sessions(db, user, limit=limit, offset=offset)


@router.get("/student-live-sessions/{live_session_id}/embed", response_model=LiveSessionEmbedOut)
async def get_student_live_embed(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _require_student_live_session(db, user, live_session_id)
    if not _live_session_is_joinable(session):
        raise HTTPException(status_code=409, detail="Live session is not joinable")
    return LiveSessionEmbedOut(
        id=session.id,
        title=session.title,
        status=session.status,
        embed_url=get_live_embed_url(session.vdocipher_live_id),
        chat_embed_url="",
        vdocipher_live_id=session.vdocipher_live_id,
    )


@router.get("/live-sessions/{live_session_id}/interactions", response_model=list[LiveSessionInteractionOut])
async def list_professor_live_interactions(
    live_session_id: int,
    status: str | None = None,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await list_professor_live_interaction_entries(
        db,
        professor=professor,
        live_session_id=live_session_id,
        status=status,
        kind=kind,
        before_id=before_id,
        limit=limit,
    )


@router.patch("/live-sessions/interactions/{interaction_id}", response_model=LiveSessionInteractionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def update_professor_live_interaction(
    interaction_id: int,
    body: LiveSessionInteractionPatchIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await update_professor_live_interaction_state(
        db,
        professor=professor,
        request=request,
        interaction_id=interaction_id,
        body=body,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.delete("/live-sessions/interactions/{interaction_id}", response_model=LiveSessionInteractionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def delete_professor_live_interaction(
    interaction_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await delete_professor_live_interaction_state(
        db,
        professor=professor,
        request=request,
        interaction_id=interaction_id,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/student-live-sessions/{live_session_id}/interactions", response_model=list[LiveSessionInteractionOut])
async def list_student_live_interactions(
    live_session_id: int,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_student_live_interaction_entries(
        db,
        user=user,
        live_session_id=live_session_id,
        kind=kind,
        before_id=before_id,
        limit=limit,
    )


@router.post("/student-live-sessions/{live_session_id}/interactions", response_model=LiveSessionInteractionOut, status_code=201)
@limiter.limit(STUDENT_CHAT_ROUTE_LIMIT)
async def create_student_live_interaction(
    request: Request,
    live_session_id: int,
    body: LiveSessionInteractionIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    result = await create_student_live_interaction_state(
        db,
        user=user,
        live_session_id=live_session_id,
        body=body,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/live-sessions/{live_session_id}/checkpoints", response_model=list[LiveSessionCheckpointOut])
async def list_professor_live_checkpoints(
    live_session_id: int,
    before_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await list_professor_live_checkpoint_entries(
        db,
        professor=professor,
        live_session_id=live_session_id,
        before_id=before_id,
        limit=limit,
    )


@router.post("/live-sessions/{live_session_id}/checkpoints", response_model=LiveSessionCheckpointOut, status_code=201)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def create_professor_live_checkpoint(
    live_session_id: int,
    body: LiveSessionCheckpointIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await create_professor_live_checkpoint_state(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
        body=body,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.patch("/live-sessions/checkpoints/{checkpoint_id}", response_model=LiveSessionCheckpointOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def update_professor_live_checkpoint(
    checkpoint_id: int,
    body: LiveSessionCheckpointPatchIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await update_professor_live_checkpoint_state(
        db,
        professor=professor,
        request=request,
        checkpoint_id=checkpoint_id,
        body=body,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/student-live-sessions/{live_session_id}/checkpoints", response_model=list[LiveSessionCheckpointOut])
async def list_student_live_checkpoints(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_student_live_checkpoint_entries(db, user=user, live_session_id=live_session_id)


@router.post("/live-sessions/{live_session_id}/notify", response_model=ProfessorLiveSessionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def notify_live_session(
    live_session_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await notify_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.post("/live-sessions/{live_session_id}/start", response_model=ProfessorLiveSessionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def start_live_session(
    live_session_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await start_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.post("/live-sessions/{live_session_id}/end", response_model=ProfessorLiveSessionOut)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def end_live_session(
    live_session_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await end_professor_live_session(
        db,
        professor=professor,
        request=request,
        live_session_id=live_session_id,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/change-requests", response_model=list[ProfessorChangeRequestOut])
async def list_change_requests(
    status: str = "pending",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await list_professor_change_requests(
        db,
        professor,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.post("/change-requests", response_model=ProfessorChangeRequestOut, status_code=201)
@limiter.limit(PROFESSOR_MUTATION_ROUTE_LIMIT)
async def create_change_request(
    body: ProfessorChangeRequestIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return await create_professor_change_request(
        db,
        professor=professor,
        request=request,
        body=body,
    )


@router.get("/chat/conversations", response_model=list[ProfessorChatConversationOut])
async def list_professor_conversations(
    q: str = "",
    unread: bool = False,
    pinned: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    return await _professor_conversations(
        db,
        professor,
        settings,
        q=q,
        unread=unread,
        pinned=pinned,
        limit=limit,
        offset=offset,
    )


@router.get("/chat/conversations/{conversation_id}/messages", response_model=list[ProfessorChatMessageOut])
async def list_professor_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    return await list_professor_messages_for_conversation(
        db,
        professor=professor,
        conversation_id=conversation_id,
        settings=settings,
        limit=limit,
        before_id=before_id,
    )


@router.post("/chat/conversations/{conversation_id}/messages", response_model=ProfessorChatMessageOut, status_code=201)
@limiter.limit(PROFESSOR_CHAT_ROUTE_LIMIT)
async def send_professor_message(
    conversation_id: int,
    body: ChatMessageIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await send_professor_message_state(
        db,
        professor=professor,
        conversation_id=conversation_id,
        body=body,
        request=request,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.post("/chat/conversations/{conversation_id}/images", response_model=ProfessorChatMessageOut, status_code=201)
@limiter.limit(PROFESSOR_CHAT_IMAGE_ROUTE_LIMIT)
async def send_professor_image_message(
    conversation_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    body: str = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    result = await send_professor_image_message_state(
        db,
        professor=professor,
        conversation_id=conversation_id,
        body=body,
        file=file,
        request=request,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.patch("/chat/messages/{message_id}", response_model=ProfessorChatMessageOut)
@limiter.limit(PROFESSOR_CHAT_ROUTE_LIMIT)
async def update_chat_message(
    message_id: int,
    body: ChatMessagePatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await update_chat_message_state(
        db,
        user=user,
        message_id=message_id,
        body=body,
        request=request,
        settings=settings,
        require_professor_active_offering_fn=require_professor_active_offering,
    )


@router.delete("/chat/messages/{message_id}")
@limiter.limit(PROFESSOR_CHAT_ROUTE_LIMIT)
async def delete_chat_message(
    message_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await delete_chat_message_state(
        db,
        user=user,
        message_id=message_id,
        request=request,
        require_professor_active_offering_fn=require_professor_active_offering,
    )


@router.patch("/chat/conversations/{conversation_id}", response_model=ProfessorChatConversationOut)
@limiter.limit(PROFESSOR_CHAT_ROUTE_LIMIT)
async def patch_professor_conversation(
    conversation_id: int,
    body: ChatConversationPatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    return await patch_professor_conversation_state(
        db,
        professor=professor,
        conversation_id=conversation_id,
        body=body,
        request=request,
        settings=settings,
    )


@router.get("/student-chat", response_model=StudentProfessorChatStatusOut)
async def get_student_professor_chat(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await _student_professor_chat_status(db, user, settings, limit=limit, offset=offset)


@router.post("/student-chat/conversations", response_model=ProfessorChatConversationOut, status_code=201)
@limiter.limit(STUDENT_CHAT_ROUTE_LIMIT)
async def start_student_conversation(
    request: Request,
    background_tasks: BackgroundTasks,
    body: StudentStartConversationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    result = await start_student_conversation_state(
        db,
        user=user,
        body=body,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.get("/student-chat/conversations/{conversation_id}/messages", response_model=list[ProfessorChatMessageOut])
async def list_student_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await list_student_messages_for_conversation(
        db,
        user=user,
        conversation_id=conversation_id,
        settings=settings,
        limit=limit,
        before_id=before_id,
    )


@router.post("/student-chat/conversations/{conversation_id}/read", response_model=ProfessorChatConversationOut)
@limiter.limit(STUDENT_CHAT_ROUTE_LIMIT)
async def mark_student_conversation_read(
    request: Request,
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await mark_student_conversation_read_state(
        db,
        user=user,
        conversation_id=conversation_id,
        settings=settings,
    )


@router.post("/student-chat/conversations/{conversation_id}/messages", response_model=ProfessorChatMessageOut, status_code=201)
@limiter.limit(STUDENT_CHAT_ROUTE_LIMIT)
async def send_student_message(
    request: Request,
    background_tasks: BackgroundTasks,
    conversation_id: int,
    body: ChatMessageIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    result = await send_student_message_state(
        db,
        user=user,
        conversation_id=conversation_id,
        body=body,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result


@router.post("/student-chat/conversations/{conversation_id}/images", response_model=ProfessorChatMessageOut, status_code=201)
@limiter.limit(STUDENT_CHAT_IMAGE_ROUTE_LIMIT)
async def send_student_image_message(
    request: Request,
    background_tasks: BackgroundTasks,
    conversation_id: int,
    body: str = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    result = await send_student_image_message_state(
        db,
        user=user,
        conversation_id=conversation_id,
        body=body,
        file=file,
        settings=settings,
    )
    background_tasks.add_task(drain_realtime_outbox_in_background, settings)
    return result
