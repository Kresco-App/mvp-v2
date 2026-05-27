import logging
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.config import Settings

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


async def get_video_otp(vdocipher_id: str, settings: Settings) -> dict:
    video_id = vdocipher_id.strip()
    if not video_id:
        raise HTTPException(status_code=404, detail="No video ID configured for this lesson")
    if not settings.vdocipher_api_secret:
        raise HTTPException(status_code=501, detail="VdoCipher API secret is not configured. Set VDOCIPHER_API_SECRET.")
    if not settings.vdocipher_api_base_url:
        raise HTTPException(status_code=501, detail="VdoCipher API base URL is not configured. Set VDOCIPHER_API_BASE_URL.")

    otp_url = f"{settings.vdocipher_api_base_url.rstrip('/')}/videos/{quote(video_id, safe='')}/otp"

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            otp_url,
            headers={"Authorization": f"Apisecret {settings.vdocipher_api_secret}"},
            json={"ttl": 300},
        )

    if response.status_code != 200:
        logger.warning("vdocipher_otp_failed", extra=_provider_error_extra(response))
        raise HTTPException(status_code=502, detail="Failed to get video OTP from VdoCipher")

    try:
        data = response.json()
        return {"otp": data["otp"], "playback_info": data["playbackInfo"]}
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("vdocipher_otp_malformed_response")
        raise HTTPException(status_code=502, detail="Invalid VdoCipher OTP response") from exc


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
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            settings.vdocipher_live_create_url,
            headers={"Authorization": f"Apisecret {settings.vdocipher_api_secret}"},
            json=payload,
        )

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
