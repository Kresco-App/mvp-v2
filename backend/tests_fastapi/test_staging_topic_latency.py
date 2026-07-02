from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
TOPIC_LATENCY_PATH = REPO_ROOT / "scripts" / "check_staging_topic_latency.py"


def _load_latency_module():
    spec = importlib.util.spec_from_file_location("check_staging_topic_latency_for_tests", TOPIC_LATENCY_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    status = 200

    def __init__(self, payload: dict[str, Any], headers: dict[str, str] | None = None) -> None:
        self._payload = payload
        self.headers = FakeHeaders(headers or {})

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class FakeHeaders:
    def __init__(self, headers: dict[str, str]) -> None:
        self._headers = headers

    def get_all(self, name: str, default: list[str] | None = None) -> list[str]:
        value = self._headers.get(name)
        if value is None:
            return [] if default is None else default
        return [value]


def _workspace_payload() -> dict[str, Any]:
    return {
        "id": 42,
        "sections": [{"id": 1, "items": []}],
        "active_item": {"id": 7},
        "active_item_id": 7,
        "search_results": [],
    }


def test_topic_latency_measures_workspace_and_search_with_mocked_http():
    latency = _load_latency_module()
    requests = []

    def opener(request, timeout):
        del timeout
        requests.append(request)
        return FakeResponse(_workspace_payload())

    result = latency.measure_topic_latency(
        backend_url="https://api.example.com/staging",
        topic_id="42",
        auth_token="real-staging-token",
        search_query="revision",
        samples=1,
        warmups=0,
        workspace_threshold_ms=10_000,
        search_threshold_ms=10_000,
        opener=opener,
    )

    assert result.passed is True
    assert [probe.name for probe in result.probes] == ["topic_workspace", "topic_workspace_search"]
    assert len(requests) == 2
    assert requests[0].full_url == "https://api.example.com/staging/api/courses/topics/42/workspace"
    assert requests[1].full_url == "https://api.example.com/staging/api/courses/topics/42/workspace?q=revision"
    assert requests[0].get_header("Authorization") == "Bearer real-staging-token"


def test_topic_latency_fails_closed_contract_mode_without_inputs():
    latency = _load_latency_module()
    called = False

    def opener(request, timeout):
        nonlocal called
        called = True
        raise AssertionError("contract mode must not perform HTTP")

    result = latency.measure_topic_latency(
        backend_url="",
        topic_id="",
        auth_token="",
        search_query="",
        opener=opener,
    )

    assert result.passed is False
    assert result.mode == "contract"
    assert "STAGING_BACKEND_URL or --backend-url" in result.required_inputs
    assert "STAGING_AUTH_SMOKE_EMAIL/PASSWORD plus FIREBASE_API_KEY, or --auth-token" in result.required_inputs
    assert called is False


def test_topic_latency_exchanges_firebase_id_token_for_app_session_cookie():
    latency = _load_latency_module()
    requests = []

    def opener(request, timeout):
        del timeout
        requests.append(request)
        return FakeResponse({}, headers={"Set-Cookie": "__session=app-session-token; Path=/; HttpOnly"})

    token = latency._exchange_firebase_session_token(
        backend_url="https://api.example.com/staging",
        firebase_id_token="firebase-id-token",
        timeout_seconds=5,
        opener=opener,
    )

    assert token == "app-session-token"
    assert requests[0].full_url == "https://api.example.com/staging/api/auth/firebase-session"
    assert json.loads(requests[0].data.decode("utf-8")) == {"credential": "firebase-id-token"}


def test_topic_latency_treats_placeholder_firebase_api_key_as_missing():
    latency = _load_latency_module()

    def opener(request, timeout):
        del request, timeout
        raise AssertionError("placeholder Firebase API key must fail before HTTP")

    try:
        latency._mint_firebase_id_token(
            firebase_api_key="none",
            auth_email="student@example.com",
            auth_password="password",
            timeout_seconds=1,
            opener=opener,
        )
    except ValueError as exc:
        assert "FIREBASE_API_KEY" in str(exc)
    else:
        raise AssertionError("Expected ValueError for placeholder Firebase API key")


def test_topic_latency_rejects_local_or_non_https_backend_before_http():
    latency = _load_latency_module()
    called = False

    def opener(request, timeout):
        nonlocal called
        called = True
        raise AssertionError("local preflight must not perform HTTP")

    result = latency.measure_topic_latency(
        backend_url="http://localhost:8000",
        topic_id="42",
        auth_token="token",
        search_query="revision",
        opener=opener,
    )

    assert result.passed is False
    assert result.mode == "preflight"
    assert "backend URL must use HTTPS for staging latency evidence." in result.errors
    assert "backend URL must not point to localhost, loopback, or local tunnel hosts." in result.errors
    assert called is False


def test_topic_latency_reports_threshold_failures_with_deterministic_clock():
    latency = _load_latency_module()
    times = iter([0.0, 0.25, 1.0, 1.25])

    def opener(request, timeout):
        del request, timeout
        return FakeResponse(_workspace_payload())

    result = latency.measure_topic_latency(
        backend_url="https://api.example.com",
        topic_id="42",
        auth_token="token",
        search_query="revision",
        samples=1,
        warmups=0,
        workspace_threshold_ms=100,
        search_threshold_ms=100,
        opener=opener,
        clock=lambda: next(times),
    )

    assert result.passed is False
    assert "topic_workspace p95 latency 250.00 ms exceeded threshold 100.00 ms." in result.errors
    assert "topic_workspace_search p95 latency 250.00 ms exceeded threshold 100.00 ms." in result.errors


def test_topic_latency_redacts_non_json_error_bodies():
    latency = _load_latency_module()

    assert latency._safe_body_summary("token=secret-value") == "non-JSON response body redacted (18 bytes)"


def test_topic_latency_json_redacts_auth_token_and_query_string():
    latency = _load_latency_module()

    def opener(request, timeout):
        del timeout
        assert request.get_header("Authorization") == "Bearer real-staging-token"
        return FakeResponse(_workspace_payload())

    result = latency.measure_topic_latency(
        backend_url="https://api.example.com/staging?token=url-secret",
        topic_id="42",
        auth_token="real-staging-token",
        search_query="revision",
        samples=1,
        warmups=0,
        workspace_threshold_ms=10_000,
        search_threshold_ms=10_000,
        opener=opener,
    )
    rendered = json.dumps(result.to_dict(), sort_keys=True)

    assert "real-staging-token" not in rendered
    assert "url-secret" not in rendered
    assert '"Authorization": "[redacted]"' in rendered
    assert '"url": "https://api.example.com/staging/api/courses/topics/42/workspace?[redacted]"' in rendered


def test_topic_latency_builds_urls_from_ready_url_stage_prefix():
    latency = _load_latency_module()

    assert latency.build_backend_url(
        "https://api.example.com/staging/ready",
        "/api/courses/topics/42/workspace",
    ) == "https://api.example.com/staging/api/courses/topics/42/workspace"
