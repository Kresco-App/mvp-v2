#!/usr/bin/env python3
"""Plan which staging deploy jobs should run for a set of changed paths."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import PurePosixPath


@dataclass(frozen=True)
class StagingDeployPlan:
    deploy_backend: bool
    deploy_frontend: bool
    deploy_hosting: bool
    reason: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Plan staging deploy jobs from changed repository paths.")
    parser.add_argument("--event-name", default=os.environ.get("GITHUB_EVENT_NAME", ""))
    parser.add_argument("--output-file", default=os.environ.get("GITHUB_OUTPUT", ""))
    args = parser.parse_args(argv)

    changed_paths = [line.strip() for line in sys.stdin if line.strip()]
    plan = plan_staging_deploy(args.event_name, changed_paths)
    _write_outputs(args.output_file, plan)
    print(
        "Staging deploy plan: "
        f"backend={_bool(plan.deploy_backend)} "
        f"frontend={_bool(plan.deploy_frontend)} "
        f"hosting={_bool(plan.deploy_hosting)} "
        f"reason={plan.reason}"
    )
    return 0


def plan_staging_deploy(event_name: str, changed_paths: list[str]) -> StagingDeployPlan:
    if event_name == "workflow_dispatch":
        return StagingDeployPlan(True, True, True, "manual-dispatch")

    normalized_paths = [_normalize_path(path) for path in changed_paths if _normalize_path(path)]
    if not normalized_paths:
        return StagingDeployPlan(True, True, True, "no-changed-paths-fallback")

    deploy_backend = False
    deploy_frontend = False
    deploy_hosting = False
    reasons: set[str] = set()

    for path in normalized_paths:
        if _matches(path, "backend"):
            deploy_backend = True
            reasons.add("backend")
        elif _matches(path, "frontend"):
            deploy_frontend = True
            reasons.add("frontend")
        elif path in {".firebaserc", "firebase.json"} or _matches(path, "firebase-hosting-public"):
            deploy_hosting = True
            reasons.add("hosting")
        elif _matches(path, ".github/workflows") or _matches(path, "infra/terraform"):
            deploy_backend = True
            deploy_frontend = True
            deploy_hosting = True
            reasons.add("workflow-or-infra")
        elif _matches(path, "scripts"):
            reasons.add("scripts-smoke-only")
        else:
            reasons.add("smoke-only")

    reason = ",".join(sorted(reasons)) if reasons else "smoke-only"
    return StagingDeployPlan(deploy_backend, deploy_frontend, deploy_hosting, reason)


def _normalize_path(path: str) -> str:
    normalized = path.replace("\\", "/").strip("/")
    if not normalized:
        return ""
    return PurePosixPath(normalized).as_posix()


def _matches(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def _write_outputs(output_file: str, plan: StagingDeployPlan) -> None:
    if not output_file:
        return
    with open(output_file, "a", encoding="utf-8") as handle:
        handle.write(f"deploy_backend={_bool(plan.deploy_backend)}\n")
        handle.write(f"deploy_frontend={_bool(plan.deploy_frontend)}\n")
        handle.write(f"deploy_hosting={_bool(plan.deploy_hosting)}\n")
        handle.write(f"reason={plan.reason}\n")


def _bool(value: bool) -> str:
    return "true" if value else "false"


if __name__ == "__main__":
    raise SystemExit(main())
