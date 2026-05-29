from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from botocore.exceptions import ClientError
from sqlalchemy.engine import make_url

from app.database import _build_async_url

RUNTIME_SECRET_ID_ENV = "KRESCO_RUNTIME_SECRET_ID"
DATABASE_URL_KEY = "DATABASE_URL"


def main() -> None:
    configured_subnets = os.environ.get("ZAPPA_SUBNET_IDS", "").strip()
    configured_security_groups = os.environ.get("ZAPPA_SECURITY_GROUP_IDS", "").strip()
    if configured_subnets and configured_security_groups:
        _write_outputs(configured_subnets, configured_security_groups)
        print("Using explicit Zappa VPC config from GitHub environment variables.")
        return

    import boto3

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or None
    secretsmanager = boto3.client("secretsmanager", region_name=region)

    database_url = _runtime_database_url(secretsmanager) or os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit(
            "DATABASE_URL is required to discover the RDS Proxy VPC config. "
            f"Set it in the runtime secret referenced by {RUNTIME_SECRET_ID_ENV}."
        )

    rds = boto3.client("rds", region_name=region)
    ec2 = boto3.client("ec2", region_name=region)

    host = _database_host(database_url)
    proxy = _find_proxy_for_host(rds, host)
    proxy_name = proxy.get("DBProxyName", "")
    vpc_id = proxy.get("VpcId", "")
    subnet_ids = [str(value) for value in proxy.get("VpcSubnetIds", []) if str(value).startswith("subnet-")]
    proxy_security_group_ids = [
        str(value)
        for value in proxy.get("VpcSecurityGroupIds", [])
        if str(value).startswith("sg-")
    ]

    if not proxy_name or not vpc_id or not subnet_ids or not proxy_security_group_ids:
        raise SystemExit("Unable to derive VPC, subnet, and security group IDs from the RDS Proxy.")

    stage = os.environ.get("ZAPPA_STAGE", "staging").strip() or "staging"
    lambda_security_group_id = _ensure_lambda_security_group(ec2, vpc_id, stage)
    _authorize_proxy_ingress(ec2, proxy_security_group_ids, lambda_security_group_id)
    _authorize_proxy_target_ingress(rds, ec2, proxy_name, proxy_security_group_ids)
    _authorize_lambda_egress(
        ec2,
        lambda_security_group_id,
        proxy_security_group_ids,
        5432,
        "Kresco Lambda to RDS Proxy",
    )
    _ensure_private_aws_service_access(ec2, vpc_id, subnet_ids, lambda_security_group_id, region, stage)
    _write_outputs(",".join(subnet_ids), lambda_security_group_id)
    print(
        "Resolved Zappa VPC config from RDS Proxy "
        f"{proxy_name}: subnets={len(subnet_ids)} lambda_security_group={lambda_security_group_id}"
    )


def _runtime_database_url(secretsmanager) -> str:
    secret_id = os.environ.get(RUNTIME_SECRET_ID_ENV, "").strip()
    if not secret_id:
        return ""

    response = secretsmanager.get_secret_value(SecretId=secret_id)
    secret_string = response.get("SecretString")
    if not secret_string:
        raise SystemExit("Runtime secret must contain a JSON SecretString.")

    try:
        secret = json.loads(secret_string)
    except json.JSONDecodeError as exc:
        raise SystemExit("Runtime secret must contain valid JSON.") from exc

    if not isinstance(secret, dict):
        raise SystemExit("Runtime secret must contain a JSON object.")

    return str(secret.get(DATABASE_URL_KEY) or secret.get("database_url") or "").strip()


def _database_host(database_url: str) -> str:
    async_url, _ = _build_async_url(database_url)
    host = make_url(async_url).host or ""
    if not host:
        raise SystemExit("DATABASE_URL must include an RDS Proxy hostname.")
    return host


def _find_proxy_for_host(rds, host: str) -> dict:
    for proxy in _paginate(rds, "describe_db_proxies", "DBProxies"):
        if proxy.get("Endpoint") == host:
            return proxy

    endpoint_proxy_name = ""
    for endpoint in _paginate(rds, "describe_db_proxy_endpoints", "DBProxyEndpoints"):
        if endpoint.get("Endpoint") == host:
            endpoint_proxy_name = str(endpoint.get("DBProxyName", ""))
            break

    if endpoint_proxy_name:
        response = rds.describe_db_proxies(DBProxyName=endpoint_proxy_name)
        proxies = response.get("DBProxies", [])
        if proxies:
            return proxies[0]

    raise SystemExit("DATABASE_URL host does not match an RDS Proxy endpoint in this AWS region.")


def _paginate(client, operation_name: str, result_key: str) -> list[dict]:
    try:
        paginator = client.get_paginator(operation_name)
    except Exception:
        response = getattr(client, operation_name)()
        return list(response.get(result_key, []))

    results: list[dict] = []
    for page in paginator.paginate():
        results.extend(page.get(result_key, []))
    return results


def _ensure_lambda_security_group(ec2, vpc_id: str, stage: str) -> str:
    group_name = f"kresco-{stage}-lambda-db"
    existing = ec2.describe_security_groups(
        Filters=[
            {"Name": "group-name", "Values": [group_name]},
            {"Name": "vpc-id", "Values": [vpc_id]},
        ]
    ).get("SecurityGroups", [])
    if existing:
        return str(existing[0]["GroupId"])

    response = ec2.create_security_group(
        GroupName=group_name,
        Description=f"Kresco {stage} Lambda access to RDS Proxy",
        VpcId=vpc_id,
        TagSpecifications=[
            {
                "ResourceType": "security-group",
                "Tags": [
                    {"Key": "Name", "Value": group_name},
                    {"Key": "Project", "Value": "kresco"},
                    {"Key": "Stage", "Value": stage},
                ],
            }
        ],
    )
    return str(response["GroupId"])


def _authorize_proxy_ingress(ec2, proxy_security_group_ids: list[str], lambda_security_group_id: str) -> None:
    for proxy_security_group_id in proxy_security_group_ids:
        try:
            ec2.authorize_security_group_ingress(
                GroupId=proxy_security_group_id,
                IpPermissions=[
                    {
                        "IpProtocol": "tcp",
                        "FromPort": 5432,
                        "ToPort": 5432,
                        "UserIdGroupPairs": [
                            {
                                "GroupId": lambda_security_group_id,
                                "Description": "Kresco Lambda to RDS Proxy",
                            }
                        ],
                    }
                ],
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "InvalidPermission.Duplicate":
                raise


def _authorize_proxy_target_ingress(rds, ec2, proxy_name: str, proxy_security_group_ids: list[str]) -> None:
    target_security_group_ids = _proxy_target_security_group_ids(rds, proxy_name)
    if not target_security_group_ids:
        raise SystemExit(
            f"RDS Proxy {proxy_name} has no resolvable database target security groups. "
            "Attach a DB target to the proxy before deploying Lambda."
        )

    for target_security_group_id in target_security_group_ids:
        for proxy_security_group_id in proxy_security_group_ids:
            try:
                ec2.authorize_security_group_ingress(
                    GroupId=target_security_group_id,
                    IpPermissions=[
                        {
                            "IpProtocol": "tcp",
                            "FromPort": 5432,
                            "ToPort": 5432,
                            "UserIdGroupPairs": [
                                {
                                    "GroupId": proxy_security_group_id,
                                    "Description": "Kresco RDS Proxy to database target",
                                }
                            ],
                        }
                    ],
                )
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") != "InvalidPermission.Duplicate":
                    raise


def _proxy_target_security_group_ids(rds, proxy_name: str) -> list[str]:
    response = rds.describe_db_proxy_targets(DBProxyName=proxy_name)
    targets = list(response.get("Targets", []))
    if not targets:
        return []

    target_resource_ids = {str(target.get("RdsResourceId", "")) for target in targets if target.get("RdsResourceId")}
    target_endpoints = {str(target.get("Endpoint", "")) for target in targets if target.get("Endpoint")}
    group_ids: set[str] = set()

    for instance in _paginate(rds, "describe_db_instances", "DBInstances"):
        if _matches_rds_target(instance, target_resource_ids, target_endpoints):
            group_ids.update(_rds_security_group_ids(instance))

    for cluster in _paginate(rds, "describe_db_clusters", "DBClusters"):
        if _matches_rds_cluster_target(cluster, target_resource_ids, target_endpoints):
            group_ids.update(_rds_security_group_ids(cluster))

    return sorted(group_ids)


def _matches_rds_target(instance: dict, target_resource_ids: set[str], target_endpoints: set[str]) -> bool:
    endpoint = instance.get("Endpoint") if isinstance(instance.get("Endpoint"), dict) else {}
    return (
        str(instance.get("DBInstanceIdentifier", "")) in target_resource_ids
        or str(instance.get("DbiResourceId", "")) in target_resource_ids
        or str(endpoint.get("Address", "")) in target_endpoints
    )


def _matches_rds_cluster_target(cluster: dict, target_resource_ids: set[str], target_endpoints: set[str]) -> bool:
    return (
        str(cluster.get("DBClusterIdentifier", "")) in target_resource_ids
        or str(cluster.get("DbClusterResourceId", "")) in target_resource_ids
        or str(cluster.get("Endpoint", "")) in target_endpoints
        or str(cluster.get("ReaderEndpoint", "")) in target_endpoints
    )


def _rds_security_group_ids(resource: dict) -> set[str]:
    return {
        str(group.get("VpcSecurityGroupId", ""))
        for group in resource.get("VpcSecurityGroups", [])
        if str(group.get("VpcSecurityGroupId", "")).startswith("sg-")
    }


def _authorize_lambda_egress(
    ec2,
    lambda_security_group_id: str,
    destination_security_group_ids: list[str],
    port: int,
    description: str,
) -> None:
    for destination_security_group_id in destination_security_group_ids:
        try:
            ec2.authorize_security_group_egress(
                GroupId=lambda_security_group_id,
                IpPermissions=[
                    {
                        "IpProtocol": "tcp",
                        "FromPort": port,
                        "ToPort": port,
                        "UserIdGroupPairs": [
                            {
                                "GroupId": destination_security_group_id,
                                "Description": description,
                            }
                        ],
                    }
                ],
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "InvalidPermission.Duplicate":
                raise


def _ensure_private_aws_service_access(
    ec2,
    vpc_id: str,
    subnet_ids: list[str],
    lambda_security_group_id: str,
    region: str | None,
    stage: str,
) -> None:
    if not region:
        raise SystemExit("AWS_REGION is required to provision Lambda VPC endpoints.")

    endpoint_ids: list[str] = []
    route_table_ids = _route_table_ids_for_subnets(ec2, vpc_id, subnet_ids)
    if route_table_ids:
        endpoint_ids.append(_ensure_s3_gateway_endpoint(ec2, vpc_id, route_table_ids, region, stage))

    endpoint_security_group_id = _ensure_endpoint_security_group(ec2, vpc_id, lambda_security_group_id, stage)
    _authorize_lambda_egress(
        ec2,
        lambda_security_group_id,
        [endpoint_security_group_id],
        443,
        "Kresco Lambda to private AWS endpoints",
    )
    endpoint_ids.append(
        _ensure_interface_endpoint(
            ec2,
            vpc_id,
            subnet_ids,
            endpoint_security_group_id,
            region,
            "secretsmanager",
            stage,
        )
    )
    _wait_for_vpc_endpoints(ec2, [endpoint_id for endpoint_id in endpoint_ids if endpoint_id])


def _route_table_ids_for_subnets(ec2, vpc_id: str, subnet_ids: list[str]) -> list[str]:
    main_route_table_id = _main_route_table_id(ec2, vpc_id)
    route_table_ids: list[str] = []
    for subnet_id in subnet_ids:
        response = ec2.describe_route_tables(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "association.subnet-id", "Values": [subnet_id]},
            ]
        )
        tables = response.get("RouteTables", [])
        route_table_id = str(tables[0].get("RouteTableId", "")) if tables else main_route_table_id
        if route_table_id and route_table_id not in route_table_ids:
            route_table_ids.append(route_table_id)
    return route_table_ids


def _main_route_table_id(ec2, vpc_id: str) -> str:
    response = ec2.describe_route_tables(
        Filters=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "association.main", "Values": ["true"]},
        ]
    )
    tables = response.get("RouteTables", [])
    return str(tables[0].get("RouteTableId", "")) if tables else ""


def _ensure_s3_gateway_endpoint(
    ec2,
    vpc_id: str,
    route_table_ids: list[str],
    region: str,
    stage: str,
) -> str:
    service_name = f"com.amazonaws.{region}.s3"
    existing = _vpc_endpoints(ec2, vpc_id, service_name, ["available", "pending"])
    if existing:
        endpoint = existing[0]
        endpoint_id = str(endpoint["VpcEndpointId"])
        existing_route_table_ids = {str(value) for value in endpoint.get("RouteTableIds", [])}
        missing_route_table_ids = [value for value in route_table_ids if value not in existing_route_table_ids]
        if missing_route_table_ids:
            ec2.modify_vpc_endpoint(
                VpcEndpointId=endpoint_id,
                AddRouteTableIds=missing_route_table_ids,
            )
        return endpoint_id

    response = ec2.create_vpc_endpoint(
        VpcEndpointType="Gateway",
        VpcId=vpc_id,
        ServiceName=service_name,
        RouteTableIds=route_table_ids,
        TagSpecifications=[_endpoint_tags(stage, "s3")],
    )
    return str(response.get("VpcEndpoint", {}).get("VpcEndpointId", ""))


def _ensure_interface_endpoint(
    ec2,
    vpc_id: str,
    subnet_ids: list[str],
    security_group_id: str,
    region: str,
    service: str,
    stage: str,
) -> str:
    service_name = f"com.amazonaws.{region}.{service}"
    existing = _vpc_endpoints(ec2, vpc_id, service_name, ["available", "pending"])
    if existing:
        endpoint = existing[0]
        endpoint_id = str(endpoint["VpcEndpointId"])
        existing_subnet_ids = {str(value) for value in endpoint.get("SubnetIds", [])}
        missing_subnet_ids = [value for value in subnet_ids if value not in existing_subnet_ids]
        kwargs: dict[str, object] = {}
        if missing_subnet_ids:
            kwargs["AddSubnetIds"] = missing_subnet_ids
        if security_group_id not in _endpoint_security_group_ids(endpoint):
            kwargs["AddSecurityGroupIds"] = [security_group_id]
        if not endpoint.get("PrivateDnsEnabled", False):
            kwargs["PrivateDnsEnabled"] = True
        if kwargs:
            ec2.modify_vpc_endpoint(VpcEndpointId=endpoint_id, **kwargs)
        return endpoint_id

    response = ec2.create_vpc_endpoint(
        VpcEndpointType="Interface",
        VpcId=vpc_id,
        ServiceName=service_name,
        SubnetIds=subnet_ids,
        SecurityGroupIds=[security_group_id],
        PrivateDnsEnabled=True,
        TagSpecifications=[_endpoint_tags(stage, service)],
    )
    return str(response.get("VpcEndpoint", {}).get("VpcEndpointId", ""))


def _vpc_endpoints(ec2, vpc_id: str, service_name: str, states: list[str]) -> list[dict]:
    response = ec2.describe_vpc_endpoints(
        Filters=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "service-name", "Values": [service_name]},
            {"Name": "vpc-endpoint-state", "Values": states},
        ]
    )
    return list(response.get("VpcEndpoints", []))


def _endpoint_security_group_ids(endpoint: dict) -> set[str]:
    group_ids: set[str] = set()
    for group in endpoint.get("Groups", []):
        if isinstance(group, dict):
            group_id = str(group.get("GroupId", ""))
        else:
            group_id = str(group)
        if group_id:
            group_ids.add(group_id)
    return group_ids


def _wait_for_vpc_endpoints(ec2, endpoint_ids: list[str]) -> None:
    if not endpoint_ids:
        return
    try:
        waiter = ec2.get_waiter("vpc_endpoint_available")
    except Exception:
        return
    waiter.wait(
        VpcEndpointIds=endpoint_ids,
        WaiterConfig={"Delay": 5, "MaxAttempts": 24},
    )


def _ensure_endpoint_security_group(
    ec2,
    vpc_id: str,
    lambda_security_group_id: str,
    stage: str,
) -> str:
    group_name = f"kresco-{stage}-vpc-endpoints"
    existing = ec2.describe_security_groups(
        Filters=[
            {"Name": "group-name", "Values": [group_name]},
            {"Name": "vpc-id", "Values": [vpc_id]},
        ]
    ).get("SecurityGroups", [])
    if existing:
        group_id = str(existing[0]["GroupId"])
    else:
        response = ec2.create_security_group(
            GroupName=group_name,
            Description=f"Kresco {stage} private AWS service endpoints",
            VpcId=vpc_id,
            TagSpecifications=[
                {
                    "ResourceType": "security-group",
                    "Tags": [
                        {"Key": "Name", "Value": group_name},
                        {"Key": "Project", "Value": "kresco"},
                        {"Key": "Stage", "Value": stage},
                    ],
                }
            ],
        )
        group_id = str(response["GroupId"])

    try:
        ec2.authorize_security_group_ingress(
            GroupId=group_id,
            IpPermissions=[
                {
                    "IpProtocol": "tcp",
                    "FromPort": 443,
                    "ToPort": 443,
                    "UserIdGroupPairs": [
                        {
                            "GroupId": lambda_security_group_id,
                            "Description": "Kresco Lambda to private AWS endpoints",
                        }
                    ],
                }
            ],
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "InvalidPermission.Duplicate":
            raise
    return group_id


def _endpoint_tags(stage: str, service: str) -> dict[str, object]:
    return {
        "ResourceType": "vpc-endpoint",
        "Tags": [
            {"Key": "Name", "Value": f"kresco-{stage}-{service}"},
            {"Key": "Project", "Value": "kresco"},
            {"Key": "Stage", "Value": stage},
        ],
    }


def _write_outputs(subnet_ids: str, security_group_ids: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"subnet_ids={subnet_ids}\n")
            output.write(f"security_group_ids={security_group_ids}\n")
    else:
        print(f"subnet_ids={subnet_ids}")
        print(f"security_group_ids={security_group_ids}")


if __name__ == "__main__":
    main()
