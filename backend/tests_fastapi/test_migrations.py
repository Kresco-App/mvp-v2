from __future__ import annotations

import importlib.util
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_VERSION_NUM_LIMIT = 32


def _load_migration_modules():
    migration_dir = BACKEND_ROOT / "alembic" / "versions"
    for path in migration_dir.glob("*.py"):
        spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
        assert spec is not None
        assert spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield path, module


def test_alembic_revision_ids_fit_default_postgres_version_table():
    revision_ids: dict[str, Path] = {}

    for path, module in _load_migration_modules():
        revision = getattr(module, "revision")
        assert isinstance(revision, str)
        assert len(revision) <= ALEMBIC_VERSION_NUM_LIMIT, path.name
        assert revision not in revision_ids, f"{revision} reused by {path.name} and {revision_ids[revision].name}"
        revision_ids[revision] = path


def test_alembic_revisions_form_one_linear_chain():
    revisions: dict[str, Path] = {}
    down_revisions: dict[str, str | None] = {}

    for path, module in _load_migration_modules():
        revision = getattr(module, "revision")
        down_revision = getattr(module, "down_revision")
        assert isinstance(revision, str)
        assert down_revision is None or isinstance(down_revision, str), path.name
        revisions[revision] = path
        down_revisions[revision] = down_revision

    referenced = {down_revision for down_revision in down_revisions.values() if down_revision is not None}
    missing = referenced - set(revisions)
    assert missing == set()

    heads = set(revisions) - referenced
    roots = {revision for revision, down_revision in down_revisions.items() if down_revision is None}
    assert len(heads) == 1
    assert roots == {"0000"}

    current = next(iter(heads))
    visited: set[str] = set()
    while current is not None:
        assert current not in visited, f"Cycle detected at Alembic revision {current}"
        visited.add(current)
        current = down_revisions[current]

    assert visited == set(revisions)
