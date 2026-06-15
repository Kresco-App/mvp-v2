from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

DEFAULT_WORKSPACE_THRESHOLD_MS = 1000.0
DEFAULT_SEARCH_THRESHOLD_MS = 1500.0
DEFAULT_SAMPLES = 5
DEFAULT_WARMUPS = 1
DEFAULT_TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class ProbeMeasurement:
    name: str
    url: str
    threshold_ms: float
    samples_ms: tuple[float, ...]
    status_code: int | None
    response_summary: dict[str, Any]
    errors: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "url": _redact_url(self.url),
            "threshold_ms": self.threshold_ms,
            "samples_ms": [round(sample, 2) for sample in self.samples_ms],
            "summary": _measurement_summary(self.samples_ms),
            "status_code": self.status_code,
            "response_summary": self.response_summary,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class TopicLatencyResult:
    passed: bool
    mode: str
    errors: tuple[str, ...]
    probes: tuple[ProbeMeasurement, ...]
    required_inputs: tuple[str, ...] = ()
    request_headers: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "mode": self.mode,
            "errors": list(self.errors),
            "required_inputs": list(self.required_inputs),
            "request_headers": _redact_headers(self.request_headers or {}),
            "probes": [probe.to_dict() for probe in self.probes],
        }


OpenUrl = Callable[..., Any]
Clock = Callable[[], float]


def measure_topic_latency(
    *,
    backend_url: str,
    topic_id: str,
    auth_token: str,
    search_query: str,
    workspace_threshold_ms: float = DEFAULT_WORKSPACE_THRESHOLD_MS,
    search_threshold_ms: float = DEFAULT_SEARCH_THRESHOLD_MS,
    samples: int = DEFAULT_SAMPLES,
    warmups: int = DEFAULT_WARMUPS,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    opener: OpenUrl = urlopen,
    clock: Clock = time.perf_counter,
    contract_only: bool = False,
) -> TopicLatencyResult:
    missing_inputs = _missing_inputs(
        backend_url=backend_url,
        topic_id=topic_id,
        auth_token=auth_token,
        search_query=search_query,
    )
    if contract_only or missing_inputs:
        return _contract_result(missing_inputs)
    backend_url_errors = _backend_url_errors(backend_url)
    if backend_url_errors:
        return TopicLatencyResult(
            passed=False,
            mode="preflight",
            errors=backend_url_errors,
            probes=(),
        )

    headers = _auth_headers(auth_header=auth_header, auth_scheme=auth_scheme, auth_token=auth_token)
    workspace_url = build_backend_url(backend_url, f"/api/courses/topics/{quote(str(topic_id).strip())}/workspace")
    search_url = build_backend_url(
        backend_url,
        f"/api/courses/topics/{quote(str(topic_id).strip())}/workspace?{urlencode({'q': search_query.strip()})}",
    )

    probes = (
        _measure_probe(
            name="topic_workspace",
            url=workspace_url,
            threshold_ms=workspace_threshold_ms,
            validator=_validate_workspace_payload,
            samples=max(1, samples),
            warmups=max(0, warmups),
            timeout_seconds=timeout_seconds,
            headers=headers,
            opener=opener,
            clock=clock,
        ),
        _measure_probe(
            name="topic_workspace_search",
            url=search_url,
            threshold_ms=search_threshold_ms,
            validator=_validate_workspace_search_payload,
            samples=max(1, samples),
            warmups=max(0, warmups),
            timeout_seconds=timeout_seconds,
            headers=headers,
            opener=opener,
            clock=clock,
        ),
    )
    errors = tuple(error for probe in probes for error in probe.errors)
    return TopicLatencyResult(
        passed=not errors,
        mode="http",
        errors=errors,
        probes=probes,
        request_headers=headers,
    )


def build_backend_url(base_url: str, path_and_query: str) -> str:
    parsed = urlparse(base_url.strip())
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("backend URL must be an absolute HTTP(S) URL.")
    endpoint_path, question, endpoint_query = path_and_query.partition("?")
    base_path = parsed.path.rstrip("/")
    if base_path.endswith("/ready"):
        base_path = base_path.rsplit("/", 1)[0]
    path = f"{base_path}/{endpoint_path.lstrip('/')}" if base_path else endpoint_path
    return urlunparse(parsed._replace(path=path, query=endpoint_query if question else "", params="", fragment=""))


def _measure_probe(
    *,
    name: str,
    url: str,
    threshold_ms: float,
    validator: Callable[[dict[str, Any]], tuple[str, ...]],
    samples: int,
    warmups: int,
    timeout_seconds: int,
    headers: dict[str, str],
    opener: OpenUrl,
    clock: Clock,
) -> ProbeMeasurement:
    errors: list[str] = []
    samples_ms: list[float] = []
    status_code: int | None = None
    response_summary: dict[str, Any] = {}

    try:
        for _ in range(warmups):
            _fetch_json(url, headers=headers, timeout_seconds=timeout_seconds, opener=opener)
        for _ in range(samples):
            started = clock()
            payload, status_code = _fetch_json(url, headers=headers, timeout_seconds=timeout_seconds, opener=opener)
            elapsed_ms = (clock() - started) * 1000
            samples_ms.append(elapsed_ms)
            payload_errors = validator(payload)
            if payload_errors:
                errors.extend(payload_errors)
            response_summary = _workspace_summary(payload)
    except Exception as exc:
        errors.append(f"{name} request failed for {_redact_url(url)}: {type(exc).__name__}: {exc}")

    summary = _measurement_summary(tuple(samples_ms))
    p95_ms = summary.get("p95_ms")
    if isinstance(p95_ms, float) and p95_ms > threshold_ms:
        errors.append(f"{name} p95 latency {p95_ms:.2f} ms exceeded threshold {threshold_ms:.2f} ms.")
    if not samples_ms and not errors:
        errors.append(f"{name} did not record any latency samples.")

    return ProbeMeasurement(
        name=name,
        url=url,
        threshold_ms=threshold_ms,
        samples_ms=tuple(samples_ms),
        status_code=status_code,
        response_summary=response_summary,
        errors=tuple(errors),
    )


def _fetch_json(
    url: str,
    *,
    headers: dict[str, str],
    timeout_seconds: int,
    opener: OpenUrl,
) -> tuple[dict[str, Any], int | None]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "kresco-staging-topic-latency/1.0",
        **headers,
    }
    request = Request(url, headers=request_headers, method="GET")
    try:
        with opener(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise ValueError("response JSON must be an object")
            return parsed, getattr(response, "status", None)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GET {_redact_url(url)} returned {exc.code}: {_safe_body_summary(body)}") from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(str(reason)) from exc


def _validate_workspace_payload(payload: dict[str, Any]) -> tuple[str, ...]:
    errors: list[str] = []
    if not isinstance(payload.get("sections"), list):
        errors.append("topic workspace response must include sections list.")
    if "active_item" not in payload:
        errors.append("topic workspace response must include active_item.")
    if "search_results" not in payload:
        errors.append("topic workspace response must include search_results.")
    return tuple(errors)


def _validate_workspace_search_payload(payload: dict[str, Any]) -> tuple[str, ...]:
    errors = list(_validate_workspace_payload(payload))
    if not isinstance(payload.get("search_results"), list):
        errors.append("topic workspace search response must include search_results list.")
    return tuple(errors)


def _workspace_summary(payload: dict[str, Any]) -> dict[str, Any]:
    sections = payload.get("sections")
    search_results = payload.get("search_results")
    return {
        "topic_id": payload.get("id"),
        "section_count": len(sections) if isinstance(sections, list) else None,
        "search_result_count": len(search_results) if isinstance(search_results, list) else None,
        "active_item_id": payload.get("active_item_id"),
    }


def _measurement_summary(samples_ms: tuple[float, ...]) -> dict[str, float | int | None]:
    if not samples_ms:
        return {"count": 0, "min_ms": None, "avg_ms": None, "p95_ms": None, "max_ms": None}
    sorted_samples = sorted(samples_ms)
    p95_index = max(0, min(len(sorted_samples) - 1, int(len(sorted_samples) * 0.95 + 0.999999) - 1))
    return {
        "count": len(samples_ms),
        "min_ms": round(min(samples_ms), 2),
        "avg_ms": round(statistics.fmean(samples_ms), 2),
        "p95_ms": round(sorted_samples[p95_index], 2),
        "max_ms": round(max(samples_ms), 2),
    }


def _auth_headers(*, auth_header: str, auth_scheme: str, auth_token: str) -> dict[str, str]:
    header = auth_header.strip()
    scheme = auth_scheme.strip()
    token = auth_token.strip()
    value = f"{scheme} {token}" if scheme else token
    return {header: value}


def _missing_inputs(*, backend_url: str, topic_id: str, auth_token: str, search_query: str) -> tuple[str, ...]:
    missing: list[str] = []
    if not backend_url.strip():
        missing.append("backend_url")
    if not topic_id.strip():
        missing.append("topic_id")
    if not auth_token.strip():
        missing.append("auth_token")
    if not search_query.strip():
        missing.append("search_query")
    return tuple(missing)


def _contract_result(missing_inputs: tuple[str, ...]) -> TopicLatencyResult:
    required_inputs = (
        "STAGING_BACKEND_URL or --backend-url",
        "STAGING_TOPIC_ID or --topic-id",
        "STAGING_AUTH_TOKEN or --auth-token",
        "STAGING_TOPIC_SEARCH_QUERY or --search-query",
    )
    detail = ", ".join(missing_inputs) if missing_inputs else "contract mode requested"
    return TopicLatencyResult(
        passed=False,
        mode="contract",
        errors=(f"Staging topic latency evidence was not collected; missing inputs: {detail}.",),
        probes=(),
        required_inputs=required_inputs,
    )


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {key: "[redacted]" for key in headers}


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    netloc = parsed.hostname or parsed.netloc
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc, query="[redacted]" if parsed.query else ""))


def _safe_body_summary(body: str) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return f"non-JSON response body redacted ({len(body)} bytes)"
    if isinstance(parsed, dict):
        return json.dumps(_redact_json(parsed))[:200]
    return str(parsed)[:200]


def _backend_url_errors(backend_url: str) -> tuple[str, ...]:
    try:
        parsed = urlparse(backend_url.strip())
    except Exception:
        return ("backend URL must be an absolute HTTPS URL.",)
    errors: list[str] = []
    if not parsed.scheme or not parsed.netloc:
        errors.append("backend URL must be an absolute HTTPS URL.")
    elif parsed.scheme != "https":
        errors.append("backend URL must use HTTPS for staging latency evidence.")
    host = (parsed.hostname or "").lower().strip("[]")
    if host in {"localhost", "0.0.0.0", "::1"} or host.startswith("127.") or "ngrok" in host:
        errors.append("backend URL must not point to localhost, loopback, or local tunnel hosts.")
    return tuple(errors)


def _redact_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if _is_sensitive_key(str(key)) else _redact_json(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_redact_json(item) for item in value]
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in ("authorization", "cookie", "password", "secret", "token", "session"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Measure staging topic workspace/search latency against fail-closed launch thresholds."
    )
    parser.add_argument("--backend-url", default=os.environ.get("STAGING_BACKEND_URL", ""))
    parser.add_argument("--topic-id", default=os.environ.get("STAGING_TOPIC_ID", ""))
    parser.add_argument("--auth-token", default=os.environ.get("STAGING_AUTH_TOKEN", ""))
    parser.add_argument("--auth-header", default=os.environ.get("STAGING_AUTH_HEADER", "Authorization"))
    parser.add_argument("--auth-scheme", default=os.environ.get("STAGING_AUTH_SCHEME", "Bearer"))
    parser.add_argument("--search-query", default=os.environ.get("STAGING_TOPIC_SEARCH_QUERY", "revision"))
    parser.add_argument("--workspace-threshold-ms", type=float, default=DEFAULT_WORKSPACE_THRESHOLD_MS)
    parser.add_argument("--search-threshold-ms", type=float, default=DEFAULT_SEARCH_THRESHOLD_MS)
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--warmups", type=int, default=DEFAULT_WARMUPS)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--contract", action="store_true", help="Emit the fail-closed evidence contract without HTTP.")
    parser.add_argument("--json", action="store_true", help="Print redacted machine-readable evidence.")
    args = parser.parse_args(argv)

    result = measure_topic_latency(
        backend_url=args.backend_url,
        topic_id=args.topic_id,
        auth_token=args.auth_token,
        auth_header=args.auth_header,
        auth_scheme=args.auth_scheme,
        search_query=args.search_query,
        workspace_threshold_ms=args.workspace_threshold_ms,
        search_threshold_ms=args.search_threshold_ms,
        samples=args.samples,
        warmups=args.warmups,
        timeout_seconds=args.timeout_seconds,
        contract_only=args.contract,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: TopicLatencyResult) -> None:
    if result.passed:
        print("Staging topic latency evidence passed.")
        return
    print("Staging topic latency evidence failed closed.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    if result.mode == "contract":
        print("- Required inputs: " + ", ".join(result.required_inputs), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
