from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from datetime import timedelta
from typing import Protocol
from urllib.parse import quote, unquote, urlparse
import uuid

from app.config import (
    DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS,
    MAX_MEDIA_GCS_SIGNED_URL_TTL_SECONDS,
    MEDIA_STORAGE_GCS,
    MEDIA_STORAGE_GCS_MOCK,
    Settings,
)

class MediaStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredMedia:
    key: str
    reference: str
    url: str


class MediaStorage(Protocol):
    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        ...

    async def delete_reference(self, reference: str | None) -> bool:
        ...


class LocalMediaStorage:
    def __init__(self, root: Path = Path("media"), public_prefix: str = "/media") -> None:
        self.root = root
        self.public_prefix = public_prefix.rstrip("/")

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        del content_type
        clean_key = _normalize_media_object_key(key)
        destination = _safe_local_destination(self.root, clean_key)
        await asyncio.to_thread(destination.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        url = f"{self.public_prefix}/{quote(clean_key, safe='/')}"
        return StoredMedia(key=clean_key, reference=url, url=url)

    async def delete_reference(self, reference: str | None) -> bool:
        key = _local_reference_key(reference, self.public_prefix)
        if key is None:
            return False
        destination = _safe_local_destination(self.root, key)
        return await asyncio.to_thread(_unlink_if_exists, destination)


class GCSMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.media_gcs_bucket.strip()
        self.prefix = _clean_prefix(settings.media_gcs_prefix)
        self.signed_url_ttl_seconds = _safe_signed_url_ttl_seconds(settings.media_gcs_signed_url_ttl_seconds)
        if not self.bucket:
            raise MediaStorageError("GCS media storage is missing bucket configuration.")

        self.client = _gcs_client()
        self.bucket_client = self.client.bucket(self.bucket)

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        clean_key = _normalize_media_object_key(key)
        object_key = "/".join(part for part in [self.prefix, clean_key] if part)
        blob = self.bucket_client.blob(object_key)
        await asyncio.to_thread(blob.upload_from_string, content, content_type=content_type)
        reference = gcs_reference(self.bucket, object_key)
        return StoredMedia(
            key=object_key,
            reference=reference,
            url=await asyncio.to_thread(
                _signed_gcs_blob_url,
                blob,
                expires_in=self.signed_url_ttl_seconds,
            ),
        )

    async def delete_reference(self, reference: str | None) -> bool:
        object_key = _owned_gcs_reference_key(reference, bucket=self.bucket, prefix=self.prefix)
        if object_key is None:
            return False
        blob = self.bucket_client.blob(object_key)
        await asyncio.to_thread(blob.delete)
        return True


class GCSMockMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.media_gcs_bucket.strip()
        self.prefix = _clean_prefix(settings.media_gcs_prefix)
        self.root = Path(settings.media_gcs_mock_root).expanduser()
        self.signed_url_ttl_seconds = _safe_signed_url_ttl_seconds(settings.media_gcs_signed_url_ttl_seconds)
        if not self.bucket:
            raise MediaStorageError("GCS mock media storage is missing bucket configuration.")

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        del content_type
        clean_key = _normalize_media_object_key(key)
        object_key = "/".join(part for part in [self.prefix, clean_key] if part)
        destination = _safe_local_destination(self.root / self.bucket, object_key)
        await asyncio.to_thread(destination.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        reference = gcs_reference(self.bucket, object_key)
        return StoredMedia(
            key=object_key,
            reference=reference,
            url=mock_sign_gcs_reference(reference, expires_in=self.signed_url_ttl_seconds),
        )

    async def delete_reference(self, reference: str | None) -> bool:
        object_key = _owned_gcs_reference_key(reference, bucket=self.bucket, prefix=self.prefix)
        if object_key is None:
            return False
        destination = _safe_local_destination(self.root / self.bucket, object_key)
        return await asyncio.to_thread(_unlink_if_exists, destination)


def get_media_storage(settings: Settings) -> MediaStorage:
    backend = settings.media_storage_backend.strip().lower()
    if backend == MEDIA_STORAGE_GCS:
        return GCSMediaStorage(settings)
    if backend == MEDIA_STORAGE_GCS_MOCK:
        return GCSMockMediaStorage(settings)
    return LocalMediaStorage()


async def warm_media_storage_client(settings: Settings) -> None:
    if settings.media_storage_backend.strip().lower() == MEDIA_STORAGE_GCS:
        await asyncio.to_thread(_gcs_client)


def media_url(reference: str | None, settings: Settings) -> str:
    if not reference:
        return ""
    if reference.startswith("gs://"):
        if not _gcs_reference_matches_settings_scope(reference, settings):
            return ""
        if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_GCS_MOCK:
            return mock_sign_gcs_reference(reference, settings=settings)
        return sign_gcs_reference(reference, settings=settings)
    return reference


async def async_media_url(reference: str | None, settings: Settings) -> str:
    if not reference:
        return ""
    if reference.startswith("gs://"):
        if not _gcs_reference_matches_settings_scope(reference, settings):
            return ""
        if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_GCS_MOCK:
            return await asyncio.to_thread(mock_sign_gcs_reference, reference, settings=settings)
        return await asyncio.to_thread(sign_gcs_reference, reference, settings=settings)
    return reference


def gcs_reference(bucket: str, key: str) -> str:
    return f"gs://{bucket}/{quote(key, safe='/')}"


async def delete_media_reference(storage: MediaStorage, reference: str | None) -> bool:
    if not reference:
        return False
    return await storage.delete_reference(reference)


def mock_sign_gcs_reference(
    reference: str,
    *,
    settings: Settings | None = None,
    expires_in: int | None = None,
) -> str:
    parsed = urlparse(reference)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path:
        raise MediaStorageError("Invalid GCS media reference.")

    bucket = parsed.netloc
    key = unquote(parsed.path.lstrip("/"))
    ttl = _safe_signed_url_ttl_seconds(
        expires_in if expires_in is not None else (settings.media_gcs_signed_url_ttl_seconds if settings else DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS)
    )
    return f"https://mock-gcs.local/{bucket}/{quote(key, safe='/')}?expires={ttl}&signature=mock"


def sign_gcs_reference(
    reference: str,
    *,
    settings: Settings | None,
    client: object | None = None,
    expires_in: int | None = None,
) -> str:
    parsed = urlparse(reference)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path:
        raise MediaStorageError("Invalid GCS media reference.")

    bucket = parsed.netloc
    key = unquote(parsed.path.lstrip("/"))
    ttl = _safe_signed_url_ttl_seconds(
        expires_in if expires_in is not None else (settings.media_gcs_signed_url_ttl_seconds if settings else DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS)
    )
    if client is None:
        client = _gcs_client()
    blob = client.bucket(bucket).blob(key)
    return _signed_gcs_blob_url(blob, expires_in=ttl)


def _safe_signed_url_ttl_seconds(value: int | str) -> int:
    ttl = int(value)
    if ttl < 1:
        raise MediaStorageError("Signed media URL TTL must be positive.")
    return min(ttl, MAX_MEDIA_GCS_SIGNED_URL_TTL_SECONDS)


def profile_media_key(user_id: int, kind: str, extension: str) -> str:
    return f"profile/{user_id}/{kind}-{uuid.uuid4().hex}{extension}"


def professor_chat_media_key(conversation_id: int, extension: str) -> str:
    return f"professor-chat/{conversation_id}/{uuid.uuid4().hex}{extension}"


def safe_original_filename(filename: str | None, fallback: str) -> str:
    return Path(filename or fallback).name[:120]


def _clean_prefix(prefix: str) -> str:
    return "/".join(part for part in prefix.strip("/").split("/") if part)


def _local_reference_key(reference: str | None, public_prefix: str) -> str | None:
    if not reference:
        return None
    parsed = urlparse(reference)
    if parsed.scheme or parsed.netloc:
        return None
    prefix = public_prefix.rstrip("/")
    path = parsed.path
    if not path.startswith(f"{prefix}/"):
        return None
    return unquote(path[len(prefix) + 1:])


def _gcs_reference_parts(reference: str | None) -> tuple[str, str] | None:
    if not reference:
        return None
    parsed = urlparse(reference)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path:
        return None
    key = unquote(parsed.path.lstrip("/"))
    if not key:
        return None
    return parsed.netloc, key


def _owned_gcs_reference_key(reference: str | None, *, bucket: str, prefix: str) -> str | None:
    parts = _gcs_reference_parts(reference)
    if parts is None:
        return None
    reference_bucket, key = parts
    if reference_bucket != bucket or not _key_matches_prefix(key, prefix):
        return None
    return key


def _gcs_reference_matches_settings_scope(reference: str, settings: Settings) -> bool:
    configured_bucket = str(getattr(settings, "media_gcs_bucket", "") or "").strip()
    if not configured_bucket:
        return False

    parts = _gcs_reference_parts(reference)
    if parts is None:
        return False

    reference_bucket, key = parts
    configured_prefix = _clean_prefix(str(getattr(settings, "media_gcs_prefix", "") or ""))
    return reference_bucket == configured_bucket and _key_matches_prefix(key, configured_prefix)


def _key_matches_prefix(key: str, prefix: str) -> bool:
    return not prefix or key == prefix or key.startswith(f"{prefix}/")


def _unlink_if_exists(path: Path) -> bool:
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False


def _normalize_media_object_key(key: str) -> str:
    cleaned_key = key.strip().replace("\\", "/")
    key_parts = cleaned_key.split("/")
    if (
        not cleaned_key
        or cleaned_key.startswith("/")
        or "\x00" in cleaned_key
        or any(part in {"", ".", ".."} for part in key_parts)
    ):
        raise MediaStorageError("Invalid media object key.")
    return cleaned_key


def _safe_local_destination(root: Path, key: str) -> Path:
    cleaned_key = _normalize_media_object_key(key)
    root_path = root.resolve()
    destination = (root_path / cleaned_key).resolve()
    try:
        destination.relative_to(root_path)
    except ValueError as exc:
        raise MediaStorageError("Media object key escapes the storage root.") from exc
    return destination


@lru_cache(maxsize=1)
def _gcs_client():
    from google.cloud import storage

    return storage.Client()


def _signed_gcs_blob_url(blob: object, *, expires_in: int) -> str:
    return blob.generate_signed_url(
        expiration=timedelta(seconds=int(expires_in)),
        method="GET",
        version="v4",
    )
