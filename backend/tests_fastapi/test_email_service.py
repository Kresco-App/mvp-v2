import asyncio

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
