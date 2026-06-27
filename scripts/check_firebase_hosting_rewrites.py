#!/usr/bin/env python3
"""Verify Kresco Firebase Hosting rewrites point to the intended Cloud Run services."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGION = "europe-southwest1"


@dataclass(frozen=True)
class HostingRewriteCheck:
    name: str
    target: str
    scope: str
    passed: bool
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "scope": self.scope,
            "passed": self.passed,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class HostingRewriteResult:
    passed: bool
    checks: tuple[HostingRewriteCheck, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "checks": [check.to_dict() for check in self.checks],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify Firebase Hosting Cloud Run rewrites.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--firebase-json", type=Path, default=REPO_ROOT / "firebase.json")
    parser.add_argument("--firebaserc", type=Path, default=REPO_ROOT / ".firebaserc")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    result = check_firebase_hosting_rewrites(
        environment=args.environment,
        firebase_json_path=args.firebase_json,
        firebaserc_path=args.firebaserc,
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for check in result.checks:
            status = "ok" if check.passed else "error"
            print(f"{status}: {check.target}")
            for error in check.errors:
                print(f"  error: {error}", file=sys.stderr)

    return 0 if result.passed else 1


def check_firebase_hosting_rewrites(
    *,
    environment: str,
    firebase_json_path: Path,
    firebaserc_path: Path,
) -> HostingRewriteResult:
    errors: list[HostingRewriteCheck] = []
    firebase_config, firebase_error = _read_json_object(firebase_json_path)
    firebaserc, firebaserc_error = _read_json_object(firebaserc_path)
    if firebase_error or firebaserc_error:
        return HostingRewriteResult(
            passed=False,
            checks=(
                HostingRewriteCheck(
                    name=f"files:{environment}",
                    target=environment,
                    scope="files",
                    passed=False,
                    errors=tuple(error for error in (firebase_error, firebaserc_error) if error),
                ),
            ),
        )

    assert firebase_config is not None
    assert firebaserc is not None
    project_id, frontend_target, api_target, frontend_service, backend_service = _expected_values(environment)
    hosting_entries = firebase_config.get("hosting")
    if not isinstance(hosting_entries, list):
        return HostingRewriteResult(
            passed=False,
            checks=(
                HostingRewriteCheck(
                    name=f"firebase-json:{environment}",
                    target=environment,
                    scope="firebase_json",
                    passed=False,
                    errors=("firebase.json hosting must be a list.",),
                ),
            ),
        )

    checks = (
        _check_target_mapping(firebaserc, project_id, frontend_target),
        _check_target_mapping(firebaserc, project_id, api_target),
        _check_frontend_hosting_entry(hosting_entries, frontend_target, frontend_service, backend_service),
        _check_api_hosting_entry(hosting_entries, api_target, backend_service),
    )
    return HostingRewriteResult(
        passed=all(check.passed for check in checks),
        checks=checks,
    )


def _expected_values(environment: str) -> tuple[str, str, str, str, str]:
    if environment == "staging":
        return (
            "kresco-staging",
            "staging-frontend",
            "staging-api",
            "kresco-frontend-staging",
            "kresco-backend-staging",
        )
    return (
        "kresco-prod",
        "production-frontend",
        "production-api",
        "kresco-frontend-prod",
        "kresco-backend-prod",
    )


def _check_target_mapping(firebaserc: dict[str, Any], project_id: str, target: str) -> HostingRewriteCheck:
    site_ids = (
        firebaserc.get("targets", {})
        .get(project_id, {})
        .get("hosting", {})
        .get(target)
    )
    errors: list[str] = []
    if not isinstance(site_ids, list) or len(site_ids) != 1 or not isinstance(site_ids[0], str) or not site_ids[0]:
        errors.append(f".firebaserc must map hosting target {target!r} to exactly one Firebase Hosting site.")
    return HostingRewriteCheck(
        name=f"target-mapping:{target}",
        target=target,
        scope="target_mapping",
        passed=not errors,
        errors=tuple(errors),
    )


def _check_frontend_hosting_entry(
    hosting_entries: list[Any],
    target: str,
    frontend_service: str,
    backend_service: str,
) -> HostingRewriteCheck:
    entry = _entry_by_target(hosting_entries, target)
    errors = _common_entry_errors(entry, target)
    if isinstance(entry, dict):
        rewrites = entry.get("rewrites")
        if not isinstance(rewrites, list):
            errors.append(f"{target} rewrites must be a list.")
        else:
            _expect_run_rewrite(errors, rewrites, "/api/**", backend_service)
            _expect_run_rewrite(errors, rewrites, "/media/**", backend_service)
            _expect_run_rewrite(errors, rewrites, "**", frontend_service)
    return HostingRewriteCheck(
        name=f"hosting-entry:{target}",
        target=target,
        scope="hosting_entry",
        passed=not errors,
        errors=tuple(errors),
    )


def _check_api_hosting_entry(hosting_entries: list[Any], target: str, backend_service: str) -> HostingRewriteCheck:
    entry = _entry_by_target(hosting_entries, target)
    errors = _common_entry_errors(entry, target)
    if isinstance(entry, dict):
        rewrites = entry.get("rewrites")
        if rewrites != [{"source": "**", "run": {"serviceId": backend_service, "region": DEFAULT_REGION}}]:
            errors.append(f"{target} must rewrite every path to {backend_service}.")
    return HostingRewriteCheck(
        name=f"hosting-entry:{target}",
        target=target,
        scope="hosting_entry",
        passed=not errors,
        errors=tuple(errors),
    )


def _common_entry_errors(entry: Any, target: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(entry, dict):
        return [f"firebase.json is missing hosting target {target!r}."]
    if entry.get("public") != "firebase-hosting-public":
        errors.append(f"{target} public directory must be firebase-hosting-public.")
    return errors


def _expect_run_rewrite(errors: list[str], rewrites: list[Any], source: str, service_id: str) -> None:
    expected = {"source": source, "run": {"serviceId": service_id, "region": DEFAULT_REGION}}
    if expected not in rewrites:
        errors.append(f"missing Firebase Hosting rewrite {source} -> {service_id}.")


def _entry_by_target(hosting_entries: list[Any], target: str) -> Any:
    for entry in hosting_entries:
        if isinstance(entry, dict) and entry.get("target") == target:
            return entry
    return None


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
