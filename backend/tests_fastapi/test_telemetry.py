import threading
import json

from app.config import Settings
from app.services.telemetry import emit_request_metric


def _json_lines(output: str) -> list[dict]:
    return [
        json.loads(line)
        for line in output.splitlines()
        if line.startswith("{")
    ]


def test_request_metric_uses_cloudwatch_embedded_metric_format(capsys):
    settings = Settings(environment="staging")

    emit_request_metric(
        settings,
        release_sha="0123456789abcdef",
        method="GET",
        path="/api/example",
        status_code=503,
        duration_ms=42,
    )

    [event] = _json_lines(capsys.readouterr().out)

    assert event["Service"] == "kresco-api"
    assert event["Environment"] == "staging"
    assert event["Release"] == "0123456789abcdef"
    assert event["RequestCount"] == 1
    assert event["RequestDurationMs"] == 42
    assert event["Request5xx"] == 1
    assert event["event_type"] == "api_request"
    assert event["_aws"]["CloudWatchMetrics"][0]["Namespace"] == "Kresco/Api"
    assert event["_aws"]["CloudWatchMetrics"][0]["Dimensions"] == [["Service", "Environment", "Release"]]


def test_emit_metrics_bounds_async_stdout_submissions(monkeypatch):
    from app.services import telemetry as telemetry_service

    class FakeFuture:
        def __init__(self):
            self.callbacks = []

        def add_done_callback(self, callback):
            self.callbacks.append(callback)

    class FakeLoop:
        def __init__(self):
            self.calls = []

        def run_in_executor(self, executor, fn, output_line):
            future = FakeFuture()
            self.calls.append({
                "executor": executor,
                "fn": fn,
                "output_line": output_line,
                "future": future,
            })
            return future

    loop = FakeLoop()
    monkeypatch.setattr(telemetry_service, "_STDOUT_EXECUTOR_SLOTS", threading.BoundedSemaphore(1))

    assert telemetry_service._submit_stdout_write(loop, "first\n") is True
    assert telemetry_service._submit_stdout_write(loop, "second\n") is False
    assert len(loop.calls) == 1
    assert loop.calls[0]["executor"] is telemetry_service._STDOUT_EXECUTOR

    [callback] = loop.calls[0]["future"].callbacks
    callback(loop.calls[0]["future"])

    assert telemetry_service._submit_stdout_write(loop, "third\n") is True
    assert len(loop.calls) == 2


def test_client_error_endpoint_accepts_browser_reports_without_csrf(app_client, monkeypatch, caplog, capsys):
    from app.services import telemetry as telemetry_service

    route = "/users/private@example.com/dashboard"
    message = "render failed for private@example.com"
    stack = "Error: boom at private@example.com"

    monkeypatch.setattr(telemetry_service, "_submit_stdout_write", lambda *_args, **_kwargs: False)
    caplog.set_level("WARNING", logger="kresco.client_errors")
    app_client.cookies.set("kresco_auth", "invalid-cookie-still-csrf-exempt")
    response = app_client.post(
        "/api/client-errors",
        headers={"Origin": "http://localhost:3000"},
        json={
            "source": "react-error-boundary",
            "message": message,
            "route": route,
            "digest": "digest-123",
            "stack": stack,
            "component_stack": "component stack",
            "release_sha": "0123456789abcdef",
            "user_agent": "SensitiveBrowser/1.0",
        },
    )

    assert response.status_code == 202
    assert response.json() == {"ok": True}

    [log_record] = [
        record for record in caplog.records
        if record.message.startswith("client_error_reported")
    ]
    assert route not in log_record.message
    assert message not in log_record.message
    assert stack not in log_record.message
    assert "route_present=True" in log_record.message
    assert f"route_length={len(route)}" in log_record.message
    assert f"message_length={len(message)}" in log_record.message
    assert "stack_present=True" in log_record.message

    captured = capsys.readouterr().out
    assert route not in captured
    assert message not in captured
    assert stack not in captured

    events = _json_lines(captured)
    client_error_event = next(
        event for event in events
        if event.get("ClientError") == 1 and event.get("event_type") == "frontend_client_error"
    )
    assert client_error_event["source"] == "react-error-boundary"
    assert client_error_event["digest"] == "digest-123"
    assert client_error_event["route_present"] is True
    assert client_error_event["route_length"] == len(route)
    assert client_error_event["message_length"] == len(message)
    assert client_error_event["stack_present"] is True
    assert client_error_event["component_stack_present"] is True
    assert client_error_event["user_agent_present"] is True
    assert "route" not in client_error_event


def test_client_error_endpoint_rejects_oversized_payloads(app_client):
    response = app_client.post(
        "/api/client-errors",
        headers={"Origin": "http://localhost:3000"},
        json={
            "source": "window-error",
            "message": "x" * 1001,
        },
    )

    assert response.status_code == 422
