from __future__ import annotations

import ast
import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parent

BASELINED_FINDINGS = {
    "backend/app/routers/courses.py:77",
    "backend/app/routers/quizzes.py:34",
    "backend/app/services/course_progress.py:111",
    "backend/app/services/course_progress.py:143",
    "backend/app/services/course_progress.py:144",
    "backend/app/services/course_tab_quiz_submission.py:246",
    "backend/app/services/course_tab_quiz_submission.py:296",
    "backend/app/services/course_tab_quiz_submission.py:344",
}


@dataclass(frozen=True)
class N1Finding:
    path: Path
    lineno: int

    @property
    def key(self) -> str:
        return f"{_display_path(self.path)}:{self.lineno}"

    @property
    def message(self) -> str:
        return f"N+1 candidate in {_display_path(self.path)} at line {self.lineno}"


def _display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(resolved)


def _python_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path] if path.suffix == ".py" else []
    return sorted(path.rglob("*.py"))


def check_file(path: Path) -> list[N1Finding]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    findings: list[N1Finding] = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr in {"execute", "scalar", "scalars"}:
                        findings.append(N1Finding(path, child.lineno))

    return findings


def scan(paths: list[Path]) -> tuple[list[N1Finding], list[str]]:
    findings: list[N1Finding] = []
    errors: list[str] = []

    for root in paths:
        for path in _python_files(root):
            try:
                findings.extend(check_file(path))
            except (OSError, SyntaxError, UnicodeDecodeError) as exc:
                errors.append(f"Could not parse {path}: {type(exc).__name__}: {exc}")

    return findings, errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan Python files for simple looped DB access patterns.")
    parser.add_argument("paths", nargs="*", help="Files or directories to scan. Defaults to backend/app.")
    parser.add_argument(
        "--no-baseline",
        action="store_true",
        help="Fail on every finding, including current repository-baselined findings.",
    )
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    roots = [Path(path).resolve() for path in args.paths] if args.paths else [BACKEND_ROOT / "app"]
    findings, errors = scan(roots)
    allowed = set() if args.no_baseline else BASELINED_FINDINGS
    unexpected_findings = [finding for finding in findings if finding.key not in allowed]

    for finding in findings:
        print(finding.message)
    for error in errors:
        print(error, file=sys.stderr)
    for finding in unexpected_findings:
        print(f"Unapproved N+1 finding: {finding.key}", file=sys.stderr)

    return 1 if errors or unexpected_findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
