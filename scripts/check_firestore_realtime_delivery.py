from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
from uuid import uuid4


DEFAULT_CHANNEL = "kresco:ops:realtime-evidence"
DEFAULT_EVENT_NAME = "ops.realtime.delivery_probe"
DEFAULT_DATABASE = "(default)"


@dataclass(frozen=True)
class FirestoreDeliveryResult:
    passed: bool
    mode: str
    errors: tuple[str, ...]
    project_id: str
    database: str
    channel: str
    channel_document_id: str
    event_name: str
    document_path: str | None = None
    write_elapsed_ms: float | None = None
    read_elapsed_ms: float | None = None
    cleanup_elapsed_ms: float | None = None
    required_inputs: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "mode": self.mode,
            "errors": list(self.errors),
            "project_id": self.project_id,
            "database": self.database,
            "channel": self.channel,
            "channel_document_id": self.channel_document_id,
            "event_name": self.event_name,
            "document_path": self.document_path,
            "write_elapsed_ms": self.write_elapsed_ms,
            "read_elapsed_ms": self.read_elapsed_ms,
            "cleanup_elapsed_ms": self.cleanup_elapsed_ms,
            "required_inputs": list(self.required_inputs),
        }


def firestore_channel_document_id(channel: str) -> str:
    clean_channel = channel.strip()
    if not clean_channel:
        raise ValueError("Realtime channel is required")
    return quote(clean_channel, safe="")


def check_firestore_delivery(
    *,
    project_id: str,
    database: str = DEFAULT_DATABASE,
    channel: str = DEFAULT_CHANNEL,
    event_name: str = DEFAULT_EVENT_NAME,
    document_id: str = "",
    cleanup: bool = True,
    contract_only: bool = False,
    client: Any | None = None,
    clock: Any = time.perf_counter,
) -> FirestoreDeliveryResult:
    clean_project = project_id.strip()
    clean_database = database.strip() or DEFAULT_DATABASE
    clean_channel = channel.strip()
    clean_event_name = event_name.strip()
    missing = _missing_inputs(project_id=clean_project, channel=clean_channel, event_name=clean_event_name)
    channel_document_id = firestore_channel_document_id(clean_channel) if clean_channel else ""
    if contract_only or missing:
        return FirestoreDeliveryResult(
            passed=False,
            mode="contract",
            errors=(f"Firestore realtime delivery evidence was not collected; missing inputs: {', '.join(missing) or 'contract mode requested'}.",),
            project_id=clean_project,
            database=clean_database,
            channel=clean_channel,
            channel_document_id=channel_document_id,
            event_name=clean_event_name,
            required_inputs=(
                "FIREBASE_PROJECT_ID or --project-id",
                "FIRESTORE_DATABASE or --database",
            ),
        )

    probe_id = document_id.strip() or f"ops-probe-{uuid4().hex}"
    document_path = f"realtimeChannels/{channel_document_id}/events/{probe_id}"
    try:
        firestore_client = client or _firestore_client(clean_project, clean_database)
    except Exception as exc:
        return _failure_result(
            errors=(f"Firestore client initialization failed: {type(exc).__name__}: {exc}",),
            project_id=clean_project,
            database=clean_database,
            channel=clean_channel,
            channel_document_id=channel_document_id,
            event_name=clean_event_name,
            document_path=document_path,
        )
    event_ref = (
        firestore_client.collection("realtimeChannels")
        .document(channel_document_id)
        .collection("events")
        .document(probe_id)
    )
    payload = {
        "channel": clean_channel,
        "name": clean_event_name,
        "data": {
            "probe_id": probe_id,
            "purpose": "staging_realtime_delivery_evidence",
        },
        "createdAt": datetime.now(timezone.utc),
    }
    errors: list[str] = []
    cleanup_elapsed_ms: float | None = None

    write_start = clock()
    try:
        event_ref.set(payload)
    except Exception as exc:
        return _failure_result(
            errors=(f"Firestore write failed for {document_path}: {type(exc).__name__}: {exc}",),
            project_id=clean_project,
            database=clean_database,
            channel=clean_channel,
            channel_document_id=channel_document_id,
            event_name=clean_event_name,
            document_path=document_path,
        )
    write_elapsed_ms = round((clock() - write_start) * 1000, 2)

    read_start = clock()
    try:
        snapshot = event_ref.get()
        exists = bool(getattr(snapshot, "exists", False))
        stored = snapshot.to_dict() if exists and hasattr(snapshot, "to_dict") else None
    except Exception as exc:
        errors.append(f"Firestore read failed for {document_path}: {type(exc).__name__}: {exc}")
        stored = None
    read_elapsed_ms = round((clock() - read_start) * 1000, 2)

    if not isinstance(stored, dict):
        errors.append("Firestore probe document was not readable after write.")
    else:
        if stored.get("channel") != clean_channel:
            errors.append("Firestore probe channel did not round-trip.")
        if stored.get("name") != clean_event_name:
            errors.append("Firestore probe event name did not round-trip.")
        data = stored.get("data")
        if not isinstance(data, dict) or data.get("probe_id") != probe_id:
            errors.append("Firestore probe payload did not round-trip.")

    if cleanup:
        cleanup_start = clock()
        try:
            event_ref.delete()
        except Exception as exc:
            errors.append(f"Firestore cleanup failed for {document_path}: {type(exc).__name__}: {exc}")
        cleanup_elapsed_ms = round((clock() - cleanup_start) * 1000, 2)

    return FirestoreDeliveryResult(
        passed=not errors,
        mode="firestore",
        errors=tuple(errors),
        project_id=clean_project,
        database=clean_database,
        channel=clean_channel,
        channel_document_id=channel_document_id,
        event_name=clean_event_name,
        document_path=document_path,
        write_elapsed_ms=write_elapsed_ms,
        read_elapsed_ms=read_elapsed_ms,
        cleanup_elapsed_ms=cleanup_elapsed_ms,
    )


def _failure_result(
    *,
    errors: tuple[str, ...],
    project_id: str,
    database: str,
    channel: str,
    channel_document_id: str,
    event_name: str,
    document_path: str,
) -> FirestoreDeliveryResult:
    return FirestoreDeliveryResult(
        passed=False,
        mode="firestore",
        errors=errors,
        project_id=project_id,
        database=database,
        channel=channel,
        channel_document_id=channel_document_id,
        event_name=event_name,
        document_path=document_path,
    )


def _missing_inputs(*, project_id: str, channel: str, event_name: str) -> tuple[str, ...]:
    missing: list[str] = []
    if not project_id:
        missing.append("project_id")
    if not channel:
        missing.append("channel")
    if not event_name:
        missing.append("event_name")
    return tuple(missing)


def _firestore_client(project_id: str, database: str):
    from google.cloud import firestore

    if database and database != DEFAULT_DATABASE:
        return firestore.Client(project=project_id, database=database)
    return firestore.Client(project=project_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write/read/delete a synthetic Firestore realtime event.")
    parser.add_argument("--project-id", default=os.environ.get("FIREBASE_PROJECT_ID", ""))
    parser.add_argument("--database", default=os.environ.get("FIRESTORE_DATABASE", DEFAULT_DATABASE))
    parser.add_argument("--channel", default=os.environ.get("REALTIME_EVIDENCE_CHANNEL", DEFAULT_CHANNEL))
    parser.add_argument("--event-name", default=DEFAULT_EVENT_NAME)
    parser.add_argument("--document-id", default="")
    parser.add_argument("--no-cleanup", action="store_true")
    parser.add_argument("--contract", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    result = check_firestore_delivery(
        project_id=args.project_id,
        database=args.database,
        channel=args.channel,
        event_name=args.event_name,
        document_id=args.document_id,
        cleanup=not args.no_cleanup,
        contract_only=args.contract,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        _print_human_result(result)
    return 0 if result.passed else 1


def _print_human_result(result: FirestoreDeliveryResult) -> None:
    if result.passed:
        print(f"Firestore realtime delivery evidence passed for {result.document_path}.")
        return
    print("Firestore realtime delivery evidence failed closed.", file=sys.stderr)
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    if result.required_inputs:
        print("- Required inputs: " + ", ".join(result.required_inputs), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
