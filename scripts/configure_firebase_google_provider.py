#!/usr/bin/env python3
"""Enable the Firebase Auth Google provider from a Google OAuth web client."""

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
from typing import Any


GCIP_API_BASE = "https://identitytoolkit.googleapis.com/v2"
DEFAULT_TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class GoogleProviderResult:
    project_id: str
    provider_id: str
    action: str
    enabled: bool
    client_id_suffix: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_id": self.project_id,
            "provider_id": self.provider_id,
            "action": self.action,
            "enabled": self.enabled,
            "client_id_suffix": self.client_id_suffix,
        }


class HttpJsonError(RuntimeError):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Configure Firebase Auth Google provider.")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--client-id", default="")
    parser.add_argument("--client-secret", default="")
    parser.add_argument("--client-id-env", default="FIREBASE_GOOGLE_CLIENT_ID")
    parser.add_argument("--client-secret-env", default="FIREBASE_GOOGLE_CLIENT_SECRET")
    parser.add_argument("--access-token", default="")
    parser.add_argument("--impersonate-service-account", default="")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    errors: list[str] = []
    client_id = (args.client_id or os.environ.get(args.client_id_env, "")).strip()
    client_secret = (args.client_secret or os.environ.get(args.client_secret_env, "")).strip()
    if not client_id:
        errors.append(f"Google OAuth client ID is required. Set {args.client_id_env} or pass --client-id.")
    if not client_secret:
        errors.append(
            f"Google OAuth client secret is required. Set {args.client_secret_env} or pass --client-secret."
        )
    token = args.access_token.strip()
    if not token and not errors:
        token = _gcloud_access_token(
            project_id=args.project_id,
            impersonate_service_account=args.impersonate_service_account.strip(),
            errors=errors,
        )
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    try:
        result = configure_google_provider(
            project_id=args.project_id,
            client_id=client_id,
            client_secret=client_secret,
            access_token=token,
            timeout_seconds=args.timeout_seconds,
        )
    except HttpJsonError as exc:
        print(f"error: Firebase Google provider API returned HTTP {exc.status}: {_redact(exc.detail)}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"error: Firebase Google provider API request failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        print(f"Firebase Google provider {result.action} for {args.project_id}; enabled={result.enabled}.")
    return 0


def configure_google_provider(
    *,
    project_id: str,
    client_id: str,
    client_secret: str,
    access_token: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> GoogleProviderResult:
    provider_id = "google.com"
    name = f"projects/{project_id}/defaultSupportedIdpConfigs/{provider_id}"
    body = {
        "name": name,
        "enabled": True,
        "clientId": client_id,
        "clientSecret": client_secret,
    }
    try:
        _fetch_json(
            f"{GCIP_API_BASE}/{urllib.parse.quote(name, safe='/')}",
            access_token=access_token,
            timeout_seconds=timeout_seconds,
        )
    except HttpJsonError as exc:
        if exc.status != 404:
            raise
        response = _fetch_json(
            f"{GCIP_API_BASE}/projects/{urllib.parse.quote(project_id, safe='')}/defaultSupportedIdpConfigs"
            f"?idpId={urllib.parse.quote(provider_id, safe='')}",
            access_token=access_token,
            timeout_seconds=timeout_seconds,
            method="POST",
            body=body,
        )
        return _result_from_response(project_id, provider_id, "created", client_id, response)

    response = _fetch_json(
        f"{GCIP_API_BASE}/{urllib.parse.quote(name, safe='/')}?updateMask=enabled,clientId,clientSecret",
        access_token=access_token,
        timeout_seconds=timeout_seconds,
        method="PATCH",
        body=body,
    )
    return _result_from_response(project_id, provider_id, "updated", client_id, response)


def _result_from_response(
    project_id: str,
    provider_id: str,
    action: str,
    client_id: str,
    response: dict[str, Any],
) -> GoogleProviderResult:
    return GoogleProviderResult(
        project_id=project_id,
        provider_id=provider_id,
        action=action,
        enabled=response.get("enabled") is True,
        client_id_suffix=client_id[-12:],
    )


def _fetch_json(
    url: str,
    *,
    access_token: str,
    timeout_seconds: int,
    method: str = "GET",
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "kresco-configure-firebase-google-provider/1.0",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", errors="replace")
        raise HttpJsonError(exc.code, detail) from exc
    if not isinstance(parsed, dict):
        raise HttpJsonError(502, "Firebase Google provider API returned a non-object JSON response.")
    return parsed


def _gcloud_access_token(
    *,
    project_id: str,
    impersonate_service_account: str,
    errors: list[str],
) -> str:
    command = ["gcloud", "auth", "print-access-token", "--project", project_id]
    if impersonate_service_account:
        command.append(f"--impersonate-service-account={impersonate_service_account}")
    try:
        completed = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except OSError as exc:
        errors.append(f"gcloud access token command failed to start: {exc}.")
        return ""
    if completed.returncode != 0:
        errors.append(f"gcloud access token command exited {completed.returncode}: {_redact(completed.stderr)}")
        return ""
    token = completed.stdout.strip()
    if not token:
        errors.append("gcloud access token command returned an empty token.")
    return token


def _redact(value: str) -> str:
    return value.replace("\n", " ")[:2000]


if __name__ == "__main__":
    raise SystemExit(main())
