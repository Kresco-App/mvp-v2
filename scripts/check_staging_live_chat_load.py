from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen


DEFAULT_THRESHOLD_MS = 1500.0
DEFAULT_SAMPLES = 5
DEFAULT_WARMUPS = 1
DEFAULT_TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class LoadProbe:
    name: str
    url: str
    threshold_ms: float
    samples_ms: tuple[float, ...]
    status_code: int | None
    response_summary: dict[str, Any]
    errors: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "url": _redact_url(self.url),
            "threshold_ms": self.threshold_ms,
            "samples_ms": [round(sample, 2) for sample in self.samples_ms],
            "summary": _measurement_summary(self.samples_ms),
            "status_code": self.status_code,
            "response_summary": self.response_summary,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class LiveChatLoadResult:
    passed: bool
    mode: str
    errors: tuple[str, ...]
    probes: tuple[LoadProbe, ...]
    required_inputs: tuple[str, ...] = ()
    request_headers: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "mode": self.mode,
            "errors": list(self.errors),
            "required_inputs": list(self.required_inputs),
            "request_headers": _redact_headers(self.request_headers or {}),
            "probes": [probe.to_dict() for probe in self.probes],
        }


OpenUrl = Callable[..., Any]
Clock = Callable[[], float]
Validator = Callable[[Any], tuple[tuple[str, ...], dict[str, Any]]]


def measure_live_chat_load(
    *,
    backend_url: str,
    auth_token: str,
    live_session_id: str = "",
    conversation_id: str = "",
    threshold_ms: float = DEFAULT_THRESHOLD_MS,
    samples: int = DEFAULT_SAMPLES,
    warmups: int = DEFAULT_WARMUPS,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    opener: OpenUrl = urlopen,
    clock: Clock = time.perf_counter,
    contract_only: bool = False,
) -> LiveChatLoadResult:
    missing_inputs = _missing_inputs(backend_url=backend_url, auth_token=auth_token)
    if contract_only or missing_inputs:
        return _contract_result(missing_inputs)
    backend_url_errors = _backend_url_errors(backend_url)
    if backend_url_errors:
        return LiveChatLoadResult(
            passed=False,
            mode="preflight",
            errors=backend_url_errors,
            probes=(),
        )

    clean_live_session_id = live_session_id.strip()
    clean_conversation_id = conversation_id.strip()
    headers = _auth_headers(auth_header=auth_header, auth_scheme=auth_scheme, auth_token=auth_token)
    probe_samples = max(1, samples)
    probe_warmups = max(0, warmups)
    probes: list[LoadProbe] = []
    result_errors: list[str] = []

    live_sessions_probe = _measure_probe(
        name="student_live_sessions",
        url=build_backend_url(backend_url, "/api/professor/student-live-sessions?limit=20"),
        threshold_ms=threshold_ms,
        validator=_validate_live_sessions_payload,
        samples=probe_samples,
        warmups=probe_warmups,
        timeout_seconds=timeout_seconds,
        headers=headers,
        opener=opener,
        clock=clock,
    )
    probes.append(live_sessions_probe)
    selected_live_session_id = clean_live_session_id or _first_id(live_sessions_probe.response_summary, "selected_live_session_id")
    if selected_live_session_id:
        probes.extend((
            _measure_probe(
                name="student_live_interactions",
                url=build_backend_url(
                    backend_url,
                    f"/api/professor/student-live-sessions/{selected_live_session_id}/interactions?limit=50",
                ),
                threshold_ms=threshold_ms,
                validator=_validate_list_payload("live interactions response must be a list."),
                samples=probe_samples,
                warmups=probe_warmups,
                timeout_seconds=timeout_seconds,
                headers=headers,
                opener=opener,
                clock=clock,
            ),
            _measure_probe(
                name="student_live_checkpoints",
                url=build_backend_url(
                    backend_url,
                    f"/api/professor/student-live-sessions/{selected_live_session_id}/checkpoints?limit=50",
                ),
                threshold_ms=threshold_ms,
                validator=_validate_list_payload("live checkpoints response must be a list."),
                samples=probe_samples,
                warmups=probe_warmups,
                timeout_seconds=timeout_seconds,
                headers=headers,
                opener=opener,
                clock=clock,
            ),
        ))
    else:
        result_errors.append("No live session id was configured or discovered for load evidence.")

    chat_status_probe = _measure_probe(
        name="student_professor_chat",
        url=build_backend_url(backend_url, "/api/professor/student-chat?limit=20"),
        threshold_ms=threshold_ms,
        validator=_validate_student_chat_payload,
        samples=probe_samples,
        warmups=probe_warmups,
        timeout_seconds=timeout_seconds,
        headers=headers,
        opener=opener,
        clock=clock,
    )
    probes.append(chat_status_probe)
    selected_conversation_id = clean_conversation_id or _first_id(chat_status_probe.response_summary, "selected_conversation_id")
    if selected_conversation_id:
        probes.append(
            _measure_probe(
                name="student_chat_messages",
                url=build_backend_url(
                    backend_url,
                    f"/api/professor/student-chat/conversations/{selected_conversation_id}/messages?limit=50",
                ),
                threshold_ms=threshold_ms,
                validator=_validate_list_payload("chat messages response must be a list."),
                samples=probe_samples,
                warmups=probe_warmups,
                timeout_seconds=timeout_seconds,
                headers=headers,
                opener=opener,
                clock=clock,
            )
        )
    else:
        result_errors.append("No professor chat conversation id was configured or discovered for load evidence.")

    errors = tuple([*result_errors, *(error for probe in probes for error in probe.errors)])
    return LiveChatLoadResult(
        passed=not errors,
        mode="http",
        errors=errors,
        probes=tuple(probes),
        request_headers=headers,
    )


def build_backend_url(base_url: str, path_and_query: str) -> str:
    parsed = urlparse(base_url.strip())
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("backend URL must be an absolute HTTP(S) URL.")
    endpoint_path, question, endpoint_query = path_and_query.partition("?")
    base_path = parsed.path.rstrip("/")
    if base_path.endswith("/ready"):
        base_path = base_path.rsplit("/", 1)[0]
    path = f"{base_path}/{endpoint_path.lstrip('/')}" if base_path else endpoint_path
    return urlunparse(parsed._replace(path=path, query=endpoint_query if question else "", params="", fragment=""))


def _measure_probe(
    *,
    name: str,
    url: str,
    threshold_ms: float,
    validator: Validator,
    samples: int,
    warmups: int,
    timeout_seconds: int,
    headers: dict[str, str],
    opener: OpenUrl,
    clock: Clock,
) -> LoadProbe:
    errors: list[str] = []
    samples_ms: list[float] = []
    status_code: int | None = None
    response_summary: dict[str, Any] = {}

    try:
        for _ in range(warmups):
            _fetch_json(url, headers=headers, timeout_seconds=timeout_seconds, opener=opener)
        for _ in range(samples):
            started = clock()
            payload, status_code = _fetch_json(url, headers=headers, timeout_seconds=timeout_seconds, opener=opener)
            elapsed_ms = (clock() - started) * 1000
            samples_ms.append(elapsed_ms)
            payload_errors, response_summary = validator(payload)
            if payload_errors:
                errors.extend(payload_errors)
    except Exception as exc:
        errors.append(f"{name} request failed for {_redact_url(url)}: {type(exc).__name__}: {exc}")

    summary = _measurement_summary(tuple(samples_ms))
    p95_ms = summary.get("p95_ms")
    if isinstance(p95_ms, float) and p95_ms > threshold_ms:
        errors.append(f"{name} p95 latency {p95_ms:.2f} ms exceeded threshold {threshold_ms:.2f} ms.")
    if not samples_ms and not errors:
        errors.append(f"{name} did not record any latency samples.")

    return LoadProbe(
        name=name,
        url=url,
        threshold_ms=threshold_ms,
        samples_ms=tuple(samples_ms),
        status_code=status_code,
        response_summary=response_summary,
        errors=tuple(errors),
    )


def _fetch_json(
    url: str,
    *,
    headers: dict[str, str],
    timeout_seconds: int,
    opener: OpenUrl,
) -> tuple[Any, int | None]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "kresco-staging-live-chat-load/1.0",
        **headers,
    }
    request = Request(url, headers=request_headers, method="GET")
    try:
        with opener(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8")), getattr(response, "status", None)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GET {_redact_url(url)} returned {exc.code}: {_safe_body_summary(body)}") from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(str(reason)) from exc


def _validate_live_sessions_payload(payload: Any) -> tuple[tuple[str, ...], dict[str, Any]]:
    if not isinstance(payload, list):
        return ("student live sessions response must be a list.",), {}
    selected = _first_object_id(payload)
    joinable = sum(1 for item in payload if isinstance(item, dict) and item.get("can_join") is True)
    return (), {
        "count": len(payload),
        "joinable_count": joinable,
        "selected_live_session_id": selected,
    }


def _validate_student_chat_payload(payload: Any) -> tuple[tuple[str, ...], dict[str, Any]]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ("student professor chat response must be an object.",), {}
    conversations = payload.get("conversations")
    teacher_threads = payload.get("teacher_threads")
    if not isinstance(conversations, list):
        errors.append("student professor chat response must include conversations list.")
        conversations = []
    if not isinstance(teacher_threads, list):
        errors.append("student professor chat response must include teacher_threads list.")
        teacher_threads = []
    return tuple(errors), {
        "eligible": payload.get("eligible"),
        "conversation_count": len(conversations),
        "teacher_thread_count": len(teacher_threads),
        "selected_conversation_id": _first_object_id(conversations),
    }


def _validate_list_payload(message: str) -> Validator:
    def validate(payload: Any) -> tuple[tuple[str, ...], dict[str, Any]]:
        if not isinstance(payload, list):
            return (message,), {}
        return (), {"count": len(payload)}

    return validate


def _first_object_id(items: list[Any]) -> str:
    for item in items:
        if isinstance(item, dict) and item.get("id") is not None:
            return str(item["id"])
    return ""


def _first_id(summary: dict[str, Any], key: str) -> str:
    value = summary.get(key)
    return str(value).strip() if value is not None else ""


def _measurement_summary(samples_ms: tuple[float, ...]) -> dict[str, float | int | None]:
    if not samples_ms:
        return {"count": 0, "min_ms": None, "avg_ms": None, "p95_ms": None, "max_ms": None}
    sorted_samples = sorted(samples_ms)
    p95_index = max(0, min(len(sorted_samples) - 1, int(len(sorted_samples) * 0.95 + 0.999999) - 1))
    return {
        "count": len(samples_ms),
        "min_ms": round(min(samples_ms), 2),
        "avg_ms": round(statistics.fmean(samples_ms), 2),
        "p95_ms": round(sorted_samples[p95_index], 2),
        "max_ms": round(max(samples_ms), 2),
    }


def _auth_headers(*, auth_header: str, auth_scheme: str, auth_token: str) -> dict[str, str]:
    header = auth_header.strip()
    scheme = auth_scheme.strip()
    token = auth_token.strip()
    value = f"{scheme} {token}" if scheme else token
    return {header: value}


def _missing_inputs(*, backend_url: str, auth_token: str) -> tuple[str, ...]:
    missing: list[str] = []
    if not backend_url.strip():
        missing.append("backend_url")
    if not auth_token.strip():
        missing.append("auth_token")
    return tuple(missing)


def _contract_result(missing_inputs: tuple[str, ...]) -> LiveChatLoadResult:
    required_inputs = _required_inputs()
    detail = ", ".join(missing_inputs) if missing_inputs else "contract mode requested"
    return LiveChatLoadResult(
        passed=False,
        mode="contract",
        errors=(f"Staging live/chat load evidence was not collected; missing inputs: {detail}.",),
        probes=(),
        required_inputs=required_inputs,
    )


def _required_inputs() -> tuple[str, ...]:
    return (
        "STAGING_BACKEND_URL or --backend-url",
        "STAGING_AUTH_SMOKE_EMAIL/PASSWORD plus FIREBASE_API_KEY, or --auth-token",
        "Optional: STAGING_LIVE_SESSION_ID or --live-session-id",
        "Optional: STAGING_CHAT_CONVERSATION_ID or --conversation-id",
    )


def _auth_contract_error(message: str) -> LiveChatLoadResult:
    return LiveChatLoadResult(
        passed=False,
        mode="contract",
        errors=(message,),
        probes=(),
        required_inputs=_required_inputs(),
    )


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {key: "[redacted]" for key in headers}


def _redact_url(url: str) -> str:
    parsed = urlparse(url)
    netloc = parsed.hostname or parsed.netloc
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc, query="[redacted]" if parsed.query else ""))


def _safe_body_summary(body: str) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return f"non-JSON response body redacted ({len(body)} bytes)"
    if isinstance(parsed, dict):
        return json.dumps(_redact_json(parsed))[:200]
    return str(parsed)[:200]


def _backend_url_errors(backend_url: str) -> tuple[str, ...]:
    try:
        parsed = urlparse(backend_url.strip())
    except Exception:
        return ("backend URL must be an absolute HTTPS URL.",)
    errors: list[str] = []
    if not parsed.scheme or not parsed.netloc:
        errors.append("backend URL must be an absolute HTTPS URL.")
    elif parsed.scheme != "https":
        errors.append("backend URL must use HTTPS for staging load evidence.")
    host = (parsed.hostname or "").lower().strip("[]")
    if host in {"localhost", "0.0.0.0", "::1"} or host.startswith("127.") or "ngrok" in host:
        errors.append("backend URL must not point to localhost, loopback, or local tunnel hosts.")
    return tuple(errors)


def _mint_firebase_id_token(
    *,
    firebase_api_key: str,
    auth_email: str,
    auth_password: str,
    timeout_seconds: int,
    opener: OpenUrl = urlopen,
) -> str:
    missing: list[str] = []
    if not firebase_api_key.strip():
        missing.append("FIREBASE_API_KEY")
    if not auth_email.strip():
        missing.append("STAGING_AUTH_SMOKE_EMAIL")
    if not auth_password:
        missing.append("STAGING_AUTH_SMOKE_PASSWORD")
    if missing:
        raise ValueError("Firebase password sign-in needs " + ", ".join(missing) + ".")

    sign_in_url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?" + urlencode(
        {"key": firebase_api_key.strip()}
    )
    request = Request(
        sign_in_url,
        data=json.dumps({
            "email": auth_email.strip(),
            "password": auth_password,
            "returnSecureToken": True,
        }).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "kresco-staging-live-chat-load/1.0",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firebase password sign-in returned {exc.code}: {_safe_body_summary(body)}") from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"Firebase password sign-in failed: {reason}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Firebase password sign-in response must be an object.")
    id_token = payload.get("idToken")
    if not isinstance(id_token, str) or not id_token:
        raise RuntimeError("Firebase password sign-in did not return an ID token.")
    return id_token


def _exchange_firebase_session_token(
    *,
    backend_url: str,
    firebase_id_token: str,
    timeout_seconds: int,
    opener: OpenUrl = urlopen,
) -> str:
    if not backend_url.strip():
        raise ValueError("backend URL is required to exchange Firebase credentials.")
    if not firebase_id_token.strip():
        raise ValueError("Firebase ID token is required to exchange an app session.")

    session_url = build_backend_url(backend_url, "/api/auth/firebase-session")
    request = Request(
        session_url,
        data=json.dumps({"credential": firebase_id_token}).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "kresco-staging-live-chat-load/1.0",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=timeout_seconds) as response:
            response.read()
            set_cookie_headers = response.headers.get_all("Set-Cookie", [])
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firebase session exchange returned {exc.code}: {_safe_body_summary(body)}") from exc
    except URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"Firebase session exchange failed: {reason}") from exc

    for header in set_cookie_headers:
        cookie = SimpleCookie()
        cookie.load(header)
        morsel = cookie.get("kresco_token")
        if morsel is not None and morsel.value:
            return morsel.value
    raise RuntimeError("Firebase session exchange did not return an app session cookie.")


def _redact_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if _is_sensitive_key(str(key)) else _redact_json(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_redact_json(item) for item in value]
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in ("authorization", "cookie", "password", "secret", "token", "session"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Measure staging live-session and professor-chat read paths against fail-closed launch thresholds."
    )
    parser.add_argument("--backend-url", default=os.environ.get("STAGING_BACKEND_URL", ""))
    parser.add_argument("--auth-token", default=os.environ.get("STAGING_LIVE_CHAT_AUTH_TOKEN", ""))
    parser.add_argument("--firebase-api-key", default=os.environ.get("FIREBASE_API_KEY", ""))
    parser.add_argument("--auth-email", default=os.environ.get("STAGING_AUTH_SMOKE_EMAIL", ""))
    parser.add_argument("--auth-password", default=os.environ.get("STAGING_AUTH_SMOKE_PASSWORD", ""))
    parser.add_argument("--auth-header", default=os.environ.get("STAGING_AUTH_HEADER", "Authorization"))
    parser.add_argument("--auth-scheme", default=os.environ.get("STAGING_AUTH_SCHEME", "Bearer"))
    parser.add_argument("--live-session-id", default=os.environ.get("STAGING_LIVE_SESSION_ID", ""))
    parser.add_argument("--conversation-id", default=os.environ.get("STAGING_CHAT_CONVERSATION_ID", ""))
    parser.add_argument("--threshold-ms", type=float, default=DEFAULT_THRESHOLD_MS)
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--warmups", type=int, default=DEFAULT_WARMUPS)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--contract", action="store_true", help="Emit the fail-closed evidence contract without HTTP.")
    parser.add_argument("--json", action="store_true", help="Print redacted machine-readable evidence.")
    args = parser.parse_args(argv)

    auth_token = args.auth_token.strip()
    if not args.contract and not auth_token and (
        args.firebase_api_key.strip() or args.auth_email.strip() or args.auth_password
    ):
        try:
            firebase_id_token = _mint_firebase_id_token(
                firebase_api_key=args.firebase_api_key,
                auth_email=args.auth_email,
                auth_password=args.auth_password,
                timeout_seconds=args.timeout_seconds,
            )
            auth_token = _exchange_firebase_session_token(
                backend_url=args.backend_url,
                firebase_id_token=firebase_id_token,
                timeout_seconds=args.timeout_seconds,
            )
        except Exception as exc:
            result = _auth_contract_error(str(exc))
            if args.json:
                print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
            else:
                _print_human_result(result)
            return 1

    result = measure_live_chat_load(
        backend_url=args.backend_url,
        auth_token=auth_token,
        auth_header=args.auth_header,
        auth_scheme=args.auth_scheme,
        live_session_id=args.live_session_id,
        conversation_id=args.conversation_id,
        threshold_ms=args.threshold_ms,
        samples=args.samples,
        warmups=args.warmups,
        timeout_seconds=args.timeout_seconds,
        contract_only=args.contract,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: LiveChatLoadResult) -> None:
    if result.passed:
        print("Staging live/chat load evidence passed.")
        return
    print("Staging live/chat load evidence failed closed.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    if result.mode == "contract":
        print("- Required inputs: " + ", ".join(result.required_inputs), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
