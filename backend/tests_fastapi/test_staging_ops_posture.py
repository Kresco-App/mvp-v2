from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OPS_POSTURE_PATH = REPO_ROOT / "scripts" / "check_staging_ops_posture.py"


def _load_ops_module():
    spec = importlib.util.spec_from_file_location("check_staging_ops_posture_for_tests", OPS_POSTURE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeAwsClient:
    provider_name = "fake-aws"

    function_arn = "arn:aws:lambda:eu-west-3:123456789012:function:kresco-staging"

    def describe_db_proxy(self, proxy_name: str) -> dict[str, Any]:
        return {
            "DBProxies": [
                {
                    "DBProxyName": proxy_name,
                    "Endpoint": "kresco-staging-proxy.proxy-c123.eu-west-3.rds.amazonaws.com",
                    "RequireTLS": True,
                }
            ]
        }

    def describe_db_proxy_targets(self, proxy_name: str) -> dict[str, Any]:
        del proxy_name
        return {
            "Targets": [
                {
                    "Type": "RDS_INSTANCE",
                    "Role": "READ_WRITE",
                    "TargetHealth": {"State": "AVAILABLE"},
                }
            ]
        }

    def get_lambda_configuration(self, function_name: str) -> dict[str, Any]:
        return {
            "FunctionName": function_name,
            "FunctionArn": self.function_arn,
            "MemorySize": 1024,
            "Timeout": 45,
            "State": "Active",
            "LastUpdateStatus": "Successful",
        }

    def describe_rule(self, rule_name: str) -> dict[str, Any]:
        return {
            "Name": rule_name,
            "State": "ENABLED",
            "ScheduleExpression": "rate(1 minute)",
        }

    def list_targets_by_rule(self, rule_name: str) -> dict[str, Any]:
        del rule_name
        return {"Targets": [{"Arn": self.function_arn}]}


class DriftedAwsClient(FakeAwsClient):
    def describe_db_proxy(self, proxy_name: str) -> dict[str, Any]:
        payload = super().describe_db_proxy(proxy_name)
        payload["DBProxies"][0]["RequireTLS"] = False
        return payload

    def describe_db_proxy_targets(self, proxy_name: str) -> dict[str, Any]:
        del proxy_name
        return {
            "Targets": [
                {
                    "Type": "RDS_INSTANCE",
                    "Role": "READ_WRITE",
                    "TargetHealth": {"State": "UNAVAILABLE", "Reason": "CONNECTION_FAILED"},
                }
            ]
        }

    def get_lambda_configuration(self, function_name: str) -> dict[str, Any]:
        payload = super().get_lambda_configuration(function_name)
        payload["MemorySize"] = 512
        payload["Timeout"] = 30
        return payload

    def describe_rule(self, rule_name: str) -> dict[str, Any]:
        return {
            "Name": rule_name,
            "State": "DISABLED",
            "ScheduleExpression": "",
        }

    def list_targets_by_rule(self, rule_name: str) -> dict[str, Any]:
        del rule_name
        return {"Targets": []}


def _write_drill_evidence(path: Path, artifact: str = "artifacts/staging-drill.json") -> Path:
    payload = {
        "environment": "staging",
        "executed_at": "2026-06-05T12:00:00Z",
        "rollback_drill": {"status": "passed", "artifact": artifact, "operator": "ops"},
        "migration_rollback_drill": {"status": "passed", "artifact": artifact, "operator": "ops"},
        "backup_restore_drill": {"status": "passed", "artifact": artifact, "operator": "ops"},
        "incident_response_drill": {"status": "passed", "artifact": artifact, "operator": "ops"},
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_ops_posture_accepts_complete_mocked_aws_and_drill_evidence(tmp_path):
    ops = _load_ops_module()
    drill_path = _write_drill_evidence(tmp_path / "staging-drills.json")

    result = ops.collect_ops_posture(
        rds_proxy_name="kresco-staging-proxy",
        lambda_function_name="kresco-staging",
        keep_warm_rule_name="kresco-staging-keep-warm",
        worker_schedule_rule_name="kresco-staging-outbox",
        drill_evidence_file=drill_path,
        aws_client=FakeAwsClient(),
    )

    assert result.passed is True
    assert result.errors == ()
    assert {check.name for check in result.checks} == {
        "rds_proxy_tls_and_target_health",
        "lambda_runtime_configuration",
        "lambda_keep_warm_schedule",
        "realtime_outbox_worker_schedule",
        "staging_runbook_drills",
    }


def test_ops_posture_fails_closed_for_missing_or_unhealthy_staging_evidence(tmp_path):
    ops = _load_ops_module()
    missing_drill_path = tmp_path / "missing-drills.json"

    result = ops.collect_ops_posture(
        rds_proxy_name="kresco-staging-proxy",
        lambda_function_name="kresco-staging",
        keep_warm_rule_name="kresco-staging-keep-warm",
        worker_schedule_rule_name="kresco-staging-outbox",
        drill_evidence_file=missing_drill_path,
        aws_client=DriftedAwsClient(),
    )

    assert result.passed is False
    assert "RDS Proxy RequireTLS must be true." in result.errors
    assert any("TargetHealth.State=AVAILABLE" in error for error in result.errors)
    assert "Lambda MemorySize must be at least 1024 MB." in result.errors
    assert "Lambda Timeout must be at least 45 seconds." in result.errors
    assert "EventBridge rule kresco-staging-keep-warm must be ENABLED." in result.errors
    assert any("Rollback/backup drill evidence file does not exist" in error for error in result.errors)


def test_ops_posture_requires_runbook_drill_artifacts():
    ops = _load_ops_module()

    result = ops.validate_drill_evidence(
        {
            "environment": "staging",
            "executed_at": "2026-06-05T12:00:00Z",
            "rollback_drill": {"status": "passed"},
            "migration_rollback_drill": {"status": "skipped", "artifact": "migration.md"},
            "backup_restore_drill": {"status": "passed", "artifact": "backup.md"},
        }
    )

    assert result.passed is False
    assert "rollback drill must include artifact, evidence_file, or evidence_url." in result.errors
    assert any("migration rollback drill status must be one of" in error for error in result.errors)
    assert "incident response drill evidence must be an object at incident_response_drill." in result.errors


def test_ops_posture_json_redacts_account_ids_and_evidence_url_tokens(tmp_path):
    ops = _load_ops_module()
    drill_path = _write_drill_evidence(
        tmp_path / "staging-drills.json",
        artifact="https://evidence.example/staging-drill?token=secret-value",
    )

    result = ops.collect_ops_posture(
        rds_proxy_name="kresco-staging-proxy",
        lambda_function_name="kresco-staging",
        keep_warm_rule_name="kresco-staging-keep-warm",
        worker_schedule_rule_name="kresco-staging-outbox",
        drill_evidence_file=drill_path,
        aws_client=FakeAwsClient(),
    )
    rendered = json.dumps(result.to_dict(), sort_keys=True)

    assert "123456789012" not in rendered
    assert "secret-value" not in rendered
    assert "[account-id]" in rendered
    assert "[redacted]" in rendered

