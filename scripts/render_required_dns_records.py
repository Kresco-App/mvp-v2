#!/usr/bin/env python3
"""Render the DNS records required for Kresco public subdomain routing."""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from check_firebase_hosting_domains import _expected_contract  # noqa: E402


DEFAULT_ZONE = "kresco.ma"
DEFAULT_TTL = 300
FIREBASE_HOSTING_APEX_A = "199.36.158.100"


@dataclass(frozen=True)
class RequiredDnsRecord:
    environment: str
    zone: str
    name: str
    fqdn: str
    record_type: str
    value: str
    ttl: int


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render required Kresco DNS records without network calls.")
    parser.add_argument("--environment", choices=("staging", "production", "all"), default="all")
    parser.add_argument("--zone", default=DEFAULT_ZONE)
    parser.add_argument("--ttl", type=int, default=DEFAULT_TTL)
    parser.add_argument("--format", choices=("table", "csv", "bind"), default="table")
    args = parser.parse_args(argv)

    records = required_dns_records(environment=args.environment, zone=args.zone, ttl=args.ttl)
    if args.format == "csv":
        _write_csv(records)
    elif args.format == "bind":
        _write_bind(records)
    else:
        _write_table(records)
    return 0


def required_dns_records(*, environment: str, zone: str = DEFAULT_ZONE, ttl: int = DEFAULT_TTL) -> tuple[RequiredDnsRecord, ...]:
    environments = ("staging", "production") if environment == "all" else (environment,)
    return tuple(
        record
        for env in environments
        for record in _records_for_environment(env, zone=zone.strip().rstrip("."), ttl=ttl)
    )


def _records_for_environment(environment: str, *, zone: str, ttl: int) -> tuple[RequiredDnsRecord, ...]:
    _project_id, expectations = _expected_contract(environment)
    records: list[RequiredDnsRecord] = []
    for expectation in expectations:
        for domain in expectation.domains:
            if environment == "production" and expectation.scope == "frontend" and domain == zone:
                records.append(_record(environment, zone, domain, "A", FIREBASE_HOSTING_APEX_A, ttl))
                records.append(_record(environment, zone, domain, "TXT", f"hosting-site={expectation.site}", ttl))
            else:
                records.append(_record(environment, zone, domain, "CNAME", f"{expectation.site}.web.app", ttl))
    return tuple(records)


def _record(environment: str, zone: str, fqdn: str, record_type: str, value: str, ttl: int) -> RequiredDnsRecord:
    return RequiredDnsRecord(
        environment=environment,
        zone=zone,
        name=_relative_name(fqdn, zone),
        fqdn=fqdn,
        record_type=record_type,
        value=value,
        ttl=ttl,
    )


def _relative_name(fqdn: str, zone: str) -> str:
    normalized_fqdn = fqdn.strip().rstrip(".")
    normalized_zone = zone.strip().rstrip(".")
    if normalized_fqdn == normalized_zone:
        return "@"
    suffix = f".{normalized_zone}"
    if normalized_fqdn.endswith(suffix):
        return normalized_fqdn[: -len(suffix)]
    return normalized_fqdn


def _write_table(records: tuple[RequiredDnsRecord, ...]) -> None:
    current_environment = ""
    for record in records:
        if record.environment != current_environment:
            if current_environment:
                print()
            current_environment = record.environment
            print(f"{record.environment}:")
            print("name\ttype\tvalue\tttl")
        print(f"{record.name}\t{record.record_type}\t{record.value}\t{record.ttl}")


def _write_csv(records: tuple[RequiredDnsRecord, ...]) -> None:
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(["environment", "zone", "name", "fqdn", "type", "value", "ttl"])
    for record in records:
        writer.writerow([
            record.environment,
            record.zone,
            record.name,
            record.fqdn,
            record.record_type,
            record.value,
            record.ttl,
        ])


def _write_bind(records: tuple[RequiredDnsRecord, ...]) -> None:
    current_environment = ""
    for record in records:
        if record.environment != current_environment:
            if current_environment:
                print()
            current_environment = record.environment
            print(f"; {record.environment}")
        print(f"{record.name} {record.ttl} IN {record.record_type} {_bind_value(record)}")


def _bind_value(record: RequiredDnsRecord) -> str:
    if record.record_type == "TXT":
        return f'"{record.value}"'
    if record.record_type == "CNAME":
        return f"{record.value.rstrip('.')}."
    return record.value


if __name__ == "__main__":
    raise SystemExit(main())
