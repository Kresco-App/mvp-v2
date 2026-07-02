#!/usr/bin/env python3
"""Deploy Firebase Hosting rewrite-only releases from firebase.json."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
import urllib.error
import urllib.parse
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[1]
FIREBASE_HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1"
TOKEN_ENV = "FIREBASE_HOSTING_ACCESS_TOKEN"
GCLOUD_BIN_ENV = "GCLOUD_BIN"


@dataclass(frozen=True)
class HostingRewriteDeployment:
    environment: str
    project_id: str
    target: str
    site: str
    version: str
    release: str
    dry_run: bool
    errors: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "project_id": self.project_id,
            "target": self.target,
            "site": self.site,
            "version": self.version,
            "release": self.release,
            "dry_run": self.dry_run,
            "passed": self.passed,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class HostingRewriteDeploymentResult:
    passed: bool
    deployments: tuple[HostingRewriteDeployment, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "deployments": [deployment.to_dict() for deployment in self.deployments],
        }


RequestJson = Callable[[str, str, str, str, dict[str, Any] | None, float], dict[str, Any]]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Deploy Firebase Hosting rewrite-only versions.")
    parser.add_argument("--environment", choices=("staging", "production", "all"), default="all")
    parser.add_argument("--firebase-json", type=Path, default=REPO_ROOT / "firebase.json")
    parser.add_argument("--firebaserc", type=Path, default=REPO_ROOT / ".firebaserc")
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=30.0)
    parser.add_argument("--message", default="Deploy Firebase Hosting Cloud Run rewrites")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = os.environ.get(args.access_token_env, "").strip()
    access_token_error = ""
    if not args.dry_run and not access_token:
        access_token, access_token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    result = deploy_firebase_hosting_rewrites(
        environment=args.environment,
        firebase_json_path=args.firebase_json,
        firebaserc_path=args.firebaserc,
        access_token=access_token,
        access_token_error=access_token_error,
        timeout_seconds=args.timeout_seconds,
        message=args.message,
        dry_run=args.dry_run,
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for deployment in result.deployments:
            status = "ok" if deployment.passed else "error"
            action = "dry-run" if deployment.dry_run else "deployed"
            print(f"{status}: {deployment.target} -> {deployment.site} ({action})")
            if deployment.version:
                print(f"  version: {deployment.version}")
            if deployment.release:
                print(f"  release: {deployment.release}")
            for error in deployment.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def deploy_firebase_hosting_rewrites(
    *,
    environment: str,
    firebase_json_path: Path,
    firebaserc_path: Path,
    access_token: str,
    access_token_error: str = "",
    timeout_seconds: float = 30.0,
    message: str,
    dry_run: bool = False,
    request_json: RequestJson | None = None,
) -> HostingRewriteDeploymentResult:
    firebase_config, firebase_error = _read_json_object(firebase_json_path)
    firebaserc, firebaserc_error = _read_json_object(firebaserc_path)
    if firebase_error or firebaserc_error:
        errors = tuple(error for error in (firebase_error, firebaserc_error) if error)
        deployment = HostingRewriteDeployment(
            environment=environment,
            project_id="",
            target=environment,
            site="",
            version="",
            release="",
            dry_run=dry_run,
            errors=errors,
        )
        return HostingRewriteDeploymentResult(passed=False, deployments=(deployment,))

    assert firebase_config is not None
    assert firebaserc is not None
    if not dry_run and not access_token:
        deployment = HostingRewriteDeployment(
            environment=environment,
            project_id="",
            target=environment,
            site="",
            version="",
            release="",
            dry_run=dry_run,
            errors=(access_token_error or f"{TOKEN_ENV} or gcloud auth is required.",),
        )
        return HostingRewriteDeploymentResult(passed=False, deployments=(deployment,))

    environments = ("staging", "production") if environment == "all" else (environment,)
    deployments: list[HostingRewriteDeployment] = []
    requester = request_json or _request_json
    for selected_environment in environments:
        project_id = _project_id(selected_environment)
        for target in _targets(selected_environment):
            site, entry_errors = _site_for_target(firebaserc, project_id, target)
            entry = _entry_by_target(firebase_config.get("hosting"), target)
            if entry_errors or not isinstance(entry, dict):
                errors = list(entry_errors)
                if not isinstance(entry, dict):
                    errors.append(f"firebase.json is missing hosting target {target!r}.")
                deployments.append(
                    HostingRewriteDeployment(
                        environment=selected_environment,
                        project_id=project_id,
                        target=target,
                        site=site,
                        version="",
                        release="",
                        dry_run=dry_run,
                        errors=tuple(errors),
                    ),
                )
                continue

            config = _rest_serving_config(entry)
            if dry_run:
                deployments.append(
                    HostingRewriteDeployment(
                        environment=selected_environment,
                        project_id=project_id,
                        target=target,
                        site=site,
                        version="",
                        release="",
                        dry_run=True,
                        errors=(),
                    ),
                )
                continue

            deployments.append(
                _deploy_site(
                    environment=selected_environment,
                    project_id=project_id,
                    target=target,
                    site=site,
                    config=config,
                    access_token=access_token,
                    timeout_seconds=timeout_seconds,
                    message=message,
                    request_json=requester,
                ),
            )

    return HostingRewriteDeploymentResult(
        passed=all(deployment.passed for deployment in deployments),
        deployments=tuple(deployments),
    )


def _deploy_site(
    *,
    environment: str,
    project_id: str,
    target: str,
    site: str,
    config: dict[str, Any],
    access_token: str,
    timeout_seconds: float,
    message: str,
    request_json: RequestJson,
) -> HostingRewriteDeployment:
    version_name = ""
    release_name = ""
    try:
        version = request_json(
            "POST",
            _url(f"/sites/{site}/versions"),
            project_id,
            access_token,
            {
                "config": config,
                "labels": {
                    "environment": environment,
                    "target": target,
                    "deploy-source": "codex-rest",
                },
            },
            timeout_seconds,
        )
        version_name = str(version.get("name") or "")
        if not version_name:
            raise RuntimeError(f"Firebase Hosting did not return a version name for {site!r}.")

        request_json(
            "POST",
            _url(f"/{version_name}:populateFiles"),
            project_id,
            access_token,
            {"files": {}},
            timeout_seconds,
        )
        request_json(
            "PATCH",
            _url(f"/{version_name}", {"updateMask": "status"}),
            project_id,
            access_token,
            {"status": "FINALIZED"},
            timeout_seconds,
        )
        release = request_json(
            "POST",
            _url(f"/sites/{site}/releases", {"versionName": version_name}),
            project_id,
            access_token,
            {"message": message},
            timeout_seconds,
        )
        release_name = str(release.get("name") or "")
    except (RuntimeError, urllib.error.HTTPError, OSError, TimeoutError, urllib.error.URLError, json.JSONDecodeError) as exc:
        return HostingRewriteDeployment(
            environment=environment,
            project_id=project_id,
            target=target,
            site=site,
            version=version_name,
            release=release_name,
            dry_run=False,
            errors=(str(exc),),
        )

    return HostingRewriteDeployment(
        environment=environment,
        project_id=project_id,
        target=target,
        site=site,
        version=version_name,
        release=release_name,
        dry_run=False,
        errors=(),
    )


def _rest_serving_config(entry: dict[str, Any]) -> dict[str, Any]:
    config: dict[str, Any] = {}
    for key in ("headers", "redirects"):
        if isinstance(entry.get(key), list):
            config[key] = [_rest_pattern_object(item) for item in entry[key] if isinstance(item, dict)]
    for key in ("cleanUrls", "trailingSlashBehavior", "appAssociation"):
        if key in entry:
            config[key] = entry[key]
    rewrites = entry.get("rewrites")
    if isinstance(rewrites, list):
        config["rewrites"] = [_rest_pattern_object(item) for item in rewrites if isinstance(item, dict)]
    return config


def _rest_pattern_object(item: dict[str, Any]) -> dict[str, Any]:
    converted = {key: value for key, value in item.items() if key != "source"}
    source = item.get("source")
    if isinstance(source, str):
        converted["glob"] = source
    return converted


def _site_for_target(firebaserc: dict[str, Any], project_id: str, target: str) -> tuple[str, tuple[str, ...]]:
    site_ids = (
        firebaserc.get("targets", {})
        .get(project_id, {})
        .get("hosting", {})
        .get(target)
    )
    if not isinstance(site_ids, list) or len(site_ids) != 1 or not isinstance(site_ids[0], str) or not site_ids[0]:
        return "", (f".firebaserc must map hosting target {target!r} to exactly one Firebase Hosting site.",)
    return site_ids[0], ()


def _entry_by_target(hosting_entries: Any, target: str) -> Any:
    if not isinstance(hosting_entries, list):
        return None
    for entry in hosting_entries:
        if isinstance(entry, dict) and entry.get("target") == target:
            return entry
    return None


def _project_id(environment: str) -> str:
    return "kresco-staging" if environment == "staging" else "kresco-prod"


def _targets(environment: str) -> tuple[str, str]:
    if environment == "staging":
        return ("staging-frontend", "staging-api")
    return ("production-frontend", "production-api")


def _request_json(
    method: str,
    url: str,
    project_id: str,
    access_token: str,
    body: dict[str, Any] | None,
    timeout_seconds: float,
) -> dict[str, Any]:
    payload = json.dumps(body or {}).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=payload,
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
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"HTTP {exc.code} from Firebase Hosting API: {detail}") from exc
    if not response_body:
        return {}
    return json.loads(response_body)


def _url(path: str, query: dict[str, str] | None = None) -> str:
    encoded_path = urllib.parse.quote(path, safe="/:")
    base = f"{FIREBASE_HOSTING_API}{encoded_path}"
    if not query:
        return base
    return f"{base}?{urllib.parse.urlencode(query)}"


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
    return "", f"Unable to load gcloud access token for Firebase Hosting deploy: {'; '.join(errors)}"


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
