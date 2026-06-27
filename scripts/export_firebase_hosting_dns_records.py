#!/usr/bin/env python3
"""Export Firebase Hosting DNS records required for Kresco custom domains."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from check_firebase_hosting_domains import (  # noqa: E402
    TOKEN_ENV,
    _custom_domain_url,
    _expected_contract,
    _gcloud_access_token,
)


@dataclass(frozen=True)
class DomainDnsPlan:
    target: str
    site: str
    domain: str
    passed: bool
    host_state: str
    ownership_state: str
    cert_state: str
    records: tuple[dict[str, Any], ...]
    issues: tuple[str, ...]
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "site": self.site,
            "domain": self.domain,
            "passed": self.passed,
            "host_state": self.host_state,
            "ownership_state": self.ownership_state,
            "cert_state": self.cert_state,
            "records": list(self.records),
            "issues": list(self.issues),
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class DnsPlanResult:
    environment: str
    project_id: str
    passed: bool
    domains: tuple[DomainDnsPlan, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "project_id": self.project_id,
            "passed": self.passed,
            "domains": [domain.to_dict() for domain in self.domains],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export Firebase Hosting DNS record plan.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = os.environ.get(args.access_token_env, "").strip()
    token_error = ""
    if not access_token:
        access_token, token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    result = export_firebase_hosting_dns_records(
        environment=args.environment,
        access_token=access_token,
        access_token_error=token_error,
        timeout_seconds=args.timeout_seconds,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for domain in result.domains:
            print(f"{domain.domain}: host={domain.host_state or 'unknown'} ownership={domain.ownership_state or 'unknown'} cert={domain.cert_state or 'unknown'}")
            for record in domain.records:
                print(
                    f"  {record.get('requiredAction', 'ADD')} "
                    f"{record.get('domainName', domain.domain)} "
                    f"{record.get('type', '')} "
                    f"{record.get('rdata', '')}"
                )
            for error in domain.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def export_firebase_hosting_dns_records(
    *,
    environment: str,
    access_token: str,
    access_token_error: str = "",
    timeout_seconds: float = 20.0,
) -> DnsPlanResult:
    project_id, expectations = _expected_contract(environment)
    if not access_token:
        error = access_token_error or f"Firebase Hosting DNS export requires {TOKEN_ENV} or gcloud auth."
        domains = tuple(
            DomainDnsPlan(
                target=expectation.target,
                site=expectation.site,
                domain=domain,
                passed=False,
                host_state="",
                ownership_state="",
                cert_state="",
                records=(),
                issues=(),
                errors=(error,),
            )
            for expectation in expectations
            for domain in expectation.domains
        )
        return DnsPlanResult(environment=environment, project_id=project_id, passed=False, domains=domains)

    domains = tuple(
        _read_dns_plan(
            project_id=project_id,
            target=expectation.target,
            site=expectation.site,
            domain=domain,
            access_token=access_token,
            timeout_seconds=timeout_seconds,
        )
        for expectation in expectations
        for domain in expectation.domains
    )
    return DnsPlanResult(
        environment=environment,
        project_id=project_id,
        passed=all(domain.passed for domain in domains),
        domains=domains,
    )


def _read_dns_plan(
    *,
    project_id: str,
    target: str,
    site: str,
    domain: str,
    access_token: str,
    timeout_seconds: float,
) -> DomainDnsPlan:
    url = _custom_domain_url(project_id=project_id, site=site, domain=domain)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "x-goog-user-project": project_id,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        return _error_plan(target, site, domain, f"HTTP {exc.code}: {detail}")
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return _error_plan(target, site, domain, str(exc))
    except json.JSONDecodeError as exc:
        return _error_plan(target, site, domain, f"invalid JSON response: {exc.msg}")
    if not isinstance(payload, dict):
        return _error_plan(target, site, domain, "custom-domain response was not a JSON object")

    records = tuple(_desired_records(payload))
    issues = tuple(_issue_messages(payload))
    cert = payload.get("cert") if isinstance(payload.get("cert"), dict) else {}
    return DomainDnsPlan(
        target=target,
        site=site,
        domain=domain,
        passed=True,
        host_state=str(payload.get("hostState") or ""),
        ownership_state=str(payload.get("ownershipState") or ""),
        cert_state=str(cert.get("state") or ""),
        records=records,
        issues=issues,
        errors=(),
    )


def _desired_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    updates = payload.get("requiredDnsUpdates")
    if not isinstance(updates, dict):
        return []
    desired = updates.get("desired")
    if not isinstance(desired, list):
        return []
    records: list[dict[str, Any]] = []
    for update in desired:
        if not isinstance(update, dict) or not isinstance(update.get("records"), list):
            continue
        for record in update["records"]:
            if isinstance(record, dict):
                records.append(
                    {
                        "domainName": str(record.get("domainName") or update.get("domainName") or ""),
                        "type": str(record.get("type") or ""),
                        "rdata": str(record.get("rdata") or ""),
                        "requiredAction": str(record.get("requiredAction") or ""),
                    }
                )
    return records


def _issue_messages(payload: dict[str, Any]) -> list[str]:
    issues = payload.get("issues")
    if not isinstance(issues, list):
        return []
    messages: list[str] = []
    for issue in issues:
        if isinstance(issue, dict) and issue.get("message"):
            messages.append(str(issue["message"]))
    return messages


def _error_plan(target: str, site: str, domain: str, error: str) -> DomainDnsPlan:
    return DomainDnsPlan(
        target=target,
        site=site,
        domain=domain,
        passed=False,
        host_state="",
        ownership_state="",
        cert_state="",
        records=(),
        issues=(),
        errors=(error,),
    )


if __name__ == "__main__":
    raise SystemExit(main())
