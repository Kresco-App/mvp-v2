from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlunparse
from urllib.request import Request, urlopen

DEFAULT_RETRIES = 12
DEFAULT_DELAY_SECONDS = 5
DEFAULT_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class RuntimeVerificationResult:
    passed: bool
    errors: tuple[str, ...]
    readiness_status: str | None
    diagnostics_status: str | None
    outbox_result: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": list(self.errors),
            "readiness_status": self.readiness_status,
            "diagnostics_status": self.diagnostics_status,
            "outbox_result": self.outbox_result,
        }


def validate_runtime_payloads(
    readiness: dict[str, Any],
    diagnostics: dict[str, Any],
    outbox_result: dict[str, Any] | None = None,
) -> RuntimeVerificationResult:
    errors: list[str] = []

    if readiness.get("status") != "ready":
        errors.append("readiness.status must be ready.")
    if diagnostics.get("status") != "ready":
        errors.append("diagnostics.status must be ready.")

    checks = diagnostics.get("checks")
    if not isinstance(checks, dict):
        errors.append("diagnostics.checks must be an object.")
        checks = {}

    configuration = _check(checks, "configuration", errors)
    _require(configuration.get("production_like") is True, "configuration.production_like must be true.", errors)
    _require(configuration.get("error_count") == 0, "configuration.error_count must be zero.", errors)

    database = _check(checks, "database", errors)
    _require(database.get("strategy") == "rds_proxy", "database.strategy must be rds_proxy.", errors)
    _require(database.get("rds_proxy_declared") is True, "database.rds_proxy_declared must be true.", errors)

    migrations = _check(checks, "migrations", errors)
    current_heads = migrations.get("current_heads")
    expected_heads = migrations.get("expected_heads")
    _require(isinstance(current_heads, list) and current_heads, "migrations.current_heads must be non-empty.", errors)
    _require(current_heads == expected_heads, "migrations.current_heads must match expected_heads.", errors)

    storage = _check(checks, "storage", errors)
    _require(storage.get("backend") == "s3", "storage.backend must be s3.", errors)
    _require(storage.get("bucket_configured") is True, "storage.bucket_configured must be true.", errors)
    _require(storage.get("region_configured") is True, "storage.region_configured must be true.", errors)
    _require(storage.get("prefix_configured") is True, "storage.prefix_configured must be true.", errors)
    _require(_int_value(storage, "presign_ttl_seconds") >= 60, "storage.presign_ttl_seconds must be at least 60.", errors)
    _require(_int_value(storage, "profile_quota_bytes") > 0, "storage.profile_quota_bytes must be positive.", errors)
    _require(
        _int_value(storage, "chat_conversation_quota_bytes") > 0,
        "storage.chat_conversation_quota_bytes must be positive.",
        errors,
    )
    _require(
        _int_value(storage, "lifecycle_expiration_days") > 0,
        "storage.lifecycle_expiration_days must be positive.",
        errors,
    )

    realtime = _check(checks, "realtime", errors)
    _require(realtime.get("ably_key") == "ok", "realtime.ably_key must be ok.", errors)
    _require(realtime.get("outbox_secret_configured") is True, "realtime.outbox_secret_configured must be true.", errors)
    outbox_counts = realtime.get("outbox") if isinstance(realtime.get("outbox"), dict) else {}
    _require(outbox_counts.get("status") == "ok", "realtime.outbox.status must be ok.", errors)
    _require(_int_value(outbox_counts, "dead") == 0, "realtime.outbox.dead must be zero.", errors)

    video = _check(checks, "video", errors)
    _require(video.get("api_secret_configured") is True, "video.api_secret_configured must be true.", errors)
    _require(video.get("api_base_url_https") is True, "video.api_base_url_https must be true.", errors)
    _require(video.get("live_create_url_https") is True, "video.live_create_url_https must be true.", errors)

    email = _check(checks, "email", errors)
    _require(email.get("resend_api_key_configured") is True, "email.resend_api_key_configured must be true.", errors)

    if outbox_result is not None:
        _require(outbox_result.get("ok") is True, "outbox drain endpoint must return ok=true.", errors)
        _require(_int_value(outbox_result, "retry") == 0, "outbox drain must not move events to retry.", errors)
        _require(_int_value(outbox_result, "dead") == 0, "outbox drain must not dead-letter events.", errors)

    return RuntimeVerificationResult(
        passed=not errors,
        errors=tuple(errors),
        readiness_status=str(readiness.get("status")) if readiness.get("status") is not None else None,
        diagnostics_status=str(diagnostics.get("status")) if diagnostics.get("status") is not None else None,
        outbox_result=outbox_result,
    )


def _check(checks: dict[str, Any], name: str, errors: list[str]) -> dict[str, Any]:
    check = checks.get(name)
    if not isinstance(check, dict):
        errors.append(f"diagnostics.checks.{name} must be an object.")
        return {}
    if check.get("status") != "ok":
        errors.append(f"diagnostics.checks.{name}.status must be ok.")
    return check


def _require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def _int_value(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    return value if isinstance(value, int) else -1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a deployed staging/production-like backend runtime.")
    parser.add_argument("ready_url", nargs="?", default=os.environ.get("BACKEND_READY_URL", ""))
    parser.add_argument("--diagnostics-url", default="")
    parser.add_argument("--process-outbox-url", default="")
    parser.add_argument("--internal-secret", default=os.environ.get("KRESCO_INTERNAL_SECRET", ""))
    parser.add_argument("--skip-outbox-drain", action="store_true")
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--delay-seconds", type=int, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    ready_url = args.ready_url.strip()
    internal_secret = args.internal_secret.strip()
    if not ready_url:
        print("error: BACKEND_READY_URL or ready_url argument is required.", file=sys.stderr)
        return 1
    if not internal_secret:
        print("error: KRESCO_INTERNAL_SECRET is required for protected diagnostics.", file=sys.stderr)
        return 1

    diagnostics_url = args.diagnostics_url.strip() or derive_url(ready_url, "/api/internal/diagnostics")
    process_outbox_url = args.process_outbox_url.strip() or derive_url(
        ready_url,
        "/api/internal/realtime/process-outbox?limit=1",
    )

    try:
        readiness = _fetch_with_retries(ready_url, timeout_seconds=args.timeout_seconds, retries=args.retries, delay=args.delay_seconds)
        diagnostics = fetch_json(diagnostics_url, timeout_seconds=args.timeout_seconds, internal_secret=internal_secret)
        outbox_result = None if args.skip_outbox_drain else fetch_json(
            process_outbox_url,
            method="POST",
            timeout_seconds=args.timeout_seconds,
            internal_secret=internal_secret,
        )
    except Exception as exc:
        print(f"error: staging runtime verifier failed while fetching runtime evidence: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    result = validate_runtime_payloads(readiness, diagnostics, outbox_result)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result, ready_url)
    return 0 if result.passed else 1


def derive_url(ready_url: str, path_and_query: str) -> str:
    parsed = urlparse(ready_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("ready_url must be an absolute HTTP(S) URL.")
    path, question, query = path_and_query.partition("?")
    return urlunparse(parsed._replace(path=path, query=query if question else "", params="", fragment=""))


def _fetch_with_retries(url: str, timeout_seconds: int, retries: int, delay: int) -> dict[str, Any]:
    last_error = "not attempted"
    for attempt in range(1, max(retries, 1) + 1):
        try:
            payload = fetch_json(url, timeout_seconds=timeout_seconds)
            if payload.get("status") == "ready":
                return payload
            last_error = f"payload status was {payload.get('status')!r}"
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        if attempt < retries:
            print(f"Runtime readiness attempt {attempt}/{retries} failed: {last_error}. Retrying...")
            time.sleep(max(delay, 1))
    raise RuntimeError(f"readiness did not become ready: {last_error}")


def fetch_json(
    url: str,
    *,
    method: str = "GET",
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    internal_secret: str = "",
) -> dict[str, Any]:
    headers = {"Accept": "application/json", "User-Agent": "kresco-staging-runtime-check/1.0"}
    if internal_secret:
        headers["x-kresco-internal-secret"] = internal_secret
    request = Request(url, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return _parse_json(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        payload = _parse_json(body)
        raise RuntimeError(f"{method} {_redact_url(url)} returned {exc.code}: {payload}") from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(str(reason)) from exc


def _parse_json(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("response JSON must be an object")
    return parsed


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse(parsed._replace(query="[redacted]" if parsed.query else ""))


def _print_human_result(result: RuntimeVerificationResult, ready_url: str) -> None:
    if result.passed:
        print(f"Staging runtime verification passed for {_redact_url(ready_url)}.")
        return

    print(f"Staging runtime verification failed for {_redact_url(ready_url)}.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
