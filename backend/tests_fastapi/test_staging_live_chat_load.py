from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
LOAD_PATH = REPO_ROOT / "scripts" / "check_staging_live_chat_load.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_staging_live_chat_load_for_tests", LOAD_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    status = 200

    def __init__(self, payload: Any, headers: dict[str, str] | None = None) -> None:
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


def test_live_chat_load_measures_student_live_and_chat_paths_with_mocked_http():
    load = _load_module()
    requests = []

    def opener(request, timeout):
        del timeout
        requests.append(request)
        url = request.full_url
        if url.endswith("/api/professor/student-live-sessions?limit=20"):
            return FakeResponse([{"id": 62, "can_join": True}])
        if url.endswith("/api/professor/student-live-sessions/62/interactions?limit=50"):
            return FakeResponse([{"id": 1}])
        if url.endswith("/api/professor/student-live-sessions/62/checkpoints?limit=50"):
            return FakeResponse([{"id": 2}])
        if url.endswith("/api/professor/student-chat?limit=20"):
            return FakeResponse({
                "eligible": True,
                "conversations": [{"id": 81}],
                "teacher_threads": [],
            })
        if url.endswith("/api/professor/student-chat/conversations/81/messages?limit=50"):
            return FakeResponse([{"id": 3}])
        raise AssertionError(f"unexpected URL {url}")

    result = load.measure_live_chat_load(
        backend_url="https://api.example.com/staging",
        auth_token="real-staging-token",
        samples=1,
        warmups=0,
        threshold_ms=10_000,
        opener=opener,
    )

    assert result.passed is True
    assert [probe.name for probe in result.probes] == [
        "student_live_sessions",
        "student_live_interactions",
        "student_live_checkpoints",
        "student_professor_chat",
        "student_chat_messages",
    ]
    assert len(requests) == 5
    assert requests[0].get_header("Authorization") == "Bearer real-staging-token"
    assert result.probes[0].response_summary["selected_live_session_id"] == "62"
    assert result.probes[3].response_summary["selected_conversation_id"] == "81"


def test_live_chat_load_uses_configured_ids_when_lists_are_empty():
    load = _load_module()
    urls = []

    def opener(request, timeout):
        del timeout
        urls.append(request.full_url)
        if request.full_url.endswith("/api/professor/student-live-sessions?limit=20"):
            return FakeResponse([])
        if request.full_url.endswith("/api/professor/student-chat?limit=20"):
            return FakeResponse({"eligible": True, "conversations": [], "teacher_threads": []})
        return FakeResponse([])

    result = load.measure_live_chat_load(
        backend_url="https://api.example.com",
        auth_token="token",
        live_session_id="99",
        conversation_id="88",
        samples=1,
        warmups=0,
        threshold_ms=10_000,
        opener=opener,
    )

    assert result.passed is True
    assert "https://api.example.com/api/professor/student-live-sessions/99/interactions?limit=50" in urls
    assert "https://api.example.com/api/professor/student-chat/conversations/88/messages?limit=50" in urls


def test_live_chat_load_fails_closed_without_required_inputs():
    load = _load_module()
    called = False

    def opener(request, timeout):
        nonlocal called
        called = True
        raise AssertionError("contract mode must not perform HTTP")

    result = load.measure_live_chat_load(backend_url="", auth_token="", opener=opener)

    assert result.passed is False
    assert result.mode == "contract"
    assert "STAGING_BACKEND_URL or --backend-url" in result.required_inputs
    assert "STAGING_AUTH_SMOKE_EMAIL/PASSWORD plus FIREBASE_API_KEY, or --auth-token" in result.required_inputs
    assert called is False


def test_live_chat_load_exchanges_firebase_id_token_for_app_session_cookie():
    load = _load_module()
    requests = []

    def opener(request, timeout):
        del timeout
        requests.append(request)
        return FakeResponse({}, headers={"Set-Cookie": "kresco_token=app-session-token; Path=/; HttpOnly"})

    token = load._exchange_firebase_session_token(
        backend_url="https://api.example.com/staging",
        firebase_id_token="firebase-id-token",
        timeout_seconds=5,
        opener=opener,
    )

    assert token == "app-session-token"
    assert requests[0].full_url == "https://api.example.com/staging/api/auth/firebase-session"
    assert json.loads(requests[0].data.decode("utf-8")) == {"credential": "firebase-id-token"}


def test_live_chat_load_rejects_local_or_non_https_backend_before_http():
    load = _load_module()
    called = False

    def opener(request, timeout):
        nonlocal called
        called = True
        raise AssertionError("local preflight must not perform HTTP")

    result = load.measure_live_chat_load(
        backend_url="http://127.0.0.1:8000",
        auth_token="token",
        opener=opener,
    )

    assert result.passed is False
    assert result.mode == "preflight"
    assert "backend URL must use HTTPS for staging load evidence." in result.errors
    assert "backend URL must not point to localhost, loopback, or local tunnel hosts." in result.errors
    assert called is False


def test_live_chat_load_reports_threshold_failures_with_deterministic_clock():
    load = _load_module()
    times = iter([
        0.0,
        0.25,
        1.0,
        1.25,
        2.0,
        2.25,
        3.0,
        3.25,
        4.0,
        4.25,
    ])

    def opener(request, timeout):
        del timeout
        if request.full_url.endswith("/api/professor/student-chat?limit=20"):
            return FakeResponse({"eligible": True, "conversations": [], "teacher_threads": []})
        return FakeResponse([])

    result = load.measure_live_chat_load(
        backend_url="https://api.example.com",
        auth_token="token",
        live_session_id="62",
        conversation_id="81",
        samples=1,
        warmups=0,
        threshold_ms=100,
        opener=opener,
        clock=lambda: next(times),
    )

    assert result.passed is False
    assert "student_live_sessions p95 latency 250.00 ms exceeded threshold 100.00 ms." in result.errors
    assert "student_live_interactions p95 latency 250.00 ms exceeded threshold 100.00 ms." in result.errors
    assert not [error for error in result.errors if "request failed" in error]


def test_live_chat_load_requires_discoverable_or_configured_detail_ids():
    load = _load_module()

    def opener(request, timeout):
        del request, timeout
        if request.full_url.endswith("/api/professor/student-chat?limit=20"):
            return FakeResponse({"eligible": True, "conversations": [], "teacher_threads": []})
        return FakeResponse([])

    result = load.measure_live_chat_load(
        backend_url="https://api.example.com",
        auth_token="token",
        samples=1,
        warmups=0,
        threshold_ms=10_000,
        opener=opener,
    )

    assert result.passed is False
    assert "No live session id was configured or discovered for load evidence." in result.errors
    assert "No professor chat conversation id was configured or discovered for load evidence." in result.errors


def test_live_chat_load_json_redacts_auth_token_and_query_string():
    load = _load_module()

    def opener(request, timeout):
        del timeout
        assert request.get_header("Authorization") == "Bearer real-staging-token"
        return FakeResponse([])

    result = load.measure_live_chat_load(
        backend_url="https://api.example.com/staging?token=url-secret",
        auth_token="real-staging-token",
        live_session_id="62",
        conversation_id="81",
        samples=1,
        warmups=0,
        threshold_ms=10_000,
        opener=opener,
    )
    rendered = json.dumps(result.to_dict(), sort_keys=True)

    assert "real-staging-token" not in rendered
    assert "url-secret" not in rendered
    assert '"Authorization": "[redacted]"' in rendered
    assert '"url": "https://api.example.com/staging/api/professor/student-live-sessions?[redacted]"' in rendered


def test_live_chat_load_builds_urls_from_ready_url_stage_prefix():
    load = _load_module()

    assert load.build_backend_url(
        "https://api.example.com/staging/ready",
        "/api/professor/student-live-sessions?limit=20",
    ) == "https://api.example.com/staging/api/professor/student-live-sessions?limit=20"
