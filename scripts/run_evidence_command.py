#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


SENSITIVE_ENV_NAME_RE = re.compile(r"(SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|API[_-]?KEY|AUTH)", re.I)
SECRET_SHAPED_PATTERNS = (
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b"),
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run an evidence collector, write redacted JSON output, and preserve the collector exit code."
    )
    parser.add_argument("--name", required=True, help="Stable evidence collector name.")
    parser.add_argument("--output", required=True, type=Path, help="Path to write the evidence wrapper JSON.")
    parser.add_argument("--require-json", action="store_true", help="Fail unless stdout is a single JSON document.")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command to run after --.")
    args = parser.parse_args(argv)

    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("A command is required after --.")

    result = subprocess.run(command, check=False, text=True, capture_output=True)
    payload = build_payload(args.name, result.returncode, result.stdout, result.stderr, require_json=args.require_json)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if result.stdout.strip():
        print(redact_text(result.stdout).rstrip())
    if result.stderr.strip():
        print(redact_text(result.stderr).rstrip(), file=sys.stderr)
    print(f"Wrote evidence wrapper to {args.output}")
    if args.require_json and payload["stdout_json"] is None:
        return result.returncode or 1
    return result.returncode


def build_payload(name: str, exit_code: int, stdout: str, stderr: str, *, require_json: bool = False) -> dict[str, Any]:
    stdout_text = redact_text(stdout)
    stderr_text = redact_text(stderr)
    parsed_stdout = _parse_json(stdout_text)
    wrapper_errors: list[str] = []
    if require_json and parsed_stdout is None:
        wrapper_errors.append("stdout must be a single valid JSON document.")
    payload: dict[str, Any] = {
        "name": name,
        "exit_code": exit_code,
        "passed": exit_code == 0 and not wrapper_errors,
        "stdout_json": parsed_stdout,
        "stdout": "" if parsed_stdout is not None else _bounded_text(stdout_text),
        "stderr": _bounded_text(stderr_text),
        "wrapper_errors": wrapper_errors,
    }
    return payload


def redact_text(value: str) -> str:
    redacted = value
    for secret_value in _sensitive_env_values():
        redacted = redacted.replace(secret_value, "[redacted]")
    for pattern in SECRET_SHAPED_PATTERNS:
        redacted = pattern.sub("[redacted]", redacted)
    redacted = re.sub(r"(?i)(token|secret|password|api[_-]?key)=([^&\s]+)", r"\1=[redacted]", redacted)
    redacted = re.sub(r"(?i)(authorization:\s*)(bearer|basic)\s+\S+", r"\1\2 [redacted]", redacted)
    return redacted


def _sensitive_env_values() -> list[str]:
    values: list[str] = []
    for key, value in os.environ.items():
        if not value or len(value) < 8:
            continue
        if SENSITIVE_ENV_NAME_RE.search(key):
            values.append(value)
    return sorted(values, key=len, reverse=True)


def _parse_json(value: str) -> Any | None:
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def _bounded_text(value: str, limit: int = 6000) -> str:
    stripped = value.strip()
    if len(stripped) <= limit:
        return stripped
    return stripped[:limit] + "\n[truncated]"


if __name__ == "__main__":
    raise SystemExit(main())
