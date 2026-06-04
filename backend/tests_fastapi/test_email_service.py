import asyncio
from types import SimpleNamespace

import pytest

from app.services import email as email_service
from app.services.email import send_reset_email, send_verification_email


def test_send_verification_email_builds_resend_payload(monkeypatch, test_settings):
    sent = []
    settings = test_settings.model_copy(
        update={"frontend_url": "https://app.example", "resend_api_key": "re_test"}
    )

    monkeypatch.setattr(email_service, "_send_email_sync", lambda api_key, params: sent.append((api_key, params)))

    asyncio.run(send_verification_email("student@example.com", "Student Name", "verify-token", settings))

    assert sent[0][0] == "re_test"
    payload = sent[0][1]
    assert payload["from"] == "Kresco <onboarding@resend.dev>"
    assert payload["to"] == ["student@example.com"]
    assert payload["subject"] == "Verifiez votre email Kresco"
    assert "Student Name" in payload["html"]
    assert "https://app.example/auth/verify-email?token=verify-token" in payload["html"]


def test_send_verification_email_escapes_full_name(monkeypatch, test_settings):
    sent = []
    settings = test_settings.model_copy(
        update={"frontend_url": "https://app.example", "resend_api_key": "re_test"}
    )

    monkeypatch.setattr(email_service, "_send_email_sync", lambda api_key, params: sent.append((api_key, params)))

    asyncio.run(send_verification_email("student@example.com", '<img src=x onerror="alert(1)">', "verify-token", settings))

    html = sent[0][1]["html"]
    assert '<img src=x onerror="alert(1)">' not in html
    assert "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" in html


def test_send_reset_email_builds_resend_payload(monkeypatch, test_settings):
    sent = []
    settings = test_settings.model_copy(
        update={"frontend_url": "https://app.example", "resend_api_key": "re_test"}
    )

    monkeypatch.setattr(email_service, "_send_email_sync", lambda api_key, params: sent.append((api_key, params)))

    asyncio.run(send_reset_email("student@example.com", "reset-token", settings))

    assert sent[0][0] == "re_test"
    payload = sent[0][1]
    assert payload["from"] == "Kresco <onboarding@resend.dev>"
    assert payload["to"] == ["student@example.com"]
    assert payload["subject"] == "Reinitialiser votre mot de passe Kresco"
    assert "https://app.example/auth/reset-password?token=reset-token" in payload["html"]


def test_resend_sync_send_uses_bounded_http_timeout(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return Response()

    monkeypatch.setattr(email_service.requests, "request", fake_request)

    email_service._send_email_sync("re_test", {"to": ["student@example.com"]})

    method, url, kwargs = calls[0]
    assert method == "post"
    assert url.endswith("/emails")
    assert kwargs["headers"]["Authorization"] == "Bearer re_test"
    assert kwargs["timeout"] == email_service.RESEND_EMAIL_TIMEOUT_SECONDS


def _response(status_code: int):
    class FakeResponse:
        def raise_for_status(self):
            if status_code >= 400:
                error = email_service.requests.HTTPError(f"status {status_code}")
                error.response = SimpleNamespace(status_code=status_code)
                raise error

    return FakeResponse()


def test_send_email_sync_retries_resend_5xx(monkeypatch):
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return _response(503 if len(calls) == 1 else 200)

    monkeypatch.setattr(email_service.requests, "request", fake_request)
    monkeypatch.setattr(email_service.time, "sleep", lambda _seconds: None)

    email_service._send_email_sync("resend-key", {"to": ["student@example.com"]})

    assert len(calls) == 2
    assert calls[0][2]["timeout"] == email_service.RESEND_EMAIL_TIMEOUT_SECONDS


def test_send_email_sync_does_not_retry_resend_400(monkeypatch):
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return _response(400)

    monkeypatch.setattr(email_service.requests, "request", fake_request)

    with pytest.raises(email_service.requests.HTTPError):
        email_service._send_email_sync("resend-key", {"to": ["student@example.com"]})

    assert len(calls) == 1
