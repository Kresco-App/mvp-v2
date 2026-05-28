from __future__ import annotations

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
class ReadinessResult:
    status_code: int
    payload: dict[str, Any]


def main() -> int:
    url = sys.argv[1].strip() if len(sys.argv) > 1 else os.environ.get("BACKEND_READY_URL", "").strip()
    if not url:
        print("error: BACKEND_READY_URL must be configured for post-deploy readiness checks.", file=sys.stderr)
        return 1

    retries = _int_env("KRESCO_READINESS_RETRIES", DEFAULT_RETRIES)
    delay_seconds = _int_env("KRESCO_READINESS_DELAY_SECONDS", DEFAULT_DELAY_SECONDS)
    timeout_seconds = _int_env("KRESCO_READINESS_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
    safe_url = _redact_url(url)

    last_error = "readiness check did not run"
    for attempt in range(1, retries + 1):
        try:
            result = fetch_readiness(url, timeout_seconds)
            if result.status_code == 200 and result.payload.get("status") == "ready":
                print(f"Readiness check passed for {safe_url}.")
                return 0
            last_error = (
                f"unexpected status_code={result.status_code} "
                f"payload_status={result.payload.get('status')!r}"
            )
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"

        if attempt < retries:
            print(f"Readiness check attempt {attempt}/{retries} failed: {last_error}. Retrying...")
            time.sleep(delay_seconds)

    print(f"error: readiness check failed for {safe_url}: {last_error}", file=sys.stderr)
    return 1


def fetch_readiness(url: str, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> ReadinessResult:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "kresco-readiness-check/1.0"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
            return ReadinessResult(status_code=response.status, payload=_parse_json(body))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return ReadinessResult(status_code=exc.code, payload=_parse_json(body))
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(str(reason)) from exc


def _parse_json(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _int_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(parsed, 1)


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.query:
        return url
    return urlunparse(parsed._replace(query="[redacted]"))


if __name__ == "__main__":
    raise SystemExit(main())
