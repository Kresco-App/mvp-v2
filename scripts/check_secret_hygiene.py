from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]

SENSITIVE_ENV_NAMES = {
    "ABLY_API_KEY",
    "ADMIN_PASSWORD",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "JWT_SECRET_KEY",
    "KRESCO_INTERNAL_SECRET",
    "MEDIA_S3_BUCKET",
    "REALTIME_OUTBOX_SECRET",
    "RESEND_API_KEY",
    "STRIPE_PRODUCT_ID",
    "STRIPE_SK",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "VDOCIPHER_API_SECRET",
    "VDOCIPHER_LIVE_CREATE_URL",
    "VERCEL_TOKEN",
}
SENSITIVE_NAME_FRAGMENTS = ("SECRET", "PASSWORD", "PRIVATE_KEY", "API_KEY")
ENV_ASSIGNMENT_RE = re.compile(
    r"^\s*(?:export\s+)?(?P<key>[A-Z][A-Z0-9_]*)\s*[:=]\s*(?P<value>.+?)\s*$"
)
SECRET_VALUE_PATTERNS = (
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b")),
    ("stripe-live-secret", re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b")),
    ("stripe-webhook-secret", re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b")),
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----")),
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
    "${{ secrets.",
    "${{ vars.",
    "<",
    ">",
    "__SET_IN_AWS_SECRETS__",
    "change-me",
    "example",
    "fake",
    "fallback-secret-change-in-production",
    "google-client",
    "placeholder",
    "postgres",
    "postgres:postgres",
    "sqlite+aiosqlite",
    "test-",
    "user:pass@",
)


@dataclass(frozen=True)
class SecretFinding:
    path: str
    line: int
    kind: str
    identifier: str

    def format(self) -> str:
        return f"{self.path}:{self.line}: {self.kind} ({self.identifier})"


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


def tracked_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return [REPO_ROOT / raw_path for raw_path in result.stdout.decode("utf-8").split("\0") if raw_path]


def local_env_paths(root: Path = REPO_ROOT) -> list[Path]:
    paths: list[Path] = []
    for path in root.rglob(".env*"):
        if not path.is_file() or path.name == ".env.example":
            continue
        if set(path.relative_to(root).parts) & SKIP_PARTS:
            continue
        paths.append(path)
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan for high-confidence checked-in or local secret material.")
    parser.add_argument("--include-local-env", action="store_true", help="Also scan ignored local .env files.")
    args = parser.parse_args(argv)

    findings = scan_paths(tracked_paths())
    if args.include_local_env:
        findings.extend(scan_paths(local_env_paths()))

    if findings:
        print("Secret hygiene check failed. Findings are redacted; rotate any real exposed credentials.")
        for finding in sorted(findings, key=lambda item: (item.path, item.line, item.kind)):
            print(f"- {finding.format()}")
        return 1

    print("Secret hygiene check passed.")
    return 0


def _is_sensitive_key(key: str) -> bool:
    return key in SENSITIVE_ENV_NAMES or any(fragment in key for fragment in SENSITIVE_NAME_FRAGMENTS)


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
    return any(marker.lower() in lowered for marker in ALLOW_VALUE_MARKERS)


def _is_scan_candidate(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        relative_parts = set(path.relative_to(REPO_ROOT).parts)
    except ValueError:
        relative_parts = set(path.parts)
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
