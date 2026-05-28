from __future__ import annotations

import json
import sys
import time
from collections.abc import Mapping
from typing import Any

from app.config import Settings

METRIC_NAMESPACE = "Kresco/Api"
SERVICE_NAME = "kresco-api"


def emit_request_metric(
    settings: Settings,
    *,
    release_sha: str,
    method: str,
    path: str,
    status_code: int,
    duration_ms: int,
) -> None:
    metrics: dict[str, tuple[int | float, str]] = {
        "RequestCount": (1, "Count"),
        "RequestDurationMs": (max(int(duration_ms), 0), "Milliseconds"),
    }
    if status_code >= 500:
        metrics["Request5xx"] = (1, "Count")
    elif status_code >= 400:
        metrics["Request4xx"] = (1, "Count")

    emit_metrics(
        settings,
        release_sha=release_sha,
        metrics=metrics,
        properties={
            "event_type": "api_request",
            "method": method.upper(),
            "path": _bounded(path, 300),
            "status_code": int(status_code),
            "status_class": f"{int(status_code) // 100}xx",
        },
    )


def emit_unhandled_exception_metric(
    settings: Settings,
    *,
    release_sha: str,
    path: str,
    error_type: str,
) -> None:
    emit_metrics(
        settings,
        release_sha=release_sha,
        metrics={"UnhandledException": (1, "Count")},
        properties={
            "event_type": "api_unhandled_exception",
            "path": _bounded(path, 300),
            "error_type": _bounded(error_type, 120),
        },
    )


def emit_readiness_error_metric(
    settings: Settings,
    *,
    release_sha: str,
    check_name: str,
    error_type: str,
) -> None:
    emit_metrics(
        settings,
        release_sha=release_sha,
        metrics={"ReadinessError": (1, "Count")},
        properties={
            "event_type": "api_readiness_error",
            "check_name": _bounded(check_name, 120),
            "error_type": _bounded(error_type, 120),
        },
    )


def emit_client_error_metric(
    settings: Settings,
    *,
    release_sha: str,
    source: str,
    route: str | None,
    digest: str | None,
) -> None:
    emit_metrics(
        settings,
        release_sha=release_sha,
        metrics={"ClientError": (1, "Count")},
        properties={
            "event_type": "frontend_client_error",
            "source": _bounded(source, 80),
            "route": _bounded(route or "", 300),
            "digest": _bounded(digest or "", 200),
        },
    )


def emit_metrics(
    settings: Settings,
    *,
    release_sha: str,
    metrics: Mapping[str, tuple[int | float, str]],
    properties: Mapping[str, Any] | None = None,
) -> None:
    if not metrics:
        return

    dimensions = {
        "Service": SERVICE_NAME,
        "Environment": _bounded(settings.environment.strip().lower() or "development", 60),
        "Release": _bounded(release_sha.strip() or "development", 120),
    }
    metric_specs = [
        {"Name": name, "Unit": unit}
        for name, (_, unit) in metrics.items()
    ]
    event: dict[str, Any] = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": METRIC_NAMESPACE,
                    "Dimensions": [["Service", "Environment", "Release"]],
                    "Metrics": metric_specs,
                }
            ],
        },
        **dimensions,
    }
    for name, (value, _) in metrics.items():
        event[name] = value
    if properties:
        event.update({key: _json_safe(value) for key, value in properties.items()})

    try:
        sys.stdout.write(json.dumps(event, separators=(",", ":"), sort_keys=True) + "\n")
        sys.stdout.flush()
    except Exception:
        # Telemetry must never break request handling.
        return


def _bounded(value: str, max_length: int) -> str:
    return value[:max_length]


def _json_safe(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)
