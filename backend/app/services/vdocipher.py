import asyncio
import logging
from time import monotonic
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.config import Settings, is_vdocipher_provider_url

SENSITIVE_PROVIDER_KEYS = {
    "authorization",
    "key",
    "otp",
    "password",
    "playbackinfo",
    "secret",
    "streamkey",
    "stream_key",
    "token",
}

logger = logging.getLogger(__name__)

DEMO_VIDEO_ID_PREFIX = "demo-"
DEMO_VIDEO_STREAM = {"otp": "mock-otp-token", "playback_info": ""}
VDOCIPHER_PROVIDER_ATTEMPTS = 3
VDOCIPHER_RETRY_BASE_SECONDS = 0.1
RETRYABLE_VDOCIPHER_STATUS_CODES = {429, 500, 502, 503, 504}
VDOCIPHER_OTP_TTL_SECONDS = 300
VDOCIPHER_OTP_CACHE_SECONDS = 240

_video_otp_cache: dict[tuple[str, str, str], tuple[float, dict]] = {}
_video_otp_locks: dict[tuple[str, str, str], asyncio.Lock] = {}


def _first_string(data: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def sanitize_provider_payload(value):
    if isinstance(value, dict):
        clean = {}
        for key, nested_value in value.items():
            normalized_key = str(key).replace("-", "").replace("_", "").casefold()
            if normalized_key in SENSITIVE_PROVIDER_KEYS or any(marker in normalized_key for marker in ("secret", "token", "password")):
                clean[key] = "[redacted]"
            else:
                clean[key] = sanitize_provider_payload(nested_value)
        return clean
    if isinstance(value, list):
        return [sanitize_provider_payload(item) for item in value]
    return value


def _provider_error_extra(response: httpx.Response) -> dict:
    log_extra = {"provider_status_code": response.status_code}
    try:
        log_extra["provider_response"] = sanitize_provider_payload(response.json())
    except ValueError:
        log_extra["provider_response_length"] = len(response.text or "")
    return log_extra


def _is_retryable_provider_error(exc: httpx.HTTPError) -> bool:
    return isinstance(exc, httpx.TransportError)


def clear_video_otp_cache() -> None:
    _video_otp_cache.clear()
    _video_otp_locks.clear()


def _video_otp_cache_key(video_id: str, settings: Settings, user_id: int | str | None) -> tuple[str, str, str]:
    return (
        settings.vdocipher_api_base_url.rstrip("/"),
        video_id,
        str(user_id) if user_id is not None else "",
    )


def _cached_video_otp(key: tuple[str, str, str]) -> dict | None:
    cached = _video_otp_cache.get(key)
    if cached is None:
        return None
    expires_at, value = cached
    if expires_at <= monotonic():
        _video_otp_cache.pop(key, None)
        return None
    return dict(value)


async def _post_vdocipher_json(
    url: str,
    *,
    headers: dict,
    json: dict,
    timeout: int,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(1, VDOCIPHER_PROVIDER_ATTEMPTS + 1):
            try:
                response = await client.post(url, headers=headers, json=json)
            except httpx.HTTPError as exc:
                if attempt >= VDOCIPHER_PROVIDER_ATTEMPTS or not _is_retryable_provider_error(exc):
                    raise
                await asyncio.sleep(VDOCIPHER_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                continue
            if (
                response.status_code in RETRYABLE_VDOCIPHER_STATUS_CODES
                and attempt < VDOCIPHER_PROVIDER_ATTEMPTS
            ):
                await asyncio.sleep(VDOCIPHER_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                continue
            return response
    raise RuntimeError("unreachable")


async def _delete_vdocipher_resource(
    url: str,
    *,
    headers: dict,
    timeout: int,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(1, VDOCIPHER_PROVIDER_ATTEMPTS + 1):
            try:
                response = await client.delete(url, headers=headers)
            except httpx.HTTPError as exc:
                if attempt >= VDOCIPHER_PROVIDER_ATTEMPTS or not _is_retryable_provider_error(exc):
                    raise
                await asyncio.sleep(VDOCIPHER_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                continue
            if (
                response.status_code in RETRYABLE_VDOCIPHER_STATUS_CODES
                and attempt < VDOCIPHER_PROVIDER_ATTEMPTS
            ):
                await asyncio.sleep(VDOCIPHER_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                continue
            return response
    raise RuntimeError("unreachable")


def _live_delete_url(template: str, live_id: str) -> str:
    encoded_live_id = quote(live_id.strip(), safe="")
    if "{live_id}" in template or "{liveId}" in template:
        return template.replace("{live_id}", encoded_live_id).replace("{liveId}", encoded_live_id)
    return f"{template.rstrip('/')}/{encoded_live_id}"


def _vdocipher_authorization_headers(settings: Settings, url: str) -> dict[str, str]:
    if not is_vdocipher_provider_url(url):
        raise HTTPException(
            status_code=501,
            detail="VdoCipher provider URL must use a VdoCipher-owned HTTPS host.",
        )
    return {"Authorization": f"Apisecret {settings.vdocipher_api_secret}"}


async def get_video_otp(vdocipher_id: str, settings: Settings, *, user_id: int | str | None = None) -> dict:
    video_id = vdocipher_id.strip()
    if not video_id:
        raise HTTPException(status_code=404, detail="No video ID configured for this lesson")
    if not settings.vdocipher_api_secret:
        raise HTTPException(status_code=501, detail="VdoCipher API secret is not configured. Set VDOCIPHER_API_SECRET.")
    if not settings.vdocipher_api_base_url:
        raise HTTPException(status_code=501, detail="VdoCipher API base URL is not configured. Set VDOCIPHER_API_BASE_URL.")

    cache_key = _video_otp_cache_key(video_id, settings, user_id)
    cached = _cached_video_otp(cache_key)
    if cached is not None:
        return cached

    lock = _video_otp_locks.setdefault(cache_key, asyncio.Lock())
    async with lock:
        cached = _cached_video_otp(cache_key)
        if cached is not None:
            return cached
        return await _fetch_video_otp(video_id, settings, user_id=user_id, cache_key=cache_key)


async def _fetch_video_otp(
    video_id: str,
    settings: Settings,
    *,
    user_id: int | str | None,
    cache_key: tuple[str, str, str],
) -> dict:
    otp_url = f"{settings.vdocipher_api_base_url.rstrip('/')}/videos/{quote(video_id, safe='')}/otp"
    payload: dict[str, int | str] = {"ttl": VDOCIPHER_OTP_TTL_SECONDS}
    if user_id is not None:
        payload["userId"] = str(user_id)

    try:
        response = await _post_vdocipher_json(
            otp_url,
            headers=_vdocipher_authorization_headers(settings, otp_url),
            json=payload,
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.warning("vdocipher_otp_request_failed", exc_info=True)
        raise HTTPException(status_code=502, detail="Failed to get video OTP from VdoCipher") from exc

    if response.status_code != 200:
        logger.warning("vdocipher_otp_failed", extra=_provider_error_extra(response))
        raise HTTPException(status_code=502, detail="Failed to get video OTP from VdoCipher")

    try:
        data = response.json()
        result = {"otp": data["otp"], "playback_info": data["playbackInfo"]}
        _video_otp_cache[cache_key] = (monotonic() + VDOCIPHER_OTP_CACHE_SECONDS, result)
        return dict(result)
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("vdocipher_otp_malformed_response")
        raise HTTPException(status_code=502, detail="Invalid VdoCipher OTP response") from exc


async def get_video_stream_data(vdocipher_id: str, settings: Settings, *, user_id: int | str | None = None) -> dict:
    video_id = vdocipher_id.strip()
    if video_id.startswith(DEMO_VIDEO_ID_PREFIX) and not settings.is_production_like:
        return dict(DEMO_VIDEO_STREAM)
    return await get_video_otp(video_id, settings, user_id=user_id)


async def create_live_stream(title: str, settings: Settings, *, chat_mode: str = "off") -> dict:
    if not settings.vdocipher_api_secret:
        raise HTTPException(
            status_code=501,
            detail="VdoCipher API secret is not configured. Set VDOCIPHER_API_SECRET.",
        )
    if not settings.vdocipher_live_create_url:
        raise HTTPException(
            status_code=501,
            detail="VdoCipher live stream creation is not configured. Set VDOCIPHER_LIVE_CREATE_URL.",
        )

    payload = {
        "title": title,
        "chatMode": chat_mode,
        "hidePolls": True,
        "hideQnA": True,
        "disableEmojis": True,
    }
    try:
        response = await _post_vdocipher_json(
            settings.vdocipher_live_create_url,
            headers=_vdocipher_authorization_headers(settings, settings.vdocipher_live_create_url),
            json=payload,
            timeout=15,
        )
    except httpx.HTTPError as exc:
        logger.warning("vdocipher_live_create_request_failed", exc_info=True)
        raise HTTPException(status_code=502, detail="Failed to create VdoCipher live stream") from exc

    if response.status_code >= 400:
        logger.warning("vdocipher_live_create_failed", extra=_provider_error_extra(response))
        raise HTTPException(status_code=502, detail="Failed to create VdoCipher live stream")

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning("vdocipher_live_create_malformed_response")
        raise HTTPException(status_code=502, detail="Invalid VdoCipher live stream response") from exc
    live_id = _first_string(data, ("liveId", "live_id", "id", "streamId", "stream_id"))
    if not live_id:
        raise HTTPException(status_code=502, detail="VdoCipher did not return a live stream ID")
    return {
        "live_id": str(live_id),
        "stream_ingest_url": _first_string(data, ("streamUrl", "stream_url", "ingestUrl", "ingest_url", "rtmpUrl", "rtmp_url")),
        "stream_key": _first_string(data, ("streamKey", "stream_key", "key")),
        "raw": sanitize_provider_payload(data),
    }


async def delete_live_stream(live_id: str, settings: Settings) -> dict:
    clean_live_id = live_id.strip()
    if not clean_live_id:
        return {"cleanup_state": "skipped", "cleanup_reason": "missing_live_id"}

    if not settings.vdocipher_api_secret:
        logger.critical(
            "vdocipher_live_cleanup_required",
            extra={"vdocipher_live_id": clean_live_id, "cleanup_reason": "missing_api_secret"},
        )
        return {"cleanup_state": "cleanup_required", "cleanup_reason": "missing_api_secret"}

    delete_url_template = getattr(settings, "vdocipher_live_delete_url", "").strip()
    if not delete_url_template:
        logger.critical(
            "vdocipher_live_cleanup_required",
            extra={"vdocipher_live_id": clean_live_id, "cleanup_reason": "delete_endpoint_unconfigured"},
        )
        return {"cleanup_state": "cleanup_required", "cleanup_reason": "delete_endpoint_unconfigured"}

    delete_url = _live_delete_url(delete_url_template, clean_live_id)
    try:
        response = await _delete_vdocipher_resource(
            delete_url,
            headers=_vdocipher_authorization_headers(settings, delete_url),
            timeout=15,
        )
    except httpx.HTTPError as exc:
        logger.exception(
            "vdocipher_live_cleanup_delete_request_failed",
            extra={"vdocipher_live_id": clean_live_id},
        )
        return {
            "cleanup_state": "cleanup_required",
            "cleanup_reason": "delete_request_failed",
            "cleanup_error": f"{type(exc).__name__}: {str(exc)[:500]}",
        }

    if response.status_code >= 400:
        logger.critical(
            "vdocipher_live_cleanup_delete_failed",
            extra={"vdocipher_live_id": clean_live_id, **_provider_error_extra(response)},
        )
        return {
            "cleanup_state": "cleanup_required",
            "cleanup_reason": "delete_provider_failed",
            "provider_status_code": response.status_code,
        }

    logger.info("vdocipher_live_cleanup_deleted", extra={"vdocipher_live_id": clean_live_id})
    return {"cleanup_state": "deleted"}


def get_live_embed_url(vdocipher_live_id: str, chat_token: str = "") -> str:
    if not vdocipher_live_id:
        raise HTTPException(status_code=404, detail="No VdoCipher live ID configured for this session")

    live_id = quote(vdocipher_live_id.strip(), safe="")
    url = f"https://player.vdocipher.com/live-v2?liveId={live_id}"
    if chat_token:
        url += f"&token={quote(chat_token, safe='')}"
    return url


def get_live_chat_embed_url(vdocipher_live_id: str) -> str:
    if not vdocipher_live_id:
        raise HTTPException(status_code=404, detail="No VdoCipher live ID configured for this session")

    live_id = quote(vdocipher_live_id.strip(), safe="")
    return f"https://zenstream.chat?liveId={live_id}"
