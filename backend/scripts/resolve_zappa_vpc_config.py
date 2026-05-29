from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from botocore.exceptions import ClientError
from sqlalchemy.engine import make_url

from app.database import _build_async_url


def main() -> None:
    configured_subnets = os.environ.get("ZAPPA_SUBNET_IDS", "").strip()
    configured_security_groups = os.environ.get("ZAPPA_SECURITY_GROUP_IDS", "").strip()
    if configured_subnets and configured_security_groups:
        _write_outputs(configured_subnets, configured_security_groups)
        print("Using explicit Zappa VPC config from GitHub environment variables.")
        return

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required to discover the RDS Proxy VPC config.")

    import boto3

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or None
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
    _write_outputs(",".join(subnet_ids), lambda_security_group_id)
    print(
        "Resolved Zappa VPC config from RDS Proxy "
        f"{proxy_name}: subnets={len(subnet_ids)} lambda_security_group={lambda_security_group_id}"
    )


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
