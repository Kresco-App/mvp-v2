from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "ensure_firebase_hosting_sites.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("ensure_firebase_hosting_sites_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_ensure_firebase_hosting_sites_accepts_existing_sites(monkeypatch):
    module = _load_module()

    def fake_site_exists(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return True, ""

    monkeypatch.setattr(module, "_site_exists", fake_site_exists)

    result = module.ensure_firebase_hosting_sites(
        environment="staging",
        ensure=False,
        access_token="token",
    )

    assert result.passed is True
    assert result.ensured is False
    assert {site.status for site in result.sites} == {"exists"}
    assert {site.site for site in result.sites} == {"kresco-staging", "kresco-staging-api"}


def test_ensure_firebase_hosting_sites_reports_missing_without_ensure(monkeypatch):
    module = _load_module()

    def fake_site_exists(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return False, "HTTP 404: not found"

    monkeypatch.setattr(module, "_site_exists", fake_site_exists)

    result = module.ensure_firebase_hosting_sites(
        environment="production",
        ensure=False,
        access_token="token",
    )

    assert result.passed is False
    assert {site.status for site in result.sites} == {"missing"}
    assert {site.site for site in result.sites} == {"kresco-prod", "kresco-prod-api"}


def test_ensure_firebase_hosting_sites_creates_missing_sites(monkeypatch):
    module = _load_module()
    created_sites: list[str] = []

    def fake_site_exists(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return False, "HTTP 404: not found"

    def fake_create_site(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        created_sites.append(site)
        return True, ""

    monkeypatch.setattr(module, "_site_exists", fake_site_exists)
    monkeypatch.setattr(module, "_create_site", fake_create_site)

    result = module.ensure_firebase_hosting_sites(
        environment="staging",
        ensure=True,
        access_token="token",
    )

    assert result.passed is True
    assert {site.status for site in result.sites} == {"created"}
    assert set(created_sites) == {"kresco-staging", "kresco-staging-api"}


def test_ensure_firebase_hosting_sites_fails_without_token():
    module = _load_module()

    result = module.ensure_firebase_hosting_sites(
        environment="staging",
        ensure=True,
        access_token="",
        access_token_error="missing token",
    )

    assert result.passed is False
    assert {site.status for site in result.sites} == {"auth_error"}
    assert all(site.errors == ("missing token",) for site in result.sites)
