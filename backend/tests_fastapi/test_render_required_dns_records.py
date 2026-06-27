from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "render_required_dns_records.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("render_required_dns_records_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_render_required_dns_records_outputs_provider_names():
    module = _load_module()

    records = module.required_dns_records(environment="staging")

    assert ("staging", "CNAME", "kresco-staging.web.app") in {
        (record.name, record.record_type, record.value)
        for record in records
    }
    assert ("admin.staging", "CNAME", "kresco-staging.web.app") in {
        (record.name, record.record_type, record.value)
        for record in records
    }
    assert ("api.staging", "CNAME", "kresco-staging-api.web.app") in {
        (record.name, record.record_type, record.value)
        for record in records
    }


def test_render_required_dns_records_includes_production_apex_verification():
    module = _load_module()

    records = module.required_dns_records(environment="production")

    assert ("@", "A", "199.36.158.100") in {
        (record.name, record.record_type, record.value)
        for record in records
    }
    assert ("@", "TXT", "hosting-site=kresco-prod") in {
        (record.name, record.record_type, record.value)
        for record in records
    }
    assert ("api", "CNAME", "kresco-prod-api.web.app") in {
        (record.name, record.record_type, record.value)
        for record in records
    }


def test_render_required_dns_records_can_render_bind_values():
    module = _load_module()
    cname = module.RequiredDnsRecord(
        environment="staging",
        zone="kresco.ma",
        name="admin.staging",
        fqdn="admin.staging.kresco.ma",
        record_type="CNAME",
        value="kresco-staging.web.app",
        ttl=300,
    )
    txt = module.RequiredDnsRecord(
        environment="production",
        zone="kresco.ma",
        name="@",
        fqdn="kresco.ma",
        record_type="TXT",
        value="hosting-site=kresco-prod",
        ttl=300,
    )

    assert module._bind_value(cname) == "kresco-staging.web.app."
    assert module._bind_value(txt) == '"hosting-site=kresco-prod"'
