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


def test_client_error_endpoint_accepts_browser_reports_without_csrf(app_client, capsys):
    app_client.cookies.set("kresco_auth", "invalid-cookie-still-csrf-exempt")
    response = app_client.post(
        "/api/client-errors",
        headers={"Origin": "http://localhost:3000"},
        json={
            "source": "react-error-boundary",
            "message": "widget boom",
            "route": "/home",
            "digest": "digest-123",
            "stack": "stack trace",
            "component_stack": "component stack",
            "release_sha": "0123456789abcdef",
        },
    )

    assert response.status_code == 202
    assert response.json() == {"ok": True}

    events = _json_lines(capsys.readouterr().out)
    assert any(event.get("ClientError") == 1 and event.get("event_type") == "frontend_client_error" for event in events)


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
