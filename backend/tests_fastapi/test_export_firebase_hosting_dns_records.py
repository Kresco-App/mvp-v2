from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "export_firebase_hosting_dns_records.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("export_firebase_hosting_dns_records_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_dns_export_extracts_desired_records_and_issues():
    module = _load_module()
    payload = {
        "hostState": "HOST_UNREACHABLE",
        "ownershipState": "OWNERSHIP_UNREACHABLE",
        "cert": {"state": "CERT_PREPARING"},
        "requiredDnsUpdates": {
            "desired": [
                {
                    "domainName": "api.staging.kresco.ma",
                    "records": [
                        {
                            "domainName": "api.staging.kresco.ma",
                            "type": "CNAME",
                            "rdata": "kresco-staging-api.web.app",
                            "requiredAction": "ADD",
                        },
                    ],
                },
            ],
        },
        "issues": [{"message": "DNS request failed."}],
    }

    assert module._desired_records(payload) == [
        {
            "domainName": "api.staging.kresco.ma",
            "type": "CNAME",
            "rdata": "kresco-staging-api.web.app",
            "requiredAction": "ADD",
        },
    ]
    assert module._issue_messages(payload) == ["DNS request failed."]


def test_dns_export_fails_without_token():
    module = _load_module()

    result = module.export_firebase_hosting_dns_records(
        environment="staging",
        access_token="",
        access_token_error="missing token",
    )

    assert result.passed is False
    assert {domain.errors for domain in result.domains} == {("missing token",)}
