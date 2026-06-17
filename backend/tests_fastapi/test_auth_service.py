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
