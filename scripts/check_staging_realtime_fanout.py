#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse, urlunparse
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 10
DEFAULT_OUTBOX_LIMIT = 100
DEFAULT_EXPECTED_STUDENTS = 50
DEFAULT_POLL_ATTEMPTS = 3
DEFAULT_POLL_DELAY_SECONDS = 2
USER_AGENT = "kresco-staging-realtime-fanout-probe/1.0"
OFFERING_NOTIFICATION_EVENT_BY_ACTION = {
    "notify": "live.session.notify",
    "start": "live.session.started",
}
SESSION_EVENT_BY_ACTION = {
    "notify": "live.session.notified",
    "start": "live.session.started",
}


@dataclass(frozen=True)
class EndpointSet:
    backend_url: str
    ready_url: str
    diagnostics_url: str
    process_outbox_url: str


@dataclass
class FanoutEvidence:
    requested: bool = False
    professor_action: str = ""
    live_session_id: int | None = None
    course_offering_id: int | None = None
    expected_students: int = DEFAULT_EXPECTED_STUDENTS
    checked_students: int = 0
    student_subscription_matches: int = 0
    student_ably_capability_matches: int = 0
    student_session_visibility_matches: int = 0
    offering_channel: str = ""
    offering_event_name: str = ""
    session_channel: str = ""
    session_event_name: str = ""
    provider_history_checked: bool = False
    provider_delivery_verified: bool = False
    provider_history_not_before_ms: int | None = None
    eventbridge_schedule_verified: bool = False
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "requested": self.requested,
            "professor_action": self.professor_action,
            "live_session_id": self.live_session_id,
            "course_offering_id": self.course_offering_id,
            "expected_students": self.expected_students,
            "checked_students": self.checked_students,
            "student_subscription_matches": self.student_subscription_matches,
            "student_ably_capability_matches": self.student_ably_capability_matches,
            "student_session_visibility_matches": self.student_session_visibility_matches,
            "offering_channel": self.offering_channel,
            "offering_event_name": self.offering_event_name,
            "session_channel": self.session_channel,
            "session_event_name": self.session_event_name,
            "provider_history_checked": self.provider_history_checked,
            "provider_delivery_verified": self.provider_delivery_verified,
            "provider_history_not_before_ms": self.provider_history_not_before_ms,
            "eventbridge_schedule_verified": self.eventbridge_schedule_verified,
            "failures": self.failures,
        }


@dataclass
class ProbeResult:
    passed: bool
    mode: str
    evidence_level: str
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    ready_status: str | None = None
    diagnostics_status: str | None = None
    outbox_before: dict[str, Any] | None = None
    outbox_after: dict[str, Any] | None = None
    outbox_result: dict[str, Any] | None = None
    fanout: FanoutEvidence = field(default_factory=FanoutEvidence)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "mode": self.mode,
            "evidence_level": self.evidence_level,
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "ready_status": self.ready_status,
            "diagnostics_status": self.diagnostics_status,
            "outbox_before": self.outbox_before,
            "outbox_after": self.outbox_after,
            "outbox_result": self.outbox_result,
            "fanout": self.fanout.to_dict(),
        }


@dataclass(frozen=True)
class ProbeConfig:
    backend_url: str
    internal_secret: str
    mode: str
    outbox_limit: int = DEFAULT_OUTBOX_LIMIT
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    expected_students: int = DEFAULT_EXPECTED_STUDENTS
    professor_token: str = ""
    student_tokens: tuple[str, ...] = ()
    live_session_id: int | None = None
    professor_action: str = "notify"
    ably_api_key: str = ""
    require_provider_delivery: bool = False
    skip_outbox_drain: bool = False
    poll_attempts: int = DEFAULT_POLL_ATTEMPTS
    poll_delay_seconds: int = DEFAULT_POLL_DELAY_SECONDS
    allow_insecure_backend: bool = False


class ProbeError(RuntimeError):
    pass


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        config = _config_from_args(args)
        result = run_probe(config)
    except ProbeError as exc:
        result = ProbeResult(
            passed=False,
            mode=getattr(args, "mode", "outbox"),
            evidence_level="none",
            errors=(str(exc),),
            warnings=(),
        )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Collect staging realtime outbox/fanout evidence without printing worker or auth secrets."
        )
    )
    parser.add_argument(
        "backend_url",
        nargs="?",
        default=os.environ.get("STAGING_BACKEND_URL", os.environ.get("BACKEND_READY_URL", "")),
        help="Staging backend origin/stage URL or /ready URL. Defaults to STAGING_BACKEND_URL or BACKEND_READY_URL.",
    )
    parser.add_argument(
        "--mode",
        choices=("outbox", "fanout-50", "contract"),
        default=os.environ.get("STAGING_REALTIME_PROBE_MODE", "outbox"),
        help="outbox verifies the protected worker endpoint; fanout-50 triggers a live action and checks student access; contract validates inputs only and fails closed.",
    )
    parser.add_argument(
        "--internal-secret",
        default=os.environ.get("KRESCO_INTERNAL_SECRET", os.environ.get("REALTIME_OUTBOX_SECRET", "")),
        help="Internal worker secret. Prefer env vars so the value is not stored in shell history.",
    )
    parser.add_argument("--outbox-limit", type=int, default=DEFAULT_OUTBOX_LIMIT)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--expected-students", type=int, default=DEFAULT_EXPECTED_STUDENTS)
    parser.add_argument("--professor-token", default=os.environ.get("STAGING_PROFESSOR_TOKEN", ""))
    parser.add_argument("--student-tokens", default=os.environ.get("STAGING_STUDENT_TOKENS", ""))
    parser.add_argument(
        "--student-token-file",
        type=Path,
        default=_path_from_env("STAGING_STUDENT_TOKENS_FILE"),
        help="JSON array/object or newline-separated file containing staging student bearer tokens.",
    )
    parser.add_argument("--live-session-id", type=int, default=os.environ.get("STAGING_LIVE_SESSION_ID") or None)
    parser.add_argument("--professor-action", choices=tuple(OFFERING_NOTIFICATION_EVENT_BY_ACTION), default="notify")
    parser.add_argument("--ably-api-key", default=os.environ.get("ABLY_API_KEY", ""))
    parser.add_argument(
        "--require-provider-delivery",
        action="store_true",
        help="Fail unless Ably history contains the expected staging realtime event.",
    )
    parser.add_argument(
        "--skip-outbox-drain",
        action="store_true",
        help="Do not call the manual protected drain endpoint after triggering a live action.",
    )
    parser.add_argument("--poll-attempts", type=int, default=DEFAULT_POLL_ATTEMPTS)
    parser.add_argument("--poll-delay-seconds", type=int, default=DEFAULT_POLL_DELAY_SECONDS)
    parser.add_argument(
        "--allow-insecure-backend",
        action="store_true",
        help="Allow http:// backend URLs for local rehearsals only. Staging should use HTTPS.",
    )
    parser.add_argument("--json", action="store_true")
    return parser


def _config_from_args(args: argparse.Namespace) -> ProbeConfig:
    backend_url = args.backend_url.strip()
    internal_secret = args.internal_secret.strip()
    student_tokens = tuple(
        token
        for token in (
            *_parse_token_collection(args.student_tokens),
            *_parse_student_token_file(args.student_token_file),
        )
        if token
    )
    return ProbeConfig(
        backend_url=backend_url,
        internal_secret=internal_secret,
        mode=args.mode,
        outbox_limit=_bounded_int(args.outbox_limit, "outbox-limit", minimum=1, maximum=500),
        timeout_seconds=_bounded_int(args.timeout_seconds, "timeout-seconds", minimum=1, maximum=60),
        expected_students=_bounded_int(args.expected_students, "expected-students", minimum=1, maximum=200),
        professor_token=args.professor_token.strip(),
        student_tokens=student_tokens,
        live_session_id=args.live_session_id,
        professor_action=args.professor_action,
        ably_api_key=args.ably_api_key.strip(),
        require_provider_delivery=args.require_provider_delivery,
        skip_outbox_drain=args.skip_outbox_drain,
        poll_attempts=_bounded_int(args.poll_attempts, "poll-attempts", minimum=1, maximum=20),
        poll_delay_seconds=_bounded_int(args.poll_delay_seconds, "poll-delay-seconds", minimum=0, maximum=30),
        allow_insecure_backend=args.allow_insecure_backend,
    )


def run_probe(config: ProbeConfig) -> ProbeResult:
    preflight_errors = _preflight_errors(config)
    if preflight_errors:
        return ProbeResult(
            passed=False,
            mode=config.mode,
            evidence_level="none",
            errors=tuple(preflight_errors),
            warnings=(),
        )

    endpoints = derive_endpoints(config.backend_url, outbox_limit=config.outbox_limit)

    if config.mode == "contract":
        return ProbeResult(
            passed=False,
            mode=config.mode,
            evidence_level="contract_only",
            errors=(
                "contract mode validates required URL and secret inputs but does not collect runtime staging evidence.",
            ),
            warnings=(
                f"derived ready URL: {_redact_url(endpoints.ready_url)}",
                f"derived diagnostics URL: {_redact_url(endpoints.diagnostics_url)}",
                f"derived outbox URL: {_redact_url(endpoints.process_outbox_url)}",
            ),
        )

    warnings: list[str] = []
    errors: list[str] = []
    fanout = FanoutEvidence()
    readiness: dict[str, Any] | None = None
    diagnostics_before: dict[str, Any] | None = None
    diagnostics_after: dict[str, Any] | None = None
    outbox_result: dict[str, Any] | None = None

    try:
        readiness = fetch_json(endpoints.ready_url, timeout_seconds=config.timeout_seconds)
        diagnostics_before = fetch_json(
            endpoints.diagnostics_url,
            timeout_seconds=config.timeout_seconds,
            internal_secret=config.internal_secret,
        )
    except Exception as exc:
        return ProbeResult(
            passed=False,
            mode=config.mode,
            evidence_level="none",
            errors=(f"failed to fetch staging readiness/diagnostics evidence: {type(exc).__name__}: {exc}",),
            warnings=(),
        )

    if readiness.get("status") != "ready":
        errors.append("readiness.status must be ready.")
    if diagnostics_before.get("status") != "ready":
        errors.append("diagnostics.status must be ready for realtime probe preflight.")
    outbox_before = _extract_outbox_counts(diagnostics_before)
    if outbox_before.get("status") != "ok":
        errors.append("diagnostics.checks.realtime.outbox.status must be ok before probing.")
    if _int_value(outbox_before, "dead") > 0:
        errors.append("diagnostics.checks.realtime.outbox.dead must be zero before probing.")

    if config.mode == "fanout-50":
        fanout = _run_fanout_probe(config, endpoints, warnings, errors)

    if not config.skip_outbox_drain:
        try:
            outbox_result = fetch_json(
                endpoints.process_outbox_url,
                method="POST",
                timeout_seconds=config.timeout_seconds,
                internal_secret=config.internal_secret,
            )
        except Exception as exc:
            errors.append(f"bounded outbox drain request failed: {type(exc).__name__}: {exc}")
        else:
            _validate_outbox_result(outbox_result, errors)
    else:
        warnings.append("manual protected outbox drain was skipped; worker endpoint processing was not verified.")

    if fanout.requested:
        _verify_provider_history(config, fanout, warnings)
        for failure in fanout.failures:
            if failure not in errors:
                errors.append(failure)

    try:
        diagnostics_after = fetch_json(
            endpoints.diagnostics_url,
            timeout_seconds=config.timeout_seconds,
            internal_secret=config.internal_secret,
        )
    except Exception as exc:
        errors.append(f"failed to fetch post-probe diagnostics: {type(exc).__name__}: {exc}")

    outbox_after = _extract_outbox_counts(diagnostics_after or {})
    if outbox_after and _int_value(outbox_after, "dead") > 0:
        errors.append("diagnostics.checks.realtime.outbox.dead must remain zero after probing.")

    evidence_level = "outbox_endpoint" if outbox_result else "runtime_preflight"
    if fanout.requested:
        if fanout.provider_delivery_verified:
            evidence_level = "fanout_50_provider_delivery"
        elif fanout.checked_students >= config.expected_students and not fanout.failures:
            evidence_level = "fanout_50_api_contract"
        else:
            evidence_level = "fanout_attempted"
    else:
        warnings.append("50-student staging fanout was not requested; RT-FANOUT-001 remains without fanout evidence.")
    if fanout.requested and not fanout.eventbridge_schedule_verified:
        warnings.append(
            "EventBridge schedule firing is not proven by this HTTP probe; use CloudWatch/EventBridge evidence before launch sign-off."
        )
    if config.require_provider_delivery and not fanout.provider_delivery_verified:
        errors.append("provider delivery was required but Ably history did not verify the expected event.")

    return ProbeResult(
        passed=not errors,
        mode=config.mode,
        evidence_level=evidence_level,
        errors=tuple(errors),
        warnings=tuple(warnings),
        ready_status=str(readiness.get("status")) if readiness else None,
        diagnostics_status=str((diagnostics_after or diagnostics_before or {}).get("status")),
        outbox_before=outbox_before or None,
        outbox_after=outbox_after or None,
        outbox_result=outbox_result,
        fanout=fanout,
    )


def _run_fanout_probe(
    config: ProbeConfig,
    endpoints: EndpointSet,
    warnings: list[str],
    errors: list[str],
) -> FanoutEvidence:
    fanout = FanoutEvidence(
        requested=True,
        professor_action=config.professor_action,
        live_session_id=config.live_session_id,
        expected_students=config.expected_students,
        offering_event_name=OFFERING_NOTIFICATION_EVENT_BY_ACTION[config.professor_action],
        session_event_name=SESSION_EVENT_BY_ACTION[config.professor_action],
    )
    assert config.live_session_id is not None

    action_url = api_url(
        endpoints.backend_url,
        f"/api/professor/live-sessions/{config.live_session_id}/{config.professor_action}",
    )
    fanout.provider_history_not_before_ms = int(time.time() * 1000)
    try:
        session_payload = fetch_json(
            action_url,
            method="POST",
            timeout_seconds=config.timeout_seconds,
            bearer_token=config.professor_token,
        )
    except Exception as exc:
        errors.append(f"professor live-session {config.professor_action} request failed: {type(exc).__name__}: {exc}")
        return fanout

    session_id = _required_int(session_payload, "id", errors, "professor action response")
    offering_id = _required_int(session_payload, "course_offering_id", errors, "professor action response")
    if session_id is not None:
        fanout.live_session_id = session_id
    if offering_id is not None:
        fanout.course_offering_id = offering_id
        fanout.offering_channel = offering_notifications_channel_name(offering_id)
    if fanout.live_session_id is not None:
        fanout.session_channel = live_session_channel_name(fanout.live_session_id)

    if not fanout.offering_channel:
        return fanout

    student_tokens = config.student_tokens[:config.expected_students]
    for index, token in enumerate(student_tokens, start=1):
        _check_student_realtime_contract(
            endpoints.backend_url,
            token=token,
            student_index=index,
            expected_live_session_id=fanout.live_session_id,
            expected_offering_channel=fanout.offering_channel,
            timeout_seconds=config.timeout_seconds,
            fanout=fanout,
        )

    if fanout.checked_students < config.expected_students:
        fanout.failures.append(
            f"only {fanout.checked_students} student token(s) were checked; expected {config.expected_students}."
        )
    if fanout.student_subscription_matches < config.expected_students:
        fanout.failures.append(
            "not every checked student subscription payload included the offering notification channel."
        )
    if fanout.student_ably_capability_matches < config.expected_students:
        fanout.failures.append(
            "not every checked student Ably token capability included the offering notification channel."
        )
    if fanout.student_session_visibility_matches < config.expected_students:
        fanout.failures.append("not every checked student could see the live session through the staging API.")

    if fanout.failures:
        errors.extend(fanout.failures)
    return fanout


def _verify_provider_history(config: ProbeConfig, fanout: FanoutEvidence, warnings: list[str]) -> None:
    if not fanout.offering_channel:
        return
    if config.ably_api_key:
        fanout.provider_history_checked = True
        try:
            fanout.provider_delivery_verified = _poll_ably_history_for_event(
                fanout.offering_channel,
                event_name=fanout.offering_event_name,
                live_session_id=fanout.live_session_id,
                not_before_ms=fanout.provider_history_not_before_ms,
                ably_api_key=config.ably_api_key,
                timeout_seconds=config.timeout_seconds,
                attempts=config.poll_attempts,
                delay_seconds=config.poll_delay_seconds,
            )
        except Exception as exc:
            message = f"Ably history check failed before provider delivery evidence was collected: {type(exc).__name__}: {exc}"
            if config.require_provider_delivery:
                fanout.failures.append(message)
            else:
                warnings.append(message)
            return
        if not fanout.provider_delivery_verified:
            message = "Ably history did not contain the expected offering-channel live notification event."
            if config.require_provider_delivery:
                fanout.failures.append(message)
            else:
                warnings.append(message)
    else:
        warnings.append("ABLY_API_KEY was not provided; provider delivery was not checked.")


def _check_student_realtime_contract(
    backend_url: str,
    *,
    token: str,
    student_index: int,
    expected_live_session_id: int | None,
    expected_offering_channel: str,
    timeout_seconds: int,
    fanout: FanoutEvidence,
) -> None:
    fanout.checked_students += 1
    auth_label = f"student {student_index}"
    try:
        subscriptions = fetch_json(
            api_url(backend_url, "/api/realtime/subscriptions"),
            timeout_seconds=timeout_seconds,
            bearer_token=token,
        )
        channels = subscriptions.get("notification_channels")
        if isinstance(channels, list) and expected_offering_channel in channels:
            fanout.student_subscription_matches += 1
        else:
            fanout.failures.append(f"{auth_label} subscriptions did not include the offering notification channel.")
    except Exception as exc:
        fanout.failures.append(f"{auth_label} subscriptions request failed: {type(exc).__name__}: {exc}")

    try:
        ably_token = fetch_json(
            api_url(backend_url, "/api/realtime/ably-token"),
            timeout_seconds=timeout_seconds,
            bearer_token=token,
        )
        capability = ably_token.get("capability")
        if isinstance(capability, dict) and expected_offering_channel in capability:
            fanout.student_ably_capability_matches += 1
        else:
            fanout.failures.append(f"{auth_label} Ably capability did not include the offering notification channel.")
    except Exception as exc:
        fanout.failures.append(f"{auth_label} Ably token request failed: {type(exc).__name__}: {exc}")

    if expected_live_session_id is None:
        return
    try:
        live_sessions = fetch_json(
            api_url(backend_url, "/api/professor/student-live-sessions?limit=100"),
            timeout_seconds=timeout_seconds,
            bearer_token=token,
            expect_object=False,
        )
        if isinstance(live_sessions, list) and any(_item_id(item) == expected_live_session_id for item in live_sessions):
            fanout.student_session_visibility_matches += 1
        else:
            fanout.failures.append(f"{auth_label} could not see the live session in the staging API.")
    except Exception as exc:
        fanout.failures.append(f"{auth_label} student live-session request failed: {type(exc).__name__}: {exc}")


def _poll_ably_history_for_event(
    channel: str,
    *,
    event_name: str,
    live_session_id: int | None,
    not_before_ms: int | None,
    ably_api_key: str,
    timeout_seconds: int,
    attempts: int,
    delay_seconds: int,
) -> bool:
    history_url = (
        "https://rest.ably.io/channels/"
        f"{quote(channel, safe='')}/history?limit=20&direction=backwards"
    )
    for attempt in range(1, attempts + 1):
        history_payload = fetch_json(
            history_url,
            timeout_seconds=timeout_seconds,
            basic_auth_secret=ably_api_key,
            expect_object=False,
        )
        if _history_contains_event(
            history_payload,
            event_name=event_name,
            live_session_id=live_session_id,
            not_before_ms=not_before_ms,
        ):
            return True
        if attempt < attempts and delay_seconds > 0:
            time.sleep(delay_seconds)
    return False


def _history_contains_event(
    history_payload: Any,
    *,
    event_name: str,
    live_session_id: int | None,
    not_before_ms: int | None,
) -> bool:
    if isinstance(history_payload, dict):
        items = history_payload.get("items")
    else:
        items = history_payload
    if not isinstance(items, list):
        return False
    for item in items:
        if not isinstance(item, dict) or item.get("name") != event_name:
            continue
        if not _history_item_is_new_enough(item, not_before_ms=not_before_ms):
            continue
        data = item.get("data")
        if live_session_id is None:
            return True
        if isinstance(data, dict) and _item_id(data, key="live_session_id") == live_session_id:
            return True
    return False


def _history_item_is_new_enough(item: dict[str, Any], *, not_before_ms: int | None) -> bool:
    if not_before_ms is None:
        return True
    timestamp = item.get("timestamp")
    try:
        return int(timestamp) >= not_before_ms
    except (TypeError, ValueError):
        return False


def derive_endpoints(backend_url: str, *, outbox_limit: int = DEFAULT_OUTBOX_LIMIT) -> EndpointSet:
    parsed = urlparse(backend_url.strip())
    if not parsed.scheme or not parsed.netloc:
        raise ProbeError("staging backend URL must be an absolute HTTP(S) URL.")
    base_path = _stage_base_path(parsed.path)
    normalized_backend = urlunparse(parsed._replace(path=base_path, params="", query="", fragment=""))
    return EndpointSet(
        backend_url=normalized_backend,
        ready_url=api_url(normalized_backend, "/ready"),
        diagnostics_url=api_url(normalized_backend, "/api/internal/diagnostics"),
        process_outbox_url=api_url(normalized_backend, f"/api/internal/realtime/process-outbox?limit={outbox_limit}"),
    )


def api_url(backend_url: str, path_and_query: str) -> str:
    parsed = urlparse(backend_url)
    path, question, query = path_and_query.partition("?")
    base_path = _stage_base_path(parsed.path)
    endpoint_path = f"{base_path.rstrip('/')}/{path.lstrip('/')}" if base_path else f"/{path.lstrip('/')}"
    return urlunparse(parsed._replace(path=endpoint_path, query=query if question else "", params="", fragment=""))


def _stage_base_path(path: str) -> str:
    normalized = (path or "").rstrip("/")
    if normalized.endswith("/ready"):
        normalized = normalized[: -len("/ready")]
    if normalized.endswith("/api"):
        normalized = normalized[: -len("/api")]
    return normalized


def fetch_json(
    url: str,
    *,
    method: str = "GET",
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    internal_secret: str = "",
    bearer_token: str = "",
    basic_auth_secret: str = "",
    expect_object: bool = True,
) -> Any:
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if internal_secret:
        headers["x-kresco-internal-secret"] = internal_secret
    if bearer_token:
        headers["Authorization"] = _bearer_value(bearer_token)
    if basic_auth_secret:
        headers["Authorization"] = f"Basic {base64.b64encode(basic_auth_secret.encode('utf-8')).decode('ascii')}"
    data = b"" if method.upper() == "POST" else None
    request = Request(url, headers=headers, method=method.upper(), data=data)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        status = f"HTTP {exc.code}"
        reason = getattr(exc, "reason", "")
        raise RuntimeError(f"{method.upper()} {_redact_url(url)} returned {status} {reason}".strip()) from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(str(reason)) from exc
    if expect_object and not isinstance(parsed, dict):
        raise ValueError("response JSON must be an object")
    return parsed


def offering_notifications_channel_name(course_offering_id: int | str) -> str:
    return f"kresco:offering:{course_offering_id}:notifications"


def live_session_channel_name(live_session_id: int | str) -> str:
    return f"kresco:live:{live_session_id}"


def _preflight_errors(config: ProbeConfig) -> list[str]:
    errors: list[str] = []
    if not config.backend_url:
        errors.append("STAGING_BACKEND_URL, BACKEND_READY_URL, or backend_url argument is required.")
    else:
        parsed = urlparse(config.backend_url)
        if not parsed.scheme or not parsed.netloc:
            errors.append("staging backend URL must be an absolute HTTP(S) URL.")
        elif parsed.scheme != "https" and not config.allow_insecure_backend:
            errors.append("staging backend URL must use HTTPS unless --allow-insecure-backend is set.")
    if not config.internal_secret:
        errors.append("KRESCO_INTERNAL_SECRET, REALTIME_OUTBOX_SECRET, or --internal-secret is required.")
    if config.mode == "fanout-50":
        if config.expected_students < DEFAULT_EXPECTED_STUDENTS:
            errors.append(
                f"fanout-50 mode requires expected-students >= {DEFAULT_EXPECTED_STUDENTS}; "
                f"{config.expected_students} requested."
            )
        if not config.professor_token:
            errors.append("STAGING_PROFESSOR_TOKEN or --professor-token is required for fanout-50 mode.")
        if config.live_session_id is None:
            errors.append("STAGING_LIVE_SESSION_ID or --live-session-id is required for fanout-50 mode.")
        if len(config.student_tokens) < config.expected_students:
            errors.append(
                f"fanout-50 mode requires {config.expected_students} student auth token(s); "
                f"{len(config.student_tokens)} provided."
            )
        if config.require_provider_delivery and not config.ably_api_key:
            errors.append("ABLY_API_KEY or --ably-api-key is required with --require-provider-delivery.")
    return errors


def _extract_outbox_counts(diagnostics: dict[str, Any]) -> dict[str, Any]:
    checks = diagnostics.get("checks")
    if not isinstance(checks, dict):
        return {}
    realtime = checks.get("realtime")
    if not isinstance(realtime, dict):
        return {}
    outbox = realtime.get("outbox")
    return outbox if isinstance(outbox, dict) else {}


def _validate_outbox_result(outbox_result: dict[str, Any], errors: list[str]) -> None:
    if outbox_result.get("ok") is not True:
        errors.append("outbox drain endpoint must return ok=true.")
    if _int_value(outbox_result, "retry") > 0:
        errors.append("outbox drain must not move events to retry.")
    if _int_value(outbox_result, "dead") > 0:
        errors.append("outbox drain must not dead-letter events.")


def _int_value(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    return value if isinstance(value, int) else 0


def _required_int(payload: dict[str, Any], key: str, errors: list[str], label: str) -> int | None:
    value = payload.get(key)
    if isinstance(value, int):
        return value
    errors.append(f"{label}.{key} must be an integer.")
    return None


def _item_id(item: Any, *, key: str = "id") -> int | None:
    if isinstance(item, dict) and isinstance(item.get(key), int):
        return item[key]
    return None


def _bounded_int(value: int, label: str, *, minimum: int, maximum: int) -> int:
    if value < minimum or value > maximum:
        raise ProbeError(f"{label} must be between {minimum} and {maximum}.")
    return value


def _path_from_env(name: str) -> Path | None:
    value = os.environ.get(name, "").strip()
    return Path(value) if value else None


def _parse_student_token_file(path: Path | None) -> tuple[str, ...]:
    if path is None:
        return ()
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ProbeError(f"student token file could not be read: {type(exc).__name__}") from exc
    return _parse_token_collection(content)


def _parse_token_collection(value: str) -> tuple[str, ...]:
    raw = value.strip()
    if not raw:
        return ()
    if raw[0] in "[{":
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProbeError("student token collection must be valid JSON or comma/newline-separated text.") from exc
        if isinstance(parsed, dict):
            parsed = parsed.get("tokens")
        if not isinstance(parsed, list):
            raise ProbeError("student token JSON must be an array or an object with a tokens array.")
        return tuple(str(item).strip() for item in parsed if str(item).strip())
    tokens: list[str] = []
    for line in raw.replace(",", "\n").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            tokens.append(stripped)
    return tuple(tokens)


def _bearer_value(token: str) -> str:
    stripped = token.strip()
    return stripped if stripped.lower().startswith("bearer ") else f"Bearer {stripped}"


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse(parsed._replace(query="[redacted]" if parsed.query else ""))


def _print_human_result(result: ProbeResult) -> None:
    if result.passed:
        print(f"Staging realtime probe passed ({result.evidence_level}).")
    else:
        print(f"Staging realtime probe failed ({result.evidence_level}).", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    for warning in result.warnings:
        print(f"- warning: {warning}", file=sys.stderr)
    if result.fanout.requested:
        print(
            "Fanout checked "
            f"{result.fanout.checked_students}/{result.fanout.expected_students} students; "
            f"provider_delivery={result.fanout.provider_delivery_verified}; "
            f"eventbridge_schedule={result.fanout.eventbridge_schedule_verified}.",
            file=sys.stderr if not result.passed else sys.stdout,
        )


if __name__ == "__main__":
    raise SystemExit(main())
