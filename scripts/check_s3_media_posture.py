#!/usr/bin/env python
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 10
REQUIRED_BLOCK_PUBLIC_ACCESS_FLAGS = (
    "BlockPublicAcls",
    "IgnorePublicAcls",
    "BlockPublicPolicy",
    "RestrictPublicBuckets",
)
ACCEPTED_ENCRYPTION_ALGORITHMS = {"AES256", "aws:kms", "aws:kms:dsse"}
DENIED_ANONYMOUS_STATUS_CODES = {401, 403}


class EvidenceCollectionError(RuntimeError):
    pass


class S3EvidenceClient(Protocol):
    source_name: str

    def get_public_access_block(self, bucket: str) -> dict[str, Any]:
        ...

    def get_bucket_encryption(self, bucket: str) -> dict[str, Any]:
        ...

    def get_bucket_lifecycle_configuration(self, bucket: str) -> dict[str, Any]:
        ...

    def get_bucket_region(self, bucket: str) -> str:
        ...

    def find_object_key(self, bucket: str, prefix: str) -> str | None:
        ...

    def object_exists(self, bucket: str, key: str) -> bool:
        ...


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    detail: str
    evidence: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "detail": self.detail,
            "evidence": self.evidence,
        }


@dataclass(frozen=True)
class AnonymousReadProbeResult:
    denied: bool
    status_code: int | None
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "denied": self.denied,
            "status_code": self.status_code,
            "detail": self.detail,
        }


@dataclass(frozen=True)
class S3MediaPostureResult:
    passed: bool
    bucket_ref: str
    prefix_ref: str
    evidence_source: str
    checks: tuple[CheckResult, ...]
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "bucket_ref": self.bucket_ref,
            "prefix_ref": self.prefix_ref,
            "evidence_source": self.evidence_source,
            "errors": list(self.errors),
            "checks": [check.to_dict() for check in self.checks],
        }


class Boto3S3EvidenceClient:
    source_name = "boto3"

    def __init__(self, region: str = "") -> None:
        import boto3

        self._client = boto3.client("s3", region_name=region or None)

    def get_public_access_block(self, bucket: str) -> dict[str, Any]:
        return self._call("get_public_access_block", Bucket=bucket)

    def get_bucket_encryption(self, bucket: str) -> dict[str, Any]:
        return self._call("get_bucket_encryption", Bucket=bucket)

    def get_bucket_lifecycle_configuration(self, bucket: str) -> dict[str, Any]:
        return self._call("get_bucket_lifecycle_configuration", Bucket=bucket)

    def get_bucket_region(self, bucket: str) -> str:
        payload = self._call("get_bucket_location", Bucket=bucket)
        return _normalize_aws_region(payload.get("LocationConstraint"))

    def find_object_key(self, bucket: str, prefix: str) -> str | None:
        payload = self._call("list_objects_v2", Bucket=bucket, Prefix=prefix, MaxKeys=1)
        contents = payload.get("Contents")
        if not isinstance(contents, list):
            return None
        for item in contents:
            if isinstance(item, dict) and isinstance(item.get("Key"), str) and item["Key"]:
                return item["Key"]
        return None

    def object_exists(self, bucket: str, key: str) -> bool:
        try:
            self._call("head_object", Bucket=bucket, Key=key)
        except EvidenceCollectionError as exc:
            if _aws_error_code(exc) in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

    def _call(self, operation: str, **kwargs: Any) -> dict[str, Any]:
        try:
            payload = getattr(self._client, operation)(**kwargs)
        except Exception as exc:  # pragma: no cover - exercised through mocked clients.
            raise EvidenceCollectionError(_summarize_aws_exception(operation, exc)) from exc
        if not isinstance(payload, dict):
            raise EvidenceCollectionError(f"{operation} returned non-object evidence.")
        return payload


class AwsCliS3EvidenceClient:
    source_name = "aws-cli"

    def __init__(self, region: str = "") -> None:
        self.region = region

    def get_public_access_block(self, bucket: str) -> dict[str, Any]:
        return self._run_json("get-public-access-block", "--bucket", bucket)

    def get_bucket_encryption(self, bucket: str) -> dict[str, Any]:
        return self._run_json("get-bucket-encryption", "--bucket", bucket)

    def get_bucket_lifecycle_configuration(self, bucket: str) -> dict[str, Any]:
        return self._run_json("get-bucket-lifecycle-configuration", "--bucket", bucket)

    def get_bucket_region(self, bucket: str) -> str:
        payload = self._run_json("get-bucket-location", "--bucket", bucket)
        return _normalize_aws_region(payload.get("LocationConstraint"))

    def find_object_key(self, bucket: str, prefix: str) -> str | None:
        payload = self._run_json(
            "list-objects-v2",
            "--bucket",
            bucket,
            "--prefix",
            prefix,
            "--max-keys",
            "1",
        )
        contents = payload.get("Contents")
        if not isinstance(contents, list):
            return None
        for item in contents:
            if isinstance(item, dict) and isinstance(item.get("Key"), str) and item["Key"]:
                return item["Key"]
        return None

    def object_exists(self, bucket: str, key: str) -> bool:
        try:
            self._run_json("head-object", "--bucket", bucket, "--key", key)
        except EvidenceCollectionError as exc:
            if _aws_error_code(exc) in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

    def _run_json(self, operation: str, *args: str) -> dict[str, Any]:
        command = ["aws", "s3api", operation, *args, "--output", "json"]
        if self.region:
            command.extend(["--region", self.region])
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
        except subprocess.TimeoutExpired as exc:
            raise EvidenceCollectionError(f"aws s3api {operation} timed out.") from exc
        if completed.returncode != 0:
            code = _extract_aws_cli_error_code(completed.stderr)
            detail = f"aws s3api {operation} failed with exit code {completed.returncode}"
            if code:
                detail = f"{detail} ({code})"
            raise EvidenceCollectionError(detail)
        try:
            payload = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise EvidenceCollectionError(f"aws s3api {operation} returned invalid JSON.") from exc
        if not isinstance(payload, dict):
            raise EvidenceCollectionError(f"aws s3api {operation} returned non-object evidence.")
        return payload


def check_s3_media_posture(
    bucket: str,
    *,
    prefix: str = "",
    expected_retention_days: int | None = None,
    anonymous_read_key: str = "",
    region: str = "",
    client: S3EvidenceClient | None = None,
    anonymous_probe: Callable[[str, str, str, int], AnonymousReadProbeResult] = lambda b, k, r, t: anonymous_get_probe(b, k, r, t),
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> S3MediaPostureResult:
    bucket = bucket.strip()
    clean_prefix = _clean_prefix(prefix)
    object_prefix = _object_prefix(clean_prefix)
    bucket_ref = _redacted_ref(bucket)
    prefix_ref = _redacted_ref(clean_prefix)
    checks: list[CheckResult] = []

    if not bucket:
        check = CheckResult(
            name="bucket",
            status="error",
            detail="Bucket name is required.",
            evidence={},
        )
        return S3MediaPostureResult(
            passed=False,
            bucket_ref=bucket_ref,
            prefix_ref=prefix_ref,
            evidence_source="none",
            checks=(check,),
            errors=("bucket: Bucket name is required.",),
        )

    if client is None:
        try:
            client = select_s3_client(region=region)
        except EvidenceCollectionError as exc:
            check = CheckResult(
                name="evidence_client",
                status="error",
                detail=_redact_text(str(exc), bucket=bucket, prefix=clean_prefix, key=anonymous_read_key),
                evidence={"selected": "none"},
            )
            return S3MediaPostureResult(
                passed=False,
                bucket_ref=bucket_ref,
                prefix_ref=prefix_ref,
                evidence_source="none",
                checks=(check,),
                errors=(f"{check.name}: {check.detail}",),
            )

    checks.append(_safe_check("block_public_access", bucket, clean_prefix, anonymous_read_key, _check_block_public_access, client, bucket))
    checks.append(_safe_check("bucket_encryption", bucket, clean_prefix, anonymous_read_key, _check_bucket_encryption, client, bucket))
    checks.append(
        _safe_check(
            "lifecycle",
            bucket,
            clean_prefix,
            anonymous_read_key,
            _check_lifecycle,
            client,
            bucket,
            object_prefix,
            expected_retention_days,
        )
    )
    checks.append(
        _safe_check(
            "anonymous_read_denial",
            bucket,
            clean_prefix,
            anonymous_read_key,
            _check_anonymous_read_denial,
            client,
            bucket,
            object_prefix,
            anonymous_read_key.strip(),
            region,
            anonymous_probe,
            timeout_seconds,
        )
    )

    errors = tuple(f"{check.name}: {check.detail}" for check in checks if check.status != "ok")
    return S3MediaPostureResult(
        passed=not errors,
        bucket_ref=bucket_ref,
        prefix_ref=prefix_ref,
        evidence_source=getattr(client, "source_name", "unknown"),
        checks=tuple(checks),
        errors=errors,
    )


def select_s3_client(*, tool: str = "auto", region: str = "") -> S3EvidenceClient:
    normalized_tool = tool.strip().lower()
    if normalized_tool not in {"auto", "boto3", "aws-cli"}:
        raise EvidenceCollectionError("tool must be one of: auto, boto3, aws-cli.")

    if normalized_tool in {"auto", "boto3"} and importlib.util.find_spec("boto3") is not None:
        try:
            return Boto3S3EvidenceClient(region=region)
        except Exception as exc:
            if normalized_tool == "boto3":
                raise EvidenceCollectionError(f"boto3 client initialization failed with {type(exc).__name__}.") from exc
    if normalized_tool == "boto3":
        raise EvidenceCollectionError("boto3 is not installed.")

    if normalized_tool in {"auto", "aws-cli"} and shutil.which("aws"):
        return AwsCliS3EvidenceClient(region=region)
    if normalized_tool == "aws-cli":
        raise EvidenceCollectionError("AWS CLI executable was not found.")

    raise EvidenceCollectionError("Neither boto3 nor the AWS CLI is available for local evidence collection.")


def _safe_check(
    name: str,
    bucket: str,
    prefix: str,
    key: str,
    callback: Callable[..., CheckResult],
    *args: Any,
) -> CheckResult:
    try:
        return callback(*args)
    except Exception as exc:
        return CheckResult(
            name=name,
            status="error",
            detail=f"evidence missing or unreadable: {_redact_text(str(exc), bucket=bucket, prefix=prefix, key=key)}",
            evidence={"error_type": type(exc).__name__},
        )


def _check_block_public_access(client: S3EvidenceClient, bucket: str) -> CheckResult:
    payload = client.get_public_access_block(bucket)
    config = payload.get("PublicAccessBlockConfiguration")
    if not isinstance(config, dict):
        return CheckResult(
            name="block_public_access",
            status="error",
            detail="bucket-level Block Public Access configuration was not returned.",
            evidence={"configured": False},
        )

    flags = {flag: config.get(flag) is True for flag in REQUIRED_BLOCK_PUBLIC_ACCESS_FLAGS}
    missing = tuple(flag for flag, enabled in flags.items() if not enabled)
    if missing:
        return CheckResult(
            name="block_public_access",
            status="error",
            detail=f"bucket-level Block Public Access must enable all required flags; missing: {', '.join(missing)}.",
            evidence={"configured": True, "flags": flags},
        )

    return CheckResult(
        name="block_public_access",
        status="ok",
        detail="bucket-level Block Public Access is fully enabled.",
        evidence={"configured": True, "flags": flags},
    )


def _check_bucket_encryption(client: S3EvidenceClient, bucket: str) -> CheckResult:
    payload = client.get_bucket_encryption(bucket)
    config = payload.get("ServerSideEncryptionConfiguration")
    rules = config.get("Rules") if isinstance(config, dict) else None
    if not isinstance(rules, list) or not rules:
        return CheckResult(
            name="bucket_encryption",
            status="error",
            detail="default bucket encryption rules were not returned.",
            evidence={"configured": False},
        )

    algorithms: list[str] = []
    bucket_key_enabled = False
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        default_encryption = rule.get("ApplyServerSideEncryptionByDefault")
        if isinstance(default_encryption, dict) and isinstance(default_encryption.get("SSEAlgorithm"), str):
            algorithms.append(default_encryption["SSEAlgorithm"])
        bucket_key_enabled = bucket_key_enabled or rule.get("BucketKeyEnabled") is True

    invalid = tuple(algorithm for algorithm in algorithms if algorithm not in ACCEPTED_ENCRYPTION_ALGORITHMS)
    if not algorithms:
        return CheckResult(
            name="bucket_encryption",
            status="error",
            detail="default bucket encryption does not name an accepted SSE algorithm.",
            evidence={"configured": False, "algorithms": []},
        )
    if invalid:
        return CheckResult(
            name="bucket_encryption",
            status="error",
            detail=f"default bucket encryption uses unsupported SSE algorithm(s): {', '.join(invalid)}.",
            evidence={"configured": True, "algorithms": algorithms, "bucket_key_enabled": bucket_key_enabled},
        )

    return CheckResult(
        name="bucket_encryption",
        status="ok",
        detail="default bucket encryption is configured.",
        evidence={"configured": True, "algorithms": algorithms, "bucket_key_enabled": bucket_key_enabled},
    )


def _check_lifecycle(
    client: S3EvidenceClient,
    bucket: str,
    object_prefix: str,
    expected_retention_days: int | None,
) -> CheckResult:
    payload = client.get_bucket_lifecycle_configuration(bucket)
    rules = payload.get("Rules")
    if not isinstance(rules, list) or not rules:
        return CheckResult(
            name="lifecycle",
            status="error",
            detail="bucket lifecycle rules were not returned.",
            evidence={"configured": False},
        )

    candidates = []
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("Status") != "Enabled":
            continue
        rule_prefix, constrained_filter = _lifecycle_rule_prefix(rule)
        if constrained_filter or rule_prefix is None:
            continue
        if not _rule_prefix_covers_expected_prefix(rule_prefix, object_prefix):
            continue
        expiration_days = _expiration_days(rule)
        if expiration_days is None:
            continue
        candidates.append(
            {
                "rule_ref": _redacted_ref(str(rule.get("ID", ""))),
                "rule_prefix_ref": _redacted_ref(rule_prefix),
                "expiration_days": expiration_days,
            }
        )

    strict_candidates = [
        candidate
        for candidate in candidates
        if expected_retention_days is None or candidate["expiration_days"] <= expected_retention_days
    ]
    evidence = {
        "configured": True,
        "expected_prefix_ref": _redacted_ref(object_prefix),
        "expected_retention_days": expected_retention_days,
        "matching_rule_count": len(strict_candidates),
        "candidate_rule_count": len(candidates),
    }
    if strict_candidates:
        evidence["matching_rule"] = strict_candidates[0]
        return CheckResult(
            name="lifecycle",
            status="ok",
            detail="an enabled lifecycle expiration rule covers the requested media prefix.",
            evidence=evidence,
        )

    if candidates and expected_retention_days is not None:
        detail = "matching lifecycle rules are less strict than the expected retention days."
    else:
        detail = "no enabled lifecycle expiration rule covers the requested media prefix."
    return CheckResult(
        name="lifecycle",
        status="error",
        detail=detail,
        evidence=evidence,
    )


def _check_anonymous_read_denial(
    client: S3EvidenceClient,
    bucket: str,
    object_prefix: str,
    anonymous_read_key: str,
    region: str,
    anonymous_probe: Callable[[str, str, str, int], AnonymousReadProbeResult],
    timeout_seconds: int,
) -> CheckResult:
    key = anonymous_read_key
    if key:
        if not client.object_exists(bucket, key):
            return CheckResult(
                name="anonymous_read_denial",
                status="error",
                detail="provided anonymous-read probe key does not exist or could not be proven to exist.",
                evidence={"object_key_ref": _redacted_ref(key), "object_exists": False},
            )
    else:
        key = client.find_object_key(bucket, object_prefix) or ""
        if not key:
            return CheckResult(
                name="anonymous_read_denial",
                status="error",
                detail="no existing object was available under the requested prefix for an anonymous-read probe.",
                evidence={"expected_prefix_ref": _redacted_ref(object_prefix), "object_exists": False},
            )

    resolved_region = _normalize_aws_region(region) if region.strip() else client.get_bucket_region(bucket)
    probe = anonymous_probe(bucket, key, resolved_region, timeout_seconds)
    evidence = {
        "object_key_ref": _redacted_ref(key),
        "region": resolved_region,
        "probe": probe.to_dict(),
    }
    if probe.denied:
        return CheckResult(
            name="anonymous_read_denial",
            status="ok",
            detail="anonymous ranged GET was denied for an existing media object.",
            evidence=evidence,
        )

    return CheckResult(
        name="anonymous_read_denial",
        status="error",
        detail=probe.detail,
        evidence=evidence,
    )


def anonymous_get_probe(bucket: str, key: str, region: str, timeout_seconds: int) -> AnonymousReadProbeResult:
    url = _anonymous_s3_object_url(bucket, key, region)
    request = Request(
        url,
        headers={
            "Accept": "*/*",
            "Range": "bytes=0-0",
            "User-Agent": "kresco-s3-media-posture-check/1.0",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status_code = int(getattr(response, "status", 0) or 0)
    except HTTPError as exc:
        status_code = int(exc.code)
        if status_code in DENIED_ANONYMOUS_STATUS_CODES:
            return AnonymousReadProbeResult(
                denied=True,
                status_code=status_code,
                detail="anonymous ranged GET was denied.",
            )
        if status_code == 404:
            return AnonymousReadProbeResult(
                denied=False,
                status_code=status_code,
                detail="anonymous ranged GET returned 404; object evidence is missing.",
            )
        return AnonymousReadProbeResult(
            denied=False,
            status_code=status_code,
            detail=f"anonymous ranged GET returned unexpected HTTP {status_code}.",
        )
    except URLError as exc:
        raise EvidenceCollectionError(f"anonymous ranged GET failed before denial evidence was collected: {type(exc.reason).__name__}") from exc

    if 200 <= status_code < 300:
        return AnonymousReadProbeResult(
            denied=False,
            status_code=status_code,
            detail="anonymous ranged GET succeeded; object appears publicly readable.",
        )
    return AnonymousReadProbeResult(
        denied=False,
        status_code=status_code,
        detail=f"anonymous ranged GET returned unexpected HTTP {status_code}.",
    )


def _anonymous_s3_object_url(bucket: str, key: str, region: str) -> str:
    normalized_region = _normalize_aws_region(region)
    host = f"{bucket}.s3.amazonaws.com" if normalized_region == "us-east-1" else f"{bucket}.s3.{normalized_region}.amazonaws.com"
    return f"https://{host}/{quote(key, safe='/')}"


def _lifecycle_rule_prefix(rule: dict[str, Any]) -> tuple[str | None, bool]:
    if isinstance(rule.get("Prefix"), str):
        return rule["Prefix"], False

    filter_value = rule.get("Filter")
    if filter_value is None:
        return "", False
    if not isinstance(filter_value, dict):
        return None, True
    if not filter_value:
        return "", False

    filter_keys = set(filter_value)
    if filter_keys == {"Prefix"} and isinstance(filter_value.get("Prefix"), str):
        return filter_value["Prefix"], False
    if filter_keys == {"And"} and isinstance(filter_value.get("And"), dict):
        and_filter = filter_value["And"]
        and_keys = set(and_filter)
        if and_keys == {"Prefix"} and isinstance(and_filter.get("Prefix"), str):
            return and_filter["Prefix"], False
        if isinstance(and_filter.get("Prefix"), str):
            return and_filter["Prefix"], True
    return "", True


def _expiration_days(rule: dict[str, Any]) -> int | None:
    expiration = rule.get("Expiration")
    if not isinstance(expiration, dict):
        return None
    days = expiration.get("Days")
    return days if isinstance(days, int) and days > 0 else None


def _rule_prefix_covers_expected_prefix(rule_prefix: str, object_prefix: str) -> bool:
    return not rule_prefix or object_prefix.startswith(rule_prefix)


def _clean_prefix(prefix: str) -> str:
    return "/".join(part for part in prefix.strip().strip("/").split("/") if part)


def _object_prefix(clean_prefix: str) -> str:
    return f"{clean_prefix}/" if clean_prefix else ""


def _normalize_aws_region(region: Any) -> str:
    if region in (None, ""):
        return "us-east-1"
    if region == "EU":
        return "eu-west-1"
    return str(region)


def _summarize_aws_exception(operation: str, exc: Exception) -> str:
    response = getattr(exc, "response", None)
    error = response.get("Error", {}) if isinstance(response, dict) else {}
    code = error.get("Code")
    if code:
        return f"{operation} failed with AWS error {code}."
    return f"{operation} failed with {type(exc).__name__}."


def _aws_error_code(exc: BaseException) -> str:
    match = re.search(r"\bAWS error ([A-Za-z0-9_.-]+)", str(exc))
    if match:
        return match.group(1).rstrip(".")
    match = re.search(r"\(([^)]+)\)", str(exc))
    return match.group(1).rstrip(".") if match else ""


def _extract_aws_cli_error_code(stderr: str) -> str:
    match = re.search(r"\(([^)]+)\)", stderr or "")
    return match.group(1) if match else ""


def _redacted_ref(value: str) -> str:
    if not value:
        return ""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"sha256:{digest}"


def _redact_text(text: str, *, bucket: str, prefix: str, key: str) -> str:
    redacted = text
    for value in sorted({bucket, prefix, key}, key=len, reverse=True):
        if value:
            redacted = redacted.replace(value, f"<redacted:{_redacted_ref(value)}>")
    redacted = re.sub(r"AKIA[0-9A-Z]{16}", "<redacted:aws-access-key>", redacted)
    redacted = re.sub(r"ASIA[0-9A-Z]{16}", "<redacted:aws-temp-access-key>", redacted)
    redacted = re.sub(r"(?i)(X-Amz-Signature=)[0-9a-f]+", r"\1<redacted>", redacted)
    redacted = re.sub(r"(?i)(Credential=)[^&\s]+", r"\1<redacted>", redacted)
    return redacted[:500]


def _env_int(name: str) -> int | None:
    value = os.environ.get(name, "").strip()
    if not value:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify staging/production S3 media bucket posture without printing secrets.")
    parser.add_argument("bucket", help="S3 bucket name to verify. The report redacts this value.")
    parser.add_argument("--prefix", default=os.environ.get("MEDIA_S3_PREFIX", ""), help="Media object prefix to verify.")
    parser.add_argument(
        "--expected-retention-days",
        type=int,
        default=_env_int("MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS"),
        help="Maximum acceptable lifecycle expiration days for the prefix.",
    )
    parser.add_argument(
        "--anonymous-read-key",
        default="",
        help="Existing object key to probe with an unauthenticated ranged GET. If omitted, the verifier samples one object under --prefix.",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("MEDIA_S3_REGION", os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", ""))),
        help="AWS region used for AWS client selection and anonymous S3 URL construction.",
    )
    parser.add_argument("--tool", choices=("auto", "boto3", "aws-cli"), default="auto")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true", help="Print redacted machine-readable evidence.")
    args = parser.parse_args(argv)

    try:
        client = select_s3_client(tool=args.tool, region=args.region)
    except EvidenceCollectionError as exc:
        check = CheckResult(
            name="evidence_client",
            status="error",
            detail=_redact_text(
                str(exc),
                bucket=args.bucket.strip(),
                prefix=_clean_prefix(args.prefix),
                key=args.anonymous_read_key.strip(),
            ),
            evidence={"selected": "none", "requested_tool": args.tool},
        )
        result = S3MediaPostureResult(
            passed=False,
            bucket_ref=_redacted_ref(args.bucket.strip()),
            prefix_ref=_redacted_ref(_clean_prefix(args.prefix)),
            evidence_source="none",
            checks=(check,),
            errors=(f"{check.name}: {check.detail}",),
        )
    else:
        result = check_s3_media_posture(
            args.bucket,
            prefix=args.prefix,
            expected_retention_days=args.expected_retention_days,
            anonymous_read_key=args.anonymous_read_key,
            region=args.region,
            client=client,
            timeout_seconds=max(args.timeout_seconds, 1),
        )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: S3MediaPostureResult) -> None:
    if result.passed:
        print(f"S3 media posture verification passed for bucket {result.bucket_ref}.")
        return

    print(f"S3 media posture verification failed for bucket {result.bucket_ref}.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
