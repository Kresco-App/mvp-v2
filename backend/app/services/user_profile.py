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

MAX_PROFILE_MEDIA_BYTES = 5 * 1024 * 1024
MediaUrlFn = Callable[[str, Settings], str]
MediaStorageFactory = Callable[[Settings], MediaStorage]


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


async def update_profile_state(
    db: AsyncSession,
    *,
    user: User,
    body: UserUpdateIn,
    settings: Settings,
    media_url_fn: MediaUrlFn = media_url,
) -> UserOut:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return user_out(user, settings, media_url_fn=media_url_fn)
    if "avatar_url" in updates:
        user.avatar_media_size = 0
    if "banner_url" in updates:
        user.banner_media_size = 0
    for field, value in updates.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
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

    stored = await storage_factory(settings).put_object(
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

    await db.commit()
    await db.refresh(user)
    return ProfileMediaOut(url=stored.url)
