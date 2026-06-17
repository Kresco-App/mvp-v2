from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MANIFEST_NAME = "runbook-drill-manifest.json"


@dataclass(frozen=True)
class EvidenceCheck:
    name: str
    passed: bool
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class RunbookDrillResult:
    passed: bool
    errors: tuple[str, ...]
    checks: dict[str, EvidenceCheck]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": list(self.errors),
            "checks": {name: check.to_dict() for name, check in self.checks.items()},
        }


def evaluate_evidence(evidence_dir: Path) -> RunbookDrillResult:
    checks = {
        "cloud_run_rollback": _check_cloud_run_rollback(evidence_dir),
        "runtime_diagnostics": _check_runtime_diagnostics(evidence_dir),
        "cloud_sql_backup_restore": _check_cloud_sql_backup_restore(evidence_dir),
        "incident_checklist": _check_incident_checklist(evidence_dir),
    }
    errors = tuple(error for check in checks.values() for error in check.errors)
    return RunbookDrillResult(passed=not errors, errors=errors, checks=checks)


def write_manifest(evidence_dir: Path, result: RunbookDrillResult) -> Path:
    evidence_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = evidence_dir / MANIFEST_NAME
    manifest_path.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
    return manifest_path


def _check_cloud_run_rollback(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    for service_name in ("backend", "frontend"):
        service = _read_json(evidence_dir / f"{service_name}-cloud-run.json", errors, label=f"{service_name} Cloud Run service")
        revisions = _read_json(
            evidence_dir / f"{service_name}-revisions.json",
            errors,
            label=f"{service_name} Cloud Run revisions",
        )
        if not isinstance(service, dict) or not _is_revision_list(revisions):
            continue

        status = service.get("status", {})
        conditions = status.get("conditions", [])
        if not _has_ready_condition(conditions):
            errors.append(f"{service_name} Cloud Run service must report Ready=True.")
        service_url = str(status.get("url") or "")
        if not service_url.startswith("https://"):
            errors.append(f"{service_name} Cloud Run service must expose an HTTPS status.url.")

        latest_ready = str(status.get("latestReadyRevisionName") or status.get("latestCreatedRevisionName") or "")
        if not latest_ready:
            errors.append(f"{service_name} Cloud Run service must report latestReadyRevisionName.")
            continue

        ready_revisions = [
            str(item.get("metadata", {}).get("name") or "")
            for item in revisions
            if isinstance(item, dict) and _has_ready_condition(item.get("status", {}).get("conditions", []))
        ]
        ready_revisions = [name for name in ready_revisions if name]
        if latest_ready not in ready_revisions:
            errors.append(f"{service_name} latest ready revision must be present in the revision list.")
        if not any(name != latest_ready for name in ready_revisions):
            errors.append(f"{service_name} must have a previous Ready revision available as a rollback candidate.")
    return _result("cloud_run_rollback", errors)


def _check_runtime_diagnostics(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    diagnostics = _read_json(evidence_dir / "runtime-diagnostics.json", errors, label="runtime diagnostics")
    if isinstance(diagnostics, dict):
        if diagnostics.get("passed") is not True:
            errors.append("runtime diagnostics must pass.")
        if diagnostics.get("readiness_status") != "ready":
            errors.append("runtime diagnostics readiness_status must be ready.")
        if diagnostics.get("diagnostics_status") != "ready":
            errors.append("runtime diagnostics diagnostics_status must be ready.")
        runtime_errors = diagnostics.get("errors")
        if isinstance(runtime_errors, list) and runtime_errors:
            errors.append("runtime diagnostics must not contain blocking errors.")
    return _result("runtime_diagnostics", errors)


def _check_cloud_sql_backup_restore(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    instance = _read_json(evidence_dir / "cloud-sql.json", errors, label="Cloud SQL instance")
    backups = _read_json(evidence_dir / "cloud-sql-backups.json", errors, label="Cloud SQL backup runs")
    restore_drill = _read_json(evidence_dir / "restore-drill.json", errors, label="restore drill")

    if isinstance(instance, dict):
        backup_config = instance.get("settings", {}).get("backupConfiguration", {})
        if backup_config.get("enabled") is not True:
            errors.append("Cloud SQL automated backups must be enabled.")
        if not str(backup_config.get("startTime") or "").strip():
            errors.append("Cloud SQL automated backups must declare a startTime.")

    if _is_backup_list(backups):
        if not backups:
            errors.append("Cloud SQL backup evidence must include at least one backup run.")
        if not any(str(item.get("status") or "").upper() == "SUCCESSFUL" for item in backups if isinstance(item, dict)):
            errors.append("Cloud SQL backup evidence must include a successful backup run.")

    if isinstance(restore_drill, dict):
        if restore_drill.get("restore_drill_completed") is not True:
            errors.append("restore drill must be marked completed.")
        artifact_url = str(restore_drill.get("restore_drill_artifact_url") or "")
        if not artifact_url.startswith("https://"):
            errors.append("restore drill artifact URL must be HTTPS.")
        if not str(restore_drill.get("restored_instance") or "").strip():
            errors.append("restore drill must record the restored instance.")
        if not str(restore_drill.get("validated_at") or "").strip():
            errors.append("restore drill must record validated_at.")
    return _result("cloud_sql_backup_restore", errors)


def _check_incident_checklist(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    checklist = _read_json(evidence_dir / "incident-checklist.json", errors, label="incident checklist")
    if isinstance(checklist, dict):
        for key in ("incident_commander", "rollback_owner", "evidence_owner"):
            if not str(checklist.get(key) or "").strip():
                errors.append(f"incident checklist must record {key}.")
        if checklist.get("confirmation") != "STAGING_DARK_CONFIRMED":
            errors.append("incident checklist confirmation must be STAGING_DARK_CONFIRMED.")
        if checklist.get("no_user_traffic_confirmed") is not True:
            errors.append("incident checklist must confirm no user traffic is routed.")
        if checklist.get("traffic_routing_hold_confirmed") is not True:
            errors.append("incident checklist must confirm traffic routing is held.")
        if checklist.get("runbook_path") != "docs/production-runbook.md":
            errors.append("incident checklist must reference docs/production-runbook.md.")
        if checklist.get("manual_operations_path") != "docs/manual-operations.md":
            errors.append("incident checklist must reference docs/manual-operations.md.")
    return _result("incident_checklist", errors)


def _read_json(path: Path, errors: list[str], *, label: str) -> Any:
    if not path.exists():
        errors.append(f"{label} evidence file is missing: {path.name}.")
        return None
    if path.stat().st_size == 0:
        errors.append(f"{label} evidence file is empty: {path.name}.")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{label} evidence file is invalid JSON: {path.name}: {exc.msg}.")
        return None


def _is_revision_list(value: Any) -> bool:
    return isinstance(value, list)


def _is_backup_list(value: Any) -> bool:
    return isinstance(value, list)


def _has_ready_condition(conditions: Any) -> bool:
    return isinstance(conditions, list) and any(
        isinstance(item, dict) and item.get("type") == "Ready" and item.get("status") == "True"
        for item in conditions
    )


def _result(name: str, errors: list[str]) -> EvidenceCheck:
    return EvidenceCheck(name=name, passed=not errors, errors=tuple(errors))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate staging runbook drill evidence artifacts.")
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    result = evaluate_evidence(args.evidence_dir)
    manifest_path = write_manifest(args.evidence_dir, result)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    if result.passed:
        print(f"Staging runbook drill evidence passed; manifest written to {manifest_path}.")
        return 0
    print(f"Staging runbook drill evidence failed; manifest written to {manifest_path}.")
    for error in result.errors:
        print(f"- {error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
