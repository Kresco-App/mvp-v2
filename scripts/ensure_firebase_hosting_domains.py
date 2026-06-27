#!/usr/bin/env python3
"""Ensure Firebase Hosting custom-domain resources exist for Kresco."""

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


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from check_firebase_hosting_domains import (  # noqa: E402
    FIREBASE_HOSTING_API,
    TOKEN_ENV,
    _expected_contract,
    _fetch_custom_domain_resource,
    _fetch_site_custom_domains,
    _gcloud_access_token,
)


@dataclass(frozen=True)
class HostingCustomDomainResult:
    target: str
    site: str
    domain: str
    status: str
    passed: bool
    errors: tuple[str, ...]
    operation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "site": self.site,
            "domain": self.domain,
            "status": self.status,
            "passed": self.passed,
            "errors": list(self.errors),
            "operation": self.operation,
        }


@dataclass(frozen=True)
class HostingCustomDomainsResult:
    environment: str
    project_id: str
    ensured: bool
    passed: bool
    domains: tuple[HostingCustomDomainResult, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "project_id": self.project_id,
            "ensured": self.ensured,
            "passed": self.passed,
            "domains": [domain.to_dict() for domain in self.domains],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ensure Firebase Hosting custom domains exist.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--ensure", action="store_true", help="Create missing custom-domain resources.")
    parser.add_argument("--validate-only", action="store_true", help="Validate creates without mutating Firebase.")
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = os.environ.get(args.access_token_env, "").strip()
    token_error = ""
    if not access_token:
        access_token, token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    result = ensure_firebase_hosting_domains(
        environment=args.environment,
        ensure=args.ensure,
        validate_only=args.validate_only,
        access_token=access_token,
        access_token_error=token_error,
        timeout_seconds=args.timeout_seconds,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for domain in result.domains:
            print(f"{domain.status}: {domain.target} -> {domain.domain}")
            if domain.operation:
                print(f"  operation: {domain.operation}")
            for error in domain.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def ensure_firebase_hosting_domains(
    *,
    environment: str,
    ensure: bool,
    validate_only: bool,
    access_token: str,
    access_token_error: str = "",
    timeout_seconds: float = 20.0,
) -> HostingCustomDomainsResult:
    project_id, expectations = _expected_contract(environment)
    if not access_token:
        error = access_token_error or f"Firebase Hosting custom-domain check requires {TOKEN_ENV} or gcloud auth."
        domains = tuple(
            HostingCustomDomainResult(
                target=expectation.target,
                site=expectation.site,
                domain=domain,
                status="auth_error",
                passed=False,
                errors=(error,),
            )
            for expectation in expectations
            for domain in expectation.domains
        )
        return HostingCustomDomainsResult(
            environment=environment,
            project_id=project_id,
            ensured=ensure,
            passed=False,
            domains=domains,
        )

    live_domains_by_site: dict[str, set[str]] = {}
    live_errors_by_site: dict[str, str] = {}
    for site in {expectation.site for expectation in expectations}:
        live_domains, live_error = _fetch_site_custom_domains(
            project_id=project_id,
            site=site,
            access_token=access_token,
            timeout_seconds=timeout_seconds,
        )
        live_domains_by_site[site] = set(live_domains)
        if live_error:
            live_errors_by_site[site] = live_error

    domains = tuple(
        _ensure_domain(
            project_id=project_id,
            target=expectation.target,
            site=expectation.site,
            domain=domain,
            existing_domains=live_domains_by_site.get(expectation.site, set()),
            site_error=live_errors_by_site.get(expectation.site, ""),
            ensure=ensure,
            validate_only=validate_only,
            access_token=access_token,
            timeout_seconds=timeout_seconds,
        )
        for expectation in expectations
        for domain in expectation.domains
    )
    return HostingCustomDomainsResult(
        environment=environment,
        project_id=project_id,
        ensured=ensure,
        passed=all(domain.passed for domain in domains),
        domains=domains,
    )


def _ensure_domain(
    *,
    project_id: str,
    target: str,
    site: str,
    domain: str,
    existing_domains: set[str],
    site_error: str,
    ensure: bool,
    validate_only: bool,
    access_token: str,
    timeout_seconds: float,
) -> HostingCustomDomainResult:
    if site_error:
        return HostingCustomDomainResult(
            target=target,
            site=site,
            domain=domain,
            status="site_error",
            passed=False,
            errors=(site_error,),
        )
    if domain in existing_domains:
        return HostingCustomDomainResult(target=target, site=site, domain=domain, status="exists", passed=True, errors=())
    resource_exists, resource_error = _fetch_custom_domain_resource(
        project_id=project_id,
        site=site,
        domain=domain,
        access_token=access_token,
        timeout_seconds=timeout_seconds,
    )
    if resource_exists:
        return HostingCustomDomainResult(target=target, site=site, domain=domain, status="exists", passed=True, errors=())
    if resource_error:
        return HostingCustomDomainResult(
            target=target,
            site=site,
            domain=domain,
            status="error",
            passed=False,
            errors=(resource_error,),
        )
    if not ensure and not validate_only:
        return HostingCustomDomainResult(
            target=target,
            site=site,
            domain=domain,
            status="missing",
            passed=False,
            errors=(f"Firebase Hosting site {site!r} is missing custom-domain resource {domain!r}.",),
        )

    created, operation, create_error = _create_custom_domain(
        project_id=project_id,
        site=site,
        domain=domain,
        validate_only=validate_only,
        access_token=access_token,
        timeout_seconds=timeout_seconds,
    )
    if created:
        return HostingCustomDomainResult(
            target=target,
            site=site,
            domain=domain,
            status="validated" if validate_only else "create_requested",
            passed=True,
            errors=(),
            operation=operation,
        )
    return HostingCustomDomainResult(
        target=target,
        site=site,
        domain=domain,
        status="error",
        passed=False,
        errors=(create_error,),
    )


def _create_custom_domain(
    *,
    project_id: str,
    site: str,
    domain: str,
    validate_only: bool,
    access_token: str,
    timeout_seconds: float,
) -> tuple[bool, str, str]:
    project = urllib.parse.quote(project_id, safe="")
    site_id = urllib.parse.quote(site, safe="")
    query = urllib.parse.urlencode({"customDomainId": domain, "validateOnly": str(validate_only).lower()})
    url = f"{FIREBASE_HOSTING_API}/projects/{project}/sites/{site_id}/customDomains?{query}"
    request = urllib.request.Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-goog-user-project": project_id,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        if exc.code == 409 or "ALREADY_EXISTS" in detail:
            return True, "", ""
        return False, "", f"Unable to create Firebase Hosting custom domain {domain!r} on {site!r}: HTTP {exc.code}: {detail}"
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return False, "", f"Unable to create Firebase Hosting custom domain {domain!r} on {site!r}: {exc}"
    except json.JSONDecodeError as exc:
        return False, "", f"Firebase Hosting custom-domain create response for {domain!r} was invalid JSON: {exc.msg}."
    if not isinstance(payload, dict):
        return False, "", f"Firebase Hosting custom-domain create response for {domain!r} was not a JSON object."
    return True, str(payload.get("name") or ""), ""


if __name__ == "__main__":
    raise SystemExit(main())
