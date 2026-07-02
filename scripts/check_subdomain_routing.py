#!/usr/bin/env python3
"""Lightweight smoke checks for Kresco public subdomain routing."""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from email.message import Message


DEFAULT_TIMEOUT_SECONDS = 20
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
RESERVED_SUBDOMAIN_LABELS = {"www", "app", "admin", "prof", "professor", "staff", "api"}


@dataclass(frozen=True)
class HttpPayload:
    status: int
    body: bytes
    headers: Message


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify public Kresco subdomain routing.")
    parser.add_argument("--apex-url", default=os.environ.get("KRESCO_FRONTEND_APEX_URL", ""))
    parser.add_argument("--expected-sha", default=os.environ.get("SHORT_SHA", ""))
    parser.add_argument(
        "--hsts-policy",
        choices=("ignore", "no-include-subdomains", "include-subdomains"),
        default=os.environ.get("KRESCO_SUBDOMAIN_SMOKE_HSTS_POLICY", "no-include-subdomains"),
        help="Expected HSTS policy on HTTPS apex responses.",
    )
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--required", action="store_true", help="Fail when apex-url is empty instead of skipping.")
    parser.add_argument(
        "--check-professor-alias",
        action="store_true",
        help="Also verify professor.<apex> redirects to the canonical prof.<apex> host.",
    )
    args = parser.parse_args(argv)

    apex_url = args.apex_url.strip()
    if not apex_url:
        if args.required:
            print("error: apex-url is required for subdomain routing smoke.", file=sys.stderr)
            return 1
        print("Subdomain routing smoke skipped: no apex-url configured.")
        return 0

    errors = check_subdomain_routing(
        apex_url,
        expected_sha=args.expected_sha.strip(),
        hsts_policy=args.hsts_policy,
        check_professor_alias=args.check_professor_alias,
        timeout_seconds=args.timeout_seconds,
    )
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Subdomain routing smoke passed for {canonical_origin(apex_url)}.")
    return 0


def check_subdomain_routing(
    apex_url: str,
    *,
    expected_sha: str = "",
    hsts_policy: str = "no-include-subdomains",
    check_professor_alias: bool = False,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> list[str]:
    errors: list[str] = []
    apex_origin = canonical_origin(apex_url, errors=errors)
    if not apex_origin:
        return errors
    if hsts_policy not in {"ignore", "no-include-subdomains", "include-subdomains"}:
        errors.append("hsts_policy must be ignore, no-include-subdomains, or include-subdomains.")
        return errors

    parsed = urllib.parse.urlparse(apex_origin)
    apex_host = parsed.hostname or ""
    scheme = parsed.scheme
    port = f":{parsed.port}" if parsed.port else ""
    apex_root = f"{scheme}://{apex_host}{port}/"

    follow_opener = urllib.request.build_opener()
    no_redirect_opener = urllib.request.build_opener(NoRedirectHandler)

    errors.extend(_check_apex_html(follow_opener, apex_root, expected_sha, hsts_policy, timeout_seconds))
    errors.extend(_check_www_redirect(no_redirect_opener, scheme, apex_host, port, timeout_seconds))

    app_root = f"{scheme}://app.{apex_host}{port}/"
    errors.extend(
        _expect_redirect(no_redirect_opener, app_root, apex_root, timeout_seconds, label="app unauthenticated root")
    )

    admin_root = f"{scheme}://admin.{apex_host}{port}/"
    admin_login = (
        f"{scheme}://admin.{apex_host}{port}/login?"
        f"{urllib.parse.urlencode({'next': '/admin'})}"
    )
    errors.extend(
        _expect_redirect(
            no_redirect_opener,
            admin_root,
            admin_login,
            timeout_seconds,
            label="admin unauthenticated root",
        )
    )

    staff_root = f"{scheme}://staff.{apex_host}{port}/"
    staff_login = (
        f"{scheme}://staff.{apex_host}{port}/login?"
        f"{urllib.parse.urlencode({'next': '/staff/payments'})}"
    )
    errors.extend(
        _expect_redirect(
            no_redirect_opener,
            staff_root,
            staff_login,
            timeout_seconds,
            label="staff unauthenticated root",
        )
    )

    prof_root = f"{scheme}://prof.{apex_host}{port}/"
    prof_login = f"{scheme}://prof.{apex_host}{port}/professor/login"
    errors.extend(_expect_redirect(no_redirect_opener, prof_root, prof_login, timeout_seconds, label="prof unauthenticated root"))
    errors.extend(_check_professor_login_html(follow_opener, prof_login, timeout_seconds))
    if check_professor_alias:
        errors.extend(_check_professor_alias_redirect(no_redirect_opener, scheme, apex_host, port, timeout_seconds))

    return errors


def canonical_origin(value: str, *, errors: list[str] | None = None) -> str:
    parsed = urllib.parse.urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
        if errors is not None:
            errors.append("apex-url must be an absolute HTTP(S) URL.")
        return ""
    first_label = parsed.hostname.split(".", 1)[0].lower()
    if first_label in RESERVED_SUBDOMAIN_LABELS:
        if errors is not None:
            errors.append("apex-url must be the frontend apex, not a workspace or API subdomain.")
        return ""
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))


def _check_apex_html(
    opener: urllib.request.OpenerDirector,
    apex_root: str,
    expected_sha: str,
    hsts_policy: str,
    timeout_seconds: int,
) -> list[str]:
    payload = _fetch(opener, apex_root, timeout_seconds=timeout_seconds)
    if isinstance(payload, Exception):
        return [f"apex root failed: {payload}"]
    if payload.status >= 400:
        return [f"apex root returned HTTP {payload.status}."]
    html = payload.body.decode("utf-8", errors="replace")
    errors: list[str] = []
    if "<html" not in html.lower():
        errors.append("apex root did not return HTML.")
    if expected_sha and f'data-release="{expected_sha}"' not in html:
        errors.append("apex root release marker did not match expected sha.")
    errors.extend(_hsts_errors(payload.headers.get("Strict-Transport-Security", ""), apex_root, hsts_policy))
    return errors


def _hsts_errors(header_value: str, apex_root: str, hsts_policy: str) -> list[str]:
    if hsts_policy == "ignore":
        return []
    parsed = urllib.parse.urlparse(apex_root)
    if parsed.scheme != "https":
        return []

    normalized = header_value.lower()
    if not normalized:
        return ["apex root is missing Strict-Transport-Security."]
    has_include_subdomains = "includesubdomains" in normalized
    if hsts_policy == "no-include-subdomains" and has_include_subdomains:
        return ["apex root HSTS must not include includeSubDomains before every public subdomain is verified."]
    if hsts_policy == "include-subdomains" and not has_include_subdomains:
        return ["apex root HSTS must include includeSubDomains after public subdomain cutover."]
    return []


def _check_www_redirect(
    opener: urllib.request.OpenerDirector,
    scheme: str,
    apex_host: str,
    port: str,
    timeout_seconds: int,
) -> list[str]:
    source = f"{scheme}://www.{apex_host}{port}/pricing?subdomain-smoke=1"
    target = f"{scheme}://{apex_host}{port}/pricing?subdomain-smoke=1"
    return _expect_redirect(opener, source, target, timeout_seconds, label="www canonical redirect")


def _check_professor_login_html(
    opener: urllib.request.OpenerDirector,
    login_url: str,
    timeout_seconds: int,
) -> list[str]:
    payload = _fetch(opener, login_url, timeout_seconds=timeout_seconds)
    if isinstance(payload, Exception):
        return [f"professor login failed: {payload}"]
    if payload.status >= 400:
        return [f"professor login returned HTTP {payload.status}."]
    if b"<html" not in payload.body.lower():
        return ["professor login did not return HTML."]
    return []


def _check_professor_alias_redirect(
    opener: urllib.request.OpenerDirector,
    scheme: str,
    apex_host: str,
    port: str,
    timeout_seconds: int,
) -> list[str]:
    source = f"{scheme}://professor.{apex_host}{port}/professor/login?next=chat"
    target = f"{scheme}://prof.{apex_host}{port}/professor/login?next=chat"
    return _expect_redirect(opener, source, target, timeout_seconds, label="professor alias redirect")


def _expect_redirect(
    opener: urllib.request.OpenerDirector,
    source: str,
    expected_location: str,
    timeout_seconds: int,
    *,
    label: str,
) -> list[str]:
    payload = _fetch(opener, source, timeout_seconds=timeout_seconds)
    if isinstance(payload, Exception):
        return [f"{label} failed: {payload}"]
    if payload.status not in REDIRECT_STATUSES:
        return [f"{label} returned HTTP {payload.status}; expected a redirect."]
    location = payload.headers.get("Location", "")
    if _normalize_url(location, source) != expected_location:
        return [f"{label} redirected to {location!r}; expected {expected_location!r}."]
    return []


def _fetch(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    timeout_seconds: int,
) -> HttpPayload | Exception:
    request = urllib.request.Request(url, headers={"Accept": "text/html", "User-Agent": "kresco-subdomain-smoke/1.0"})
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            return HttpPayload(status=response.getcode(), body=response.read(65536), headers=response.headers)
    except urllib.error.HTTPError as exc:
        return HttpPayload(status=exc.code, body=exc.read(65536), headers=exc.headers)
    except urllib.error.URLError as exc:
        return RuntimeError(str(getattr(exc, "reason", exc)))
    except TimeoutError as exc:
        return RuntimeError(str(exc))


def _normalize_url(value: str, base_url: str) -> str:
    return urllib.parse.urljoin(base_url, value)


if __name__ == "__main__":
    raise SystemExit(main())
