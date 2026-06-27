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
        "firebase_hosting": _check_firebase_hosting(evidence_dir),
        "cloud_sql": _check_cloud_sql(evidence_dir),
        "artifact_registry": _check_artifact_registry(evidence_dir),
        "media_bucket": _check_media_bucket(evidence_dir),
        "runtime_smoke": _check_runtime_smoke(evidence_dir),
        "public_routing": _check_public_routing(evidence_dir),
        "public_api": _check_public_api(evidence_dir),
        "public_auth": _check_public_auth(evidence_dir),
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


def _check_firebase_hosting(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    rewrites = _read_json(evidence_dir / "firebase-hosting-rewrites.json", errors, label="Firebase Hosting rewrites")
    if isinstance(rewrites, dict):
        if rewrites.get("passed") is not True:
            errors.append("Firebase Hosting rewrites must pass.")
        checks = rewrites.get("checks")
        if not isinstance(checks, list):
            errors.append("Firebase Hosting rewrites evidence must include a checks list.")
            checks = []
        by_target = {str(check.get("target") or ""): check for check in checks if isinstance(check, dict)}
        for target in ("staging-frontend", "staging-api"):
            check = by_target.get(target)
            if not check:
                errors.append(f"Firebase Hosting rewrites did not check {target}.")
                continue
            if check.get("passed") is not True:
                errors.append(f"Firebase Hosting rewrites for {target} must pass.")
            check_errors = check.get("errors")
            for error in check_errors if isinstance(check_errors, list) else []:
                errors.append(f"Firebase Hosting rewrites failed for {target}: {error}")

    domains = _read_json(evidence_dir / "firebase-hosting-domains.json", errors, label="Firebase Hosting domains")
    if isinstance(domains, dict):
        if domains.get("passed") is not True:
            errors.append("Firebase Hosting domains must pass.")
        entries = domains.get("entries")
        if not isinstance(entries, list):
            errors.append("Firebase Hosting domains evidence must include an entries list.")
            entries = []
        by_target = {str(entry.get("target") or ""): entry for entry in entries if isinstance(entry, dict)}
        expected_domains_by_target = {
            "staging-frontend": {
                "staging.kresco.ma",
                "www.staging.kresco.ma",
                "app.staging.kresco.ma",
                "admin.staging.kresco.ma",
                "prof.staging.kresco.ma",
                "staff.staging.kresco.ma",
            },
            "staging-api": {"api.staging.kresco.ma"},
        }
        expected_sites = {
            "staging-frontend": "kresco-staging",
            "staging-api": "kresco-staging-api",
        }
        for target, expected_domains in expected_domains_by_target.items():
            entry = by_target.get(target)
            if not entry:
                errors.append(f"Firebase Hosting domains did not check {target}.")
                continue
            if entry.get("passed") is not True:
                errors.append(f"Firebase Hosting domains for {target} must pass.")
            if entry.get("site") != expected_sites[target]:
                errors.append(f"Firebase Hosting domains for {target} must use site {expected_sites[target]}.")
            entry_domains = set(entry.get("domains") if isinstance(entry.get("domains"), list) else [])
            live_domains = set(entry.get("live_domains") if isinstance(entry.get("live_domains"), list) else [])
            if entry.get("live_checked") is not True:
                errors.append(f"Firebase Hosting domains for {target} must include a live custom-domain check.")
            for domain in sorted(expected_domains - entry_domains):
                errors.append(f"Firebase Hosting domains did not include {domain} for {target}.")
            for domain in sorted(expected_domains - live_domains):
                errors.append(f"Firebase Hosting live domains did not include {domain} for {target}.")
            entry_errors = entry.get("errors")
            for error in entry_errors if isinstance(entry_errors, list) else []:
                errors.append(f"Firebase Hosting domains failed for {target}: {error}")

    dns_plan = _read_json(evidence_dir / "firebase-hosting-dns-records.json", errors, label="Firebase Hosting DNS records")
    if isinstance(dns_plan, dict):
        if dns_plan.get("passed") is not True:
            errors.append("Firebase Hosting DNS record export must pass.")
        dns_domains = {
            str(item.get("domain") or "")
            for item in dns_plan.get("domains", [])
            if isinstance(item, dict)
        }
        for domain in (
            "staging.kresco.ma",
            "www.staging.kresco.ma",
            "app.staging.kresco.ma",
            "admin.staging.kresco.ma",
            "prof.staging.kresco.ma",
            "staff.staging.kresco.ma",
            "api.staging.kresco.ma",
        ):
            if domain not in dns_domains:
                errors.append(f"Firebase Hosting DNS record export did not include {domain}.")

    public_dns = _read_json(evidence_dir / "firebase-hosting-public-dns.json", errors, label="Firebase Hosting public DNS")
    if isinstance(public_dns, dict):
        if public_dns.get("passed") is not True:
            errors.append("Firebase Hosting public DNS check must pass.")
            records = public_dns.get("records")
            for record in records if isinstance(records, list) else []:
                if not isinstance(record, dict):
                    continue
                domain = str(record.get("domain") or "")
                record_type = str(record.get("record_type") or "")
                for error in record.get("errors", []) if isinstance(record.get("errors"), list) else []:
                    errors.append(f"Public DNS failed for {domain} {record_type}: {error}")
    return _result("firebase_hosting", errors)


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


def _check_public_routing(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    status = _read_json(evidence_dir / "subdomain-routing.status.json", errors, label="public subdomain routing status")
    if isinstance(status, dict) and status.get("exit_code") != 0:
        stderr = _read_text(evidence_dir / "subdomain-routing.stderr.txt")
        detail = f": {stderr[:1000]}" if stderr else ""
        errors.append(f"Public subdomain routing smoke must pass{detail}")

    output = _read_text(evidence_dir / "subdomain-routing.txt")
    if output and "Subdomain routing smoke passed for https://staging.kresco.ma" not in output:
        errors.append("Public subdomain routing smoke output must confirm https://staging.kresco.ma.")
    return _result("public_routing", errors)


def _check_public_api(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    status = _read_json(evidence_dir / "public-api-health.status.json", errors, label="public API health status")
    if isinstance(status, dict) and status.get("exit_code") != 0:
        stderr = _read_text(evidence_dir / "public-api-health.stderr.txt")
        detail = f": {stderr[:1000]}" if stderr else ""
        errors.append(f"Public API health smoke must pass{detail}")

    doc = _read_json(evidence_dir / "public-api-health.json", errors, label="public API health")
    runtime = _read_json(evidence_dir / "runtime-smoke.json", errors, label="runtime smoke")
    runtime_sha = str(runtime.get("backend_release_sha") or "").strip() if isinstance(runtime, dict) else ""
    if isinstance(doc, dict):
        if doc.get("passed") is not True:
            for error in doc.get("errors", []):
                errors.append(f"Public API health failed: {error}")
            if not doc.get("errors"):
                errors.append("Public API health must pass.")
        if doc.get("api_url") != "https://api.staging.kresco.ma":
            errors.append("Public API health must target https://api.staging.kresco.ma.")
        if doc.get("ready_status") != "ready":
            errors.append("Public API /ready status must be ready.")
        release_sha = str(doc.get("release_sha") or "").strip()
        expected_sha = str(doc.get("expected_sha") or "").strip()
        if not release_sha:
            errors.append("Public API health must capture release_sha.")
        if runtime_sha and expected_sha != runtime_sha:
            errors.append("Public API health expected_sha must match runtime backend_release_sha.")
        if expected_sha and release_sha != expected_sha:
            errors.append("Public API health release_sha must match expected_sha.")
    return _result("public_api", errors)


def _check_public_auth(evidence_dir: Path) -> EvidenceCheck:
    errors: list[str] = []
    doc = _read_json(evidence_dir / "public-auth-readiness.json", errors, label="public auth readiness")
    if isinstance(doc, dict):
        if doc.get("passed") is not True:
            for error in doc.get("errors", []):
                errors.append(f"Public auth readiness failed: {error}")
            if not doc.get("errors"):
                errors.append("Public auth readiness must pass.")
        expected_domains = set(doc.get("expected_domains") if isinstance(doc.get("expected_domains"), list) else [])
        for domain in (
            "staging.kresco.ma",
            "www.staging.kresco.ma",
            "app.staging.kresco.ma",
            "admin.staging.kresco.ma",
            "prof.staging.kresco.ma",
            "staff.staging.kresco.ma",
        ):
            if domain not in expected_domains:
                errors.append(f"Public auth readiness did not check {domain}.")
    return _result("public_auth", errors)


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


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""


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
