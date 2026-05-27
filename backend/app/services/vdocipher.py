import httpx
from fastapi import HTTPException
from urllib.parse import quote

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
        raise HTTPException(status_code=502, detail="Failed to get video OTP from VdoCipher")

    data = response.json()
    return {"otp": data["otp"], "playback_info": data["playbackInfo"]}


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
        detail = "Failed to create VdoCipher live stream"
        try:
            data = response.json()
            provider_detail = data.get("message") or data.get("detail") or data.get("error")
            if provider_detail:
                detail = f"{detail}: {provider_detail}"
        except ValueError:
            if response.text:
                detail = f"{detail}: {response.text[:160]}"
        raise HTTPException(status_code=502, detail=detail)

    data = response.json()
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
    return f"https://zenstream.chat?liveId={quote(vdocipher_live_id.strip(), safe='')}"
