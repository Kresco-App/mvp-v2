import asyncio
from types import SimpleNamespace

import jwt
import pytest

import app.services.auth as auth_module
from app.services.auth import AuthTokenPayload, create_token, decode_token


def _reset_google_jwks_state():
    auth_module._google_jwks_cache = None
    auth_module._google_jwks_cache_fingerprint = None
    auth_module._google_jwks_lock = None
    auth_module._google_jwks_last_refresh_at = 0.0
    auth_module._google_jwks_kid_miss_cache = {}


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


def test_firebase_payload_maps_to_google_login_payload():
    payload = auth_module._google_login_payload_from_firebase({
        "email": "firebase-user@example.com",
        "email_verified": True,
        "uid": "firebase-uid-123",
        "name": "Firebase User",
        "picture": "https://example.com/avatar.png",
        "firebase": {
            "sign_in_provider": "google.com",
            "identities": {"google.com": ["google-sub-123"]},
        },
    })

    assert payload == {
        "email": "firebase-user@example.com",
        "email_verified": True,
        "firebase_uid": "firebase-uid-123",
        "sub": "google-sub-123",
        "name": "Firebase User",
        "picture": "https://example.com/avatar.png",
    }


def test_firebase_payload_rejects_non_google_provider():
    with pytest.raises(jwt.InvalidTokenError):
        auth_module._google_login_payload_from_firebase({
            "email": "firebase-user@example.com",
            "email_verified": True,
            "uid": "firebase-uid-123",
            "firebase": {"sign_in_provider": "password"},
        })


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
    _reset_google_jwks_state()
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
    _reset_google_jwks_state()


def test_google_jwks_force_refresh_is_throttled_when_cache_is_fresh(monkeypatch):
    auth_module._google_jwks_cache = (1000.0, {"keys": [{"kid": "cached"}]})
    auth_module._google_jwks_cache_fingerprint = auth_module._google_jwks_fingerprint({"keys": [{"kid": "cached"}]})
    auth_module._google_jwks_lock = None
    auth_module._google_jwks_last_refresh_at = 900.0
    auth_module._google_jwks_kid_miss_cache = {}
    monkeypatch.setattr(auth_module.time, "time", lambda: 901.0)
    calls = []

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            calls.append(url)
            raise AssertionError("fresh forced JWKS refresh should not hit the network")

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(auth_module._google_jwks(force_refresh=True))

    assert result == {"keys": [{"kid": "cached"}]}
    assert calls == []
    _reset_google_jwks_state()


def test_verify_google_token_refetches_for_new_missing_kid_even_after_recent_refresh(monkeypatch):
    cached_jwks = {"keys": [{"kid": "cached"}]}
    rotated_jwks = {"keys": [{"kid": "rotated"}]}
    auth_module._google_jwks_cache = (1000.0, cached_jwks)
    auth_module._google_jwks_cache_fingerprint = auth_module._google_jwks_fingerprint(cached_jwks)
    auth_module._google_jwks_lock = None
    auth_module._google_jwks_last_refresh_at = 900.0
    auth_module._google_jwks_kid_miss_cache = {}
    monkeypatch.setattr(auth_module.time, "time", lambda: 901.0)
    calls = []

    class FakeResponse:
        headers = {"cache-control": "max-age=60"}

        def raise_for_status(self):
            pass

        def json(self):
            return rotated_jwks

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            calls.append(url)
            return FakeResponse()

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(auth_module, "_google_token_key_id", lambda credential: "rotated")
    monkeypatch.setattr(
        auth_module,
        "_public_key_for_google_kid",
        lambda kid, jwks: "rotated-public-key" if any(item.get("kid") == kid for item in jwks.get("keys", [])) else (_ for _ in ()).throw(jwt.InvalidTokenError("missing kid")),
    )
    monkeypatch.setattr(jwt, "decode", lambda credential, key, algorithms, audience, options: {"iss": "accounts.google.com", "aud": audience, "exp": 1, "iat": 1, "sub": "123"})

    result = asyncio.run(auth_module.verify_google_token("credential", "client-id"))

    assert result["sub"] == "123"
    assert calls == [auth_module.GOOGLE_JWKS_URL]
    _reset_google_jwks_state()


def test_verify_google_token_throttles_repeated_missing_kid_refresh_attempts(monkeypatch):
    cached_jwks = {"keys": [{"kid": "cached"}]}
    auth_module._google_jwks_cache = (2000.0, cached_jwks)
    auth_module._google_jwks_cache_fingerprint = auth_module._google_jwks_fingerprint(cached_jwks)
    auth_module._google_jwks_lock = None
    auth_module._google_jwks_last_refresh_at = 900.0
    auth_module._google_jwks_kid_miss_cache = {}
    now = {"value": 901.0}
    monkeypatch.setattr(auth_module.time, "time", lambda: now["value"])
    calls = []

    class FakeResponse:
        headers = {"cache-control": "max-age=60"}

        def raise_for_status(self):
            pass

        def json(self):
            return cached_jwks

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            calls.append(url)
            return FakeResponse()

    monkeypatch.setattr(auth_module.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(auth_module, "_google_token_key_id", lambda credential: "missing-kid")
    monkeypatch.setattr(
        auth_module,
        "_public_key_for_google_kid",
        lambda kid, jwks: "public-key" if any(item.get("kid") == kid for item in jwks.get("keys", [])) else (_ for _ in ()).throw(jwt.InvalidTokenError("missing kid")),
    )

    with pytest.raises(jwt.InvalidTokenError):
        asyncio.run(auth_module.verify_google_token("credential", "client-id"))

    now["value"] = 902.0
    with pytest.raises(jwt.InvalidTokenError):
        asyncio.run(auth_module.verify_google_token("credential", "client-id"))

    assert calls == [auth_module.GOOGLE_JWKS_URL]
    _reset_google_jwks_state()
