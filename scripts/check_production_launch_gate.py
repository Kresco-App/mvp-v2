from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRACEABILITY_PATH = REPO_ROOT / "docs" / "production-remediation-traceability.md"
DEFAULT_SWITCH_PATH = REPO_ROOT / "PRODUCTION-SWITCH.md"
PASSING_STATUS = "verified"
ALLOWED_STATUSES = frozenset({"blocked", "in_progress", "pending", "verified"})
REQUIRED_TRACEABILITY_IDS = (
    "OPS-FREEZE-001",
    "SEC-CSRF-001",
    "SEC-CSP-001",
    "SEC-CSP-STYLE-001",
    "SEC-ADMIN-001",
    "SEC-LIVE-001",
    "SEC-SECRETS-001",
    "MEDIA-S3-001",
    "MEDIA-AUTH-001",
    "RT-FANOUT-001",
    "RT-OUTBOX-001",
    "E2E-STUDENT-001",
    "E2E-PROF-001",
    "E2E-UPLOAD-001",
    "E2E-NEGATIVE-001",
    "PERF-TOPIC-001",
    "PERF-WATCH-001",
    "PERF-XP-001",
    "PERF-LIVE-001",
    "PERF-PAGE-001",
    "FE-ERROR-001",
    "FE-DATA-001",
    "FE-DEMO-001",
    "OPS-STAGE-001",
    "OPS-RDS-001",
    "OPS-LAMBDA-001",
    "OPS-RUNBOOK-001",
    "OPS-READY-001",
)


@dataclass(frozen=True)
class TraceabilityRow:
    gate_id: str
    finding: str
    status: str


@dataclass(frozen=True)
class LaunchGateResult:
    passed: bool
    incomplete_rows: tuple[TraceabilityRow, ...]
    current_score: float | None
    target_score: float | None
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "current_score": self.current_score,
            "target_score": self.target_score,
            "errors": list(self.errors),
            "incomplete_rows": [
                {"id": row.gate_id, "status": row.status, "finding": row.finding}
                for row in self.incomplete_rows
            ],
        }


def evaluate_launch_gate(traceability_text: str, switch_text: str) -> LaunchGateResult:
    rows = _parse_traceability_rows(traceability_text)
    current_score, target_score = _parse_switch_scores(switch_text)
    errors: list[str] = []

    if not rows:
        errors.append("No traceability gate rows were found.")

    row_ids = [row.gate_id for row in rows]
    row_id_set = set(row_ids)
    duplicate_ids = sorted({gate_id for gate_id in row_ids if row_ids.count(gate_id) > 1})
    missing_ids = [gate_id for gate_id in REQUIRED_TRACEABILITY_IDS if gate_id not in row_id_set]
    unexpected_ids = sorted(row_id_set - set(REQUIRED_TRACEABILITY_IDS))
    invalid_status_rows = tuple(row for row in rows if row.status.lower() not in ALLOWED_STATUSES)

    if missing_ids:
        errors.append(f"Missing required traceability gate row(s): {', '.join(missing_ids)}.")
    if duplicate_ids:
        errors.append(f"Duplicate traceability gate row(s): {', '.join(duplicate_ids)}.")
    if unexpected_ids:
        errors.append(f"Unexpected traceability gate row(s): {', '.join(unexpected_ids)}.")
    if invalid_status_rows:
        rendered = ", ".join(f"{row.gate_id}={row.status}" for row in invalid_status_rows[:10])
        suffix = "" if len(invalid_status_rows) <= 10 else f", ...and {len(invalid_status_rows) - 10} more"
        errors.append(f"Invalid traceability status value(s): {rendered}{suffix}.")

    incomplete_rows = tuple(row for row in rows if row.status.lower() != PASSING_STATUS)
    if incomplete_rows:
        errors.append(f"{len(incomplete_rows)} traceability gate row(s) are not {PASSING_STATUS}.")

    if current_score is None:
        errors.append("Current launch readiness score is missing from PRODUCTION-SWITCH.md.")
    if target_score is None:
        errors.append("Target launch readiness score is missing from PRODUCTION-SWITCH.md.")
    if current_score is not None and target_score is not None and current_score < target_score:
        errors.append(f"Launch readiness score {current_score:g}/10 is below target {target_score:g}/10.")

    return LaunchGateResult(
        passed=not errors,
        incomplete_rows=incomplete_rows,
        current_score=current_score,
        target_score=target_score,
        errors=tuple(errors),
    )


def _parse_traceability_rows(markdown: str) -> tuple[TraceabilityRow, ...]:
    rows: list[TraceabilityRow] = []
    in_gate_table = False

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line == "## Evidence Log":
            break
        if line.startswith("| ID | Finding | Required Change | Evidence Required | Status |"):
            in_gate_table = True
            continue
        if not in_gate_table or not line.startswith("|"):
            continue
        if set(line.replace("|", "").strip()) <= {"-", " "}:
            continue

        cells = _split_markdown_row(line)
        if len(cells) != 5:
            continue
        gate_id, finding, _required_change, _evidence_required, status = cells
        if gate_id and gate_id != "ID":
            rows.append(TraceabilityRow(gate_id=gate_id, finding=finding, status=status.strip("`").lower()))

    return tuple(rows)


def _split_markdown_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _parse_switch_scores(markdown: str) -> tuple[float | None, float | None]:
    current = _first_score(markdown, r"Current non-Stripe launch readiness:\s*\*\*([0-9]+(?:\.[0-9]+)?)/10\*\*")
    target = _first_score(markdown, r"Target for broad student production:\s*\*\*([0-9]+(?:\.[0-9]+)?)/10\*\*")
    return current, target


def _first_score(markdown: str, pattern: str) -> float | None:
    match = re.search(pattern, markdown)
    return float(match.group(1)) if match else None


def check_paths(traceability_path: Path, switch_path: Path) -> LaunchGateResult:
    missing = [str(path) for path in (traceability_path, switch_path) if not path.exists()]
    if missing:
        return LaunchGateResult(
            passed=False,
            incomplete_rows=(),
            current_score=None,
            target_score=None,
            errors=tuple(f"Required launch-gate file is missing: {path}" for path in missing),
        )

    return evaluate_launch_gate(
        traceability_path.read_text(encoding="utf-8"),
        switch_path.read_text(encoding="utf-8"),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fail closed unless the production launch gate is complete.")
    parser.add_argument("--traceability", type=Path, default=DEFAULT_TRACEABILITY_PATH)
    parser.add_argument("--switch", type=Path, default=DEFAULT_SWITCH_PATH)
    parser.add_argument("--json", action="store_true", help="Print machine-readable gate evidence.")
    args = parser.parse_args(argv)

    result = check_paths(args.traceability.resolve(), args.switch.resolve())
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: LaunchGateResult) -> None:
    if result.passed:
        print("Production launch gate passed.")
        return

    print("Production launch gate failed. Production deploy remains frozen.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    for row in result.incomplete_rows[:20]:
        print(f"- {row.gate_id}: status={row.status} finding={row.finding}", file=sys.stderr)
    if len(result.incomplete_rows) > 20:
        remaining = len(result.incomplete_rows) - 20
        print(f"- ...and {remaining} more incomplete gate row(s).", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
