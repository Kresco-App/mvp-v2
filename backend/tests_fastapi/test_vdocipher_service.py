import asyncio

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.services import vdocipher


class FakeAsyncClient:
    response: httpx.Response
    responses: list[httpx.Response] = []
    calls: list[dict]

    def __init__(self, *, timeout: int):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, *, headers: dict, json: dict):
        self.__class__.calls.append({"url": url, "headers": headers, "json": json, "timeout": self.timeout})
        if self.__class__.responses:
            return self.__class__.responses.pop(0)
        return self.__class__.response

    async def delete(self, url: str, *, headers: dict):
        self.__class__.calls.append({"method": "DELETE", "url": url, "headers": headers, "timeout": self.timeout})
        if self.__class__.responses:
            return self.__class__.responses.pop(0)
        return self.__class__.response


class FailingAsyncClient:
    def __init__(self, *, timeout: int):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, *, headers: dict, json: dict):
        del url, headers, json
        raise httpx.ConnectTimeout("provider timed out")

    async def delete(self, url: str, *, headers: dict):
        del url, headers
        raise httpx.ConnectTimeout("provider timed out")


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


@pytest.fixture(autouse=True)
def clear_video_otp_cache():
    vdocipher.clear_video_otp_cache()
    yield
    vdocipher.clear_video_otp_cache()


def test_get_video_otp_posts_to_configured_api_base_and_parses_response(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
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


def test_get_video_stream_data_returns_demo_stream_outside_production(monkeypatch):
    class UnexpectedAsyncClient:
        def __init__(self, *, timeout: int):
            del timeout
            raise AssertionError("demo stream should not call VdoCipher")

    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", UnexpectedAsyncClient)

    result = asyncio.run(vdocipher.get_video_stream_data(" demo-preview ", live_settings(environment="test")))

    assert result == {"otp": "mock-otp-token", "playback_info": ""}


def test_get_video_stream_data_uses_provider_for_demo_ids_in_production(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(200, json={"otp": "otp-value", "playbackInfo": "playback-value"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(vdocipher.get_video_stream_data("demo-preview", live_settings(environment="production")))

    assert result == {"otp": "otp-value", "playback_info": "playback-value"}
    assert FakeAsyncClient.calls[0]["url"] == "https://video-api.example/api/videos/demo-preview/otp"


def test_get_video_stream_data_caches_otp_per_user_and_binds_payload(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(200, json={"otp": "otp-value", "playbackInfo": "playback-value"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    async def _fetch():
        first = await vdocipher.get_video_stream_data("video-123", live_settings(), user_id=7)
        second = await vdocipher.get_video_stream_data("video-123", live_settings(), user_id=7)
        other_user = await vdocipher.get_video_stream_data("video-123", live_settings(), user_id=8)
        return first, second, other_user

    first, second, other_user = asyncio.run(_fetch())

    assert first == {"otp": "otp-value", "playback_info": "playback-value"}
    assert second == first
    assert other_user == first
    assert len(FakeAsyncClient.calls) == 2
    assert FakeAsyncClient.calls[0]["json"] == {"ttl": 300, "userId": "7"}
    assert FakeAsyncClient.calls[1]["json"] == {"ttl": 300, "userId": "8"}


def test_get_video_otp_surfaces_provider_error(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(401, json={"message": "invalid secret"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.get_video_otp("video-123", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to get video OTP from VdoCipher"


def test_get_video_otp_retries_retryable_provider_status(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.response = httpx.Response(200, json={"otp": "unused", "playbackInfo": "unused"})
    FakeAsyncClient.responses = [
        httpx.Response(503, json={"message": "temporary"}),
        httpx.Response(200, json={"otp": "otp-value", "playbackInfo": "playback-value"}),
    ]
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(vdocipher.asyncio, "sleep", no_sleep)

    result = asyncio.run(vdocipher.get_video_otp("video-123", live_settings()))

    assert result == {"otp": "otp-value", "playback_info": "playback-value"}
    assert len(FakeAsyncClient.calls) == 2


def test_get_video_otp_maps_provider_network_failure(monkeypatch):
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FailingAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.get_video_otp("video-123", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to get video OTP from VdoCipher"


def test_create_live_stream_posts_expected_payload_and_parses_provider_response(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
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


def test_create_live_stream_masks_provider_error(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(400, json={"message": "chat mode is invalid for api-secret"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.create_live_stream("Bad live", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to create VdoCipher live stream"
    assert "api-secret" not in error.value.detail


def test_create_live_stream_retries_provider_network_failure(monkeypatch):
    class FlakyAsyncClient(FakeAsyncClient):
        calls = []
        failed = False

        async def post(self, url: str, *, headers: dict, json: dict):
            self.__class__.calls.append({"url": url, "headers": headers, "json": json, "timeout": self.timeout})
            if not self.__class__.failed:
                self.__class__.failed = True
                raise httpx.ConnectTimeout("provider timed out")
            return httpx.Response(200, json={"liveId": "live_retry"})

    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FlakyAsyncClient)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(vdocipher.asyncio, "sleep", no_sleep)

    result = asyncio.run(vdocipher.create_live_stream("Retry live", live_settings()))

    assert result["live_id"] == "live_retry"
    assert len(FlakyAsyncClient.calls) == 2


def test_create_live_stream_maps_provider_network_failure(monkeypatch):
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FailingAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.create_live_stream("Slow live", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "Failed to create VdoCipher live stream"


def test_create_live_stream_rejects_missing_live_id(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(200, json={"streamUrl": "rtmp://ingest.example/live"})
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(vdocipher.create_live_stream("No live id", live_settings()))

    assert error.value.status_code == 502
    assert error.value.detail == "VdoCipher did not return a live stream ID"


def test_delete_live_stream_uses_configured_cleanup_endpoint(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    FakeAsyncClient.response = httpx.Response(204)
    monkeypatch.setattr(vdocipher.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        vdocipher.delete_live_stream(
            " live/id 1 ",
            live_settings(vdocipher_live_delete_url="https://provider.example/live/{live_id}"),
        )
    )

    assert result == {"cleanup_state": "deleted"}
    assert FakeAsyncClient.calls == [
        {
            "method": "DELETE",
            "url": "https://provider.example/live/live%2Fid%201",
            "headers": {"Authorization": "Apisecret api-secret"},
            "timeout": 15,
        }
    ]


def test_delete_live_stream_returns_cleanup_required_without_endpoint(caplog):
    with caplog.at_level("CRITICAL", logger=vdocipher.logger.name):
        result = asyncio.run(vdocipher.delete_live_stream("generated_live_123", live_settings()))

    assert result == {"cleanup_state": "cleanup_required", "cleanup_reason": "delete_endpoint_unconfigured"}
    assert "vdocipher_live_cleanup_required" in caplog.text


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
