#!/usr/bin/env python3
"""Verify public domain and Firebase Auth readiness for Kresco deployments."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


FRONTEND_SUBDOMAIN_LABELS = ("www", "app", "admin", "prof", "staff")
RESERVED_SUBDOMAIN_LABELS = {"www", "app", "admin", "prof", "professor", "staff", "api"}
DEFAULT_TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class PublicAuthReadinessResult:
    passed: bool
    errors: tuple[str, ...]
    expected_domains: tuple[str, ...]
    expected_origins: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": list(self.errors),
            "expected_domains": list(self.expected_domains),
            "expected_origins": list(self.expected_origins),
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify public domain and Firebase Auth readiness.")
    parser.add_argument("--project-id", default=os.environ.get("PROJECT_ID", ""))
    parser.add_argument("--frontend-apex-url", required=True)
    parser.add_argument("--api-host", default="")
    parser.add_argument("--runtime-secret-name", default=os.environ.get("KRESCO_RUNTIME_SECRET_NAME", ""))
    parser.add_argument("--runtime-secret-json", type=Path)
    parser.add_argument("--auth-config-json", type=Path)
    parser.add_argument("--runtime-secret-only", action="store_true")
    parser.add_argument("--ensure-authorized-domains", action="store_true")
    parser.add_argument("--require-email-password", action="store_true")
    parser.add_argument("--require-google-provider", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    errors: list[str] = []
    project_id = args.project_id.strip()
    if not project_id and not args.auth_config_json and not args.runtime_secret_only:
        errors.append("project-id is required when auth-config-json is not provided.")

    runtime_secret = _load_runtime_secret(
        project_id=project_id,
        secret_name=args.runtime_secret_name.strip(),
        fixture_path=args.runtime_secret_json,
        errors=errors,
    )
    auth_config: dict[str, Any] | None = None
    if args.runtime_secret_only:
        if args.auth_config_json:
            errors.append("auth-config-json cannot be used with runtime-secret-only.")
        if args.ensure_authorized_domains:
            errors.append("ensure-authorized-domains cannot be used with runtime-secret-only.")
    else:
        auth_config = _load_auth_config(
            project_id=project_id,
            fixture_path=args.auth_config_json,
            timeout_seconds=args.timeout_seconds,
            require_google_provider=args.require_google_provider,
            errors=errors,
        )
    apex_origin = canonical_origin(args.frontend_apex_url)
    if args.ensure_authorized_domains:
        if args.auth_config_json:
            errors.append("ensure-authorized-domains cannot be used with auth-config-json.")
        elif not apex_origin:
            errors.append("frontend-apex-url must be valid before ensuring Firebase authorized domains.")
        elif auth_config and apex_origin:
            auth_config = _ensure_authorized_domains(
                auth_config,
                required_frontend_domains(apex_origin),
                project_id=project_id,
                timeout_seconds=args.timeout_seconds,
                errors=errors,
            )
    result = evaluate_public_auth_readiness(
        runtime_secret if isinstance(runtime_secret, dict) else {},
        auth_config if isinstance(auth_config, dict) else {},
        frontend_apex_url=args.frontend_apex_url,
        api_host=args.api_host,
        require_email_password=args.require_email_password,
        require_google_provider=args.require_google_provider,
        require_firebase_auth_config=not args.runtime_secret_only,
        preflight_errors=errors,
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    if result.passed:
        if not args.json:
            print(f"Public auth readiness passed for {canonical_origin(args.frontend_apex_url)}.")
        return 0
    for error in result.errors:
        print(f"error: {error}", file=sys.stderr)
    return 1


def evaluate_public_auth_readiness(
    runtime_secret: dict[str, Any],
    auth_config: dict[str, Any],
    *,
    frontend_apex_url: str,
    api_host: str = "",
    require_email_password: bool = False,
    require_google_provider: bool = False,
    require_firebase_auth_config: bool = True,
    preflight_errors: list[str] | None = None,
) -> PublicAuthReadinessResult:
    errors = list(preflight_errors or [])
    apex_origin = canonical_origin(frontend_apex_url, errors=errors)
    expected_domains: tuple[str, ...] = ()
    expected_origins: tuple[str, ...] = ()
    if apex_origin:
        expected_domains = required_frontend_domains(apex_origin)
        expected_origins = required_frontend_origins(apex_origin)

    if runtime_secret and apex_origin:
        errors.extend(_runtime_secret_errors(runtime_secret, apex_origin, expected_origins, api_host=api_host.strip()))
    elif not runtime_secret:
        errors.append("runtime secret JSON is required.")
    if require_firebase_auth_config:
        if auth_config:
            if runtime_secret:
                errors.extend(_frontend_firebase_config_errors(runtime_secret, auth_config))
            errors.extend(
                _firebase_auth_config_errors(
                    auth_config,
                    expected_domains,
                    require_email_password=require_email_password,
                    require_google_provider=require_google_provider,
                )
            )
        else:
            errors.append("Firebase Auth config JSON is required.")

    return PublicAuthReadinessResult(
        passed=not errors,
        errors=tuple(errors),
        expected_domains=expected_domains,
        expected_origins=expected_origins,
    )


def canonical_origin(value: str, *, errors: list[str] | None = None) -> str:
    parsed = urllib.parse.urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
        if errors is not None:
            errors.append("frontend-apex-url must be an absolute HTTP(S) URL.")
        return ""
    first_label = parsed.hostname.split(".", 1)[0].lower()
    if first_label in RESERVED_SUBDOMAIN_LABELS:
        if errors is not None:
            errors.append("frontend-apex-url must be the frontend apex, not a workspace or API subdomain.")
        return ""
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))


def required_frontend_domains(apex_origin: str) -> tuple[str, ...]:
    parsed = urllib.parse.urlparse(apex_origin)
    apex_host = parsed.hostname or ""
    return tuple([apex_host, *(f"{label}.{apex_host}" for label in FRONTEND_SUBDOMAIN_LABELS)])


def required_frontend_origins(apex_origin: str) -> tuple[str, ...]:
    parsed = urllib.parse.urlparse(apex_origin)
    apex_host = parsed.hostname or ""
    scheme = parsed.scheme
    port = f":{parsed.port}" if parsed.port else ""
    return tuple([f"{scheme}://{apex_host}{port}", *(f"{scheme}://{label}.{apex_host}{port}" for label in FRONTEND_SUBDOMAIN_LABELS)])


def _runtime_secret_errors(
    runtime_secret: dict[str, Any],
    apex_origin: str,
    expected_origins: tuple[str, ...],
    *,
    api_host: str,
) -> list[str]:
    errors: list[str] = []
    parsed = urllib.parse.urlparse(apex_origin)
    apex_host = parsed.hostname or ""
    frontend_url = _string_value(runtime_secret, "FRONTEND_URL", "frontend_url")
    auth_cookie_domain = _string_value(runtime_secret, "AUTH_COOKIE_DOMAIN", "auth_cookie_domain", "KRESCO_AUTH_COOKIE_DOMAIN")
    cors_origins = set(_list_value(runtime_secret, "CORS_ALLOWED_ORIGINS", "cors_allowed_origins"))
    csrf_origins = set(_list_value(runtime_secret, "CSRF_TRUSTED_ORIGINS", "csrf_trusted_origins"))
    trusted_hosts = set(_list_value(runtime_secret, "KRESCO_TRUSTED_HOSTS", "trusted_hosts"))

    if frontend_url != apex_origin:
        errors.append(f"FRONTEND_URL must be {apex_origin!r}; got {frontend_url!r}.")
    if auth_cookie_domain != apex_host:
        errors.append(f"AUTH_COOKIE_DOMAIN must be {apex_host!r}; got {auth_cookie_domain!r}.")

    missing_cors = sorted(set(expected_origins) - cors_origins)
    if missing_cors:
        errors.append("CORS_ALLOWED_ORIGINS is missing: " + ", ".join(missing_cors) + ".")
    unexpected_cors = sorted(cors_origins - set(expected_origins))
    if unexpected_cors:
        errors.append("CORS_ALLOWED_ORIGINS has unexpected origins: " + ", ".join(unexpected_cors) + ".")
    missing_csrf = sorted(set(expected_origins) - csrf_origins)
    if missing_csrf:
        errors.append("CSRF_TRUSTED_ORIGINS is missing: " + ", ".join(missing_csrf) + ".")
    unexpected_csrf = sorted(csrf_origins - set(expected_origins))
    if unexpected_csrf:
        errors.append("CSRF_TRUSTED_ORIGINS has unexpected origins: " + ", ".join(unexpected_csrf) + ".")
    if api_host and api_host not in trusted_hosts:
        errors.append(f"KRESCO_TRUSTED_HOSTS must include {api_host!r}.")
    return errors


def _frontend_firebase_config_errors(runtime_secret: dict[str, Any], auth_config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    firebase_api_key = _string_value(runtime_secret, "NEXT_PUBLIC_FIREBASE_API_KEY", "FIREBASE_WEB_API_KEY", "firebase_api_key")
    firebase_project_id = _string_value(runtime_secret, "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID", "firebase_project_id")
    firebase_auth_domain = _string_value(runtime_secret, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN", "firebase_auth_domain")
    firebase_app_id = _string_value(runtime_secret, "NEXT_PUBLIC_FIREBASE_APP_ID", "FIREBASE_APP_ID", "firebase_app_id")

    required_values = {
        "NEXT_PUBLIC_FIREBASE_API_KEY": firebase_api_key,
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID": firebase_project_id,
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": firebase_auth_domain,
        "NEXT_PUBLIC_FIREBASE_APP_ID": firebase_app_id,
    }
    for key, value in required_values.items():
        if not value:
            errors.append(f"{key} must be present in the runtime secret used for frontend builds.")

    if not firebase_auth_domain:
        return errors
    if _is_invalid_auth_domain(firebase_auth_domain):
        errors.append("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be a bare hostname, not a URL or host with a port.")
        return errors

    authorized_domains = set(_list_value(auth_config, "authorizedDomains", "authorized_domains"))
    if firebase_auth_domain not in authorized_domains:
        errors.append(f"NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN {firebase_auth_domain!r} must be present in Firebase Auth authorizedDomains.")
    return errors


def _firebase_auth_config_errors(
    auth_config: dict[str, Any],
    expected_domains: tuple[str, ...],
    *,
    require_email_password: bool,
    require_google_provider: bool,
) -> list[str]:
    errors: list[str] = []
    authorized_domains = set(_list_value(auth_config, "authorizedDomains", "authorized_domains"))
    missing_domains = sorted(set(expected_domains) - authorized_domains)
    if missing_domains:
        errors.append("Firebase Auth authorizedDomains is missing: " + ", ".join(missing_domains) + ".")

    if require_email_password:
        email_config = auth_config.get("signIn", {}).get("email") if isinstance(auth_config.get("signIn"), dict) else None
        if not isinstance(email_config, dict) or email_config.get("enabled") is not True:
            errors.append("Firebase Auth Email/Password sign-in must be enabled.")
    if require_google_provider and not _google_provider_enabled(auth_config):
        errors.append("Firebase Auth Google provider must be enabled.")
    return errors


def _is_invalid_auth_domain(value: str) -> bool:
    stripped = value.strip()
    if not stripped or "/" in stripped or ":" in stripped or stripped.startswith("."):
        return True
    try:
        parsed = urllib.parse.urlparse(f"https://{stripped}")
    except ValueError:
        return True
    return parsed.hostname != stripped.lower() or not parsed.hostname or "." not in parsed.hostname


def _google_provider_enabled(auth_config: dict[str, Any]) -> bool:
    explicit = auth_config.get("googleProvider")
    if isinstance(explicit, dict) and explicit.get("enabled") is True:
        return True
    for key in ("defaultSupportedIdpConfigs", "defaultSupportedIdps", "idpConfigs"):
        configs = auth_config.get(key)
        if not isinstance(configs, list):
            continue
        for config in configs:
            if not isinstance(config, dict):
                continue
            name = str(config.get("name") or config.get("idpId") or config.get("providerId") or "")
            if name.endswith("/google.com") or name == "google.com":
                return config.get("enabled") is True
    return False


def _load_runtime_secret(
    *,
    project_id: str,
    secret_name: str,
    fixture_path: Path | None,
    errors: list[str],
) -> dict[str, Any] | None:
    if fixture_path:
        return _read_json_file(fixture_path, errors, label="runtime secret")
    if not secret_name:
        errors.append("runtime-secret-name is required when runtime-secret-json is not provided.")
        return None
    if not project_id:
        errors.append("project-id is required to fetch the runtime secret.")
        return None
    command = [
        "gcloud",
        "secrets",
        "versions",
        "access",
        "latest",
        "--project",
        project_id,
        "--secret",
        secret_name,
    ]
    payload = _run_command(command, errors, label="runtime secret")
    if payload is None:
        return None
    return _parse_json(payload, errors, label="runtime secret")


def _load_auth_config(
    *,
    project_id: str,
    fixture_path: Path | None,
    timeout_seconds: int,
    require_google_provider: bool,
    errors: list[str],
) -> dict[str, Any] | None:
    if fixture_path:
        return _read_json_file(fixture_path, errors, label="Firebase Auth config")
    if not project_id:
        return None
    token = _run_command(["gcloud", "auth", "print-access-token"], errors, label="gcloud access token")
    if token is None:
        return None
    config = _fetch_identitytoolkit_json(
        f"https://identitytoolkit.googleapis.com/admin/v2/projects/{urllib.parse.quote(project_id, safe='')}/config",
        token=token,
        timeout_seconds=timeout_seconds,
        errors=errors,
        label="Firebase Auth config",
    )
    if config is not None and require_google_provider:
        google_provider = _fetch_identitytoolkit_json(
            (
                "https://identitytoolkit.googleapis.com/admin/v2/"
                f"projects/{urllib.parse.quote(project_id, safe='')}/defaultSupportedIdpConfigs/google.com"
            ),
            token=token,
            timeout_seconds=timeout_seconds,
            errors=errors,
            label="Firebase Auth Google provider config",
        )
        if google_provider is not None:
            config["googleProvider"] = google_provider
    return config


def _ensure_authorized_domains(
    auth_config: dict[str, Any],
    required_domains: tuple[str, ...],
    *,
    project_id: str,
    timeout_seconds: int,
    errors: list[str],
) -> dict[str, Any]:
    existing_domains = _list_value(auth_config, "authorizedDomains", "authorized_domains")
    merged_domains = tuple(dict.fromkeys([*existing_domains, *required_domains]))
    missing_domains = tuple(domain for domain in required_domains if domain not in set(existing_domains))
    if not missing_domains:
        return auth_config

    if not project_id:
        errors.append("project-id is required to ensure Firebase Auth authorized domains.")
        return auth_config

    token = _run_command(["gcloud", "auth", "print-access-token"], errors, label="gcloud access token")
    if token is None:
        return auth_config

    project_path = f"projects/{project_id}/config"
    update_url = (
        "https://identitytoolkit.googleapis.com/admin/v2/"
        f"{urllib.parse.quote(project_path, safe='/')}?updateMask=authorizedDomains"
    )
    patched_config = _fetch_identitytoolkit_json(
        update_url,
        token=token,
        timeout_seconds=timeout_seconds,
        errors=errors,
        label="Firebase Auth authorized domains update",
        method="PATCH",
        body={"name": project_path, "authorizedDomains": list(merged_domains)},
    )
    if patched_config is None:
        return auth_config
    if not _list_value(patched_config, "authorizedDomains", "authorized_domains"):
        patched_config["authorizedDomains"] = list(merged_domains)
    return patched_config


def _fetch_identitytoolkit_json(
    url: str,
    *,
    token: str,
    timeout_seconds: int,
    errors: list[str],
    label: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token.strip()}",
        "User-Agent": "kresco-public-auth-readiness/1.0",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url,
        data=payload,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return _parse_json(response.read().decode("utf-8"), errors, label=label)
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", errors="replace")
        errors.append(f"{label} fetch returned HTTP {exc.code}: {_redact(detail)}")
    except urllib.error.URLError as exc:
        errors.append(f"{label} fetch failed: {getattr(exc, 'reason', exc)}.")
    except TimeoutError as exc:
        errors.append(f"{label} fetch timed out: {exc}.")
    return None


def _run_command(command: list[str], errors: list[str], *, label: str) -> str | None:
    try:
        completed = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except OSError as exc:
        errors.append(f"{label} command failed to start: {exc}.")
        return None
    if completed.returncode != 0:
        stderr = _redact(completed.stderr.strip())
        errors.append(f"{label} command exited {completed.returncode}: {stderr}.")
        return None
    return completed.stdout


def _read_json_file(path: Path, errors: list[str], *, label: str) -> dict[str, Any] | None:
    try:
        payload = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        errors.append(f"{label} JSON file could not be read: {path}: {exc}.")
        return None
    return _parse_json(payload, errors, label=label)


def _parse_json(payload: str, errors: list[str], *, label: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        errors.append(f"{label} JSON is invalid: {exc.msg}.")
        return None
    if not isinstance(parsed, dict):
        errors.append(f"{label} JSON must be an object.")
        return None
    return parsed


def _string_value(payload: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            stripped = value.strip().rstrip("/")
            if stripped.lower() in {"null", "undefined", "none"}:
                return ""
            return stripped
    return ""


def _list_value(payload: dict[str, Any], *keys: str) -> tuple[str, ...]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())
        if isinstance(value, list):
            return tuple(str(item).strip().rstrip("/") for item in value if str(item).strip())
    return ()


def _redact(value: str) -> str:
    return value.replace("\n", " ")[:2000]


if __name__ == "__main__":
    raise SystemExit(main())
