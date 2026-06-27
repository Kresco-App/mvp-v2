from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_firebase_hosting_domains.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_firebase_hosting_domains_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_firebase_hosting_domains_cover_staging_and_production_contracts():
    module = _load_module()

    result_by_environment = {
        environment: module.check_firebase_hosting_domains(
            environment=environment,
            firebaserc_path=REPO_ROOT / ".firebaserc",
        )
        for environment in ("staging", "production")
    }

    staging = result_by_environment["staging"]
    production = result_by_environment["production"]

    assert staging.passed is True
    assert production.passed is True
    assert {entry.target: entry.site for entry in staging.entries} == {
        "staging-frontend": "kresco-staging",
        "staging-api": "kresco-staging-api",
    }
    assert {entry.target: entry.site for entry in production.entries} == {
        "production-frontend": "kresco-prod",
        "production-api": "kresco-prod-api",
    }
    assert _domains_for(staging, "staging-frontend") == {
        "staging.kresco.ma",
        "www.staging.kresco.ma",
        "app.staging.kresco.ma",
        "admin.staging.kresco.ma",
        "prof.staging.kresco.ma",
        "staff.staging.kresco.ma",
    }
    assert _domains_for(staging, "staging-api") == {"api.staging.kresco.ma"}
    assert _domains_for(production, "production-frontend") == {
        "kresco.ma",
        "www.kresco.ma",
        "app.kresco.ma",
        "admin.kresco.ma",
        "prof.kresco.ma",
        "staff.kresco.ma",
    }
    assert _domains_for(production, "production-api") == {"api.kresco.ma"}


def test_firebase_hosting_domains_reject_wrong_api_site(tmp_path):
    module = _load_module()
    firebaserc = tmp_path / ".firebaserc"
    firebaserc.write_text(
        json.dumps(
            {
                "targets": {
                    "kresco-staging": {
                        "hosting": {
                            "staging-frontend": ["kresco-staging"],
                            "staging-api": ["kresco-staging"],
                        },
                    },
                },
            },
        ),
        encoding="utf-8",
    )

    result = module.check_firebase_hosting_domains(environment="staging", firebaserc_path=firebaserc)

    assert result.passed is False
    assert any(
        ".firebaserc must map hosting target 'staging-api' to Firebase Hosting site 'kresco-staging-api'." in error
        for entry in result.entries
        for error in entry.errors
    )


def test_firebase_hosting_domains_live_check_accepts_attached_domains(monkeypatch):
    module = _load_module()

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        assert project_id == "kresco-staging"
        assert access_token == "token"
        if site == "kresco-staging":
            return (
                (
                    "admin.staging.kresco.ma",
                    "app.staging.kresco.ma",
                    "prof.staging.kresco.ma",
                    "staff.staging.kresco.ma",
                    "staging.kresco.ma",
                    "www.staging.kresco.ma",
                ),
                "",
            )
        if site == "kresco-staging-api":
            return (("api.staging.kresco.ma",), "")
        raise AssertionError(site)

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)

    result = module.check_firebase_hosting_domains(
        environment="staging",
        firebaserc_path=REPO_ROOT / ".firebaserc",
        live=True,
        access_token="token",
    )

    assert result.passed is True
    assert all(entry.live_checked for entry in result.entries)
    assert _domains_for(result, "staging-api") == {"api.staging.kresco.ma"}
    assert _live_domains_for(result, "staging-frontend") == {
        "admin.staging.kresco.ma",
        "app.staging.kresco.ma",
        "prof.staging.kresco.ma",
        "staff.staging.kresco.ma",
        "staging.kresco.ma",
        "www.staging.kresco.ma",
    }


def test_firebase_hosting_domains_live_check_rejects_missing_domain(monkeypatch):
    module = _load_module()

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        if site == "kresco-staging":
            return (
                (
                    "app.staging.kresco.ma",
                    "prof.staging.kresco.ma",
                    "staff.staging.kresco.ma",
                    "staging.kresco.ma",
                    "www.staging.kresco.ma",
                ),
                "",
            )
        return (("api.staging.kresco.ma",), "")

    def fake_fetch_resource(*, project_id: str, site: str, domain: str, access_token: str, timeout_seconds: float):
        return False, ""

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)
    monkeypatch.setattr(module, "_fetch_custom_domain_resource", fake_fetch_resource)

    result = module.check_firebase_hosting_domains(
        environment="staging",
        firebaserc_path=REPO_ROOT / ".firebaserc",
        live=True,
        access_token="token",
    )

    assert result.passed is False
    assert any("missing live custom domain 'admin.staging.kresco.ma'" in error for entry in result.entries for error in entry.errors)


def test_firebase_hosting_domains_live_check_accepts_pending_domain_resources(monkeypatch):
    module = _load_module()
    checked_domains: list[str] = []

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return (), ""

    def fake_fetch_resource(*, project_id: str, site: str, domain: str, access_token: str, timeout_seconds: float):
        checked_domains.append(domain)
        return True, ""

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)
    monkeypatch.setattr(module, "_fetch_custom_domain_resource", fake_fetch_resource)

    result = module.check_firebase_hosting_domains(
        environment="staging",
        firebaserc_path=REPO_ROOT / ".firebaserc",
        live=True,
        access_token="token",
    )

    assert result.passed is True
    assert "api.staging.kresco.ma" in checked_domains
    assert _live_domains_for(result, "staging-api") == {"api.staging.kresco.ma"}


def test_firebase_hosting_domains_live_check_rejects_api_error(monkeypatch):
    module = _load_module()

    def fake_fetch(*, project_id: str, site: str, access_token: str, timeout_seconds: float):
        return ((), f"Unable to list Firebase Hosting custom domains for {site!r}: HTTP 403")

    monkeypatch.setattr(module, "_fetch_site_custom_domains", fake_fetch)

    result = module.check_firebase_hosting_domains(
        environment="production",
        firebaserc_path=REPO_ROOT / ".firebaserc",
        live=True,
        access_token="token",
    )

    assert result.passed is False
    assert all(entry.live_checked for entry in result.entries)
    assert any("HTTP 403" in error for entry in result.entries for error in entry.errors)


def test_firebase_hosting_domains_supports_configured_gcloud_binary(monkeypatch):
    module = _load_module()

    monkeypatch.setenv("GCLOUD_BIN", "custom-gcloud")

    assert module._gcloud_candidates() == ("custom-gcloud",)


def _domains_for(result, target: str) -> set[str]:
    for entry in result.entries:
        if entry.target == target:
            return set(entry.domains)
    raise AssertionError(f"Missing target {target}")


def _live_domains_for(result, target: str) -> set[str]:
    for entry in result.entries:
        if entry.target == target:
            return set(entry.live_domains)
    raise AssertionError(f"Missing target {target}")
