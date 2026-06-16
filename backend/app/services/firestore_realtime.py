from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import quote

from app.config import Settings


class FirestoreRealtimeConfigurationError(RuntimeError):
    pass


def firestore_channel_document_id(channel: str) -> str:
    clean_channel = channel.strip()
    if not clean_channel:
        raise FirestoreRealtimeConfigurationError("Realtime channel is required")
    return quote(clean_channel, safe="")


async def publish_firestore_message(
    settings: Settings,
    channel: str,
    name: str,
    data: dict,
    *,
    attempts: int = 2,
    retry_delay_seconds: float = 0.2,
    http_client: object | None = None,
) -> bool:
    del http_client
    if not settings.firebase_project_id.strip():
        raise FirestoreRealtimeConfigurationError("FIREBASE_PROJECT_ID is not configured")

    max_attempts = max(1, attempts)
    for attempt in range(1, max_attempts + 1):
        try:
            await asyncio.to_thread(_publish_firestore_message_sync, settings, channel, name, data)
            return True
        except Exception:
            if attempt >= max_attempts:
                return False
            await asyncio.sleep(retry_delay_seconds)
    return False


def _publish_firestore_message_sync(settings: Settings, channel: str, name: str, data: dict) -> None:
    client = _firestore_client(settings.firebase_project_id.strip(), settings.firestore_database.strip() or "(default)")
    channel_id = firestore_channel_document_id(channel)
    event_ref = (
        client.collection("realtimeChannels")
        .document(channel_id)
        .collection("events")
        .document()
    )
    event_ref.set({
        "channel": channel,
        "name": name,
        "data": data,
        "createdAt": datetime.now(timezone.utc),
    })


@lru_cache(maxsize=8)
def _firestore_client(project_id: str, database: str):
    from google.cloud import firestore

    if database and database != "(default)":
        return firestore.Client(project=project_id, database=database)
    return firestore.Client(project=project_id)
