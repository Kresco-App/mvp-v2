#!/usr/bin/env python3
"""Compare Firebase Hosting requested DNS records with public DNS."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from export_firebase_hosting_dns_records import export_firebase_hosting_dns_records  # noqa: E402
from check_firebase_hosting_domains import TOKEN_ENV, _gcloud_access_token  # noqa: E402
import os  # noqa: E402


DNS_GOOGLE_RESOLVE_URL = "https://dns.google/resolve"


@dataclass(frozen=True)
class PublicDnsRecordCheck:
    domain: str
    record_type: str
    expected: str
    actual: tuple[str, ...]
    passed: bool
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "domain": self.domain,
            "record_type": self.record_type,
            "expected": self.expected,
            "actual": list(self.actual),
            "passed": self.passed,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class PublicDnsResult:
    environment: str
    passed: bool
    records: tuple[PublicDnsRecordCheck, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "environment": self.environment,
            "passed": self.passed,
            "records": [record.to_dict() for record in self.records],
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check Firebase Hosting DNS records in public DNS.")
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--access-token-env", default=TOKEN_ENV)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    access_token = os.environ.get(args.access_token_env, "").strip()
    token_error = ""
    if not access_token:
        access_token, token_error = _gcloud_access_token(timeout_seconds=args.timeout_seconds)

    dns_plan = export_firebase_hosting_dns_records(
        environment=args.environment,
        access_token=access_token,
        access_token_error=token_error,
        timeout_seconds=args.timeout_seconds,
    )
    result = check_public_dns(
        environment=args.environment,
        dns_plan=dns_plan.to_dict(),
        timeout_seconds=args.timeout_seconds,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for record in result.records:
            status = "ok" if record.passed else "error"
            print(f"{status}: {record.domain} {record.record_type} expected {record.expected}")
            if record.actual:
                print(f"  actual: {', '.join(record.actual)}")
            for error in record.errors:
                print(f"  error: {error}", file=sys.stderr)
    return 0 if result.passed else 1


def check_public_dns(*, environment: str, dns_plan: dict[str, Any], timeout_seconds: float = 20.0) -> PublicDnsResult:
    records: list[PublicDnsRecordCheck] = []
    for domain_plan in dns_plan.get("domains", []):
        if not isinstance(domain_plan, dict):
            continue
        for record in domain_plan.get("records", []):
            if not isinstance(record, dict):
                continue
            domain = str(record.get("domainName") or domain_plan.get("domain") or "").strip().rstrip(".")
            record_type = str(record.get("type") or "").strip().upper()
            expected = _normalize_rdata(str(record.get("rdata") or ""), record_type)
            if not domain or not record_type or not expected:
                continue
            actual, errors = _resolve_dns(domain=domain, record_type=record_type, timeout_seconds=timeout_seconds)
            passed = not errors and expected in actual
            if not passed and not errors:
                errors = (f"Expected {expected!r}; public DNS returned {', '.join(actual) if actual else 'no records'}.",)
            records.append(
                PublicDnsRecordCheck(
                    domain=domain,
                    record_type=record_type,
                    expected=expected,
                    actual=actual,
                    passed=passed,
                    errors=errors,
                )
            )
    return PublicDnsResult(environment=environment, passed=bool(records) and all(record.passed for record in records), records=tuple(records))


def _resolve_dns(*, domain: str, record_type: str, timeout_seconds: float) -> tuple[tuple[str, ...], tuple[str, ...]]:
    query = urllib.parse.urlencode({"name": domain, "type": record_type})
    request = urllib.request.Request(
        f"{DNS_GOOGLE_RESOLVE_URL}?{query}",
        headers={"Accept": "application/dns-json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        return (), (f"DNS over HTTPS returned HTTP {exc.code}: {detail}",)
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return (), (f"DNS over HTTPS failed: {exc}",)
    except json.JSONDecodeError as exc:
        return (), (f"DNS over HTTPS returned invalid JSON: {exc.msg}",)
    if not isinstance(payload, dict):
        return (), ("DNS over HTTPS response was not a JSON object.",)
    status = payload.get("Status")
    if status not in (0, "0"):
        return (), (f"DNS query status was {status}; expected 0.",)
    answers = payload.get("Answer", [])
    if not isinstance(answers, list):
        return (), ("DNS response did not include an Answer list.",)
    actual = tuple(
        sorted(
            {
                _normalize_rdata(str(answer.get("data") or ""), record_type)
                for answer in answers
                if isinstance(answer, dict) and str(answer.get("type") or "")
            }
        )
    )
    return actual, ()


def _normalize_rdata(value: str, record_type: str) -> str:
    normalized = value.strip().strip('"').rstrip(".")
    return normalized.lower() if record_type in {"CNAME", "TXT"} else normalized


if __name__ == "__main__":
    raise SystemExit(main())
