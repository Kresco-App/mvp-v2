from __future__ import annotations

import importlib.util
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_VERSION_NUM_LIMIT = 32


def test_alembic_revision_ids_fit_default_postgres_version_table():
    migration_dir = BACKEND_ROOT / "alembic" / "versions"
    revision_ids: dict[str, Path] = {}

    for path in migration_dir.glob("*.py"):
        spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
        assert spec is not None
        assert spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        revision = getattr(module, "revision")
        assert isinstance(revision, str)
        assert len(revision) <= ALEMBIC_VERSION_NUM_LIMIT, path.name
        assert revision not in revision_ids, f"{revision} reused by {path.name} and {revision_ids[revision].name}"
        revision_ids[revision] = path
