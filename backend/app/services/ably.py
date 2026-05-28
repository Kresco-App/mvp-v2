import asyncio
from datetime import datetime, timedelta, timezone
import json
import logging
from urllib.parse import quote

import httpx
import jwt

from app.config import Settings
from app.models.users import User

MAX_ABLY_TOKEN_TTL_SECONDS = 24 * 60 * 60
logger = logging.getLogger(__name__)


class AblyConfigurationError(RuntimeError):
    pass


def split_ably_api_key(api_key: str) -> tuple[str, str]:
    key_name, separator, key_secret = api_key.partition(":")
    if not separator or not key_name.strip() or not key_secret.strip():
        raise AblyConfigurationError("ABLY_API_KEY must use the Ably keyName:keySecret format")
    return key_name.strip(), key_secret.strip()


def ably_client_id(user: User) -> str:
    return f"user:{user.id}"


def live_session_channel_name(live_session_id: int | str) -> str:
    return f"kresco:live:{live_session_id}"


def offering_notifications_channel_name(course_offering_id: int | str) -> str:
    return f"kresco:offering:{course_offering_id}:notifications"


def ably_user_capability(
    user: User,
    live_session_ids: list[int] | None = None,
    offering_ids: list[int] | None = None,
) -> dict[str, list[str]]:
    capability = {
        f"kresco:user:{user.id}:notifications": ["subscribe"],
        f"kresco:user:{user.id}:presence": ["presence"],
    }
    if user.role == "professor":
        capability[f"kresco:professor:{user.id}:inbox"] = ["subscribe"]
    for live_session_id in sorted(set(live_session_ids or [])):
        capability[live_session_channel_name(live_session_id)] = ["subscribe"]
    for offering_id in sorted(set(offering_ids or [])):
        capability[offering_notifications_channel_name(offering_id)] = ["subscribe"]
    return capability


def create_ably_jwt(
    user: User,
    settings: Settings,
    live_session_ids: list[int] | None = None,
    offering_ids: list[int] | None = None,
) -> tuple[str, datetime, dict[str, list[str]]]:
    if not settings.ably_api_key:
        raise AblyConfigurationError("ABLY_API_KEY is not configured")

    key_name, key_secret = split_ably_api_key(settings.ably_api_key)
    ttl_seconds = max(60, min(settings.ably_token_ttl_seconds, MAX_ABLY_TOKEN_TTL_SECONDS))
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)
    capability = ably_user_capability(user, live_session_ids, offering_ids)
    payload = {
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "x-ably-clientId": ably_client_id(user),
        "x-ably-capability": json.dumps(capability, separators=(",", ":")),
    }
    token = jwt.encode(payload, key_secret, algorithm="HS256", headers={"kid": key_name, "typ": "JWT"})
    return token, expires_at, capability


async def publish_ably_message(
    settings: Settings,
    channel: str,
    name: str,
    data: dict,
    *,
    attempts: int = 2,
    retry_delay_seconds: float = 0.2,
    http_client: httpx.AsyncClient | None = None,
) -> bool:
    if not settings.ably_api_key:
        logger.warning("Ably publish skipped because ABLY_API_KEY is not configured", extra={"channel": channel, "event": name})
        return False

    try:
        key_name, key_secret = split_ably_api_key(settings.ably_api_key)
    except AblyConfigurationError:
        logger.exception("Ably publish skipped because ABLY_API_KEY is malformed", extra={"channel": channel, "event": name})
        return False

    url = f"https://rest.ably.io/channels/{quote(channel, safe='')}/messages"
    max_attempts = max(1, attempts)

    async def _publish(client: httpx.AsyncClient) -> bool:
        for attempt in range(1, max_attempts + 1):
            try:
                response = await client.post(
                    url,
                    auth=(key_name, key_secret),
                    json={"name": name, "data": data},
                )
                response.raise_for_status()
                return True
            except Exception:
                if attempt >= max_attempts:
                    logger.exception(
                        "Ably publish failed",
                        extra={"channel": channel, "event": name, "attempts": max_attempts},
                    )
                    return False
                await asyncio.sleep(retry_delay_seconds)
        return False

    if http_client is not None:
        return await _publish(http_client)

    async with httpx.AsyncClient(timeout=5) as client:
        return await _publish(client)
