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


def test_private_aws_service_access_creates_s3_and_secrets_manager_endpoints():
    resolver = _load_resolver_module()

    class FakeEc2:
        def __init__(self):
            self.created_endpoints = []
            self.authorized_groups = []

        def describe_route_tables(self, Filters):
            filter_names = {filter_["Name"] for filter_ in Filters}
            if "association.subnet-id" in filter_names:
                subnet_id = next(filter_["Values"][0] for filter_ in Filters if filter_["Name"] == "association.subnet-id")
                return {"RouteTables": [{"RouteTableId": f"rtb-{subnet_id[-1]}"}]}
            return {"RouteTables": [{"RouteTableId": "rtb-main"}]}

        def describe_vpc_endpoints(self, Filters):
            return {"VpcEndpoints": []}

        def describe_security_groups(self, Filters):
            return {"SecurityGroups": []}

        def create_security_group(self, **kwargs):
            assert kwargs["GroupName"] == "kresco-staging-vpc-endpoints"
            return {"GroupId": "sg-endpoints"}

        def authorize_security_group_ingress(self, **kwargs):
            self.authorized_groups.append(kwargs)

        def create_vpc_endpoint(self, **kwargs):
            self.created_endpoints.append(kwargs)
            return {"VpcEndpoint": {"VpcEndpointId": f"vpce-{len(self.created_endpoints)}"}}

    ec2 = FakeEc2()

    resolver._ensure_private_aws_service_access(
        ec2,
        "vpc-123",
        ["subnet-a", "subnet-b"],
        "sg-lambda",
        "eu-west-3",
        "staging",
    )

    endpoint_types = {endpoint["VpcEndpointType"] for endpoint in ec2.created_endpoints}
    service_names = {endpoint["ServiceName"] for endpoint in ec2.created_endpoints}
    assert endpoint_types == {"Gateway", "Interface"}
    assert service_names == {"com.amazonaws.eu-west-3.s3", "com.amazonaws.eu-west-3.secretsmanager"}
    assert ec2.authorized_groups[0]["GroupId"] == "sg-endpoints"
    assert ec2.authorized_groups[0]["IpPermissions"][0]["UserIdGroupPairs"][0]["GroupId"] == "sg-lambda"


def test_existing_interface_endpoint_group_ids_are_parsed_from_group_objects():
    resolver = _load_resolver_module()

    group_ids = resolver._endpoint_security_group_ids(
        {
            "Groups": [
                {"GroupId": "sg-one", "GroupName": "one"},
                {"GroupId": "sg-two", "GroupName": "two"},
            ]
        }
    )

    assert group_ids == {"sg-one", "sg-two"}
