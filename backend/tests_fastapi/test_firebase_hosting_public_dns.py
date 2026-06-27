from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_firebase_hosting_public_dns.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_firebase_hosting_public_dns_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_public_dns_check_accepts_matching_records(monkeypatch):
    module = _load_module()

    def fake_resolve(*, domain: str, record_type: str, timeout_seconds: float):
        return (("kresco-staging.web.app",), ())

    monkeypatch.setattr(module, "_resolve_dns", fake_resolve)

    result = module.check_public_dns(
        environment="staging",
        dns_plan={
            "domains": [
                {
                    "domain": "admin.staging.kresco.ma",
                    "records": [
                        {
                            "domainName": "admin.staging.kresco.ma",
                            "type": "CNAME",
                            "rdata": "kresco-staging.web.app",
                        },
                    ],
                },
            ],
        },
    )

    assert result.passed is True
    assert result.records[0].actual == ("kresco-staging.web.app",)


def test_public_dns_check_reports_mismatch(monkeypatch):
    module = _load_module()

    def fake_resolve(*, domain: str, record_type: str, timeout_seconds: float):
        return (("old-host.example",), ())

    monkeypatch.setattr(module, "_resolve_dns", fake_resolve)

    result = module.check_public_dns(
        environment="production",
        dns_plan={
            "domains": [
                {
                    "domain": "api.kresco.ma",
                    "records": [
                        {
                            "domainName": "api.kresco.ma",
                            "type": "CNAME",
                            "rdata": "kresco-prod-api.web.app",
                        },
                    ],
                },
            ],
        },
    )

    assert result.passed is False
    assert "Expected 'kresco-prod-api.web.app'" in result.records[0].errors[0]


def test_public_dns_normalizes_txt_quotes_and_cname_dot():
    module = _load_module()

    assert module._normalize_rdata('"hosting-site=kresco-prod"', "TXT") == "hosting-site=kresco-prod"
    assert module._normalize_rdata("kresco-prod.web.app.", "CNAME") == "kresco-prod.web.app"
