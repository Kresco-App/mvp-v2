from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PROBE_PATH = REPO_ROOT / "scripts" / "check_staging_realtime_fanout.py"


class _FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def _load_probe_module():
    spec = importlib.util.spec_from_file_location("check_staging_realtime_fanout_for_tests", PROBE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _diagnostics_payload():
    return {
        "status": "ready",
        "checks": {
            "realtime": {
                "status": "ok",
                "outbox": {"status": "ok", "pending": 0, "retry": 0, "dead": 0},
            }
        },
    }


def test_staging_realtime_outbox_probe_uses_secret_header_without_printing_it(monkeypatch, capsys):
    probe = _load_probe_module()
    worker_secret = "s" * 40
    calls = []

    def fake_urlopen(request, timeout):
        calls.append({
            "url": request.full_url,
            "method": request.get_method(),
            "internal_secret": request.get_header("X-kresco-internal-secret"),
        })
        if request.full_url.endswith("/ready"):
            return _FakeResponse({"status": "ready"})
        if request.full_url.endswith("/api/internal/diagnostics"):
            return _FakeResponse(_diagnostics_payload())
        if "/api/internal/realtime/process-outbox" in request.full_url:
            return _FakeResponse({"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0})
        raise AssertionError(f"unexpected URL {request.full_url}")

    monkeypatch.setattr(probe, "urlopen", fake_urlopen)

    exit_code = probe.main([
        "https://api.example.com/staging/ready",
        "--internal-secret",
        worker_secret,
        "--json",
    ])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert worker_secret not in captured.out
    assert worker_secret not in captured.err
    body = json.loads(captured.out)
    assert body["passed"] is True
    assert body["evidence_level"] == "outbox_endpoint"
    outbox_call = next(call for call in calls if "process-outbox" in call["url"])
    assert outbox_call["method"] == "POST"
    assert outbox_call["url"].endswith("/staging/api/internal/realtime/process-outbox?limit=100")
    assert outbox_call["internal_secret"] == worker_secret


def test_staging_realtime_contract_mode_fails_closed_without_runtime_calls(monkeypatch, capsys):
    probe = _load_probe_module()

    def forbidden_urlopen(request, timeout):
        raise AssertionError("contract mode should not make HTTP calls")

    monkeypatch.setattr(probe, "urlopen", forbidden_urlopen)

    exit_code = probe.main([
        "https://api.example.com/staging",
        "--internal-secret",
        "s" * 40,
        "--mode",
        "contract",
        "--json",
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    body = json.loads(captured.out)
    assert body["passed"] is False
    assert body["evidence_level"] == "contract_only"
    assert "does not collect runtime staging evidence" in body["errors"][0]
    assert "https://api.example.com/staging/ready" in body["warnings"][0]


def test_staging_realtime_fanout_50_mode_fails_closed_when_student_tokens_are_missing():
    probe = _load_probe_module()

    result = probe.run_probe(probe.ProbeConfig(
        backend_url="https://api.example.com/staging",
        internal_secret="s" * 40,
        mode="fanout-50",
        professor_token="prof-token",
        live_session_id=42,
        student_tokens=tuple(f"student-{index}" for index in range(49)),
    ))

    assert result.passed is False
    assert result.evidence_level == "none"
    assert "requires 50 student auth token(s); 49 provided." in result.errors[0]
    assert "prof-token" not in " ".join(result.errors)


def test_staging_realtime_fanout_50_rejects_lower_expected_student_count(monkeypatch):
    probe = _load_probe_module()

    def forbidden_urlopen(request, timeout):
        raise AssertionError("fanout-50 preflight should fail before HTTP calls")

    monkeypatch.setattr(probe, "urlopen", forbidden_urlopen)

    result = probe.run_probe(probe.ProbeConfig(
        backend_url="https://api.example.com/staging",
        internal_secret="s" * 40,
        mode="fanout-50",
        expected_students=49,
        professor_token="prof-token",
        live_session_id=42,
        student_tokens=tuple(f"student-{index}" for index in range(50)),
        ably_api_key="ably:key",
        require_provider_delivery=True,
    ))

    assert result.passed is False
    assert result.evidence_level == "none"
    assert "fanout-50 mode requires expected-students >= 50; 49 requested." in result.errors


def test_staging_realtime_fanout_probe_checks_students_outbox_and_ably_history(monkeypatch, capsys):
    probe = _load_probe_module()
    worker_secret = "w" * 40
    professor_token = "professor-secret-token"
    student_tokens = [f"student-token-{index:02d}" for index in range(50)]
    ably_api_key = "ably-app.key:ably-secret"
    calls = []
    monkeypatch.setattr(probe.time, "time", lambda: 1_700_000_000.0)

    def fake_urlopen(request, timeout):
        calls.append({
            "url": request.full_url,
            "method": request.get_method(),
            "authorization": request.get_header("Authorization"),
            "internal_secret": request.get_header("X-kresco-internal-secret"),
        })
        url = request.full_url
        if url.endswith("/ready"):
            return _FakeResponse({"status": "ready"})
        if url.endswith("/api/internal/diagnostics"):
            return _FakeResponse(_diagnostics_payload())
        if url.endswith("/api/professor/live-sessions/44/notify"):
            return _FakeResponse({"id": 44, "course_offering_id": 9})
        if url.endswith("/api/realtime/subscriptions"):
            return _FakeResponse({"notification_channels": ["kresco:user:1:notifications", "kresco:offering:9:notifications"]})
        if url.endswith("/api/realtime/ably-token"):
            return _FakeResponse({"capability": {"kresco:offering:9:notifications": ["subscribe"]}})
        if url.endswith("/api/professor/student-live-sessions?limit=100"):
            return _FakeResponse([{"id": 44, "course_offering_id": 9}])
        if "/api/internal/realtime/process-outbox" in url:
            return _FakeResponse({"ok": True, "claimed": 50, "published": 50, "retry": 0, "dead": 0})
        if url.startswith("https://rest.ably.io/channels/kresco%3Aoffering%3A9%3Anotifications/history"):
            return _FakeResponse([
                {
                    "name": "live.session.notify",
                    "timestamp": 1_700_000_000_000,
                    "data": {"live_session_id": 44, "course_offering_id": 9},
                }
            ])
        raise AssertionError(f"unexpected URL {url}")

    monkeypatch.setattr(probe, "urlopen", fake_urlopen)

    exit_code = probe.main([
        "https://api.example.com/staging/ready",
        "--mode",
        "fanout-50",
        "--internal-secret",
        worker_secret,
        "--professor-token",
        professor_token,
        "--student-tokens",
        ",".join(student_tokens),
        "--live-session-id",
        "44",
        "--ably-api-key",
        ably_api_key,
        "--require-provider-delivery",
        "--poll-attempts",
        "1",
        "--poll-delay-seconds",
        "0",
        "--json",
    ])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert worker_secret not in captured.out
    assert professor_token not in captured.out
    assert student_tokens[0] not in captured.out
    assert ably_api_key not in captured.out
    body = json.loads(captured.out)
    assert body["passed"] is True
    assert body["evidence_level"] == "fanout_50_provider_delivery"
    assert body["fanout"]["checked_students"] == 50
    assert body["fanout"]["student_subscription_matches"] == 50
    assert body["fanout"]["student_ably_capability_matches"] == 50
    assert body["fanout"]["student_session_visibility_matches"] == 50
    assert body["fanout"]["provider_delivery_verified"] is True
    assert body["fanout"]["eventbridge_schedule_verified"] is False
    assert any(call["authorization"] == f"Bearer {professor_token}" for call in calls)
    assert any(call["internal_secret"] == worker_secret for call in calls)
    assert any(str(call["authorization"]).startswith("Basic ") for call in calls)


def test_staging_realtime_provider_history_rejects_stale_matching_events(monkeypatch, capsys):
    probe = _load_probe_module()
    worker_secret = "w" * 40
    student_tokens = [f"student-token-{index:02d}" for index in range(50)]
    monkeypatch.setattr(probe.time, "time", lambda: 1_700_000_000.0)

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if url.endswith("/ready"):
            return _FakeResponse({"status": "ready"})
        if url.endswith("/api/internal/diagnostics"):
            return _FakeResponse(_diagnostics_payload())
        if url.endswith("/api/professor/live-sessions/44/notify"):
            return _FakeResponse({"id": 44, "course_offering_id": 9})
        if url.endswith("/api/realtime/subscriptions"):
            return _FakeResponse({"notification_channels": ["kresco:offering:9:notifications"]})
        if url.endswith("/api/realtime/ably-token"):
            return _FakeResponse({"capability": {"kresco:offering:9:notifications": ["subscribe"]}})
        if url.endswith("/api/professor/student-live-sessions?limit=100"):
            return _FakeResponse([{"id": 44, "course_offering_id": 9}])
        if "/api/internal/realtime/process-outbox" in url:
            return _FakeResponse({"ok": True, "claimed": 0, "published": 0, "retry": 0, "dead": 0})
        if url.startswith("https://rest.ably.io/channels/kresco%3Aoffering%3A9%3Anotifications/history"):
            return _FakeResponse([
                {
                    "name": "live.session.notify",
                    "timestamp": 1_699_999_999_000,
                    "data": {"live_session_id": 44, "course_offering_id": 9},
                }
            ])
        raise AssertionError(f"unexpected URL {url}")

    monkeypatch.setattr(probe, "urlopen", fake_urlopen)

    exit_code = probe.main([
        "https://api.example.com/staging/ready",
        "--mode",
        "fanout-50",
        "--internal-secret",
        worker_secret,
        "--professor-token",
        "professor-secret-token",
        "--student-tokens",
        ",".join(student_tokens),
        "--live-session-id",
        "44",
        "--ably-api-key",
        "ably-app.key:ably-secret",
        "--require-provider-delivery",
        "--poll-attempts",
        "1",
        "--poll-delay-seconds",
        "0",
        "--json",
    ])

    captured = capsys.readouterr()
    body = json.loads(captured.out)
    assert exit_code == 1
    assert body["passed"] is False
    assert body["evidence_level"] == "fanout_attempted"
    assert body["fanout"]["provider_delivery_verified"] is False
    assert "provider delivery was required but Ably history did not verify the expected event." in body["errors"]


def test_staging_realtime_provider_history_failure_is_structured_and_redacted(monkeypatch, capsys):
    probe = _load_probe_module()
    worker_secret = "w" * 40
    ably_api_key = "ably-app.key:ably-secret"
    student_tokens = [f"student-secret-token-{index:02d}" for index in range(50)]

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if url.endswith("/ready"):
            return _FakeResponse({"status": "ready"})
        if url.endswith("/api/internal/diagnostics"):
            return _FakeResponse(_diagnostics_payload())
        if url.endswith("/api/professor/live-sessions/44/notify"):
            return _FakeResponse({"id": 44, "course_offering_id": 9})
        if url.endswith("/api/realtime/subscriptions"):
            return _FakeResponse({"notification_channels": ["kresco:offering:9:notifications"]})
        if url.endswith("/api/realtime/ably-token"):
            return _FakeResponse({"capability": {"kresco:offering:9:notifications": ["subscribe"]}})
        if url.endswith("/api/professor/student-live-sessions?limit=100"):
            return _FakeResponse([{"id": 44, "course_offering_id": 9}])
        if "/api/internal/realtime/process-outbox" in url:
            return _FakeResponse({"ok": True, "claimed": 1, "published": 1, "retry": 0, "dead": 0})
        if url.startswith("https://rest.ably.io/channels/"):
            raise RuntimeError("provider unavailable")
        raise AssertionError(f"unexpected URL {url}")

    monkeypatch.setattr(probe, "urlopen", fake_urlopen)

    exit_code = probe.main([
        "https://api.example.com/staging/ready",
        "--mode",
        "fanout-50",
        "--internal-secret",
        worker_secret,
        "--professor-token",
        "professor-secret-token",
        "--student-tokens",
        ",".join(student_tokens),
        "--live-session-id",
        "44",
        "--ably-api-key",
        ably_api_key,
        "--require-provider-delivery",
        "--poll-attempts",
        "1",
        "--poll-delay-seconds",
        "0",
        "--json",
    ])

    captured = capsys.readouterr()
    body = json.loads(captured.out)
    rendered = json.dumps(body)

    assert exit_code == 1
    assert body["passed"] is False
    assert "Ably history check failed before provider delivery evidence was collected" in rendered
    assert ably_api_key not in captured.out
    assert worker_secret not in captured.out


def test_staging_realtime_probe_derives_stage_aware_urls():
    probe = _load_probe_module()

    endpoints = probe.derive_endpoints("https://api.example.com/staging/ready", outbox_limit=7)

    assert endpoints.ready_url == "https://api.example.com/staging/ready"
    assert endpoints.diagnostics_url == "https://api.example.com/staging/api/internal/diagnostics"
    assert endpoints.process_outbox_url == "https://api.example.com/staging/api/internal/realtime/process-outbox?limit=7"
    assert probe.api_url("https://api.example.com/staging/api", "/api/realtime/subscriptions") == (
        "https://api.example.com/staging/api/realtime/subscriptions"
    )
