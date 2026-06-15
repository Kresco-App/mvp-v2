import logging
from collections.abc import Callable

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.users import User
from app.schemas.users import ProfileMediaOut, UserOut, UserUpdateIn
from app.services.image_uploads import (
    allowed_image_extension,
    image_matches_mime_type,
    normalize_image_mime_type,
)
from app.services.media_storage import MediaStorage, media_url, profile_media_key
from app.services.media_storage import delete_media_reference, get_media_storage

MAX_PROFILE_MEDIA_BYTES = 5 * 1024 * 1024
MediaUrlFn = Callable[[str, Settings], str]
MediaStorageFactory = Callable[[Settings], MediaStorage]
TRACK_FIELDS = {"niveau", "filiere"}
logger = logging.getLogger(__name__)


def profile_media_projected_bytes(user: User, kind: str, incoming_bytes: int) -> int:
    avatar_bytes = int(user.avatar_media_size or 0)
    banner_bytes = int(user.banner_media_size or 0)
    if kind == "avatar":
        avatar_bytes = incoming_bytes
    else:
        banner_bytes = incoming_bytes
    return avatar_bytes + banner_bytes


def user_out(user: User, settings: Settings, *, media_url_fn: MediaUrlFn = media_url) -> UserOut:
    out = UserOut.model_validate(user)
    out.avatar_url = media_url_fn(user.avatar_url, settings)
    out.banner_url = media_url_fn(user.banner_url, settings)
    return out


def _normalize_track_field(value: object) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _enforce_self_service_track_boundary(user: User, updates: dict) -> None:
    for field in TRACK_FIELDS.intersection(updates):
        current = _normalize_track_field(getattr(user, field, ""))
        incoming = _normalize_track_field(updates[field])
        if current and incoming != current:
            raise HTTPException(
                status_code=403,
                detail="Track changes require staff support",
            )


async def update_profile_state(
    db: AsyncSession,
    *,
    user: User,
    body: UserUpdateIn,
    settings: Settings,
    media_url_fn: MediaUrlFn = media_url,
    storage_factory: MediaStorageFactory | None = None,
) -> UserOut:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return user_out(user, settings, media_url_fn=media_url_fn)
    _enforce_self_service_track_boundary(user, updates)
    references_to_delete: list[str] = []
    if "avatar_url" in updates:
        avatar_reference = updates["avatar_url"]
        if avatar_reference not in {"", user.avatar_url}:
            raise HTTPException(
                status_code=422,
                detail="Upload new avatar media through the profile media endpoint before referencing it here",
            )
        if avatar_reference == "":
            if user.avatar_url:
                references_to_delete.append(user.avatar_url)
            user.avatar_media_size = 0
    if "banner_url" in updates:
        banner_reference = updates["banner_url"]
        if banner_reference not in {"", user.banner_url}:
            raise HTTPException(
                status_code=422,
                detail="Upload new banner media through the profile media endpoint before referencing it here",
            )
        if banner_reference == "":
            if user.banner_url:
                references_to_delete.append(user.banner_url)
            user.banner_media_size = 0
    for field, value in updates.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    if references_to_delete:
        storage = (storage_factory or get_media_storage)(settings)
        await _delete_profile_media_references(storage, references_to_delete)
    return user_out(user, settings, media_url_fn=media_url_fn)


async def upload_profile_media_state(
    db: AsyncSession,
    *,
    user: User,
    kind: str,
    file: UploadFile,
    settings: Settings,
    storage_factory: MediaStorageFactory,
) -> ProfileMediaOut:
    if kind not in {"avatar", "banner"}:
        raise HTTPException(status_code=404, detail="Unsupported profile media type")

    mime_type = normalize_image_mime_type(file.content_type)
    extension = allowed_image_extension(mime_type)
    if extension is None:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WEBP, or GIF image")

    content = await file.read(MAX_PROFILE_MEDIA_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Upload a non-empty image")
    if len(content) > MAX_PROFILE_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")
    if not image_matches_mime_type(content, mime_type):
        raise HTTPException(status_code=400, detail="Upload a valid JPG, PNG, WEBP, or GIF image")
    if profile_media_projected_bytes(user, kind, len(content)) > int(settings.media_profile_quota_bytes):
        raise HTTPException(status_code=413, detail="Profile media quota exceeded")

    storage = storage_factory(settings)
    previous_reference = user.avatar_url if kind == "avatar" else user.banner_url
    stored = await storage.put_object(
        key=profile_media_key(user.id, kind, extension),
        content=content,
        content_type=mime_type,
    )
    if kind == "avatar":
        user.avatar_url = stored.reference
        user.avatar_media_size = len(content)
    else:
        user.banner_url = stored.reference
        user.banner_media_size = len(content)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await _delete_profile_media_references(storage, [stored.reference])
        raise
    await db.refresh(user)
    if previous_reference and previous_reference != stored.reference:
        await _delete_profile_media_references(storage, [previous_reference])
    return ProfileMediaOut(url=stored.url)


async def _delete_profile_media_references(storage: MediaStorage, references: list[str]) -> None:
    seen: set[str] = set()
    for reference in references:
        if not reference or reference in seen:
            continue
        seen.add(reference)
        try:
            await delete_media_reference(storage, reference)
        except Exception:
            logger.warning("profile_media_cleanup_failed", exc_info=True)
