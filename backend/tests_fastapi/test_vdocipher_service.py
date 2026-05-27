import asyncio

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.services import vdocipher


class FakeAsyncClient:
    response: httpx.Response
    calls: list[dict]

    def __init__(self, *, timeout: int):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, *, headers: dict, json: dict):
        self.__class__.calls.append({"url": url, "headers": headers, "json": json, "timeout": self.timeout})
        return self.__class__.response


def live_settings(**overrides) -> Settings:
    values = {
        "database_url": "sqlite+aiosqlite:///./test.sqlite3",
        "jwt_secret_key": "test-secret-key-for-ci-32-bytes-minimum",
        "vdocipher_api_secret": "api-secret",
        "vdocipher_api_base_url": "https://video-api.example/api",
        "vdocipher_live_create_url": "https://provider.example/live/create",
    }
    values.update(overrides)
    return Settings(**values)


def test_get_video_otp_posts_to_configured_api_base_and_parses_response(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(200, json={"otp": "otp-value", "playbackInfo": "playback-value"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        vdocipher.get_video_otp(" video/id 1 ", live_settings(vdocipher_api_base_url="https://video-api.example/api/"))
    )

    assert result == {"otp": "otp-value", "playback_info": "playback-value"}
    assert FakeAsyncClient.calls == [
        {
            "url": "https://video-api.example/api/videos/video%2Fid%201/otp",
            "headers": {"Authorization": "Apisecret api-secret"},
            "json": {"ttl": 300},
            "timeout": 10,
        }
    ]


def test_get_video_otp_requires_video_id_and_provider_config():
    with pytest.raises(HTTPException) as missing_id:
        asyncio.run(vdocipher.get_video_otp("", live_settings()))
    assert missing_id.value.status_code == 404

    with pytest.raises(HTTPException) as missing_secret:
        asyncio.run(vdocipher.get_video_otp("video-123", live_settings(vdocipher_api_secret="")))
    assert missing_secret.value.status_code == 501
    assert "VDOCIPHER_API_SECRET" in missing_secret.value.detail

    with pytest.raises(HTTPException) as missing_base_url:
        asyncio.run(vdocipher.get_video_otp("video-123", live_settings(vdocipher_api_base_url="")))
    assert missing_base_url.value.status_code == 501
    assert "VDOCIPHER_API_BASE_URL" in missing_base_url.value.detail


def test_get_video_otp_surfaces_provider_error(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(401, json={"message": "invalid secret"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.get_video_otp("video-123", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to get video OTP from VdoCipher"


def test_create_live_stream_posts_expected_payload_and_parses_provider_response(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(
        200,
        json={
            "liveId": "live_generated",
            "ingestUrl": "rtmp://ingest.example/live",
            "streamKey": "stream-secret",
            "extra": {"status": "ready"},
        },
    )
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(vdocipher.create_live_stream("National exam live", live_settings(), chat_mode="authenticated"))

    assert result == {
        "live_id": "live_generated",
        "stream_ingest_url": "rtmp://ingest.example/live",
        "stream_key": "stream-secret",
        "raw": {
            "liveId": "live_generated",
            "ingestUrl": "rtmp://ingest.example/live",
            "streamKey": "[redacted]",
            "extra": {"status": "ready"},
        },
    }
    assert FakeAsyncClient.calls == [
        {
            "url": "https://provider.example/live/create",
            "headers": {"Authorization": "Apisecret api-secret"},
            "json": {
                "title": "National exam live",
                "chatMode": "authenticated",
                "hidePolls": True,
                "hideQnA": True,
                "disableEmojis": True,
            },
            "timeout": 15,
        }
    ]


def test_create_live_stream_requires_provider_config():
    with pytest.raises(HTTPException) as missing_secret:
        asyncio.run(vdocipher.create_live_stream("Missing secret", live_settings(vdocipher_api_secret="")))
    assert missing_secret.value.status_code == 501
    assert "VDOCIPHER_API_SECRET" in missing_secret.value.detail

    with pytest.raises(HTTPException) as missing_url:
        asyncio.run(vdocipher.create_live_stream("Missing URL", live_settings(vdocipher_live_create_url="")))
    assert missing_url.value.status_code == 501
    assert "VDOCIPHER_LIVE_CREATE_URL" in missing_url.value.detail


def test_create_live_stream_surfaces_provider_error(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(400, json={"message": "chat mode is invalid"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.create_live_stream("Bad live", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to create VdoCipher live stream: chat mode is invalid"


def test_create_live_stream_rejects_missing_live_id(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(200, json={"streamUrl": "rtmp://ingest.example/live"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.create_live_stream("No live id", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "VdoCipher did not return a live stream ID"


def test_provider_payload_sanitizer_redacts_nested_secrets():
    assert vdocipher.sanitize_provider_payload(
        {
            "streamKey": "secret",
            "nested": {"accessToken": "token", "safe": "value"},
            "items": [{"password": "pw"}, {"status": "ready"}],
        }
    ) == {
        "streamKey": "[redacted]",
        "nested": {"accessToken": "[redacted]", "safe": "value"},
        "items": [{"password": "[redacted]"}, {"status": "ready"}],
    }


def test_live_embed_urls_escape_ids_and_tokens():
    assert (
        vdocipher.get_live_embed_url(" live id/with spaces ", chat_token="token/with spaces")
        == "https://player.vdocipher.com/live-v2?liveId=live%20id%2Fwith%20spaces&token=token%2Fwith%20spaces"
    )
    assert (
        vdocipher.get_live_chat_embed_url(" live id/with spaces ")
        == "https://zenstream.chat?liveId=live%20id%2Fwith%20spaces"
    )
