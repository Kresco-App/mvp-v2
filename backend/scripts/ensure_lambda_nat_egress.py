from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from resolve_zappa_vpc_config import (  # noqa: E402
    _database_host,
    _find_proxy_for_host,
    _main_route_table_id,
    _route_table_ids_for_subnets,
    _runtime_database_url,
)


def main() -> None:
    import boto3

    mode = os.environ.get("NAT_EGRESS_MODE", "audit").strip().lower()
    if mode not in {"audit", "provision"}:
        raise SystemExit("NAT_EGRESS_MODE must be audit or provision.")

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or None
    stage = os.environ.get("ZAPPA_STAGE", "staging").strip() or "staging"
    ec2 = boto3.client("ec2", region_name=region)
    rds = boto3.client("rds", region_name=region)
    secretsmanager = boto3.client("secretsmanager", region_name=region)

    database_url = _runtime_database_url(secretsmanager) or os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL or KRESCO_RUNTIME_SECRET_ID is required to derive RDS Proxy VPC config.")

    proxy = _find_proxy_for_host(rds, _database_host(database_url))
    vpc_id = str(proxy.get("VpcId", ""))
    subnet_ids = [str(value) for value in proxy.get("VpcSubnetIds", []) if str(value).startswith("subnet-")]
    if not vpc_id or not subnet_ids:
        raise SystemExit("Unable to derive VPC/subnets from the RDS Proxy.")

    route_table_ids = _route_table_ids_for_subnets(ec2, vpc_id, subnet_ids)
    audit_before = _audit(ec2, vpc_id, subnet_ids, route_table_ids)

    result: dict[str, Any] = {
        "mode": mode,
        "stage": stage,
        "vpc_id": vpc_id,
        "lambda_subnet_count": len(subnet_ids),
        "route_table_count": len(route_table_ids),
        "before": audit_before,
    }

    if mode == "provision":
        if os.environ.get("CONFIRM_CREATE_NAT", "").strip().lower() != "true":
            raise SystemExit("Set CONFIRM_CREATE_NAT=true to create paid NAT Gateway infrastructure.")
        nat_gateway_id = _ensure_nat_gateway(ec2, vpc_id, stage)
        _ensure_lambda_route_tables_use_nat(ec2, route_table_ids, nat_gateway_id)
        result["created_or_reused_nat_gateway_id"] = nat_gateway_id
        result["after"] = _audit(ec2, vpc_id, subnet_ids, route_table_ids)

    print(json.dumps(_redact_for_logs(result), indent=2, sort_keys=True))

    final_audit = result.get("after", audit_before)
    if not final_audit.get("all_route_tables_have_nat_default", False):
        raise SystemExit("Lambda subnet route tables do not all have NAT default egress.")


def _audit(ec2, vpc_id: str, subnet_ids: list[str], route_table_ids: list[str]) -> dict[str, Any]:
    route_tables = _route_tables_by_id(ec2, route_table_ids)
    nat_gateways = _nat_gateways(ec2, vpc_id)
    rows = []
    for route_table_id in route_table_ids:
        default_route = _default_ipv4_route(route_tables.get(route_table_id, {}))
        target_type, target_id = _route_target(default_route)
        nat_state = ""
        if target_type == "nat_gateway":
            nat_state = str(nat_gateways.get(target_id, {}).get("State", ""))
        rows.append({
            "route_table_id": route_table_id,
            "default_route_target_type": target_type,
            "default_route_target_id": target_id,
            "nat_gateway_state": nat_state,
            "has_available_nat_default": target_type == "nat_gateway" and nat_state == "available",
        })
    return {
        "subnet_ids": subnet_ids,
        "route_tables": rows,
        "available_nat_gateway_count": sum(1 for gateway in nat_gateways.values() if gateway.get("State") == "available"),
        "all_route_tables_have_nat_default": bool(rows) and all(row["has_available_nat_default"] for row in rows),
    }


def _route_tables_by_id(ec2, route_table_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not route_table_ids:
        return {}
    response = ec2.describe_route_tables(RouteTableIds=route_table_ids)
    return {str(table.get("RouteTableId", "")): table for table in response.get("RouteTables", [])}


def _default_ipv4_route(route_table: dict[str, Any]) -> dict[str, Any]:
    for route in route_table.get("Routes", []):
        if route.get("DestinationCidrBlock") == "0.0.0.0/0":
            return route
    return {}


def _route_target(route: dict[str, Any]) -> tuple[str, str]:
    if not route:
        return "missing", ""
    target_keys = {
        "NatGatewayId": "nat_gateway",
        "GatewayId": "gateway",
        "TransitGatewayId": "transit_gateway",
        "VpcPeeringConnectionId": "vpc_peering",
        "NetworkInterfaceId": "network_interface",
        "InstanceId": "instance",
    }
    for key, target_type in target_keys.items():
        value = str(route.get(key, ""))
        if value:
            return target_type, value
    return "unknown", ""


def _nat_gateways(ec2, vpc_id: str) -> dict[str, dict[str, Any]]:
    response = ec2.describe_nat_gateways(
        Filter=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "state", "Values": ["pending", "available", "deleting"]},
        ]
    )
    return {str(gateway.get("NatGatewayId", "")): gateway for gateway in response.get("NatGateways", [])}


def _ensure_nat_gateway(ec2, vpc_id: str, stage: str) -> str:
    existing = _tagged_nat_gateway(ec2, vpc_id, stage)
    if existing:
        nat_gateway_id = str(existing["NatGatewayId"])
        _wait_for_nat_gateway(ec2, nat_gateway_id)
        return nat_gateway_id

    public_subnet_id = os.environ.get("NAT_PUBLIC_SUBNET_ID", "").strip() or _find_public_subnet(ec2, vpc_id)
    if not public_subnet_id:
        raise SystemExit("No public subnet with an Internet Gateway default route was found. Set NAT_PUBLIC_SUBNET_ID.")

    allocation = ec2.allocate_address(
        Domain="vpc",
        TagSpecifications=[_tag_spec("elastic-ip", stage, "kresco-staging-nat-eip")],
    )
    allocation_id = str(allocation["AllocationId"])
    response = ec2.create_nat_gateway(
        SubnetId=public_subnet_id,
        AllocationId=allocation_id,
        TagSpecifications=[_tag_spec("natgateway", stage, "kresco-staging-nat")],
    )
    nat_gateway_id = str(response["NatGateway"]["NatGatewayId"])
    _wait_for_nat_gateway(ec2, nat_gateway_id)
    return nat_gateway_id


def _tagged_nat_gateway(ec2, vpc_id: str, stage: str) -> dict[str, Any] | None:
    response = ec2.describe_nat_gateways(
        Filter=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "state", "Values": ["pending", "available"]},
            {"Name": "tag:Project", "Values": ["kresco"]},
            {"Name": "tag:Stage", "Values": [stage]},
        ]
    )
    gateways = response.get("NatGateways", [])
    return gateways[0] if gateways else None


def _find_public_subnet(ec2, vpc_id: str) -> str:
    main_route_table_id = _main_route_table_id(ec2, vpc_id)
    response = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])
    public_route_table_ids = []
    for table in response.get("RouteTables", []):
        target_type, target_id = _route_target(_default_ipv4_route(table))
        if target_type == "gateway" and target_id.startswith("igw-"):
            public_route_table_ids.append(str(table.get("RouteTableId", "")))

    subnets = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]).get("Subnets", [])
    for subnet in subnets:
        subnet_id = str(subnet.get("SubnetId", ""))
        route_table_id = _route_table_id_for_subnet(ec2, vpc_id, subnet_id, main_route_table_id)
        if route_table_id in public_route_table_ids:
            return subnet_id
    return ""


def _route_table_id_for_subnet(ec2, vpc_id: str, subnet_id: str, main_route_table_id: str) -> str:
    response = ec2.describe_route_tables(
        Filters=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "association.subnet-id", "Values": [subnet_id]},
        ]
    )
    tables = response.get("RouteTables", [])
    return str(tables[0].get("RouteTableId", "")) if tables else main_route_table_id


def _wait_for_nat_gateway(ec2, nat_gateway_id: str) -> None:
    deadline = time.time() + 600
    while time.time() < deadline:
        response = ec2.describe_nat_gateways(NatGatewayIds=[nat_gateway_id])
        gateways = response.get("NatGateways", [])
        state = str(gateways[0].get("State", "")) if gateways else ""
        if state == "available":
            return
        if state == "failed":
            raise SystemExit(f"NAT Gateway {nat_gateway_id} failed to become available.")
        time.sleep(15)
    raise SystemExit(f"NAT Gateway {nat_gateway_id} did not become available before timeout.")


def _ensure_lambda_route_tables_use_nat(ec2, route_table_ids: list[str], nat_gateway_id: str) -> None:
    for route_table_id in route_table_ids:
        table = _route_tables_by_id(ec2, [route_table_id]).get(route_table_id, {})
        default_route = _default_ipv4_route(table)
        if default_route:
            ec2.replace_route(
                RouteTableId=route_table_id,
                DestinationCidrBlock="0.0.0.0/0",
                NatGatewayId=nat_gateway_id,
            )
        else:
            ec2.create_route(
                RouteTableId=route_table_id,
                DestinationCidrBlock="0.0.0.0/0",
                NatGatewayId=nat_gateway_id,
            )


def _tag_spec(resource_type: str, stage: str, name: str) -> dict[str, Any]:
    return {
        "ResourceType": resource_type,
        "Tags": [
            {"Key": "Name", "Value": name},
            {"Key": "Project", "Value": "kresco"},
            {"Key": "Stage", "Value": stage},
        ],
    }


def _redact_for_logs(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _redact_for_logs(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_for_logs(item) for item in value]
    return value


if __name__ == "__main__":
    main()
