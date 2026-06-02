from __future__ import annotations

import asyncio
import json
import sys
import threading
import time
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.config import Settings

METRIC_NAMESPACE = "Kresco/Api"
SERVICE_NAME = "kresco-api"
_STDOUT_EXECUTOR_MAX_PENDING = 64
_STDOUT_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kresco-telemetry")
_STDOUT_EXECUTOR_SLOTS = threading.BoundedSemaphore(_STDOUT_EXECUTOR_MAX_PENDING)


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
    digest: str | None,
    route_present: bool,
    route_length: int,
    message_length: int,
    stack_present: bool,
    component_stack_present: bool,
    user_agent_present: bool,
) -> None:
    emit_metrics(
        settings,
        release_sha=release_sha,
        metrics={"ClientError": (1, "Count")},
        properties={
            "event_type": "frontend_client_error",
            "source": _bounded(source, 80),
            "digest": _bounded(digest or "", 200),
            "route_present": bool(route_present),
            "route_length": max(int(route_length), 0),
            "message_length": max(int(message_length), 0),
            "stack_present": bool(stack_present),
            "component_stack_present": bool(component_stack_present),
            "user_agent_present": bool(user_agent_present),
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

    line = json.dumps(event, separators=(",", ":"), sort_keys=True) + "\n"
    _emit_stdout_line(line)


def _emit_stdout_line(output_line: str) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _write_stdout(output_line)
        return

    if _submit_stdout_write(loop, output_line):
        return
    _write_stdout(output_line)


def _submit_stdout_write(loop: asyncio.AbstractEventLoop, output_line: str) -> bool:
    if not _STDOUT_EXECUTOR_SLOTS.acquire(blocking=False):
        return False

    try:
        future = loop.run_in_executor(_STDOUT_EXECUTOR, _write_stdout, output_line)
    except Exception:
        _STDOUT_EXECUTOR_SLOTS.release()
        return False

    future.add_done_callback(_release_stdout_executor_slot)
    return True


def _release_stdout_executor_slot(_future: object) -> None:
    _STDOUT_EXECUTOR_SLOTS.release()


def _write_stdout(output_line: str) -> None:
    try:
        sys.stdout.write(output_line)
        sys.stdout.flush()
    except Exception:
        pass


def _bounded(value: str, max_length: int) -> str:
    return value[:max_length]


def _json_safe(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)
