from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "ensure_firebase_hosting_domains.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("ensure_firebase_hosting_domains_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_ensure_firebase_hosting_domains_accepts_existing_domains(monkeypatch):
    module = _load_module()

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        if site == "kresco-staging":
            return (
                (
                    "staging.kresco.ma",
                    "www.staging.kresco.ma",
                    "app.staging.kresco.ma",
                    "admin.staging.kresco.ma",
                    "prof.staging.kresco.ma",
                    "staff.staging.kresco.ma",
                ),
                "",
            )
        return (("api.staging.kresco.ma",), "")

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)

    result = module.ensure_firebase_hosting_domains(
        environment="staging",
        ensure=False,
        validate_only=False,
        access_token="token",
    )

    assert result.passed is True
    assert {domain.status for domain in result.domains} == {"exists"}


def test_ensure_firebase_hosting_domains_reports_missing_without_ensure(monkeypatch):
    module = _load_module()

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return (), ""

    def fake_fetch_resource(*, project_id: str, site: str, domain: str, access_token: str, timeout_seconds: float):
        return False, ""

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)
    monkeypatch.setattr(module, "_fetch_custom_domain_resource", fake_fetch_resource)

    result = module.ensure_firebase_hosting_domains(
        environment="production",
        ensure=False,
        validate_only=False,
        access_token="token",
    )

    assert result.passed is False
    assert {domain.status for domain in result.domains} == {"missing"}
    assert {domain.domain for domain in result.domains} == {
        "kresco.ma",
        "www.kresco.ma",
        "app.kresco.ma",
        "admin.kresco.ma",
        "prof.kresco.ma",
        "staff.kresco.ma",
        "api.kresco.ma",
    }


def test_ensure_firebase_hosting_domains_creates_missing_domains(monkeypatch):
    module = _load_module()
    created_domains: list[tuple[str, str, bool]] = []

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return (), ""

    def fake_fetch_resource(*, project_id: str, site: str, domain: str, access_token: str, timeout_seconds: float):
        return False, ""

    def fake_create(*, project_id: str, site: str, domain: str, validate_only: bool, access_token: str, timeout_seconds: float):
        created_domains.append((site, domain, validate_only))
        return True, f"operations/{domain}", ""

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)
    monkeypatch.setattr(module, "_fetch_custom_domain_resource", fake_fetch_resource)
    monkeypatch.setattr(module, "_create_custom_domain", fake_create)

    result = module.ensure_firebase_hosting_domains(
        environment="staging",
        ensure=True,
        validate_only=False,
        access_token="token",
    )

    assert result.passed is True
    assert {domain.status for domain in result.domains} == {"create_requested"}
    assert ("kresco-staging-api", "api.staging.kresco.ma", False) in created_domains
    assert ("kresco-staging", "admin.staging.kresco.ma", False) in created_domains


def test_ensure_firebase_hosting_domains_validate_only_does_not_need_ensure(monkeypatch):
    module = _load_module()
    created_domains: list[tuple[str, bool]] = []

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return (), ""

    def fake_fetch_resource(*, project_id: str, site: str, domain: str, access_token: str, timeout_seconds: float):
        return False, ""

    def fake_create(*, project_id: str, site: str, domain: str, validate_only: bool, access_token: str, timeout_seconds: float):
        created_domains.append((domain, validate_only))
        return True, f"operations/{domain}", ""

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)
    monkeypatch.setattr(module, "_fetch_custom_domain_resource", fake_fetch_resource)
    monkeypatch.setattr(module, "_create_custom_domain", fake_create)

    result = module.ensure_firebase_hosting_domains(
        environment="staging",
        ensure=False,
        validate_only=True,
        access_token="token",
    )

    assert result.passed is True
    assert {domain.status for domain in result.domains} == {"validated"}
    assert created_domains
    assert all(validate_only for _, validate_only in created_domains)


def test_ensure_firebase_hosting_domains_fails_without_token():
    module = _load_module()

    result = module.ensure_firebase_hosting_domains(
        environment="staging",
        ensure=True,
        validate_only=False,
        access_token="",
        access_token_error="missing token",
    )

    assert result.passed is False
    assert {domain.status for domain in result.domains} == {"auth_error"}
    assert all(domain.errors == ("missing token",) for domain in result.domains)
