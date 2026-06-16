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
    DEFAULT_MEDIA_S3_PRESIGN_TTL_SECONDS,
    MEDIA_STORAGE_GCS,
    MEDIA_STORAGE_GCS_MOCK,
    MEDIA_STORAGE_S3,
    MEDIA_STORAGE_S3_MOCK,
    Settings,
)

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
        clean_key = _normalize_media_object_key(key)
        object_key = "/".join(part for part in [self.prefix, clean_key] if part)
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

    async def delete_reference(self, reference: str | None) -> bool:
        object_key = _owned_s3_reference_key(reference, bucket=self.bucket, prefix=self.prefix)
        if object_key is None:
            return False
        await _delete_s3_object_with_retry(self.client, bucket=self.bucket, key=object_key)
        return True


class GCSMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.media_gcs_bucket.strip()
        self.prefix = _clean_prefix(settings.media_gcs_prefix)
        self.signed_url_ttl_seconds = int(settings.media_gcs_signed_url_ttl_seconds)
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
        self.signed_url_ttl_seconds = int(settings.media_gcs_signed_url_ttl_seconds)
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
        clean_key = _normalize_media_object_key(key)
        object_key = "/".join(part for part in [self.prefix, clean_key] if part)
        destination = _safe_local_destination(self.root / self.bucket, object_key)
        await asyncio.to_thread(destination.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        reference = s3_reference(self.bucket, object_key)
        return StoredMedia(
            key=object_key,
            reference=reference,
            url=mock_presign_s3_reference(reference, expires_in=self.presign_ttl_seconds),
        )

    async def delete_reference(self, reference: str | None) -> bool:
        object_key = _owned_s3_reference_key(reference, bucket=self.bucket, prefix=self.prefix)
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
    if backend == MEDIA_STORAGE_S3:
        return S3MediaStorage(settings)
    if backend == MEDIA_STORAGE_S3_MOCK:
        return S3MockMediaStorage(settings)
    return LocalMediaStorage()


async def warm_media_storage_client(settings: Settings) -> None:
    if settings.media_storage_backend.strip().lower() == MEDIA_STORAGE_GCS:
        await asyncio.to_thread(_gcs_client)
        return
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
    if reference.startswith("gs://"):
        if not _gcs_reference_matches_settings_scope(reference, settings):
            return ""
        if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_GCS_MOCK:
            return mock_sign_gcs_reference(reference, settings=settings)
        return sign_gcs_reference(reference, settings=settings)
    if not reference.startswith("s3://"):
        return reference
    if not _s3_reference_matches_settings_scope(reference, settings):
        return ""
    if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_S3_MOCK:
        return mock_presign_s3_reference(reference, settings=settings)
    return presign_s3_reference(reference, settings=settings)


async def async_media_url(reference: str | None, settings: Settings) -> str:
    if not reference:
        return ""
    if reference.startswith("gs://"):
        if not _gcs_reference_matches_settings_scope(reference, settings):
            return ""
        if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_GCS_MOCK:
            return await asyncio.to_thread(mock_sign_gcs_reference, reference, settings=settings)
        return await asyncio.to_thread(sign_gcs_reference, reference, settings=settings)
    if not reference.startswith("s3://"):
        return reference
    if not _s3_reference_matches_settings_scope(reference, settings):
        return ""
    if getattr(settings, "media_storage_backend", "").strip().lower() == MEDIA_STORAGE_S3_MOCK:
        return await asyncio.to_thread(mock_presign_s3_reference, reference, settings=settings)
    return await asyncio.to_thread(presign_s3_reference, reference, settings=settings)


def s3_reference(bucket: str, key: str) -> str:
    return f"s3://{bucket}/{quote(key, safe='/')}"


def gcs_reference(bucket: str, key: str) -> str:
    return f"gs://{bucket}/{quote(key, safe='/')}"


async def delete_media_reference(storage: MediaStorage, reference: str | None) -> bool:
    if not reference:
        return False
    return await storage.delete_reference(reference)


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
    ttl = expires_in if expires_in is not None else int(settings.media_gcs_signed_url_ttl_seconds if settings else DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS)
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
    ttl = expires_in if expires_in is not None else int(settings.media_gcs_signed_url_ttl_seconds if settings else DEFAULT_MEDIA_GCS_SIGNED_URL_TTL_SECONDS)
    if client is None:
        client = _gcs_client()
    blob = client.bucket(bucket).blob(key)
    return _signed_gcs_blob_url(blob, expires_in=ttl)


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


def _s3_reference_parts(reference: str | None) -> tuple[str, str] | None:
    if not reference:
        return None
    parsed = urlparse(reference)
    if parsed.scheme != "s3" or not parsed.netloc or not parsed.path:
        return None
    key = unquote(parsed.path.lstrip("/"))
    if not key:
        return None
    return parsed.netloc, key


def _owned_s3_reference_key(reference: str | None, *, bucket: str, prefix: str) -> str | None:
    parts = _s3_reference_parts(reference)
    if parts is None:
        return None
    reference_bucket, key = parts
    if reference_bucket != bucket or not _key_matches_prefix(key, prefix):
        return None
    return key


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


def _s3_reference_matches_settings_scope(reference: str, settings: Settings) -> bool:
    configured_bucket = str(getattr(settings, "media_s3_bucket", "") or "").strip()
    if not configured_bucket:
        return False

    parts = _s3_reference_parts(reference)
    if parts is None:
        return False

    reference_bucket, key = parts
    configured_prefix = _clean_prefix(str(getattr(settings, "media_s3_prefix", "") or ""))
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


async def _delete_s3_object_with_retry(
    client: object,
    *,
    bucket: str,
    key: str,
) -> None:
    for attempt in range(1, S3_PUT_ATTEMPTS + 1):
        try:
            await asyncio.to_thread(
                client.delete_object,
                Bucket=bucket,
                Key=key,
            )
            return
        except Exception as exc:
            if attempt >= S3_PUT_ATTEMPTS or not _is_retryable_s3_error(exc):
                raise MediaStorageError("S3 media delete failed.") from exc
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
