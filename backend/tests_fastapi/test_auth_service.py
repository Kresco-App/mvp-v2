import asyncio
import base64
import builtins
import json
from types import SimpleNamespace

import jwt
import pytest

import app.services.auth as auth_module
from app.services.auth import AuthTokenPayload, create_token, decode_token


def _jwt_segment(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")


def _firebase_id_token_like(project_id: str, *, subject: str = "firebase-uid-123") -> str:
    header = _jwt_segment({"alg": "RS256", "kid": "firebase-key-id", "typ": "JWT"})
    payload = _jwt_segment({
        "aud": project_id,
        "iss": f"https://securetoken.google.com/{project_id}",
        "sub": subject,
    })
    return f"{header}.{payload}.{_jwt_segment({'signature': True})}"


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


def test_firebase_session_payload_maps_google_provider():
    payload = auth_module._firebase_session_payload_from_firebase({
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
        "provider": "google.com",
        "google_id": "google-sub-123",
        "name": "Firebase User",
        "picture": "https://example.com/avatar.png",
    }


def test_firebase_session_payload_maps_password_provider():
    payload = auth_module._firebase_session_payload_from_firebase({
        "email": "firebase-user@example.com",
        "email_verified": True,
        "uid": "firebase-uid-123",
        "name": "Firebase User",
        "firebase": {
            "sign_in_provider": "password",
            "identities": {"email": ["firebase-user@example.com"]},
        },
    })

    assert payload == {
        "email": "firebase-user@example.com",
        "email_verified": True,
        "firebase_uid": "firebase-uid-123",
        "provider": "password",
        "google_id": None,
        "name": "Firebase User",
        "picture": "",
    }


def test_firebase_payload_rejects_unsupported_provider():
    with pytest.raises(jwt.InvalidTokenError):
        auth_module._firebase_session_payload_from_firebase({
            "email": "firebase-user@example.com",
            "email_verified": True,
            "uid": "firebase-uid-123",
            "firebase": {"sign_in_provider": "facebook.com"},
        })


def test_verify_firebase_token_falls_back_when_admin_credentials_are_unavailable(monkeypatch):
    import firebase_admin.auth as firebase_auth
    from google.oauth2 import id_token as google_id_token

    project_id = "kresco-staging"
    credential = _firebase_id_token_like(project_id)
    calls: dict[str, object] = {}

    monkeypatch.setattr(auth_module, "_firebase_auth_app", lambda _project_id: object())

    def reject_admin_verification(*_args, **_kwargs):
        raise RuntimeError("Default credentials unavailable")

    def verify_without_admin_credentials(id_token, request, audience=None, clock_skew_in_seconds=0):
        calls["id_token"] = id_token
        calls["audience"] = audience
        calls["clock_skew_in_seconds"] = clock_skew_in_seconds
        calls["request_type"] = type(request).__name__
        return {
            "aud": project_id,
            "iss": f"https://securetoken.google.com/{project_id}",
            "sub": "firebase-uid-123",
            "email": "firebase-user@example.com",
            "email_verified": True,
            "name": "Firebase User",
            "firebase": {
                "sign_in_provider": "password",
                "identities": {"email": ["firebase-user@example.com"]},
            },
        }

    monkeypatch.setattr(firebase_auth, "verify_id_token", reject_admin_verification)
    monkeypatch.setattr(google_id_token, "verify_firebase_token", verify_without_admin_credentials)

    payload = asyncio.run(auth_module.verify_firebase_token(credential, project_id))

    assert calls == {
        "id_token": credential,
        "audience": project_id,
        "clock_skew_in_seconds": 0,
        "request_type": "Request",
    }
    assert payload == {
        "email": "firebase-user@example.com",
        "email_verified": True,
        "firebase_uid": "firebase-uid-123",
        "provider": "password",
        "google_id": None,
        "name": "Firebase User",
        "picture": "",
    }


def test_verify_firebase_token_uses_identity_toolkit_after_cert_verifier_failure(monkeypatch):
    import firebase_admin.auth as firebase_auth
    import requests
    from google.oauth2 import id_token as google_id_token

    project_id = "kresco-staging"
    credential = _firebase_id_token_like(project_id)
    calls: dict[str, object] = {}

    class IdentityToolkitResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "users": [
                    {
                        "localId": "firebase-uid-123",
                        "email": "firebase-user@example.com",
                        "emailVerified": True,
                        "displayName": "Firebase User",
                        "photoUrl": "https://example.com/avatar.png",
                        "providerUserInfo": [
                            {"providerId": "password", "email": "firebase-user@example.com"},
                        ],
                    }
                ]
            }

    monkeypatch.setattr(auth_module, "_firebase_auth_app", lambda _project_id: object())
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("admin unavailable")))
    monkeypatch.setattr(google_id_token, "verify_firebase_token", lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("cert fetch failed")))

    def post_identity_toolkit(url, *, params, json, timeout):
        calls["url"] = url
        calls["params"] = params
        calls["json"] = json
        calls["timeout"] = timeout
        return IdentityToolkitResponse()

    monkeypatch.setattr(requests, "post", post_identity_toolkit)

    payload = asyncio.run(auth_module.verify_firebase_token(credential, project_id, "firebase-web-api-key"))

    assert calls == {
        "url": auth_module.FIREBASE_IDENTITY_TOOLKIT_LOOKUP_URL,
        "params": {"key": "firebase-web-api-key"},
        "json": {"idToken": credential},
        "timeout": 10,
    }
    assert payload == {
        "email": "firebase-user@example.com",
        "email_verified": True,
        "firebase_uid": "firebase-uid-123",
        "provider": "password",
        "google_id": None,
        "name": "Firebase User",
        "picture": "https://example.com/avatar.png",
    }


def test_verify_firebase_token_uses_fallback_when_firebase_admin_is_missing(monkeypatch):
    import requests
    from google.oauth2 import id_token as google_id_token

    project_id = "kresco-staging"
    credential = _firebase_id_token_like(project_id)
    original_import = builtins.__import__

    class IdentityToolkitResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "users": [
                    {
                        "localId": "firebase-uid-123",
                        "email": "firebase-user@example.com",
                        "emailVerified": True,
                        "providerUserInfo": [{"providerId": "password"}],
                    }
                ]
            }

    def import_without_firebase_admin(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "firebase_admin":
            raise ModuleNotFoundError("No module named 'firebase_admin'")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", import_without_firebase_admin)
    monkeypatch.setattr(google_id_token, "verify_firebase_token", lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("cert fetch failed")))
    monkeypatch.setattr(requests, "post", lambda *_args, **_kwargs: IdentityToolkitResponse())

    payload = asyncio.run(auth_module.verify_firebase_token(credential, project_id, "firebase-web-api-key"))

    assert payload["email"] == "firebase-user@example.com"
    assert payload["firebase_uid"] == "firebase-uid-123"
    assert payload["provider"] == "password"


def test_firebase_token_fallback_rejects_wrong_project_before_network_verify(monkeypatch):
    from google.oauth2 import id_token as google_id_token

    def unexpected_network_verify(*_args, **_kwargs):
        raise AssertionError("wrong-project tokens should not reach network verification")

    monkeypatch.setattr(google_id_token, "verify_firebase_token", unexpected_network_verify)

    with pytest.raises(jwt.InvalidTokenError):
        auth_module._verify_firebase_token_without_admin_credentials(
            _firebase_id_token_like("other-project"),
            "kresco-staging",
        )


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
