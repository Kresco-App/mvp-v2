#!/usr/bin/env python3
"""Verify Firebase Hosting targets have the intended public-domain contract."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[1]
FIREBASE_HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1"
TOKEN_ENV = "FIREBASE_HOSTING_ACCESS_TOKEN"
GCLOUD_BIN_ENV = "GCLOUD_BIN"


@dataclass(frozen=True)
class HostingDomainExpectation:
    target: str
    site: str
    scope: str
    domains: tuple[str, ...]


@dataclass(frozen=True)
class HostingDomainEntry:
    target: str
    site: str
    scope: str
    domains: tuple[str, ...]
    passed: bool
    errors: tuple[str, ...]
    live_checked: bool = False
    live_domains: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "site": self.site,
            "scope": self.scope,
            "domains": list(self.domains),
            "passed": self.passed,
            "errors": list(self.errors),
            "live_checked": self.live_checked,
            "live_domains": list(self.live_domains),
        }


@dataclass(frozen=True)
class HostingDomainResult:
    environment: str
    project_id: str
    passed: bool
    entries: tuple[HostingDomainEntry, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "project_id": self.project_id,
            "passed": self.passed,
            "entries": [entry.to_dict() for entry in self.entries],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify Firebase Hosting domain expectations.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--firebaserc", type=Path, default=REPO_ROOT / ".firebaserc")
    parser.add_argument("--live", action="store_true", help="List live Firebase Hosting custom domains.")
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = ""
    access_token_error = ""
    if args.live:
        access_token = os.environ.get(args.access_token_env, "").strip()
        if not access_token:
            access_token, access_token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    result = check_firebase_hosting_domains(
        environment=args.environment,
        firebaserc_path=args.firebaserc,
        live=args.live,
        access_token=access_token,
        access_token_error=access_token_error,
        timeout_seconds=args.timeout_seconds,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for entry in result.entries:
            status = "ok" if entry.passed else "error"
            print(f"{status}: {entry.target} -> {entry.site}")
            for domain in entry.domains:
                print(f"  domain: {domain}")
            if entry.live_checked:
                for domain in entry.live_domains:
                    print(f"  live-domain: {domain}")
            for error in entry.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def check_firebase_hosting_domains(
    *,
    environment: str,
    firebaserc_path: Path,
    live: bool = False,
    access_token: str = "",
    access_token_error: str = "",
    timeout_seconds: float = 20.0,
) -> HostingDomainResult:
    project_id, expectations = _expected_contract(environment)
    firebaserc, read_error = _read_json_object(firebaserc_path)
    if read_error:
        entries = tuple(
            HostingDomainEntry(
                target=expectation.target,
                site=expectation.site,
                scope=expectation.scope,
                domains=expectation.domains,
                passed=False,
                errors=(read_error,),
                live_checked=live,
            )
            for expectation in expectations
        )
        return HostingDomainResult(environment=environment, project_id=project_id, passed=False, entries=entries)

    assert firebaserc is not None
    live_domains_by_site: dict[str, tuple[str, ...]] = {}
    live_errors_by_site: dict[str, str] = {}
    if live:
        if not access_token:
            token_error = access_token_error or f"Firebase Hosting live check requires {TOKEN_ENV} or gcloud auth."
            live_errors_by_site = {expectation.site: token_error for expectation in expectations}
        else:
            for site in {expectation.site for expectation in expectations}:
                live_domains, live_error = _fetch_site_custom_domains(
                    project_id=project_id,
                    site=site,
                    access_token=access_token,
                    timeout_seconds=timeout_seconds,
                )
                live_domain_set = set(live_domains)
                for expectation in expectations:
                    if expectation.site != site:
                        continue
                    for domain in expectation.domains:
                        if domain in live_domain_set:
                            continue
                        domain_exists, domain_error = _fetch_custom_domain_resource(
                            project_id=project_id,
                            site=site,
                            domain=domain,
                            access_token=access_token,
                            timeout_seconds=timeout_seconds,
                        )
                        if domain_exists:
                            live_domain_set.add(domain)
                        elif domain_error and not live_error:
                            live_error = domain_error
                live_domains_by_site[site] = tuple(sorted(live_domain_set))
                if live_error:
                    live_errors_by_site[site] = live_error

    entries = tuple(
        _check_expectation(
            firebaserc,
            project_id,
            expectation,
            live=live,
            live_domains=live_domains_by_site.get(expectation.site, ()),
            live_error=live_errors_by_site.get(expectation.site, ""),
        )
        for expectation in expectations
    )
    return HostingDomainResult(
        environment=environment,
        project_id=project_id,
        passed=all(entry.passed for entry in entries),
        entries=entries,
    )


def _expected_contract(environment: str) -> tuple[str, tuple[HostingDomainExpectation, ...]]:
    if environment == "staging":
        return (
            "kresco-staging",
            (
                HostingDomainExpectation(
                    target="staging-frontend",
                    site="kresco-staging",
                    scope="frontend",
                    domains=(
                        "staging.kresco.ma",
                        "www.staging.kresco.ma",
                        "app.staging.kresco.ma",
                        "admin.staging.kresco.ma",
                        "prof.staging.kresco.ma",
                        "staff.staging.kresco.ma",
                    ),
                ),
                HostingDomainExpectation(
                    target="staging-api",
                    site="kresco-staging-api",
                    scope="api",
                    domains=("api.staging.kresco.ma",),
                ),
            ),
        )
    return (
        "kresco-prod",
        (
            HostingDomainExpectation(
                target="production-frontend",
                site="kresco-prod",
                scope="frontend",
                domains=(
                    "kresco.ma",
                    "www.kresco.ma",
                    "app.kresco.ma",
                    "admin.kresco.ma",
                    "prof.kresco.ma",
                    "staff.kresco.ma",
                ),
            ),
            HostingDomainExpectation(
                target="production-api",
                site="kresco-prod-api",
                scope="api",
                domains=("api.kresco.ma",),
            ),
        ),
    )


def _check_expectation(
    firebaserc: dict[str, Any],
    project_id: str,
    expectation: HostingDomainExpectation,
    *,
    live: bool,
    live_domains: tuple[str, ...],
    live_error: str,
) -> HostingDomainEntry:
    site_ids = (
        firebaserc.get("targets", {})
        .get(project_id, {})
        .get("hosting", {})
        .get(expectation.target)
    )
    errors: list[str] = []
    if not isinstance(site_ids, list) or len(site_ids) != 1 or site_ids[0] != expectation.site:
        errors.append(
            f".firebaserc must map hosting target {expectation.target!r} "
            f"to Firebase Hosting site {expectation.site!r}."
        )
    if live:
        if live_error:
            errors.append(live_error)
        else:
            live_domain_set = set(live_domains)
            for domain in expectation.domains:
                if domain not in live_domain_set:
                    errors.append(f"Firebase Hosting site {expectation.site!r} is missing live custom domain {domain!r}.")
    return HostingDomainEntry(
        target=expectation.target,
        site=expectation.site,
        scope=expectation.scope,
        domains=expectation.domains,
        passed=not errors,
        errors=tuple(errors),
        live_checked=live,
        live_domains=live_domains,
    )


def _fetch_site_custom_domains(
    *,
    project_id: str,
    site: str,
    access_token: str,
    timeout_seconds: float,
) -> tuple[tuple[str, ...], str]:
    domains: set[str] = set()
    next_page_token = ""
    while True:
        url = _custom_domains_url(project_id=project_id, site=site, page_token=next_page_token)
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
            return (), f"Unable to list Firebase Hosting custom domains for {site!r}: HTTP {exc.code}: {detail}"
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            return (), f"Unable to list Firebase Hosting custom domains for {site!r}: {exc}"
        except json.JSONDecodeError as exc:
            return (), f"Firebase Hosting custom-domain response for {site!r} was invalid JSON: {exc.msg}."

        custom_domains = payload.get("customDomains", [])
        if not isinstance(custom_domains, list):
            return (), f"Firebase Hosting custom-domain response for {site!r} did not include a customDomains list."
        for item in custom_domains:
            if isinstance(item, dict) and isinstance(item.get("domainName"), str) and item["domainName"].strip():
                domains.add(item["domainName"].strip().lower())
        next_page_token = str(payload.get("nextPageToken") or "").strip()
        if not next_page_token:
            return tuple(sorted(domains)), ""


def _fetch_custom_domain_resource(
    *,
    project_id: str,
    site: str,
    domain: str,
    access_token: str,
    timeout_seconds: float,
) -> tuple[bool, str]:
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
        if exc.code == 404:
            return False, ""
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        return False, f"Unable to read Firebase Hosting custom domain {domain!r} for {site!r}: HTTP {exc.code}: {detail}"
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return False, f"Unable to read Firebase Hosting custom domain {domain!r} for {site!r}: {exc}"
    except json.JSONDecodeError as exc:
        return False, f"Firebase Hosting custom-domain response for {domain!r} was invalid JSON: {exc.msg}."
    if not isinstance(payload, dict):
        return False, f"Firebase Hosting custom-domain response for {domain!r} was not a JSON object."
    return payload.get("name") == f"projects/{project_id}/sites/{site}/customDomains/{domain}", ""


def _custom_domains_url(*, project_id: str, site: str, page_token: str) -> str:
    project = urllib.parse.quote(project_id, safe="")
    site_id = urllib.parse.quote(site, safe="")
    query = urllib.parse.urlencode({"pageSize": "100", "pageToken": page_token} if page_token else {"pageSize": "100"})
    return f"{FIREBASE_HOSTING_API}/projects/{project}/sites/{site_id}/customDomains?{query}"


def _custom_domain_url(*, project_id: str, site: str, domain: str) -> str:
    project = urllib.parse.quote(project_id, safe="")
    site_id = urllib.parse.quote(site, safe="")
    domain_id = urllib.parse.quote(domain, safe="")
    return f"{FIREBASE_HOSTING_API}/projects/{project}/sites/{site_id}/customDomains/{domain_id}"


def _gcloud_access_token(*, timeout_seconds: float) -> tuple[str, str]:
    errors: list[str] = []
    for executable in _gcloud_candidates():
        try:
            completed = subprocess.run(
                [executable, "auth", "print-access-token"],
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except (FileNotFoundError, OSError, subprocess.TimeoutExpired) as exc:
            errors.append(f"{executable}: {exc}")
            continue
        token = completed.stdout.strip()
        if completed.returncode == 0 and token:
            return token, ""
        detail = completed.stderr.strip()[:1000]
        errors.append(f"{executable}: {detail or 'no access token returned'}")
    return "", f"Unable to load gcloud access token for Firebase Hosting live check: {'; '.join(errors)}"


def _gcloud_candidates() -> tuple[str, ...]:
    configured = os.environ.get(GCLOUD_BIN_ENV, "").strip()
    if configured:
        return (configured,)
    return ("gcloud.cmd", "gcloud") if os.name == "nt" else ("gcloud",)


def _read_json_object(path: Path) -> tuple[dict[str, Any] | None, str]:
    if not path.exists():
        return None, f"{path.name} is missing."
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, f"{path.name} is invalid JSON: {exc.msg}."
    if not isinstance(parsed, dict):
        return None, f"{path.name} must contain a JSON object."
    return parsed, ""


if __name__ == "__main__":
    raise SystemExit(main())
