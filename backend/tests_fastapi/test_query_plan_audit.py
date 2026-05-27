from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import app.models.courses  # noqa: F401
import app.models.gamification  # noqa: F401
import app.models.interactions  # noqa: F401
from app.models.base import Base


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
AUDIT_PATH = BACKEND_ROOT / "scripts" / "audit_query_plans.py"


def _load_query_plan_audit_module():
    spec = importlib.util.spec_from_file_location("audit_query_plans_for_tests", AUDIT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_required_hot_path_indexes_exist_in_model_metadata():
    audit = _load_query_plan_audit_module()

    for required in audit.REQUIRED_INDEXES:
        table = Base.metadata.tables[required.table]
        indexes = {index.name: tuple(column.name for column in index.columns) for index in table.indexes}
        assert indexes[required.name] == required.columns


def test_query_plan_audit_detects_missing_required_indexes():
    audit = _load_query_plan_audit_module()

    missing = audit._missing_indexes({
        "topic_sections": {"ix_topic_sections_topic_order": ("topic_id",)},
    })

    assert "topic_sections.ix_topic_sections_topic_order(topic_id, order, id)" in missing
    assert any(item.startswith("topic_items.ix_topic_items_workspace_order") for item in missing)


def test_query_plan_audit_accepts_expected_index_plans(monkeypatch):
    audit = _load_query_plan_audit_module()

    async def fake_explain(_connection, _sql):
        return "\n".join(f"Index Scan using {check.expected_index}" for check in audit.PLAN_CHECKS)

    monkeypatch.setattr(audit, "explain_query", fake_explain)
    connection = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    assert asyncio.run(audit._plan_failures(connection)) == []


def test_query_plan_audit_rejects_sequential_scans(monkeypatch):
    audit = _load_query_plan_audit_module()

    async def fake_explain(_connection, _sql):
        return "Seq Scan on topic_items"

    monkeypatch.setattr(audit, "explain_query", fake_explain)
    connection = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    failures = asyncio.run(audit._plan_failures(connection))

    assert any("did not use" in failure for failure in failures)
    assert any("sequential scan" in failure for failure in failures)


def test_hot_path_index_migration_declares_required_indexes():
    audit = _load_query_plan_audit_module()
    migration = (BACKEND_ROOT / "alembic" / "versions" / "0028_hot_path_composite_indexes.py").read_text(encoding="utf-8")

    assert 'down_revision: Union[str, None] = "0027_media_quota_counters"' in migration
    for required in audit.REQUIRED_INDEXES:
        assert required.name in migration
        assert required.table in migration
        for column in required.columns:
            assert f'"{column}"' in migration


def test_backend_ci_and_deploy_run_query_plan_audit():
    ci_workflow = (REPO_ROOT / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    deploy_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text(encoding="utf-8")

    assert 'DATABASE_URL="$CI_POSTGRES_DATABASE_URL" python scripts/audit_query_plans.py' in ci_workflow
    assert 'DATABASE_URL="$CI_POSTGRES_DATABASE_URL" python scripts/audit_query_plans.py' in deploy_workflow
