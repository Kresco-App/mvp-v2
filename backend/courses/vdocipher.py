from __future__ import annotations

from typing import Any

import requests
from django.conf import settings


VDO_BASE_URL = "https://dev.vdocipher.com/api"


def _build_headers() -> dict[str, str] | None:
    secret = getattr(settings, "VDOCIPHER_API_SECRET", "")
    if not secret or secret == "mock-vdocipher-secret":
        return None
    return {"Authorization": f"Apisecret {secret}"}


def fetch_video_metadata(video_id: str, timeout: int = 10) -> dict[str, Any] | None:
    headers = _build_headers()
    if not video_id or headers is None:
        return None

    response = requests.get(
        f"{VDO_BASE_URL}/videos/{video_id}",
        headers=headers,
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else None


def fetch_video_duration_seconds(video_id: str, timeout: int = 10) -> int | None:
    metadata = fetch_video_metadata(video_id, timeout=timeout)
    length = metadata.get("length") if metadata else None
    if length is None:
        return None

    try:
        return max(int(length), 0)
    except (TypeError, ValueError):
        return None
