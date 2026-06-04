from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, unquote, urlparse
import uuid

from app.config import DEFAULT_MEDIA_S3_PRESIGN_TTL_SECONDS, MEDIA_STORAGE_S3, MEDIA_STORAGE_S3_MOCK, Settings

S3_CONNECT_TIMEOUT_SECONDS = 5
S3_READ_TIMEOUT_SECONDS = 15
S3_CLIENT_ATTEMPTS_PER_UPLOAD_ATTEMPT = 1
S3_PUT_ATTEMPTS = 3
S3_PUT_RETRY_BASE_SECONDS = 0.1
RETRYABLE_S3_ERROR_CODES = {
    "500",
    "502",
    "503",
    "504",
    "InternalError",
    "RequestTimeout",
    "RequestTimeoutException",
    "ServiceUnavailable",
    "SlowDown",
    "Throttling",
    "ThrottlingException",
}


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


class LocalMediaStorage:
    def __init__(self, root: Path = Path("media"), public_prefix: str = "/media") -> None:
        self.root = root
        self.public_prefix = public_prefix.rstrip("/")

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        del content_type
        destination = _safe_local_destination(self.root, key)
        await asyncio.to_thread(destination.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        url = f"{self.public_prefix}/{quote(key, safe='/')}"
        return StoredMedia(key=key, reference=url, url=url)


class S3MediaStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.media_s3_bucket.strip()
        self.region = settings.media_s3_region.strip()
        self.prefix = _clean_prefix(settings.media_s3_prefix)
        self.presign_ttl_seconds = int(settings.media_s3_presign_ttl_seconds)
        if not self.bucket or not self.region:
            raise MediaStorageError("S3 media storage is missing bucket or region configuration.")

        self.client = _s3_client(self.region, settings.media_s3_endpoint_url.strip())

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        object_key = "/".join(part for part in [self.prefix, key] if part)
        await _put_s3_object_with_retry(
            self.client,
            bucket=self.bucket,
            key=object_key,
            content=content,
            content_type=content_type,
        )
        return StoredMedia(
            key=object_key,
            reference=s3_reference(self.bucket, object_key),
            url=presign_s3_reference(s3_reference(self.bucket, object_key), settings=None, client=self.client, expires_in=self.presign_ttl_seconds),
        )


class S3MockMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.media_s3_bucket.strip()
        self.region = settings.media_s3_region.strip()
        self.prefix = _clean_prefix(settings.media_s3_prefix)
        self.root = Path(settings.media_s3_mock_root).expanduser()
        self.presign_ttl_seconds = int(settings.media_s3_presign_ttl_seconds)
        if not self.bucket or not self.region:
            raise MediaStorageError("S3 mock media storage is missing bucket or region configuration.")

    async def put_object(self, *, key: str, content: bytes, content_type: str) -> StoredMedia:
        del content_type
        object_key = "/".join(part for part in [self.prefix, key] if part)
        destination = _safe_local_destination(self.root / self.bucket, object_key)
        await asyncio.to_thread(destination.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        reference = s3_reference(self.bucket, object_key)
        return StoredMedia(
            key=object_key,
            reference=reference,
            url=mock_presign_s3_reference(reference, expires_in=self.presign_ttl_seconds),
        )


def get_media_storage(settings: Settings) -> MediaStorage:
    backend = settings.media_storage_backend.strip().lower()
    if backend == MEDIA_STORAGE_S3:
        return S3MediaStorage(settings)
    if backend == MEDIA_STORAGE_S3_MOCK:
        return S3MockMediaStorage(settings)
    return LocalMediaStorage()


async def warm_media_storage_client(settings: Settings) -> None:
    if settings.media_storage_backend.strip().lower() != MEDIA_STORAGE_S3:
        return
    await asyncio.to_thread(
        _s3_client,
        settings.media_s3_region.strip(),
        settings.media_s3_endpoint_url.strip(),
    )


def media_url(reference: str | None, settings: Settings) -> str:
    if not reference:
        return ""
    if not reference.startswith("s3://"):
        return reference
    if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_S3_MOCK:
        return mock_presign_s3_reference(reference, settings=settings)
    return presign_s3_reference(reference, settings=settings)


async def async_media_url(reference: str | None, settings: Settings) -> str:
    if not reference:
        return ""
    if not reference.startswith("s3://"):
        return reference
    if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_S3_MOCK:
        return await asyncio.to_thread(mock_presign_s3_reference, reference, settings=settings)
    return await asyncio.to_thread(presign_s3_reference, reference, settings=settings)


def s3_reference(bucket: str, key: str) -> str:
    return f"s3://{bucket}/{quote(key, safe='/')}"


def mock_presign_s3_reference(
    reference: str,
    *,
    settings: Settings | None = None,
    expires_in: int | None = None,
) -> str:
    parsed = urlparse(reference)
    if parsed.scheme != "s3" or not parsed.netloc or not parsed.path:
        raise MediaStorageError("Invalid S3 media reference.")

    bucket = parsed.netloc
    key = unquote(parsed.path.lstrip("/"))
    ttl = expires_in if expires_in is not None else int(settings.media_s3_presign_ttl_seconds if settings else DEFAULT_MEDIA_S3_PRESIGN_TTL_SECONDS)
    return f"https://mock-s3.local/{bucket}/{quote(key, safe='/')}?expires={ttl}&signature=mock"


def presign_s3_reference(
    reference: str,
    *,
    settings: Settings | None,
    client: object | None = None,
    expires_in: int | None = None,
) -> str:
    parsed = urlparse(reference)
    if parsed.scheme != "s3" or not parsed.netloc or not parsed.path:
        raise MediaStorageError("Invalid S3 media reference.")

    bucket = parsed.netloc
    key = unquote(parsed.path.lstrip("/"))
    ttl = expires_in if expires_in is not None else int(settings.media_s3_presign_ttl_seconds if settings else DEFAULT_MEDIA_S3_PRESIGN_TTL_SECONDS)
    if client is None:
        client = _s3_client(
            settings.media_s3_region if settings else "",
            getattr(settings, "media_s3_endpoint_url", "").strip() if settings else "",
        )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=ttl,
    )


def profile_media_key(user_id: int, kind: str, extension: str) -> str:
    return f"profile/{user_id}/{kind}-{uuid.uuid4().hex}{extension}"


def professor_chat_media_key(conversation_id: int, extension: str) -> str:
    return f"professor-chat/{conversation_id}/{uuid.uuid4().hex}{extension}"


def safe_original_filename(filename: str | None, fallback: str) -> str:
    return Path(filename or fallback).name[:120]


def _clean_prefix(prefix: str) -> str:
    return "/".join(part for part in prefix.strip("/").split("/") if part)


def _safe_local_destination(root: Path, key: str) -> Path:
    cleaned_key = key.strip().replace("\\", "/")
    key_parts = cleaned_key.split("/")
    if (
        not cleaned_key
        or cleaned_key.startswith("/")
        or "\x00" in cleaned_key
        or any(part in {"", ".", ".."} for part in key_parts)
    ):
        raise MediaStorageError("Invalid media object key.")

    root_path = root.resolve()
    destination = (root_path / cleaned_key).resolve()
    try:
        destination.relative_to(root_path)
    except ValueError as exc:
        raise MediaStorageError("Media object key escapes the storage root.") from exc
    return destination


async def _put_s3_object_with_retry(
    client: object,
    *,
    bucket: str,
    key: str,
    content: bytes,
    content_type: str,
) -> None:
    for attempt in range(1, S3_PUT_ATTEMPTS + 1):
        try:
            await asyncio.to_thread(
                client.put_object,
                Bucket=bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
            return
        except Exception as exc:
            if attempt >= S3_PUT_ATTEMPTS or not _is_retryable_s3_error(exc):
                raise MediaStorageError("S3 media upload failed.") from exc
            await asyncio.sleep(S3_PUT_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))


def _is_retryable_s3_error(exc: Exception) -> bool:
    code = _s3_error_code(exc)
    if code in RETRYABLE_S3_ERROR_CODES:
        return True

    status_code = getattr(exc, "response", {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
    if isinstance(status_code, int) and status_code >= 500:
        return True

    try:
        from botocore.exceptions import (
            ConnectionClosedError,
            ConnectTimeoutError,
            EndpointConnectionError,
            ReadTimeoutError,
        )
    except Exception:
        return False
    return isinstance(exc, (ConnectionClosedError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError))


def _s3_error_code(exc: Exception) -> str:
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = response.get("Error", {}).get("Code")
        if code is not None:
            return str(code)
    code = getattr(exc, "code", None)
    return str(code) if code is not None else ""


@lru_cache(maxsize=8)
def _s3_client(region_name: str, endpoint_url: str = ""):
    import boto3
    from botocore.config import Config

    config = Config(
        connect_timeout=S3_CONNECT_TIMEOUT_SECONDS,
        read_timeout=S3_READ_TIMEOUT_SECONDS,
        retries={"max_attempts": S3_CLIENT_ATTEMPTS_PER_UPLOAD_ATTEMPT, "mode": "standard"},
    )
    return boto3.client("s3", region_name=region_name or None, endpoint_url=endpoint_url or None, config=config)
