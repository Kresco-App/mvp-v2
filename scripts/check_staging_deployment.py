#!/usr/bin/env python3
"""Lightweight post-deploy smoke checks for the staging auto-deploy workflow."""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 6
DEFAULT_DELAY_SECONDS = 5
LEGACY_AUTH_ROUTES = (
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/reset-password",
    "/api/auth/forgot-password",
)


@dataclass(frozen=True)
class HttpPayload:
    status: int
    body: bytes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a freshly deployed staging revision.")
    parser.add_argument("--backend-url", default=os.environ.get("BACKEND_URL", ""))
    parser.add_argument("--frontend-url", default=os.environ.get("FRONTEND_URL", ""))
    parser.add_argument("--expected-sha", default=os.environ.get("SHORT_SHA", ""))
    parser.add_argument("--firebase-api-key", default=os.environ.get("FIREBASE_API_KEY", ""))
    parser.add_argument("--auth-email", default=os.environ.get("STAGING_AUTH_SMOKE_EMAIL", ""))
    parser.add_argument("--auth-password", default=os.environ.get("STAGING_AUTH_SMOKE_PASSWORD", ""))
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--delay-seconds", type=int, default=DEFAULT_DELAY_SECONDS)
    args = parser.parse_args(argv)

    errors: list[str] = []
    backend_url = _required_absolute_url(args.backend_url, "backend-url", errors)
    frontend_url = _required_absolute_url(args.frontend_url, "frontend-url", errors)
    expected_sha = args.expected_sha.strip()
    if not expected_sha:
        errors.append("expected-sha is required.")
    if errors:
        return _finish(errors)

    assert backend_url is not None
    assert frontend_url is not None

    opener = urllib.request.build_opener()
    errors.extend(
        _check_backend_readiness(
            opener,
            backend_url,
            expected_sha,
            args.timeout_seconds,
            retries=args.retries,
            delay_seconds=args.delay_seconds,
        )
    )
    errors.extend(_check_frontend_surface(opener, frontend_url, expected_sha, args.timeout_seconds))
    errors.extend(_check_legacy_auth_routes_absent(opener, backend_url, args.timeout_seconds))
    errors.extend(
        _check_optional_firebase_auth_smoke(
            backend_url,
            firebase_api_key=args.firebase_api_key.strip(),
            email=args.auth_email.strip(),
            password=args.auth_password,
            timeout_seconds=args.timeout_seconds,
        )
    )

    return _finish(errors)


def _check_backend_readiness(
    opener: urllib.request.OpenerDirector,
    backend_url: str,
    expected_sha: str,
    timeout_seconds: int,
    *,
    retries: int,
    delay_seconds: int,
) -> list[str]:
    last_errors: list[str] = []
    attempts = max(retries, 1)
    for attempt in range(1, attempts + 1):
        last_errors = _check_backend_readiness_once(opener, backend_url, expected_sha, timeout_seconds)
        if not last_errors:
            return []
        if attempt < attempts:
            print(f"Backend readiness attempt {attempt}/{attempts} failed; retrying in {delay_seconds}s.")
            time.sleep(max(delay_seconds, 1))
    return last_errors


def _check_backend_readiness_once(
    opener: urllib.request.OpenerDirector,
    backend_url: str,
    expected_sha: str,
    timeout_seconds: int,
) -> list[str]:
    errors: list[str] = []
    ready = _fetch_json(opener, _url(backend_url, "/ready"), timeout_seconds=timeout_seconds)
    if isinstance(ready, Exception):
        return [f"backend /ready failed: {ready}"]
    if ready.get("status") != "ready":
        errors.append(f"backend /ready status was {ready.get('status')!r}, expected 'ready'.")

    health = _fetch_json(opener, _url(backend_url, "/health"), timeout_seconds=timeout_seconds)
    if isinstance(health, Exception):
        errors.append(f"backend /health failed: {health}")
    elif health.get("release_sha") != expected_sha:
        errors.append(f"backend release_sha was {health.get('release_sha')!r}, expected {expected_sha!r}.")
    return errors


def _check_frontend_surface(
    opener: urllib.request.OpenerDirector,
    frontend_url: str,
    expected_sha: str,
    timeout_seconds: int,
) -> list[str]:
    payload = _fetch(opener, frontend_url, timeout_seconds=timeout_seconds)
    if isinstance(payload, Exception):
        return [f"frontend root failed: {payload}"]
    if payload.status >= 400:
        return [f"frontend root returned HTTP {payload.status}."]
    html = payload.body[:32768].decode("utf-8", errors="replace")
    errors: list[str] = []
    if "<html" not in html.lower():
        errors.append("frontend root did not return HTML.")
    if f'data-release="{expected_sha}"' not in html:
        errors.append("frontend release marker did not match expected sha.")
    return errors


def _check_legacy_auth_routes_absent(
    opener: urllib.request.OpenerDirector,
    backend_url: str,
    timeout_seconds: int,
) -> list[str]:
    errors: list[str] = []
    for path in LEGACY_AUTH_ROUTES:
        payload = _fetch(
            opener,
            _url(backend_url, path),
            method="POST",
            json_body={},
            timeout_seconds=timeout_seconds,
        )
        if isinstance(payload, Exception):
            errors.append(f"{path} check failed: {payload}")
            continue
        if payload.status not in {404, 405}:
            errors.append(f"{path} returned HTTP {payload.status}; expected 404/405 after Firebase Auth migration.")
    return errors


def _check_optional_firebase_auth_smoke(
    backend_url: str,
    *,
    firebase_api_key: str,
    email: str,
    password: str,
    timeout_seconds: int,
) -> list[str]:
    if not email and not password:
        print("Firebase credential smoke skipped: STAGING_AUTH_SMOKE_EMAIL/PASSWORD are not configured.")
        return []
    if not email or not password:
        return ["Firebase credential smoke needs both STAGING_AUTH_SMOKE_EMAIL and STAGING_AUTH_SMOKE_PASSWORD."]
    if not firebase_api_key:
        return ["Firebase credential smoke needs FIREBASE_API_KEY."]

    firebase_opener = urllib.request.build_opener()
    sign_in_url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?" + urllib.parse.urlencode(
        {"key": firebase_api_key}
    )
    sign_in = _fetch_json(
        firebase_opener,
        sign_in_url,
        method="POST",
        json_body={"email": email, "password": password, "returnSecureToken": True},
        timeout_seconds=timeout_seconds,
    )
    if isinstance(sign_in, Exception):
        return [f"Firebase password sign-in failed: {sign_in}"]
    id_token = sign_in.get("idToken")
    if not isinstance(id_token, str) or not id_token:
        return ["Firebase password sign-in did not return an ID token."]

    cookie_jar = http.cookiejar.CookieJar()
    backend_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    session = _fetch_json(
        backend_opener,
        _url(backend_url, "/api/auth/firebase-session"),
        method="POST",
        json_body={"credential": id_token},
        timeout_seconds=timeout_seconds,
    )
    if isinstance(session, Exception):
        return [f"backend Firebase session exchange failed: {session}"]
    if not isinstance(session.get("user"), dict):
        return ["backend Firebase session exchange did not return a user object."]

    profile = _fetch_json(backend_opener, _url(backend_url, "/api/profile/me"), timeout_seconds=timeout_seconds)
    if isinstance(profile, Exception):
        return [f"authenticated profile smoke failed: {profile}"]
    if not profile.get("id"):
        return ["authenticated profile smoke did not return a profile id."]
    print("Firebase credential smoke passed.")
    return []


def _fetch_json(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    timeout_seconds: int,
) -> dict[str, Any] | Exception:
    payload = _fetch(opener, url, method=method, json_body=json_body, timeout_seconds=timeout_seconds)
    if isinstance(payload, Exception):
        return payload
    if payload.status >= 400:
        return RuntimeError(f"{_redact_url(url)} returned HTTP {payload.status}: {_safe_body(payload.body)}")
    try:
        parsed = json.loads(payload.body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        return RuntimeError(f"{_redact_url(url)} did not return JSON: {exc}")
    if not isinstance(parsed, dict):
        return RuntimeError(f"{_redact_url(url)} JSON payload was not an object.")
    return parsed


def _fetch(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    timeout_seconds: int,
) -> HttpPayload | Exception:
    headers = {"Accept": "application/json", "User-Agent": "kresco-staging-deployment-smoke/1.0"}
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return HttpPayload(status=response.getcode(), body=response.read(65536))
    except urllib.error.HTTPError as exc:
        return HttpPayload(status=exc.code, body=exc.read(65536))
    except urllib.error.URLError as exc:
        return RuntimeError(str(getattr(exc, "reason", exc)))
    except TimeoutError as exc:
        return RuntimeError(str(exc))


def _url(base_url: str, path: str) -> str:
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def _required_absolute_url(value: str, name: str, errors: list[str]) -> str | None:
    stripped = value.strip()
    parsed = urllib.parse.urlparse(stripped)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        errors.append(f"{name} must be an absolute HTTP(S) URL.")
        return None
    return stripped


def _safe_body(body: bytes) -> str:
    text = body[:2048].decode("utf-8", errors="replace")
    if len(body) > 2048:
        return text + "...[truncated]"
    return text


def _redact_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    redacted_query = urllib.parse.urlencode((key, "[redacted]" if key.lower() == "key" else value) for key, value in query)
    return urllib.parse.urlunparse(parsed._replace(query=redacted_query))


def _finish(errors: list[str]) -> int:
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print("Staging deployment smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
