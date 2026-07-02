#!/usr/bin/env python3
"""Lightweight post-deploy smoke checks for the staging auto-deploy workflow."""

from __future__ import annotations

import argparse
import html
import http.cookiejar
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from check_subdomain_routing import check_subdomain_routing

DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 6
DEFAULT_DELAY_SECONDS = 5
SESSION_RATE_LIMIT_RETRY_SECONDS = 65
EMPTY_SECRET_VALUES = {"", "null", "undefined", "none"}
FRONTEND_FIREBASE_ENV_KEYS = (
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
)
LEGACY_AUTH_ROUTES = (
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/reset-password",
    "/api/auth/forgot-password",
)
ROLE_AUTH_SMOKE_SPECS = (
    {
        "name": "basic",
        "email_env": "STAGING_AUTH_BASIC_EMAIL",
        "password_env": "STAGING_AUTH_BASIC_PASSWORD",
        "expected_role": "student",
        "expected_tier": "basic",
        "expected_staff": False,
    },
    {
        "name": "student",
        "email_env": "STAGING_AUTH_STUDENT_EMAIL",
        "password_env": "STAGING_AUTH_STUDENT_PASSWORD",
        "expected_role": "student",
        "expected_tier": "pro",
        "expected_staff": False,
    },
    {
        "name": "vip",
        "email_env": "STAGING_AUTH_VIP_EMAIL",
        "password_env": "STAGING_AUTH_VIP_PASSWORD",
        "expected_role": "student",
        "expected_tier": "vip",
        "expected_staff": False,
    },
    {
        "name": "admin",
        "email_env": "STAGING_AUTH_ADMIN_EMAIL",
        "password_env": "STAGING_AUTH_ADMIN_PASSWORD",
        "expected_role": "admin",
        "expected_tier": None,
        "expected_staff": True,
    },
    {
        "name": "staff",
        "email_env": "STAGING_AUTH_STAFF_EMAIL",
        "password_env": "STAGING_AUTH_STAFF_PASSWORD",
        "expected_role": "staff",
        "expected_tier": None,
        "expected_staff": True,
    },
    {
        "name": "professor",
        "email_env": "STAGING_AUTH_PROFESSOR_EMAIL",
        "password_env": "STAGING_AUTH_PROFESSOR_PASSWORD",
        "expected_role": "professor",
        "expected_tier": None,
        "expected_staff": False,
    },
)


@dataclass(frozen=True)
class HttpPayload:
    status: int
    body: bytes


@dataclass(frozen=True)
class ExpectedReleaseShas:
    backend: str
    frontend: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a freshly deployed staging revision.")
    parser.add_argument("--backend-url", default=os.environ.get("BACKEND_URL", ""))
    parser.add_argument("--public-api-url", default=os.environ.get("STAGING_PUBLIC_API_URL", ""))
    parser.add_argument("--frontend-url", default=os.environ.get("FRONTEND_URL", ""))
    parser.add_argument("--subdomain-apex-url", default=os.environ.get("STAGING_FRONTEND_APEX_URL", ""))
    parser.add_argument("--expected-sha", default=os.environ.get("SHORT_SHA", ""))
    parser.add_argument("--expected-backend-sha", default=os.environ.get("BACKEND_EXPECTED_SHA", ""))
    parser.add_argument("--expected-frontend-sha", default=os.environ.get("FRONTEND_EXPECTED_SHA", ""))
    parser.add_argument("--project-id", default=os.environ.get("PROJECT_ID", ""))
    parser.add_argument("--region", default=os.environ.get("REGION", ""))
    parser.add_argument("--frontend-service", default=os.environ.get("FRONTEND_SERVICE", ""))
    parser.add_argument("--firebase-project-id", default=os.environ.get("FIREBASE_PROJECT_ID", ""))
    parser.add_argument("--firebase-api-key", default=os.environ.get("FIREBASE_API_KEY", ""))
    parser.add_argument("--auth-email", default=os.environ.get("STAGING_AUTH_SMOKE_EMAIL", ""))
    parser.add_argument("--auth-password", default=os.environ.get("STAGING_AUTH_SMOKE_PASSWORD", ""))
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--delay-seconds", type=int, default=DEFAULT_DELAY_SECONDS)
    args = parser.parse_args(argv)

    errors: list[str] = []
    backend_url = _required_absolute_url(args.backend_url, "backend-url", errors)
    public_api_url = _optional_absolute_url(args.public_api_url, "public-api-url", errors)
    frontend_url = _required_absolute_url(args.frontend_url, "frontend-url", errors)
    expected_shas = _resolve_expected_release_shas(
        args.expected_sha,
        args.expected_backend_sha,
        args.expected_frontend_sha,
        errors,
    )
    if errors:
        return _finish(errors)

    assert backend_url is not None
    assert frontend_url is not None
    assert expected_shas is not None

    opener = urllib.request.build_opener()
    errors.extend(
        _check_backend_readiness(
            opener,
            backend_url,
            expected_shas.backend,
            args.timeout_seconds,
            retries=args.retries,
            delay_seconds=args.delay_seconds,
            label="backend",
        )
    )
    errors.extend(_check_frontend_surface(opener, frontend_url, expected_shas.frontend, args.timeout_seconds))
    if args.subdomain_apex_url.strip():
        if public_api_url is None:
            public_api_url = _public_api_url_for_apex(args.subdomain_apex_url, errors)
        errors.extend(
            check_subdomain_routing(
                args.subdomain_apex_url,
                expected_sha=expected_shas.frontend,
                timeout_seconds=args.timeout_seconds,
            )
        )
    else:
        print("Subdomain routing smoke skipped: STAGING_FRONTEND_APEX_URL is not configured.")
    if public_api_url and public_api_url.rstrip("/") != backend_url.rstrip("/"):
        errors.extend(
            _check_backend_readiness(
                opener,
                public_api_url,
                expected_shas.backend,
                args.timeout_seconds,
                retries=args.retries,
                delay_seconds=args.delay_seconds,
                label="public api",
            )
        )
    frontend_env_errors, frontend_firebase_env = _check_frontend_cloud_run_firebase_env(
        project_id=args.project_id.strip(),
        region=args.region.strip(),
        frontend_service=args.frontend_service.strip(),
    )
    errors.extend(frontend_env_errors)
    expected_firebase_config = _expected_frontend_firebase_config(
        frontend_firebase_env,
        firebase_project_id=args.firebase_project_id.strip(),
        firebase_api_key=args.firebase_api_key.strip(),
    )
    errors.extend(
        _check_frontend_firebase_bundle(
            opener,
            frontend_url,
            expected_firebase_config,
            args.timeout_seconds,
        )
    )
    errors.extend(_check_legacy_auth_routes_absent(opener, backend_url, args.timeout_seconds))
    role_auth_configured = _role_auth_smoke_configured(os.environ)
    auth_smoke_url = (
        public_api_url
        if public_api_url and public_api_url.rstrip("/") != backend_url.rstrip("/")
        else backend_url
    )
    auth_smoke_label = "public api" if auth_smoke_url == public_api_url else "backend"
    if role_auth_configured:
        print("Generic Firebase credential smoke skipped: role-specific staging auth secrets are configured.")
    else:
        errors.extend(
            _check_optional_firebase_auth_smoke(
                auth_smoke_url,
                firebase_api_key=args.firebase_api_key.strip(),
                email=args.auth_email.strip(),
                password=args.auth_password,
                timeout_seconds=args.timeout_seconds,
                label=auth_smoke_label,
            )
    )
    auth_targets = [(auth_smoke_label, auth_smoke_url)]
    if public_api_url and public_api_url.rstrip("/") != backend_url.rstrip("/"):
        print(
            "Cookie-based auth smoke uses the public API origin; "
            "direct Cloud Run auth is covered by /ready and /health."
        )
    errors.extend(
        _check_optional_role_firebase_auth_smokes(
            auth_targets,
            firebase_api_key=args.firebase_api_key.strip(),
            timeout_seconds=args.timeout_seconds,
            environ=os.environ,
        )
    )

    return _finish(errors)


def _resolve_expected_release_shas(
    expected_sha: str,
    expected_backend_sha: str,
    expected_frontend_sha: str,
    errors: list[str],
) -> ExpectedReleaseShas | None:
    fallback = expected_sha.strip()
    backend = expected_backend_sha.strip() or fallback
    frontend = expected_frontend_sha.strip() or fallback
    if not backend:
        errors.append("expected-backend-sha or expected-sha is required.")
    if not frontend:
        errors.append("expected-frontend-sha or expected-sha is required.")
    if not backend or not frontend:
        return None
    return ExpectedReleaseShas(backend=backend, frontend=frontend)


def _check_backend_readiness(
    opener: urllib.request.OpenerDirector,
    backend_url: str,
    expected_sha: str,
    timeout_seconds: int,
    *,
    retries: int,
    delay_seconds: int,
    label: str,
) -> list[str]:
    last_errors: list[str] = []
    attempts = max(retries, 1)
    for attempt in range(1, attempts + 1):
        last_errors = _check_backend_readiness_once(opener, backend_url, expected_sha, timeout_seconds, label=label)
        if not last_errors:
            return []
        if attempt < attempts:
            print(f"{label.title()} readiness attempt {attempt}/{attempts} failed; retrying in {delay_seconds}s.")
            time.sleep(max(delay_seconds, 1))
    return last_errors


def _check_backend_readiness_once(
    opener: urllib.request.OpenerDirector,
    backend_url: str,
    expected_sha: str,
    timeout_seconds: int,
    *,
    label: str,
) -> list[str]:
    errors: list[str] = []
    ready = _fetch_json(opener, _url(backend_url, "/ready"), timeout_seconds=timeout_seconds)
    if isinstance(ready, Exception):
        return [f"{label} /ready failed: {ready}"]
    if ready.get("status") != "ready":
        errors.append(f"{label} /ready status was {ready.get('status')!r}, expected 'ready'.")

    health = _fetch_json(opener, _url(backend_url, "/health"), timeout_seconds=timeout_seconds)
    if isinstance(health, Exception):
        errors.append(f"{label} /health failed: {health}")
    elif health.get("release_sha") != expected_sha:
        errors.append(f"{label} release_sha was {health.get('release_sha')!r}, expected {expected_sha!r}.")
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


def _check_frontend_cloud_run_firebase_env(
    *,
    project_id: str,
    region: str,
    frontend_service: str,
) -> tuple[list[str], dict[str, str]]:
    if not project_id and not region and not frontend_service:
        print("Frontend Cloud Run Firebase env check skipped: service metadata is not configured.")
        return [], {}
    missing_args = [
        name
        for name, value in (
            ("project-id", project_id),
            ("region", region),
            ("frontend-service", frontend_service),
        )
        if not value
    ]
    if missing_args:
        return [f"Frontend Cloud Run Firebase env check needs {', '.join(missing_args)}."], {}

    payload = _run_command(
        [
            "gcloud",
            "run",
            "services",
            "describe",
            frontend_service,
            "--project",
            project_id,
            "--region",
            region,
            "--format=json",
        ],
        label="frontend Cloud Run service",
    )
    if isinstance(payload, Exception):
        return [str(payload)], {}

    try:
        service = json.loads(payload)
    except json.JSONDecodeError as exc:
        return [f"frontend Cloud Run service JSON is invalid: {exc.msg}."], {}

    env = _cloud_run_container_env(service)
    errors: list[str] = []
    for key in FRONTEND_FIREBASE_ENV_KEYS:
        if not _has_secret_value(env.get(key, "")):
            errors.append(f"Cloud Run frontend env {key} must be non-empty.")
    return errors, {key: value for key, value in env.items() if key in FRONTEND_FIREBASE_ENV_KEYS}


def _cloud_run_container_env(service: dict[str, Any]) -> dict[str, str]:
    containers = (
        service.get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )
    if not isinstance(containers, list) or not containers:
        return {}
    raw_env = containers[0].get("env", []) if isinstance(containers[0], dict) else []
    if not isinstance(raw_env, list):
        return {}
    env: dict[str, str] = {}
    for item in raw_env:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        value = item.get("value")
        if isinstance(name, str):
            env[name] = value if isinstance(value, str) else ""
    return env


def _expected_frontend_firebase_config(
    frontend_firebase_env: dict[str, str],
    *,
    firebase_project_id: str,
    firebase_api_key: str,
) -> dict[str, str]:
    config = dict(frontend_firebase_env)
    if firebase_api_key and not _has_secret_value(config.get("NEXT_PUBLIC_FIREBASE_API_KEY", "")):
        config["NEXT_PUBLIC_FIREBASE_API_KEY"] = firebase_api_key
    if firebase_project_id and not _has_secret_value(config.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "")):
        config["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] = firebase_project_id
    if (
        config.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
        and not _has_secret_value(config.get("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", ""))
    ):
        config["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] = f"{config['NEXT_PUBLIC_FIREBASE_PROJECT_ID']}.firebaseapp.com"
    return config


def _check_frontend_firebase_bundle(
    opener: urllib.request.OpenerDirector,
    frontend_url: str,
    expected_config: dict[str, str],
    timeout_seconds: int,
) -> list[str]:
    markers = {
        key: value
        for key, value in expected_config.items()
        if key in FRONTEND_FIREBASE_ENV_KEYS and _has_secret_value(value)
    }
    if not markers:
        print("Frontend Firebase bundle check skipped: expected public config is not available.")
        return []

    root = _fetch(opener, frontend_url, timeout_seconds=timeout_seconds, max_body_bytes=2_000_000)
    if isinstance(root, Exception):
        return [f"frontend Firebase bundle check failed to fetch root: {root}"]
    if root.status >= 400:
        return [f"frontend Firebase bundle check root returned HTTP {root.status}."]

    html_text = root.body.decode("utf-8", errors="replace")
    found = {key for key, value in markers.items() if value in html_text}
    asset_urls = _frontend_js_asset_urls(frontend_url, html_text)
    if not asset_urls:
        return ["frontend Firebase bundle check found no JavaScript assets."]

    for asset_url in asset_urls:
        if len(found) == len(markers):
            break
        payload = _fetch(opener, asset_url, timeout_seconds=timeout_seconds, max_body_bytes=2_000_000)
        if isinstance(payload, Exception) or payload.status >= 400:
            continue
        text = payload.body.decode("utf-8", errors="replace")
        for key, value in markers.items():
            if key not in found and value in text:
                found.add(key)

    missing = tuple(key for key in markers if key not in found)
    if missing:
        return [
            "frontend JavaScript bundle is missing Firebase public config marker(s): "
            + ", ".join(missing)
            + "."
        ]
    return []


def _frontend_js_asset_urls(frontend_url: str, html_text: str) -> tuple[str, ...]:
    urls: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"""(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']""", html_text):
        raw_url = html.unescape(match.group(1))
        absolute = urllib.parse.urljoin(frontend_url, raw_url)
        if absolute not in seen:
            seen.add(absolute)
            urls.append(absolute)
    return tuple(urls)


def _run_command(command: list[str], *, label: str) -> str | Exception:
    executable = _resolve_executable(command[0])
    if executable is None:
        return RuntimeError(f"{label} command failed to start: {command[0]} was not found.")
    try:
        completed = subprocess.run(
            [executable, *command[1:]],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as exc:
        return RuntimeError(f"{label} command failed to start: {exc}.")
    if completed.returncode != 0:
        return RuntimeError(f"{label} command exited {completed.returncode}: {completed.stderr.strip()}.")
    return completed.stdout


def _resolve_executable(name: str) -> str | None:
    resolved = shutil.which(name)
    if resolved:
        return resolved
    if os.name == "nt" and not name.lower().endswith(".cmd"):
        return shutil.which(f"{name}.cmd")
    return None


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
    label: str,
    expected_role: str | None = None,
    expected_tier: str | None = None,
    expected_staff: bool | None = None,
) -> list[str]:
    if not email and not password:
        print("Firebase credential smoke skipped: STAGING_AUTH_SMOKE_EMAIL/PASSWORD are not configured.")
        return []
    if not email or not password:
        return ["Firebase credential smoke needs both STAGING_AUTH_SMOKE_EMAIL and STAGING_AUTH_SMOKE_PASSWORD."]
    if not _has_secret_value(firebase_api_key):
        return ["Firebase credential smoke needs FIREBASE_API_KEY."]

    id_token = _firebase_password_id_token(
        firebase_api_key=firebase_api_key,
        email=email,
        password=password,
        timeout_seconds=timeout_seconds,
        label=label,
    )
    if isinstance(id_token, Exception):
        return [str(id_token)]
    return _check_firebase_session_profile(
        backend_url,
        id_token,
        timeout_seconds=timeout_seconds,
        label=label,
        expected_role=expected_role,
        expected_tier=expected_tier,
        expected_staff=expected_staff,
    )


def _check_optional_role_firebase_auth_smokes(
    auth_targets: list[tuple[str, str]],
    *,
    firebase_api_key: str,
    timeout_seconds: int,
    environ: dict[str, str],
) -> list[str]:
    errors: list[str] = []
    if not _has_secret_value(firebase_api_key):
        configured = any(
            environ.get(spec["email_env"], "").strip() or environ.get(spec["password_env"], "")
            for spec in ROLE_AUTH_SMOKE_SPECS
        )
        if configured:
            return ["Role auth smoke needs FIREBASE_API_KEY."]
        print("Role auth smoke skipped: no role-specific staging auth secrets are configured.")
        return []

    for spec in ROLE_AUTH_SMOKE_SPECS:
        name = str(spec["name"])
        email_env = str(spec["email_env"])
        password_env = str(spec["password_env"])
        email = environ.get(email_env, "").strip()
        password = environ.get(password_env, "")
        if not email and not password:
            print(f"{name.title()} role auth smoke skipped: {email_env}/{password_env} are not configured.")
            continue
        if not email or not password:
            errors.append(f"{name} role auth smoke needs both {email_env} and {password_env}.")
            continue

        id_token = _firebase_password_id_token(
            firebase_api_key=firebase_api_key,
            email=email,
            password=password,
            timeout_seconds=timeout_seconds,
            label=f"{name} role",
        )
        if isinstance(id_token, Exception):
            errors.append(str(id_token))
            continue

        for target_label, target_url in auth_targets:
            errors.extend(
                _check_firebase_session_profile(
                    target_url,
                    id_token,
                    timeout_seconds=timeout_seconds,
                    label=f"{target_label} {name} role",
                    expected_role=spec["expected_role"],
                    expected_tier=spec["expected_tier"],
                    expected_staff=spec["expected_staff"],
                )
            )
    if not errors:
        print("Role auth smoke matrix passed.")
    return errors


def _role_auth_smoke_configured(environ: Mapping[str, str]) -> bool:
    return any(
        environ.get(str(spec["email_env"]), "").strip() or environ.get(str(spec["password_env"]), "")
        for spec in ROLE_AUTH_SMOKE_SPECS
    )


def _firebase_password_id_token(
    *,
    firebase_api_key: str,
    email: str,
    password: str,
    timeout_seconds: int,
    label: str,
) -> str | Exception:
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
        return RuntimeError(f"{label} Firebase password sign-in failed: {sign_in}")
    id_token = sign_in.get("idToken")
    if not isinstance(id_token, str) or not id_token:
        return RuntimeError(f"{label} Firebase password sign-in did not return an ID token.")
    return id_token


def _check_firebase_session_profile(
    backend_url: str,
    id_token: str,
    *,
    timeout_seconds: int,
    label: str,
    expected_role: str | None = None,
    expected_tier: str | None = None,
    expected_staff: bool | None = None,
) -> list[str]:
    cookie_jar = http.cookiejar.CookieJar()
    backend_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    session: dict[str, Any] | Exception = RuntimeError("Firebase session exchange was not attempted.")
    for attempt in range(2):
        session = _fetch_json(
            backend_opener,
            _url(backend_url, "/api/auth/firebase-session"),
            method="POST",
            json_body={"credential": id_token},
            timeout_seconds=timeout_seconds,
        )
        if not _is_rate_limited_response(session) or attempt == 1:
            break
        print(
            f"{label.title()} Firebase session exchange was rate-limited; "
            f"retrying in {SESSION_RATE_LIMIT_RETRY_SECONDS}s."
        )
        time.sleep(SESSION_RATE_LIMIT_RETRY_SECONDS)
    if isinstance(session, Exception):
        return [f"{label} Firebase session exchange failed: {session}"]
    if not isinstance(session.get("user"), dict):
        return [f"{label} Firebase session exchange did not return a user object."]

    cookie_header = _cookie_header(cookie_jar)
    profile = _fetch_json(
        backend_opener,
        _url(backend_url, "/api/profile/me"),
        headers={"Cookie": cookie_header} if cookie_header else None,
        timeout_seconds=timeout_seconds,
    )
    if isinstance(profile, Exception):
        return [f"{label} authenticated profile smoke failed: {profile}"]
    if not profile.get("id"):
        return [f"{label} authenticated profile smoke did not return a profile id."]
    errors = _profile_expectation_errors(
        profile,
        label=label,
        expected_role=expected_role,
        expected_tier=expected_tier,
        expected_staff=expected_staff,
    )
    if errors:
        return errors
    print(f"{label.title()} Firebase credential smoke passed.")
    return []


def _is_rate_limited_response(value: dict[str, Any] | Exception) -> bool:
    return isinstance(value, Exception) and "HTTP 429" in str(value)


def _profile_expectation_errors(
    profile: dict[str, Any],
    *,
    label: str,
    expected_role: str | None,
    expected_tier: str | None,
    expected_staff: bool | None,
) -> list[str]:
    errors: list[str] = []
    if expected_role is not None and profile.get("role") != expected_role:
        errors.append(f"{label} profile role was {profile.get('role')!r}, expected {expected_role!r}.")
    if expected_tier is not None:
        actual_tier = str(profile.get("tier") or "").lower()
        if actual_tier != expected_tier:
            errors.append(f"{label} profile tier was {profile.get('tier')!r}, expected {expected_tier!r}.")
    if expected_staff is not None and bool(profile.get("is_staff")) is not expected_staff:
        errors.append(f"{label} profile is_staff was {profile.get('is_staff')!r}, expected {expected_staff!r}.")
    return errors


def _fetch_json(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: int,
) -> dict[str, Any] | Exception:
    payload = _fetch(opener, url, method=method, json_body=json_body, headers=headers, timeout_seconds=timeout_seconds)
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
    headers: dict[str, str] | None = None,
    timeout_seconds: int,
    max_body_bytes: int = 65536,
) -> HttpPayload | Exception:
    request_headers = {"Accept": "application/json", "User-Agent": "kresco-staging-deployment-smoke/1.0"}
    if headers:
        request_headers.update(headers)
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return HttpPayload(status=response.getcode(), body=response.read(max_body_bytes))
    except urllib.error.HTTPError as exc:
        return HttpPayload(status=exc.code, body=exc.read(max_body_bytes))
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


def _optional_absolute_url(value: str, name: str, errors: list[str]) -> str | None:
    if not value.strip():
        return None
    return _required_absolute_url(value, name, errors)


def _public_api_url_for_apex(apex_url: str, errors: list[str]) -> str | None:
    parsed = urllib.parse.urlparse(apex_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        errors.append("subdomain-apex-url must be an absolute HTTP(S) URL before deriving public-api-url.")
        return None
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://api.{parsed.hostname}{port}"


def _has_secret_value(value: str) -> bool:
    return value.strip().lower() not in EMPTY_SECRET_VALUES


def _safe_body(body: bytes) -> str:
    text = body[:2048].decode("utf-8", errors="replace")
    if len(body) > 2048:
        return text + "...[truncated]"
    return text


def _cookie_header(cookie_jar: http.cookiejar.CookieJar) -> str:
    return "; ".join(f"{cookie.name}={cookie.value}" for cookie in cookie_jar)


def _redact_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    redacted_query = urllib.parse.urlencode([
        (key, "[redacted]" if key.lower() == "key" else value)
        for key, value in query
    ])
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
