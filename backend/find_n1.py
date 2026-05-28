from __future__ import annotations

import ast
import sys
from pathlib import Path


def check_file(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    findings: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr in {"execute", "scalar", "scalars"}:
                        findings.append(f"N+1 candidate in {path} at line {child.lineno}")

    return findings


def scan(root: Path) -> tuple[list[str], list[str]]:
    findings: list[str] = []
    errors: list[str] = []

    for path in root.rglob("*.py"):
        try:
            findings.extend(check_file(path))
        except (OSError, SyntaxError, UnicodeDecodeError) as exc:
            errors.append(f"Could not parse {path}: {type(exc).__name__}: {exc}")

    return findings, errors


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    root = Path(args[0]).resolve() if args else Path(__file__).resolve().parent / "app"
    findings, errors = scan(root)

    for finding in findings:
        print(finding)
    for error in errors:
        print(error, file=sys.stderr)

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
