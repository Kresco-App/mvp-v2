from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_EXACT_NAMES = {
    ".DS_Store",
    "Thumbs.db",
    "ehthumbs.db",
}
FORBIDDEN_EXACT_PATHS = {
    "TODO-MANUAL.md": "root scratch/manual file; move durable operational notes under docs/",
    "ARCHITECTURAL_SUGGESTIONS.md": "generated audit scratch file; fold durable findings into AGENT_BUG_DUMP.md or docs/",
    "backend/AGENT_BUG_DUMP.md": "duplicate agent dump; keep the root AGENT_BUG_DUMP.md canonical/",
    "diff_review.txt": "generated review artifact; do not keep large local diffs in the repo/",
}
FORBIDDEN_ROOT_SCRIPT_PREFIXES = (
    "append_bugs",
    "append_perf",
    "find_large",
    "mark_dump",
)
FORBIDDEN_SUFFIXES = {
    ".db",
    ".db-journal",
    ".pyc",
    ".pyo",
    ".sqlite",
    ".sqlite3",
    ".tgz",
}
FORBIDDEN_PARTS = {
    ".codex-logs",
    ".next",
    ".pytest_cache",
    "__pycache__",
    "coverage",
    "node_modules",
    "playwright-report",
    "package",
    "test-results",
}
ALLOWED_ENV_FILES = {
    ".env.example",
}


def main() -> int:
    tracked_paths = _git_hygiene_paths()
    problems = [
        problem
        for path in tracked_paths
        if path.exists()
        for problem in _hygiene_problems(path)
    ]

    if problems:
        print("Repository hygiene check failed. Remove these tracked local artifacts or secrets:")
        for problem in sorted(problems):
            print(f"- {problem}")
        return 1

    print("Repository hygiene check passed.")
    return 0


def _git_hygiene_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    raw_paths = result.stdout.decode("utf-8").split("\0")
    return [REPO_ROOT / raw_path for raw_path in raw_paths if raw_path]


def _hygiene_problems(path: Path) -> list[str]:
    relative_path = path.relative_to(REPO_ROOT).as_posix()
    parts = set(path.relative_to(REPO_ROOT).parts)
    suffix = path.name.lower()

    problems: list[str] = []
    if relative_path in FORBIDDEN_EXACT_PATHS:
        problems.append(f"{relative_path} is a {FORBIDDEN_EXACT_PATHS[relative_path]}.")
    if path.parent == REPO_ROOT and path.suffix == ".py" and path.stem.startswith(FORBIDDEN_ROOT_SCRIPT_PREFIXES):
        problems.append(f"{relative_path} is a generated audit helper script; keep durable automation under scripts/.")
    if path.name in FORBIDDEN_EXACT_NAMES:
        problems.append(f"{relative_path} is an OS-generated artifact.")
    if any(suffix.endswith(forbidden_suffix) for forbidden_suffix in FORBIDDEN_SUFFIXES):
        problems.append(f"{relative_path} is a generated binary/runtime artifact.")
    if parts & FORBIDDEN_PARTS:
        problems.append(f"{relative_path} is inside a generated artifact directory.")
    if _is_forbidden_env_file(path):
        problems.append(f"{relative_path} is a local environment file and must not be tracked.")

    return problems


def _is_forbidden_env_file(path: Path) -> bool:
    name = path.name
    if name in ALLOWED_ENV_FILES:
        return False
    return name == ".env" or name.startswith(".env.")


if __name__ == "__main__":
    raise SystemExit(main())
