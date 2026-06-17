from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER_PATH = REPO_ROOT / "scripts" / "check_staging_runbook_drill_evidence.py"


def _load_checker_module():
    spec = importlib.util.spec_from_file_location("check_staging_runbook_drill_evidence_for_tests", CHECKER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_complete_evidence(evidence_dir: Path) -> None:
    service = {
        "status": {
            "url": "https://service.example.com",
            "latestReadyRevisionName": "service-00002",
            "conditions": [{"type": "Ready", "status": "True"}],
        },
    }
    revisions = [
        {"metadata": {"name": "service-00002"}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}},
        {"metadata": {"name": "service-00001"}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}},
    ]
    for name in ("backend", "frontend"):
        _write_json(evidence_dir / f"{name}-cloud-run.json", service)
        _write_json(evidence_dir / f"{name}-revisions.json", revisions)
    _write_json(
        evidence_dir / "cloud-sql.json",
        {"settings": {"backupConfiguration": {"enabled": True, "startTime": "03:00"}}},
    )
    _write_json(evidence_dir / "cloud-sql-backups.json", [{"status": "SUCCESSFUL"}])
    _write_json(
        evidence_dir / "runtime-diagnostics.json",
        {
            "passed": True,
            "readiness_status": "ready",
            "diagnostics_status": "ready",
            "errors": [],
        },
    )
    _write_json(
        evidence_dir / "restore-drill.json",
        {
            "restore_drill_completed": True,
            "restore_drill_artifact_url": "https://example.com/restore-drill",
            "restored_instance": "kresco-staging-postgres-restore-drill",
            "validated_at": "2026-06-17T22:00:00Z",
        },
    )
    _write_json(
        evidence_dir / "incident-checklist.json",
        {
            "runbook_path": "docs/production-runbook.md",
            "manual_operations_path": "docs/manual-operations.md",
            "incident_commander": "ops@example.com",
            "rollback_owner": "backend@example.com",
            "evidence_owner": "release@example.com",
            "confirmation": "STAGING_DARK_CONFIRMED",
            "no_user_traffic_confirmed": True,
            "traffic_routing_hold_confirmed": True,
        },
    )


def test_runbook_drill_checker_accepts_complete_gcp_evidence(tmp_path):
    checker = _load_checker_module()
    _write_complete_evidence(tmp_path)

    result = checker.evaluate_evidence(tmp_path)
    manifest_path = checker.write_manifest(tmp_path, result)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert result.passed is True
    assert result.errors == ()
    assert manifest["passed"] is True
    assert all(check["passed"] for check in manifest["checks"].values())


def test_runbook_drill_checker_fails_closed_without_restore_drill(tmp_path):
    checker = _load_checker_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "restore-drill.json",
        {
            "restore_drill_completed": False,
            "restore_drill_artifact_url": "",
            "restored_instance": "",
            "validated_at": "",
        },
    )

    exit_code = checker.main([str(tmp_path)])
    manifest = json.loads((tmp_path / "runbook-drill-manifest.json").read_text(encoding="utf-8"))

    assert exit_code == 1
    assert manifest["passed"] is False
    assert manifest["checks"]["cloud_sql_backup_restore"]["passed"] is False
    assert any("restore drill must be marked completed" in error for error in manifest["errors"])


def test_runbook_drill_checker_requires_previous_ready_revision(tmp_path):
    checker = _load_checker_module()
    _write_complete_evidence(tmp_path)
    _write_json(
        tmp_path / "backend-revisions.json",
        [
            {
                "metadata": {"name": "service-00002"},
                "status": {"conditions": [{"type": "Ready", "status": "True"}]},
            },
        ],
    )

    result = checker.evaluate_evidence(tmp_path)

    assert result.passed is False
    assert "backend must have a previous Ready revision available as a rollback candidate." in result.errors
