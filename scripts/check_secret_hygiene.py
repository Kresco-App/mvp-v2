from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
ROTATION_CHECKLIST_PATH = REPO_ROOT / "docs" / "secrets-rotation-checklist.md"

SENSITIVE_ENV_NAMES = {
    "ADMIN_PASSWORD",
    "DATABASE_URL",
    "FIREBASE_WEB_API_KEY",
    "GCP_DEPLOY_SERVICE_ACCOUNT",
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "JWT_SECRET_KEY",
    "KRESCO_INTERNAL_SECRET",
    "KRESCO_RATE_LIMIT_STORAGE_URI",
    "REALTIME_OUTBOX_SECRET",
    "VDOCIPHER_API_SECRET",
    "VDOCIPHER_LIVE_CREATE_URL",
}
REQUIRED_ROTATION_RECORD_IDENTIFIERS = (
    "DATABASE_URL",
    "FIREBASE_WEB_API_KEY",
    "GCP_DEPLOY_SERVICE_ACCOUNT",
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "JWT_SECRET_KEY",
    "KRESCO_RATE_LIMIT_STORAGE_URI",
    "MEDIA_GCS_BUCKET",
    "REALTIME_OUTBOX_SECRET",
    "VDOCIPHER_API_SECRET",
    "VDOCIPHER_LIVE_CREATE_URL",
)
SENSITIVE_NAME_FRAGMENTS = ("SECRET", "PASSWORD", "PRIVATE_KEY", "API_KEY")
NON_SECRET_TOKEN_NAME_FRAGMENTS = (
    "TOKEN_TTL",
    "TOKEN_VERSION",
    "TOKEN_EXPIRATION",
    "TOKEN_EXPIRY",
    "TOKEN_FILE",
    "TOKENS_FILE",
    "TOKEN_SECONDS",
    "TOKEN_MINUTES",
    "TOKEN_HOURS",
)
ENV_ASSIGNMENT_RE = re.compile(
    r"^\s*(?:export\s+)?(?P<key>[A-Z][A-Z0-9_]*)\s*[:=]\s*(?P<value>.+?)\s*$"
)
SECRET_VALUE_PATTERNS = (
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b")),
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----")),
)
ENV_SECRET_VALUE_PATTERNS = (
    ("jwt-token", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
)
TEXT_SUFFIXES = {
    ".cjs",
    ".css",
    ".env",
    ".example",
    ".ini",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
SKIP_PARTS = {
    ".git",
    ".next",
    ".pytest_cache",
    "__pycache__",
    "coverage",
    "node_modules",
    "playwright-report",
    "test-results",
    "venv",
    ".venv",
}
ALLOW_VALUE_MARKERS = (
    "__SET_IN_SECRET_MANAGER__",
    "change-me",
    "example",
    "fake",
    "fallback-secret-change-in-production",
    "google-client",
    "placeholder",
    "sqlite+aiosqlite",
    "test-",
    "user:pass@",
    "user:password@",
)


@dataclass(frozen=True)
class SecretFinding:
    path: str
    line: int
    kind: str
    identifier: str

    def format(self) -> str:
        return f"{self.path}:{self.line}: {self.kind} ({self.identifier})"


@dataclass(frozen=True)
class RequiredRotationRecord:
    secret_name: str
    environment: str


REQUIRED_ROTATION_RECORDS = (
    RequiredRotationRecord("DATABASE_URL", "staging"),
    RequiredRotationRecord("DATABASE_URL", "production"),
    RequiredRotationRecord("JWT_SECRET_KEY", "staging"),
    RequiredRotationRecord("JWT_SECRET_KEY", "production"),
    RequiredRotationRecord("REALTIME_OUTBOX_SECRET", "staging"),
    RequiredRotationRecord("REALTIME_OUTBOX_SECRET", "production"),
    RequiredRotationRecord("KRESCO_RATE_LIMIT_STORAGE_URI", "staging"),
    RequiredRotationRecord("KRESCO_RATE_LIMIT_STORAGE_URI", "production"),
    RequiredRotationRecord("GCP_WORKLOAD_IDENTITY_PROVIDER / GCP_DEPLOY_SERVICE_ACCOUNT", "deploy"),
    RequiredRotationRecord("MEDIA_GCS_BUCKET policy and lifecycle", "staging"),
    RequiredRotationRecord("MEDIA_GCS_BUCKET policy and lifecycle", "production"),
    RequiredRotationRecord("FIREBASE_WEB_API_KEY", "staging"),
    RequiredRotationRecord("FIREBASE_WEB_API_KEY", "production"),
    RequiredRotationRecord("VDOCIPHER_API_SECRET / VDOCIPHER_LIVE_CREATE_URL", "staging"),
    RequiredRotationRecord("VDOCIPHER_API_SECRET / VDOCIPHER_LIVE_CREATE_URL", "production"),
)

REQUIRED_ROTATION_COLUMNS = (
    "Secret Name",
    "Provider",
    "Environment",
    "Owner",
    "Rotated At UTC",
    "Old Value Revoked",
    "Evidence Link",
)
ROTATION_PLACEHOLDER_VALUES = {"", "tbd", "todo", "pending", "n/a", "na", "none", "placeholder"}
ROTATION_PLACEHOLDER_TOKEN_RE = re.compile(r"\b(?:tbd|todo|pending|none|placeholder)\b|(?:^|\s)n/?a(?:$|\s)", re.I)
AFFIRMATIVE_REVOCATION_VALUES = {"yes", "y", "true", "revoked", "disabled", "complete", "completed", "verified"}
NEGATIVE_REVOCATION_RE = re.compile(r"\b(?:not|no|without|pending|todo|planned|deferred|will|after launch)\b", re.I)


def scan_text(path: Path, text: str) -> list[SecretFinding]:
    relative_path = _relative(path)
    findings: list[SecretFinding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(line):
                findings.append(SecretFinding(relative_path, line_number, kind, "redacted"))

        if not _should_scan_env_assignment(path):
            continue
        env_match = ENV_ASSIGNMENT_RE.match(line)
        if not env_match:
            continue
        key = env_match.group("key")
        value = _normalize_value(env_match.group("value"))
        if value and not _is_allowed_placeholder_value(value):
            for kind, pattern in ENV_SECRET_VALUE_PATTERNS:
                if pattern.search(value):
                    findings.append(SecretFinding(relative_path, line_number, kind, "redacted"))
        if _is_sensitive_key(key) and value and not _is_allowed_placeholder_value(value):
            findings.append(SecretFinding(relative_path, line_number, "literal-sensitive-env-value", key))
    return findings


def scan_paths(paths: Iterable[Path]) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    for path in paths:
        if not _is_scan_candidate(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        findings.extend(scan_text(path, text))
    return findings


def scan_rotation_checklist(path: Path = ROTATION_CHECKLIST_PATH) -> list[SecretFinding]:
    if not path.exists():
        return [SecretFinding(_relative(path), 1, "rotation-checklist-missing-file", "docs/secrets-rotation-checklist.md")]
    return scan_rotation_checklist_text(path, path.read_text(encoding="utf-8"))


def scan_rotation_checklist_text(path: Path, text: str) -> list[SecretFinding]:
    relative_path = _relative(path)
    findings: list[SecretFinding] = []
    records = _parse_rotation_records(text)
    if not records:
        return [SecretFinding(relative_path, 1, "rotation-checklist-missing-table", "rotation-record-template")]

    seen_records = {
        (
            _normalize_rotation_cell(row.get("Secret Name", "")),
            _normalize_rotation_environment(row.get("Environment", "")),
        )
        for _, row in records
    }
    for required in REQUIRED_ROTATION_RECORDS:
        record_key = (_normalize_rotation_cell(required.secret_name), _normalize_rotation_environment(required.environment))
        if record_key not in seen_records:
            findings.append(
                SecretFinding(
                    relative_path,
                    1,
                    "rotation-checklist-missing-record",
                    f"{required.secret_name} [{required.environment}]",
                )
            )

    for line_number, row in records:
        findings.extend(_validate_rotation_record(relative_path, line_number, row))
    return findings


def _parse_rotation_records(text: str) -> list[tuple[int, dict[str, str]]]:
    header: list[str] | None = None
    records: list[tuple[int, dict[str, str]]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        cells = _markdown_cells(line)
        if not cells:
            if header is not None and records:
                break
            continue
        if header is None:
            if all(column in cells for column in REQUIRED_ROTATION_COLUMNS):
                header = cells
            continue
        if _is_markdown_separator(cells):
            continue
        if len(cells) < len(header):
            if records:
                break
            continue
        row = {column: cells[index] for index, column in enumerate(header) if index < len(cells)}
        if any(row.get(column, "").strip() for column in REQUIRED_ROTATION_COLUMNS):
            records.append((line_number, row))
        elif records:
            break
    return records


def _validate_rotation_record(relative_path: str, line_number: int, row: dict[str, str]) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    secret_name = _normalize_rotation_cell(row.get("Secret Name", ""))
    environment = _normalize_rotation_environment(row.get("Environment", ""))
    row_identifier = f"{secret_name or 'unknown'} [{environment or 'unknown'}]"

    for column in REQUIRED_ROTATION_COLUMNS:
        value = row.get(column, "")
        if _is_rotation_placeholder(value):
            findings.append(
                SecretFinding(
                    relative_path,
                    line_number,
                    "rotation-checklist-placeholder",
                    f"{row_identifier} {column}",
                )
            )

    rotated_at = row.get("Rotated At UTC", "")
    if not _is_rotation_placeholder(rotated_at) and not _is_valid_rotation_timestamp(rotated_at):
        findings.append(
            SecretFinding(relative_path, line_number, "rotation-checklist-invalid-timestamp", row_identifier)
        )

    revoked = row.get("Old Value Revoked", "")
    if not _is_rotation_placeholder(revoked) and not _is_affirmative_revocation(revoked):
        findings.append(
            SecretFinding(relative_path, line_number, "rotation-checklist-revocation-missing", row_identifier)
        )

    evidence = row.get("Evidence Link", "")
    if not _is_rotation_placeholder(evidence) and not _is_strong_evidence_reference(evidence):
        findings.append(SecretFinding(relative_path, line_number, "rotation-checklist-weak-evidence", row_identifier))

    return findings


def _markdown_cells(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return []
    cells: list[str] = []
    current: list[str] = []
    index = 1
    while index < len(stripped):
        char = stripped[index]
        if char == "\\" and index + 1 < len(stripped) and stripped[index + 1] == "|":
            current.append("|")
            index += 2
            continue
        if char == "|":
            cells.append("".join(current).strip())
            current = []
            index += 1
            continue
        current.append(char)
        index += 1
    if current or not stripped.endswith("|"):
        cells.append("".join(current).strip())
    return cells


def _is_markdown_separator(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _normalize_rotation_cell(value: str) -> str:
    normalized = value.replace("`", "").strip()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*/\s*", " / ", normalized)
    return normalized


def _normalize_rotation_environment(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _is_rotation_placeholder(value: str) -> bool:
    normalized = _normalize_rotation_cell(value).strip()
    lowered = normalized.lower()
    if lowered in ROTATION_PLACEHOLDER_VALUES:
        return True
    if ROTATION_PLACEHOLDER_TOKEN_RE.search(lowered):
        return True
    return normalized.startswith("<") and normalized.endswith(">")


def _is_valid_rotation_timestamp(value: str) -> bool:
    stripped = value.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", stripped):
        return False
    try:
        datetime.strptime(stripped, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return False
    return True


def _is_affirmative_revocation(value: str) -> bool:
    normalized = _normalize_rotation_cell(value).lower()
    if NEGATIVE_REVOCATION_RE.search(normalized):
        return False
    return (
        normalized in AFFIRMATIVE_REVOCATION_VALUES
        or normalized.startswith("yes ")
        or normalized.startswith("revoked ")
        or normalized.startswith("disabled ")
    )


def _is_strong_evidence_reference(value: str) -> bool:
    raw = value.strip()
    if re.search(r"https?://\S{8,}", raw):
        return True
    normalized = _normalize_rotation_cell(value)
    lowered = normalized.lower()
    if lowered in {"done", "yes", "ok", "link", "evidence", "screenshot", "provider evidence"}:
        return False
    if re.search(r"\b[A-Z][A-Z0-9]+-\d+\b", normalized):
        return True
    if re.search(r"\b(?:run|ticket|issue|pr|audit|artifact|log|cloudtrail|rotation)[-_:#/]?[A-Za-z0-9-]*\d", normalized, re.I):
        return True
    return False


def tracked_paths(root: Path = REPO_ROOT) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
    )
    return [root / raw_path for raw_path in result.stdout.decode("utf-8").split("\0") if raw_path]


def local_env_paths(root: Path = REPO_ROOT) -> list[Path]:
    candidates: list[Path] = []
    for path in root.rglob(".env*"):
        if not path.is_file() or path.name == ".env.example":
            continue
        if set(path.relative_to(root).parent.parts) & SKIP_PARTS:
            continue
        candidates.append(path)
    return _git_ignored_paths(candidates, root)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan for high-confidence checked-in or local secret material.")
    parser.add_argument("--include-local-env", action="store_true", help="Also scan ignored local .env files.")
    parser.add_argument(
        "--require-rotation-checklist",
        action="store_true",
        help="Require docs/secrets-rotation-checklist.md to have complete provider rotation evidence.",
    )
    args = parser.parse_args(argv)

    findings = scan_paths(tracked_paths())
    scanned_local_env_paths: list[Path] = []
    if args.include_local_env:
        scanned_local_env_paths = local_env_paths()
        findings.extend(scan_paths(scanned_local_env_paths))
    if args.require_rotation_checklist:
        findings.extend(scan_rotation_checklist())

    if findings:
        print("Secret hygiene check failed. Findings are redacted; rotate any real exposed credentials.")
        if args.include_local_env:
            print(f"Scanned {len(scanned_local_env_paths)} ignored local env file(s).")
        for finding in sorted(findings, key=lambda item: (item.path, item.line, item.kind)):
            print(f"- {finding.format()}")
        return 1

    print("Secret hygiene check passed.")
    if args.include_local_env:
        print(f"Scanned {len(scanned_local_env_paths)} ignored local env file(s).")
    if args.require_rotation_checklist:
        print("Rotation checklist evidence is complete.")
    return 0


def _is_sensitive_key(key: str) -> bool:
    if key in SENSITIVE_ENV_NAMES:
        return True
    if any(fragment in key for fragment in SENSITIVE_NAME_FRAGMENTS):
        return True
    if "TOKEN" in key:
        return not any(fragment in key for fragment in NON_SECRET_TOKEN_NAME_FRAGMENTS)
    return False


def _normalize_value(value: str) -> str:
    value = value.strip()
    if "#" in value and not value.startswith("${{"):
        value = value.split("#", 1)[0].strip()
    return value.strip("'\"")


def _is_allowed_placeholder_value(value: str) -> bool:
    normalized = value.strip().strip("'\"")
    if normalized == "":
        return True
    lowered = normalized.lower()
    if normalized.startswith("<") and normalized.endswith(">"):
        return True
    if re.search(r"\$\{\{\s*(?:secrets|vars|env)\.", normalized):
        return True
    if re.search(r"\$[A-Z][A-Z0-9_]*", normalized):
        return True
    if lowered in {"postgres", "postgres:postgres"}:
        return True
    if "://postgres:postgres@" in lowered:
        return True
    return any(marker.lower() in lowered for marker in ALLOW_VALUE_MARKERS)


def _git_ignored_paths(paths: Iterable[Path], root: Path) -> list[Path]:
    root = root.resolve()
    rel_to_path: dict[str, Path] = {}
    for path in paths:
        try:
            rel_to_path[path.resolve().relative_to(root).as_posix()] = path
        except ValueError:
            continue
    if not rel_to_path:
        return []

    stdin = "\0".join(rel_to_path).encode("utf-8") + b"\0"
    result = subprocess.run(
        ["git", "check-ignore", "-z", "--stdin"],
        cwd=root,
        input=stdin,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode not in {0, 1}:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Unable to determine ignored local env files: {message}")

    ignored: list[Path] = []
    for raw_path in result.stdout.decode("utf-8").split("\0"):
        if raw_path:
            ignored.append(rel_to_path[raw_path])
    return sorted(ignored)


def _is_scan_candidate(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        relative_parts = set(path.relative_to(REPO_ROOT).parent.parts)
    except ValueError:
        relative_parts = set(path.parent.parts)
    if relative_parts & SKIP_PARTS:
        return False
    if path.suffix.lower() in TEXT_SUFFIXES:
        return True
    return path.name.startswith(".env") or path.name.endswith(".example")


def _should_scan_env_assignment(path: Path) -> bool:
    return path.name.startswith(".env") or path.suffix.lower() in {".env", ".example", ".md", ".txt", ".yaml", ".yml"}


def _relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
