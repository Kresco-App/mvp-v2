from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlparse, urlunparse

MIN_LAMBDA_MEMORY_MB = 1024
MIN_LAMBDA_TIMEOUT_SECONDS = 45
PASSING_DRILL_STATUSES = {"passed", "complete", "completed", "verified"}
REQUIRED_DRILLS = {
    "rollback_drill": "rollback drill",
    "migration_rollback_drill": "migration rollback drill",
    "backup_restore_drill": "backup/restore drill",
    "incident_response_drill": "incident response drill",
}
SENSITIVE_KEY_PARTS = (
    "authorization",
    "cookie",
    "credential",
    "password",
    "secret",
    "session",
    "token",
    "api_key",
    "apikey",
)


class AwsClient(Protocol):
    provider_name: str

    def describe_db_proxy(self, proxy_name: str) -> dict[str, Any]:
        ...

    def describe_db_proxy_targets(self, proxy_name: str) -> dict[str, Any]:
        ...

    def get_lambda_configuration(self, function_name: str) -> dict[str, Any]:
        ...

    def describe_rule(self, rule_name: str) -> dict[str, Any]:
        ...

    def list_targets_by_rule(self, rule_name: str) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class EvidenceCheck:
    name: str
    passed: bool
    errors: tuple[str, ...]
    evidence: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return _redact(
            {
                "name": self.name,
                "passed": self.passed,
                "errors": list(self.errors),
                "evidence": self.evidence,
            }
        )


@dataclass(frozen=True)
class OpsPostureResult:
    passed: bool
    aws_provider: str | None
    errors: tuple[str, ...]
    checks: tuple[EvidenceCheck, ...]

    def to_dict(self) -> dict[str, Any]:
        return _redact(
            {
                "passed": self.passed,
                "aws_provider": self.aws_provider,
                "errors": list(self.errors),
                "checks": [check.to_dict() for check in self.checks],
            }
        )


class Boto3AwsClient:
    provider_name = "boto3"

    def __init__(self, *, region: str = "") -> None:
        import boto3  # type: ignore[import-not-found]

        session = boto3.session.Session(region_name=region or None)
        self._rds = session.client("rds")
        self._lambda = session.client("lambda")
        self._events = session.client("events")

    def describe_db_proxy(self, proxy_name: str) -> dict[str, Any]:
        return self._rds.describe_db_proxies(DBProxyName=proxy_name)

    def describe_db_proxy_targets(self, proxy_name: str) -> dict[str, Any]:
        return self._rds.describe_db_proxy_targets(DBProxyName=proxy_name)

    def get_lambda_configuration(self, function_name: str) -> dict[str, Any]:
        return self._lambda.get_function_configuration(FunctionName=function_name)

    def describe_rule(self, rule_name: str) -> dict[str, Any]:
        return self._events.describe_rule(Name=rule_name)

    def list_targets_by_rule(self, rule_name: str) -> dict[str, Any]:
        return self._events.list_targets_by_rule(Rule=rule_name)


class CliAwsClient:
    provider_name = "aws-cli"

    def __init__(self, *, region: str = "") -> None:
        self._region = region

    def describe_db_proxy(self, proxy_name: str) -> dict[str, Any]:
        return self._aws_json("rds", "describe-db-proxies", "--db-proxy-name", proxy_name)

    def describe_db_proxy_targets(self, proxy_name: str) -> dict[str, Any]:
        return self._aws_json("rds", "describe-db-proxy-targets", "--db-proxy-name", proxy_name)

    def get_lambda_configuration(self, function_name: str) -> dict[str, Any]:
        return self._aws_json("lambda", "get-function-configuration", "--function-name", function_name)

    def describe_rule(self, rule_name: str) -> dict[str, Any]:
        return self._aws_json("events", "describe-rule", "--name", rule_name)

    def list_targets_by_rule(self, rule_name: str) -> dict[str, Any]:
        return self._aws_json("events", "list-targets-by-rule", "--rule", rule_name)

    def _aws_json(self, service: str, operation: str, *args: str) -> dict[str, Any]:
        command = ["aws", service, operation, *args, "--output", "json"]
        if self._region:
            command.extend(["--region", self._region])
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        if completed.returncode != 0:
            detail = _redact_text(completed.stderr.strip() or completed.stdout.strip())
            raise RuntimeError(f"aws {service} {operation} failed with exit {completed.returncode}: {detail}")
        parsed = json.loads(completed.stdout)
        if not isinstance(parsed, dict):
            raise RuntimeError(f"aws {service} {operation} did not return a JSON object.")
        return parsed


def collect_ops_posture(
    *,
    rds_proxy_name: str,
    lambda_function_name: str,
    keep_warm_rule_name: str,
    worker_schedule_rule_name: str,
    drill_evidence_file: Path | None,
    region: str = "",
    min_lambda_memory_mb: int = MIN_LAMBDA_MEMORY_MB,
    min_lambda_timeout_seconds: int = MIN_LAMBDA_TIMEOUT_SECONDS,
    aws_provider: str = "auto",
    aws_client: AwsClient | None = None,
) -> OpsPostureResult:
    checks: list[EvidenceCheck] = []
    selected_provider_name = aws_client.provider_name if aws_client is not None else None

    missing_aws_inputs = [
        message
        for value, message in (
            (rds_proxy_name, "RDS proxy name is required."),
            (lambda_function_name, "Lambda function name is required."),
            (keep_warm_rule_name, "Lambda keep-warm EventBridge rule name is required."),
            (worker_schedule_rule_name, "Worker schedule EventBridge rule name is required."),
        )
        if not value.strip()
    ]
    if missing_aws_inputs:
        checks.append(EvidenceCheck("aws_inputs", False, tuple(missing_aws_inputs), {}))
    else:
        try:
            client = aws_client or select_aws_client(aws_provider, region=region)
            selected_provider_name = client.provider_name
            checks.extend(
                collect_aws_checks(
                    client,
                    rds_proxy_name=rds_proxy_name.strip(),
                    lambda_function_name=lambda_function_name.strip(),
                    keep_warm_rule_name=keep_warm_rule_name.strip(),
                    worker_schedule_rule_name=worker_schedule_rule_name.strip(),
                    min_lambda_memory_mb=min_lambda_memory_mb,
                    min_lambda_timeout_seconds=min_lambda_timeout_seconds,
                )
            )
        except Exception as exc:
            checks.append(
                EvidenceCheck(
                    "aws_collection",
                    False,
                    (f"AWS evidence collection failed: {type(exc).__name__}: {_redact_text(str(exc))}",),
                    {"requested_provider": aws_provider, "region": region},
                )
            )

    checks.append(validate_drill_evidence_file(drill_evidence_file))

    errors = tuple(error for check in checks for error in check.errors)
    return OpsPostureResult(
        passed=not errors,
        aws_provider=selected_provider_name,
        errors=errors,
        checks=tuple(checks),
    )


def select_aws_client(provider: str, *, region: str = "") -> AwsClient:
    normalized = provider.strip().lower() or "auto"
    if normalized not in {"auto", "boto3", "cli", "aws-cli"}:
        raise ValueError("--aws-provider must be one of: auto, boto3, cli.")

    boto3_error: Exception | None = None
    if normalized in {"auto", "boto3"}:
        try:
            return Boto3AwsClient(region=region)
        except ImportError as exc:
            boto3_error = exc
            if normalized == "boto3":
                raise RuntimeError("boto3 is not installed.") from exc

    if normalized in {"auto", "cli", "aws-cli"}:
        if shutil.which("aws"):
            return CliAwsClient(region=region)
        if normalized in {"cli", "aws-cli"}:
            raise RuntimeError("AWS CLI executable was not found on PATH.")

    if boto3_error is not None:
        raise RuntimeError("Neither boto3 nor the AWS CLI is available for AWS evidence collection.") from boto3_error
    raise RuntimeError("No AWS evidence provider is available.")


def collect_aws_checks(
    client: AwsClient,
    *,
    rds_proxy_name: str,
    lambda_function_name: str,
    keep_warm_rule_name: str,
    worker_schedule_rule_name: str,
    min_lambda_memory_mb: int,
    min_lambda_timeout_seconds: int,
) -> tuple[EvidenceCheck, ...]:
    checks: list[EvidenceCheck] = []
    proxy_payload = client.describe_db_proxy(rds_proxy_name)
    target_payload = client.describe_db_proxy_targets(rds_proxy_name)
    checks.append(
        validate_rds_proxy(
            proxy_payload,
            target_payload,
            expected_proxy_name=rds_proxy_name,
            provider=client.provider_name,
        )
    )

    lambda_payload = client.get_lambda_configuration(lambda_function_name)
    checks.append(
        validate_lambda_configuration(
            lambda_payload,
            expected_function_name=lambda_function_name,
            min_memory_mb=min_lambda_memory_mb,
            min_timeout_seconds=min_lambda_timeout_seconds,
            provider=client.provider_name,
        )
    )

    lambda_arn = str(lambda_payload.get("FunctionArn", ""))
    for label, rule_name in (
        ("lambda_keep_warm_schedule", keep_warm_rule_name),
        ("realtime_outbox_worker_schedule", worker_schedule_rule_name),
    ):
        rule_payload = client.describe_rule(rule_name)
        targets_payload = client.list_targets_by_rule(rule_name)
        checks.append(
            validate_eventbridge_rule(
                rule_payload,
                targets_payload,
                expected_rule_name=rule_name,
                expected_lambda_name=lambda_function_name,
                expected_lambda_arn=lambda_arn,
                check_name=label,
                provider=client.provider_name,
            )
        )

    return tuple(checks)


def validate_rds_proxy(
    proxy_payload: dict[str, Any],
    targets_payload: dict[str, Any],
    *,
    expected_proxy_name: str,
    provider: str = "provided",
) -> EvidenceCheck:
    errors: list[str] = []
    proxies = proxy_payload.get("DBProxies")
    proxy = _first_matching(proxies, "DBProxyName", expected_proxy_name)
    if proxy is None:
        errors.append("RDS Proxy describe-db-proxies returned no matching proxy.")
        proxy = {}

    if proxy.get("RequireTLS") is not True:
        errors.append("RDS Proxy RequireTLS must be true.")

    targets = targets_payload.get("Targets")
    if not isinstance(targets, list) or not targets:
        errors.append("RDS Proxy target health evidence must include at least one target.")
        targets = []

    target_evidence = []
    unavailable_states = []
    for target in targets:
        if not isinstance(target, dict):
            unavailable_states.append("<invalid target>")
            continue
        target_health = target.get("TargetHealth") if isinstance(target.get("TargetHealth"), dict) else {}
        state = target_health.get("State")
        target_evidence.append(
            {
                "type": target.get("Type"),
                "role": target.get("Role"),
                "target_health_state": state,
                "target_health_reason": target_health.get("Reason"),
            }
        )
        if state != "AVAILABLE":
            unavailable_states.append(str(state or "missing"))
    if unavailable_states:
        errors.append(
            "Every RDS Proxy target must report TargetHealth.State=AVAILABLE "
            f"(current: {', '.join(unavailable_states)})."
        )

    return EvidenceCheck(
        "rds_proxy_tls_and_target_health",
        not errors,
        tuple(errors),
        {
            "provider": provider,
            "proxy_name": proxy.get("DBProxyName") or expected_proxy_name,
            "endpoint": proxy.get("Endpoint"),
            "require_tls": proxy.get("RequireTLS"),
            "target_count": len(target_evidence),
            "targets": target_evidence,
        },
    )


def validate_lambda_configuration(
    payload: dict[str, Any],
    *,
    expected_function_name: str,
    min_memory_mb: int,
    min_timeout_seconds: int,
    provider: str = "provided",
) -> EvidenceCheck:
    errors: list[str] = []
    memory_size = _int_value(payload, "MemorySize")
    timeout_seconds = _int_value(payload, "Timeout")

    if not payload:
        errors.append("Lambda configuration evidence is missing.")
    if memory_size < min_memory_mb:
        errors.append(f"Lambda MemorySize must be at least {min_memory_mb} MB.")
    if timeout_seconds < min_timeout_seconds:
        errors.append(f"Lambda Timeout must be at least {min_timeout_seconds} seconds.")
    if payload.get("State") not in {None, "Active"}:
        errors.append(f"Lambda State must be Active (current: {payload.get('State')!r}).")
    if payload.get("LastUpdateStatus") not in {None, "Successful"}:
        errors.append(f"Lambda LastUpdateStatus must be Successful (current: {payload.get('LastUpdateStatus')!r}).")

    return EvidenceCheck(
        "lambda_runtime_configuration",
        not errors,
        tuple(errors),
        {
            "provider": provider,
            "function_name": payload.get("FunctionName") or expected_function_name,
            "function_arn": payload.get("FunctionArn"),
            "memory_size": memory_size if memory_size >= 0 else None,
            "timeout_seconds": timeout_seconds if timeout_seconds >= 0 else None,
            "state": payload.get("State"),
            "last_update_status": payload.get("LastUpdateStatus"),
        },
    )


def validate_eventbridge_rule(
    rule_payload: dict[str, Any],
    targets_payload: dict[str, Any],
    *,
    expected_rule_name: str,
    expected_lambda_name: str,
    expected_lambda_arn: str,
    check_name: str,
    provider: str = "provided",
) -> EvidenceCheck:
    errors: list[str] = []
    schedule_expression = rule_payload.get("ScheduleExpression")
    if not rule_payload:
        errors.append("EventBridge rule evidence is missing.")
    if rule_payload.get("State") != "ENABLED":
        errors.append(f"EventBridge rule {expected_rule_name} must be ENABLED.")
    if not isinstance(schedule_expression, str) or not schedule_expression.strip():
        errors.append(f"EventBridge rule {expected_rule_name} must include a ScheduleExpression.")

    targets = targets_payload.get("Targets")
    if not isinstance(targets, list) or not targets:
        errors.append(f"EventBridge rule {expected_rule_name} must include at least one Lambda target.")
        targets = []
    target_arns = [str(target.get("Arn", "")) for target in targets if isinstance(target, dict)]
    if target_arns and not any(
        _target_matches_lambda(arn, expected_lambda_name=expected_lambda_name, expected_lambda_arn=expected_lambda_arn)
        for arn in target_arns
    ):
        errors.append(f"EventBridge rule {expected_rule_name} must target Lambda {expected_lambda_name}.")

    return EvidenceCheck(
        check_name,
        not errors,
        tuple(errors),
        {
            "provider": provider,
            "rule_name": rule_payload.get("Name") or expected_rule_name,
            "state": rule_payload.get("State"),
            "schedule_expression": schedule_expression,
            "target_count": len(target_arns),
            "target_arns": target_arns,
        },
    )


def validate_drill_evidence_file(path: Path | None) -> EvidenceCheck:
    if path is None:
        return EvidenceCheck(
            "staging_runbook_drills",
            False,
            ("Rollback/backup drill evidence file is required.",),
            {},
        )
    if not path.exists():
        return EvidenceCheck(
            "staging_runbook_drills",
            False,
            (f"Rollback/backup drill evidence file does not exist: {path}",),
            {"path": str(path)},
        )

    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return EvidenceCheck(
            "staging_runbook_drills",
            False,
            (f"Rollback/backup drill evidence file is not valid JSON: {type(exc).__name__}: {exc}",),
            {"path": str(path)},
        )
    return validate_drill_evidence(parsed, source_path=path)


def validate_drill_evidence(payload: Any, *, source_path: Path | None = None) -> EvidenceCheck:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return EvidenceCheck(
            "staging_runbook_drills",
            False,
            ("Rollback/backup drill evidence JSON must be an object.",),
            {"path": str(source_path) if source_path else None},
        )

    environment = str(payload.get("environment", "")).strip().lower()
    if environment != "staging":
        errors.append("Rollback/backup drill evidence must declare environment=staging.")
    if not str(payload.get("executed_at") or payload.get("completed_at") or "").strip():
        errors.append("Rollback/backup drill evidence must include executed_at or completed_at.")

    drill_evidence: dict[str, Any] = {}
    for key, label in REQUIRED_DRILLS.items():
        drill = payload.get(key)
        if not isinstance(drill, dict):
            errors.append(f"{label} evidence must be an object at {key}.")
            drill_evidence[key] = None
            continue
        status = str(drill.get("status", "")).strip().lower()
        if status not in PASSING_DRILL_STATUSES:
            errors.append(f"{label} status must be one of {sorted(PASSING_DRILL_STATUSES)}.")
        artifact = str(drill.get("artifact") or drill.get("evidence_file") or drill.get("evidence_url") or "").strip()
        if not artifact:
            errors.append(f"{label} must include artifact, evidence_file, or evidence_url.")
        drill_evidence[key] = {
            "status": drill.get("status"),
            "artifact": artifact,
            "operator": drill.get("operator"),
            "notes": drill.get("notes"),
        }

    return EvidenceCheck(
        "staging_runbook_drills",
        not errors,
        tuple(errors),
        {
            "path": str(source_path) if source_path else None,
            "environment": payload.get("environment"),
            "executed_at": payload.get("executed_at") or payload.get("completed_at"),
            "drills": drill_evidence,
        },
    )


def _first_matching(values: Any, key: str, expected: str) -> dict[str, Any] | None:
    if not isinstance(values, list):
        return None
    fallback: dict[str, Any] | None = None
    for value in values:
        if not isinstance(value, dict):
            continue
        fallback = fallback or value
        if value.get(key) == expected:
            return value
    return fallback


def _target_matches_lambda(arn: str, *, expected_lambda_name: str, expected_lambda_arn: str) -> bool:
    if expected_lambda_arn and (arn == expected_lambda_arn or arn.startswith(f"{expected_lambda_arn}:")):
        return True
    function_segment = f":function:{expected_lambda_name}"
    return function_segment in arn


def _int_value(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool):
        return -1
    if isinstance(value, int):
        return value
    return -1


def _redact(value: Any, *, parent_key: str = "") -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, nested in value.items():
            key_text = str(key)
            if _is_sensitive_key(key_text):
                redacted[key_text] = "[redacted]"
            else:
                redacted[key_text] = _redact(nested, parent_key=key_text)
        return redacted
    if isinstance(value, list):
        return [_redact(item, parent_key=parent_key) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact(item, parent_key=parent_key) for item in value)
    if isinstance(value, str):
        if _is_sensitive_key(parent_key):
            return "[redacted]"
        return _redact_text(value)
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in SENSITIVE_KEY_PARTS)


def _redact_text(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        netloc = parsed.hostname or ""
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        value = urlunparse(parsed._replace(netloc=netloc, query="[redacted]" if parsed.query else ""))
    value = re.sub(r"\b\d{12}\b", "[account-id]", value)
    value = re.sub(r"\b(A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b", "[aws-access-key]", value)
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Collect fail-closed staging ops evidence for RDS Proxy, Lambda schedules, and runbook drills."
    )
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "")))
    parser.add_argument("--aws-provider", choices=("auto", "boto3", "cli"), default="auto")
    parser.add_argument("--rds-proxy-name", default=os.environ.get("STAGING_RDS_PROXY_NAME", ""))
    parser.add_argument("--lambda-function-name", default=os.environ.get("STAGING_LAMBDA_FUNCTION_NAME", ""))
    parser.add_argument("--keep-warm-rule-name", default=os.environ.get("STAGING_KEEP_WARM_RULE_NAME", ""))
    parser.add_argument(
        "--worker-schedule-rule-name",
        default=os.environ.get("STAGING_WORKER_SCHEDULE_RULE_NAME", os.environ.get("STAGING_OUTBOX_RULE_NAME", "")),
    )
    parser.add_argument(
        "--drill-evidence-file",
        type=Path,
        default=Path(os.environ["STAGING_OPS_DRILL_EVIDENCE_FILE"])
        if os.environ.get("STAGING_OPS_DRILL_EVIDENCE_FILE")
        else None,
    )
    parser.add_argument("--min-lambda-memory-mb", type=int, default=MIN_LAMBDA_MEMORY_MB)
    parser.add_argument("--min-lambda-timeout-seconds", type=int, default=MIN_LAMBDA_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true", help="Print redacted machine-readable evidence.")
    args = parser.parse_args(argv)

    result = collect_ops_posture(
        rds_proxy_name=args.rds_proxy_name,
        lambda_function_name=args.lambda_function_name,
        keep_warm_rule_name=args.keep_warm_rule_name,
        worker_schedule_rule_name=args.worker_schedule_rule_name,
        drill_evidence_file=args.drill_evidence_file,
        region=args.region,
        min_lambda_memory_mb=args.min_lambda_memory_mb,
        min_lambda_timeout_seconds=args.min_lambda_timeout_seconds,
        aws_provider=args.aws_provider,
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: OpsPostureResult) -> None:
    if result.passed:
        print("Staging ops posture evidence passed.")
        return
    print("Staging ops posture evidence failed closed.", file=sys.stderr)
    for error in result.errors:
        print(f"- {_redact_text(error)}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
