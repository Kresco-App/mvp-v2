from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "backend" / "scripts" / "resolve_zappa_vpc_config.py"


def _load_resolver_module():
    spec = importlib.util.spec_from_file_location("resolve_zappa_vpc_config_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_database_host_handles_reserved_password_characters():
    resolver = _load_resolver_module()

    host = resolver._database_host(
        "postgresql+asyncpg://kresco_admin:p%40ss%3Aword@proxy.example.com:5432/kresco?sslmode=require"
    )

    assert host == "proxy.example.com"


def test_find_proxy_matches_default_and_custom_proxy_endpoints():
    resolver = _load_resolver_module()

    class FakeRds:
        def get_paginator(self, operation_name):
            pages = {
                "describe_db_proxies": [
                    {"DBProxies": [{"DBProxyName": "kresco", "Endpoint": "default.example.com"}]},
                ],
                "describe_db_proxy_endpoints": [
                    {"DBProxyEndpoints": [{"DBProxyName": "kresco", "Endpoint": "custom.example.com"}]},
                ],
            }
            return SimpleNamespace(paginate=lambda: pages[operation_name])

        def describe_db_proxies(self, DBProxyName=None):
            assert DBProxyName == "kresco"
            return {"DBProxies": [{"DBProxyName": "kresco", "Endpoint": "default.example.com"}]}

    rds = FakeRds()

    assert resolver._find_proxy_for_host(rds, "default.example.com")["DBProxyName"] == "kresco"
    assert resolver._find_proxy_for_host(rds, "custom.example.com")["DBProxyName"] == "kresco"


def test_authorize_proxy_ingress_ignores_duplicate_rule():
    resolver = _load_resolver_module()

    class FakeEc2:
        def authorize_security_group_ingress(self, **kwargs):
            from botocore.exceptions import ClientError

            assert kwargs["GroupId"] == "sg-proxy"
            raise ClientError(
                {"Error": {"Code": "InvalidPermission.Duplicate", "Message": "duplicate"}},
                "AuthorizeSecurityGroupIngress",
            )

    resolver._authorize_proxy_ingress(FakeEc2(), ["sg-proxy"], "sg-lambda")
