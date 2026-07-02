from __future__ import annotations

import importlib.util
import sys
from email.message import Message
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_subdomain_routing.py"
ADMIN_LOGIN_URL = "https://admin.staging.kresco.ma/login?next=%2Fadmin"
STAFF_LOGIN_URL = "https://staff.staging.kresco.ma/login?next=%2Fstaff%2Fpayments"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_subdomain_routing_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _payload(
    module,
    status: int,
    body: bytes = b"<html data-release=\"abc12345\"></html>",
    location: str = "",
    hsts: str = "max-age=31536000",
):
    headers = Message()
    if location:
        headers["Location"] = location
    if hsts:
        headers["Strict-Transport-Security"] = hsts
    return module.HttpPayload(status=status, body=body, headers=headers)


def test_subdomain_routing_smoke_verifies_public_host_contract(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        assert timeout_seconds == 7
        routes = {
            "https://staging.kresco.ma/": _payload(module, 200),
            "https://www.staging.kresco.ma/pricing?subdomain-smoke=1": _payload(
                module,
                307,
                location="https://staging.kresco.ma/pricing?subdomain-smoke=1",
            ),
            "https://app.staging.kresco.ma/": _payload(module, 307, location="https://staging.kresco.ma/"),
            "https://admin.staging.kresco.ma/": _payload(module, 307, location=ADMIN_LOGIN_URL),
            "https://staff.staging.kresco.ma/": _payload(module, 307, location=STAFF_LOGIN_URL),
            "https://prof.staging.kresco.ma/": _payload(
                module,
                307,
                location="https://prof.staging.kresco.ma/professor/login",
            ),
            "https://prof.staging.kresco.ma/professor/login": _payload(module, 200),
            "https://professor.staging.kresco.ma/professor/login?next=chat": _payload(
                module,
                307,
                location="https://prof.staging.kresco.ma/professor/login?next=chat",
            ),
        }
        return routes[url]

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    assert module.check_subdomain_routing(
        "https://staging.kresco.ma/some/path?ignored=1",
        expected_sha="abc12345",
        check_professor_alias=True,
        timeout_seconds=7,
    ) == []


def test_subdomain_routing_smoke_does_not_require_professor_alias_by_default(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        assert not url.startswith("https://professor.staging.kresco.ma/")
        routes = {
            "https://staging.kresco.ma/": _payload(module, 200),
            "https://www.staging.kresco.ma/pricing?subdomain-smoke=1": _payload(
                module,
                307,
                location="https://staging.kresco.ma/pricing?subdomain-smoke=1",
            ),
            "https://app.staging.kresco.ma/": _payload(module, 307, location="https://staging.kresco.ma/"),
            "https://admin.staging.kresco.ma/": _payload(module, 307, location=ADMIN_LOGIN_URL),
            "https://staff.staging.kresco.ma/": _payload(module, 307, location=STAFF_LOGIN_URL),
            "https://prof.staging.kresco.ma/": _payload(
                module,
                307,
                location="https://prof.staging.kresco.ma/professor/login",
            ),
            "https://prof.staging.kresco.ma/professor/login": _payload(module, 200),
        }
        return routes[url]

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    assert module.check_subdomain_routing("https://staging.kresco.ma", expected_sha="abc12345") == []


def test_subdomain_routing_smoke_reports_professor_alias_mismatch_when_requested(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        if url == "https://staging.kresco.ma/":
            return _payload(module, 200)
        if url == "https://www.staging.kresco.ma/pricing?subdomain-smoke=1":
            return _payload(module, 307, location="https://staging.kresco.ma/pricing?subdomain-smoke=1")
        if url == "https://prof.staging.kresco.ma/":
            return _payload(module, 307, location="https://prof.staging.kresco.ma/professor/login")
        if url == "https://prof.staging.kresco.ma/professor/login":
            return _payload(module, 200)
        if url == "https://professor.staging.kresco.ma/professor/login?next=chat":
            return _payload(module, 307, location="https://staging.kresco.ma/professor/login?next=chat")
        if url == "https://admin.staging.kresco.ma/":
            return _payload(module, 307, location=ADMIN_LOGIN_URL)
        if url == "https://staff.staging.kresco.ma/":
            return _payload(module, 307, location=STAFF_LOGIN_URL)
        return _payload(module, 307, location="https://staging.kresco.ma/")

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    errors = module.check_subdomain_routing(
        "https://staging.kresco.ma",
        expected_sha="abc12345",
        check_professor_alias=True,
    )

    assert any("professor alias redirect" in error for error in errors)


def test_subdomain_routing_smoke_reports_redirect_mismatches(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        if url == "https://staging.kresco.ma/":
            return _payload(module, 200)
        if url == "https://www.staging.kresco.ma/pricing?subdomain-smoke=1":
            return _payload(module, 307, location="https://wrong.example/pricing?subdomain-smoke=1")
        if url.endswith("/professor/login"):
            return _payload(module, 200)
        return _payload(module, 307, location="https://staging.kresco.ma/")

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    errors = module.check_subdomain_routing("https://staging.kresco.ma", expected_sha="abc12345")

    assert any("www canonical redirect" in error for error in errors)
    assert any("prof unauthenticated root" in error for error in errors)


def test_subdomain_routing_smoke_reports_workspace_redirect_failures(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        if url == "https://staging.kresco.ma/":
            return _payload(module, 200)
        if url == "https://www.staging.kresco.ma/pricing?subdomain-smoke=1":
            return _payload(module, 307, location="https://staging.kresco.ma/pricing?subdomain-smoke=1")
        if url == "https://admin.staging.kresco.ma/":
            return _payload(module, 200)
        if url.endswith("/professor/login"):
            return _payload(module, 200)
        return _payload(module, 307, location="https://staging.kresco.ma/")

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    errors = module.check_subdomain_routing("https://staging.kresco.ma", expected_sha="abc12345")

    assert any("admin unauthenticated root returned HTTP 200; expected a redirect" in error for error in errors)


def test_subdomain_routing_smoke_rejects_hsts_include_subdomains_before_cutover(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        if url == "https://staging.kresco.ma/":
            return _payload(module, 200, hsts="max-age=31536000; includeSubDomains")
        if url == "https://www.staging.kresco.ma/pricing?subdomain-smoke=1":
            return _payload(module, 307, location="https://staging.kresco.ma/pricing?subdomain-smoke=1")
        if url == "https://prof.staging.kresco.ma/":
            return _payload(module, 307, location="https://prof.staging.kresco.ma/professor/login")
        if url == "https://admin.staging.kresco.ma/":
            return _payload(module, 307, location=ADMIN_LOGIN_URL)
        if url == "https://staff.staging.kresco.ma/":
            return _payload(module, 307, location=STAFF_LOGIN_URL)
        if url.endswith("/professor/login"):
            return _payload(module, 200)
        return _payload(module, 307, location="https://staging.kresco.ma/")

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    errors = module.check_subdomain_routing("https://staging.kresco.ma", expected_sha="abc12345")

    assert any("must not include includeSubDomains" in error for error in errors)


def test_subdomain_routing_smoke_can_require_hsts_include_subdomains_after_cutover(monkeypatch):
    module = _load_module()

    def fake_fetch(_opener, url: str, *, timeout_seconds: int):
        if url == "https://staging.kresco.ma/":
            return _payload(module, 200, hsts="max-age=31536000; includeSubDomains")
        if url == "https://www.staging.kresco.ma/pricing?subdomain-smoke=1":
            return _payload(module, 307, location="https://staging.kresco.ma/pricing?subdomain-smoke=1")
        if url == "https://prof.staging.kresco.ma/":
            return _payload(module, 307, location="https://prof.staging.kresco.ma/professor/login")
        if url == "https://admin.staging.kresco.ma/":
            return _payload(module, 307, location=ADMIN_LOGIN_URL)
        if url == "https://staff.staging.kresco.ma/":
            return _payload(module, 307, location=STAFF_LOGIN_URL)
        if url.endswith("/professor/login"):
            return _payload(module, 200)
        return _payload(module, 307, location="https://staging.kresco.ma/")

    monkeypatch.setattr(module, "_fetch", fake_fetch)

    assert module.check_subdomain_routing(
        "https://staging.kresco.ma",
        expected_sha="abc12345",
        hsts_policy="include-subdomains",
    ) == []


def test_subdomain_routing_cli_skips_when_apex_is_not_configured(monkeypatch, capsys):
    module = _load_module()
    monkeypatch.delenv("KRESCO_FRONTEND_APEX_URL", raising=False)

    assert module.main([]) == 0

    captured = capsys.readouterr()
    assert "skipped" in captured.out


def test_subdomain_routing_cli_can_require_apex(monkeypatch, capsys):
    module = _load_module()
    monkeypatch.delenv("KRESCO_FRONTEND_APEX_URL", raising=False)

    assert module.main(["--required"]) == 1

    captured = capsys.readouterr()
    assert "apex-url is required" in captured.err


def test_subdomain_routing_rejects_workspace_host_as_apex():
    module = _load_module()

    errors = module.check_subdomain_routing("https://admin.staging.kresco.ma")

    assert errors == ["apex-url must be the frontend apex, not a workspace or API subdomain."]
