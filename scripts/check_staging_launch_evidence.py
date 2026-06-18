from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MANIFEST_NAME = "evidence-manifest.json"
PUBLIC_IAM_MEMBERS = {"allUsers", "allAuthenticatedUsers"}


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
class EvidenceResult:
    passed: bool
    errors: tuple[str, ...]
    checks: dict[str, EvidenceCheck]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": list(self.errors),
            "checks": {name: check.to_dict() for name, check in self.checks.items()},
        }


def evaluate_evidence(evidence_dir: Path) -> EvidenceResult:
    checks = {
        "cloud_run": _check_cloud_run(evidence_dir),
        "cloud_sql": _check_cloud_sql(evidence_dir),
        "artifact_registry": _check_artifact_registry(evidence_dir),
        "media_bucket": _check_media_bucket(evidence_dir),
        "runtime_smoke": _check_runtime_smoke(evidence_dir),
    }
    errors = tuple(error for check in checks.values() for error in check.errors)
    return EvidenceResult(passed=not errors, errors=errors, checks=checks)


def write_manifest(evidence_dir: Path, result: EvidenceResult) -> Path:
    evidence_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = evidence_dir / MANIFEST_NAME
    manifest_path.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
    return manifest_path


def _check_cloud_run(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    for service_name, path in (
        ("backend", evidence_dir / "backend-cloud-run.json"),
        ("frontend", evidence_dir / "frontend-cloud-run.json"),
    ):
        doc = _read_json(path, errors, label=f"{service_name} Cloud Run service")
        if not isinstance(doc, dict):
            continue
        annotations = doc.get("spec", {}).get("template", {}).get("metadata", {}).get("annotations", {})
        if annotations.get("autoscaling.knative.dev/minScale", "0") not in {"0", ""}:
            errors.append(f"{service_name} Cloud Run minScale must be 0.")
        if annotations.get("autoscaling.knative.dev/maxScale") not in {"3", 3}:
            errors.append(f"{service_name} Cloud Run maxScale must be 3.")
        conditions = doc.get("status", {}).get("conditions", [])
        if not any(item.get("type") == "Ready" and item.get("status") == "True" for item in conditions):
            errors.append(f"{service_name} Cloud Run service must report Ready=True.")
    return _result("cloud_run", errors)


def _check_cloud_sql(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    doc = _read_json(evidence_dir / "cloud-sql.json", errors, label="Cloud SQL instance")
    if isinstance(doc, dict):
        settings = doc.get("settings", {})
        if doc.get("state") != "STOPPED":
            errors.append("Cloud SQL must be stopped outside active test windows.")
        if settings.get("activationPolicy") != "NEVER":
            errors.append("Cloud SQL activationPolicy must be NEVER.")
        if settings.get("availabilityType") != "ZONAL":
            errors.append("Dark/staging Cloud SQL must be zonal before launch.")
        if str(settings.get("dataDiskSizeGb")) not in {"20", "20.0"}:
            errors.append("Cloud SQL disk should stay at the 20GB floor before launch.")
    return _result("cloud_sql", errors)


def _check_artifact_registry(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    doc = _read_json(evidence_dir / "artifact-registry.json", errors, label="Artifact Registry repository")
    if isinstance(doc, dict):
        policies = doc.get("cleanupPolicies") or {}
        if "delete-old-images" not in policies or "keep-latest-10" not in policies:
            errors.append("Artifact Registry cleanup policies delete-old-images and keep-latest-10 are required.")
    return _result("artifact_registry", errors)


def _check_media_bucket(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    runtime = _read_json(evidence_dir / "media-runtime-config.json", errors, label="media runtime config")
    if isinstance(runtime, dict):
        if runtime.get("bucket_configured") is not True:
            errors.append("MEDIA_GCS_BUCKET must be configured.")
        if runtime.get("prefix_configured") is not True:
            errors.append("MEDIA_GCS_PREFIX must be configured.")

    describe_error = _read_optional_json(evidence_dir / "media-bucket-error.json")
    if describe_error:
        errors.append(_media_error_message(describe_error, fallback="unable to describe media bucket"))
        return _result("media_bucket", errors)

    iam_error = _read_optional_json(evidence_dir / "media-bucket-iam-error.json")
    if iam_error:
        errors.append(_media_error_message(iam_error, fallback="unable to read media bucket IAM"))
        return _result("media_bucket", errors)

    bucket = _read_json(evidence_dir / "media-bucket.json", errors, label="media bucket")
    iam = _read_json(evidence_dir / "media-bucket-iam.json", errors, label="media bucket IAM")
    if isinstance(bucket, dict):
        if not _bucket_uniform_access_enabled(bucket):
            errors.append("Media bucket must enable uniform bucket-level access.")
        if not _bucket_public_access_prevention_enforced(bucket):
            errors.append("Media bucket publicAccessPrevention must be enforced.")
        if not _bucket_has_lifecycle_rules(bucket):
            errors.append("Media bucket lifecycle rules are required.")
    if isinstance(iam, dict):
        for binding in iam.get("bindings", []):
            public_members = PUBLIC_IAM_MEMBERS.intersection(set(binding.get("members", [])))
            if public_members:
                members = ", ".join(sorted(public_members))
                errors.append(f"Media bucket IAM must not grant {binding.get('role')} to {members}.")
    return _result("media_bucket", errors)


def _check_runtime_smoke(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    doc = _read_json(evidence_dir / "runtime-smoke.json", errors, label="runtime smoke")
    if isinstance(doc, dict):
        if not str(doc.get("backend_health_url") or "").startswith("https://"):
            errors.append("Runtime smoke must capture an HTTPS backend health URL.")
        if not str(doc.get("backend_release_sha") or "").strip():
            errors.append("Runtime smoke must capture backend_release_sha.")
        if int(doc.get("frontend_status") or 0) >= 400:
            errors.append("Runtime smoke frontend_status must be below 400.")
        if not str(doc.get("frontend_url") or "").startswith("https://"):
            errors.append("Runtime smoke must capture an HTTPS frontend URL.")
    return _result("runtime_smoke", errors)


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


def _read_optional_json(path: Path) -> dict[str, Any] | None:
    if not path.exists() or path.stat().st_size == 0:
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"error": path.name, "detail": "invalid JSON error artifact"}
    return value if isinstance(value, dict) else {"error": path.name, "detail": "non-object error artifact"}


def _media_error_message(error: dict[str, Any], *, fallback: str) -> str:
    name = str(error.get("error") or fallback)
    permission = str(error.get("required_permission") or "").strip()
    if permission:
        return f"Media bucket posture failed: {name}; required_permission={permission}."
    return f"Media bucket posture failed: {name}."


def _bucket_uniform_access_enabled(bucket: dict[str, Any]) -> bool:
    if bucket.get("uniform_bucket_level_access") is True:
        return True
    iam_config = bucket.get("iamConfiguration", {})
    if not isinstance(iam_config, dict):
        return False
    uniform_access = iam_config.get("uniformBucketLevelAccess", {})
    return isinstance(uniform_access, dict) and uniform_access.get("enabled") is True


def _bucket_public_access_prevention_enforced(bucket: dict[str, Any]) -> bool:
    if bucket.get("public_access_prevention") == "enforced":
        return True
    iam_config = bucket.get("iamConfiguration", {})
    return isinstance(iam_config, dict) and iam_config.get("publicAccessPrevention") == "enforced"


def _bucket_has_lifecycle_rules(bucket: dict[str, Any]) -> bool:
    lifecycle = bucket.get("lifecycle")
    if isinstance(lifecycle, dict) and lifecycle.get("rule"):
        return True
    lifecycle_config = bucket.get("lifecycle_config")
    return isinstance(lifecycle_config, dict) and bool(lifecycle_config.get("rule"))


def _result(name: str, errors: list[str]) -> EvidenceCheck:
    return EvidenceCheck(name=name, passed=not errors, errors=tuple(errors))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate staging launch evidence artifacts.")
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    result = evaluate_evidence(args.evidence_dir)
    manifest_path = write_manifest(args.evidence_dir, result)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    if result.passed:
        print(f"Staging launch evidence passed; manifest written to {manifest_path}.")
        return 0
    print(f"Staging launch evidence failed; manifest written to {manifest_path}.")
    for error in result.errors:
        print(f"- {error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
