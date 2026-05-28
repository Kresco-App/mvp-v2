import asyncio
from types import SimpleNamespace

import jwt
import pytest

import app.services.auth as auth_module
from app.services.auth import AuthTokenPayload, create_token, decode_token


def test_create_token_uses_subject_version_and_decodes_payload(test_settings):
    token = create_token(SimpleNamespace(id=42, auth_token_version=7), test_settings)

    assert decode_token(token, test_settings) == AuthTokenPayload(user_id=42, token_version=7)


def test_create_token_embeds_route_authorization_claims(test_settings):
    token = create_token(
        SimpleNamespace(id=42, auth_token_version=7, role="professor", is_staff=True),
        test_settings,
    )
    payload = jwt.decode(token, test_settings.jwt_secret_key, algorithms=[test_settings.jwt_algorithm])

    assert payload["role"] == "professor"
    assert payload["is_staff"] is True
    assert decode_token(token, test_settings) == AuthTokenPayload(user_id=42, token_version=7)


def test_create_token_allows_explicit_version_override(test_settings):
    token = create_token(SimpleNamespace(id=42, auth_token_version=7), test_settings, token_version=3)

    assert decode_token(token, test_settings) == AuthTokenPayload(user_id=42, token_version=3)


def test_create_token_rejects_invalid_subjects(test_settings):
    for subject in [True, 0, -1, SimpleNamespace(id=False), SimpleNamespace(id="not-an-int"), object()]:
        with pytest.raises(ValueError):
            create_token(subject, test_settings)


def test_create_token_rejects_invalid_token_versions(test_settings):
    for version in [True, -1, "", "not-an-int"]:
        with pytest.raises(ValueError):
            create_token(1, test_settings, token_version=version)


def test_decode_token_rejects_invalid_payload_shape(test_settings):
    invalid_payloads = [
        {"token_version": 0},
        {"user_id": 0, "token_version": 0},
        {"user_id": True, "token_version": 0},
        {"user_id": 1, "token_version": -1},
        {"user_id": 1, "token_version": ""},
        {"user_id": 1, "token_version": True},
    ]

    for payload in invalid_payloads:
        token = jwt.encode(payload, test_settings.jwt_secret_key, algorithm=test_settings.jwt_algorithm)
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(token, test_settings)


def test_google_jwks_cache_deduplicates_concurrent_fetches(monkeypatch):
    auth_module._google_jwks_cache = None
    auth_module._google_jwks_lock = None
    calls = []

    class FakeResponse:
        headers = {"cache-control": "max-age=60"}

        def raise_for_status(self):
            pass

        def json(self):
            return {"keys": [{"kid": "key-1"}]}

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            calls.append(url)
            await asyncio.sleep(0)
            return FakeResponse()

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", FakeAsyncClient)

    async def _fetch_many():
        return await asyncio.gather(*[auth_module._google_jwks() for _ in range(5)])

    results = asyncio.run(_fetch_many())

    assert results == [{"keys": [{"kid": "key-1"}]}] * 5
    assert calls == [auth_module.GOOGLE_JWKS_URL]
    auth_module._google_jwks_cache = None
    auth_module._google_jwks_lock = None
