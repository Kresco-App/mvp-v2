#!/usr/bin/env python3
"""Ensure Firebase Hosting sites exist for Kresco's frontend/API edge targets."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from check_firebase_hosting_domains import (  # noqa: E402
    FIREBASE_HOSTING_API,
    TOKEN_ENV,
    _expected_contract,
    _gcloud_access_token,
)


@dataclass(frozen=True)
class HostingSiteResult:
    target: str
    site: str
    status: str
    passed: bool
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "site": self.site,
            "status": self.status,
            "passed": self.passed,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class HostingSitesResult:
    environment: str
    project_id: str
    ensured: bool
    passed: bool
    sites: tuple[HostingSiteResult, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "project_id": self.project_id,
            "ensured": self.ensured,
            "passed": self.passed,
            "sites": [site.to_dict() for site in self.sites],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ensure Firebase Hosting sites exist.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--ensure", action="store_true", help="Create missing sites.")
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = os.environ.get(args.access_token_env, "").strip()
    token_error = ""
    if not access_token:
        access_token, token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    result = ensure_firebase_hosting_sites(
        environment=args.environment,
        ensure=args.ensure,
        access_token=access_token,
        access_token_error=token_error,
        timeout_seconds=args.timeout_seconds,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for site in result.sites:
            print(f"{site.status}: {site.target} -> {site.site}")
            for error in site.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def ensure_firebase_hosting_sites(
    *,
    environment: str,
    ensure: bool,
    access_token: str,
    access_token_error: str = "",
    timeout_seconds: float = 20.0,
) -> HostingSitesResult:
    project_id, expectations = _expected_contract(environment)
    if not access_token:
        error = access_token_error or f"Firebase Hosting site check requires {TOKEN_ENV} or gcloud auth."
        sites = tuple(
            HostingSiteResult(
                target=expectation.target,
                site=expectation.site,
                status="auth_error",
                passed=False,
                errors=(error,),
            )
            for expectation in expectations
        )
        return HostingSitesResult(environment=environment, project_id=project_id, ensured=ensure, passed=False, sites=sites)

    sites = tuple(
        _ensure_site(
            project_id=project_id,
            target=expectation.target,
            site=expectation.site,
            ensure=ensure,
            access_token=access_token,
            timeout_seconds=timeout_seconds,
        )
        for expectation in expectations
    )
    return HostingSitesResult(
        environment=environment,
        project_id=project_id,
        ensured=ensure,
        passed=all(site.passed for site in sites),
        sites=sites,
    )


def _ensure_site(
    *,
    project_id: str,
    target: str,
    site: str,
    ensure: bool,
    access_token: str,
    timeout_seconds: float,
) -> HostingSiteResult:
    exists, get_error = _site_exists(
        project_id=project_id,
        site=site,
        access_token=access_token,
        timeout_seconds=timeout_seconds,
    )
    if exists:
        return HostingSiteResult(target=target, site=site, status="exists", passed=True, errors=())
    if get_error and "HTTP 404" not in get_error:
        return HostingSiteResult(target=target, site=site, status="error", passed=False, errors=(get_error,))
    if not ensure:
        return HostingSiteResult(
            target=target,
            site=site,
            status="missing",
            passed=False,
            errors=(f"Firebase Hosting site {site!r} is missing.",),
        )

    created, create_error = _create_site(
        project_id=project_id,
        site=site,
        access_token=access_token,
        timeout_seconds=timeout_seconds,
    )
    if created:
        return HostingSiteResult(target=target, site=site, status="created", passed=True, errors=())
    return HostingSiteResult(target=target, site=site, status="error", passed=False, errors=(create_error,))


def _site_exists(*, project_id: str, site: str, access_token: str, timeout_seconds: float) -> tuple[bool, str]:
    url = _site_url(project_id=project_id, site=site)
    payload, error = _request_json("GET", url, access_token=access_token, project_id=project_id, timeout_seconds=timeout_seconds)
    if error:
        return False, error
    return isinstance(payload, dict) and payload.get("name") == f"projects/{project_id}/sites/{site}", ""


def _create_site(*, project_id: str, site: str, access_token: str, timeout_seconds: float) -> tuple[bool, str]:
    query = urllib.parse.urlencode({"siteId": site})
    url = f"{FIREBASE_HOSTING_API}/projects/{urllib.parse.quote(project_id, safe='')}/sites?{query}"
    payload, error = _request_json(
        "POST",
        url,
        access_token=access_token,
        project_id=project_id,
        timeout_seconds=timeout_seconds,
        body={},
    )
    if error:
        if "HTTP 409" in error or "ALREADY_EXISTS" in error:
            return True, ""
        return False, error
    return isinstance(payload, dict), ""


def _request_json(
    method: str,
    url: str,
    *,
    access_token: str,
    project_id: str,
    timeout_seconds: float,
    body: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-goog-user-project": project_id,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else {}, ""
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        return None, f"HTTP {exc.code}: {detail}"
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return None, str(exc)
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON response: {exc.msg}"


def _site_url(*, project_id: str, site: str) -> str:
    project = urllib.parse.quote(project_id, safe="")
    site_id = urllib.parse.quote(site, safe="")
    return f"{FIREBASE_HOSTING_API}/projects/{project}/sites/{site_id}"


if __name__ == "__main__":
    raise SystemExit(main())
