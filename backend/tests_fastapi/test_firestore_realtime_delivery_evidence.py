from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_firestore_realtime_delivery.py"


def _load_probe_module():
    spec = importlib.util.spec_from_file_location("check_firestore_realtime_delivery_for_tests", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeSnapshot:
    exists = True

    def __init__(self, payload):
        self.payload = payload

    def to_dict(self):
        return dict(self.payload)


class FakeDocument:
    def __init__(self, path, store):
        self.path = path
        self.store = store

    def collection(self, name):
        return FakeCollection([*self.path, name], self.store)

    def set(self, payload):
        self.store[tuple(self.path)] = dict(payload)

    def get(self):
        return FakeSnapshot(self.store[tuple(self.path)])

    def delete(self):
        self.store.pop(tuple(self.path), None)


class FakeCollection:
    def __init__(self, path, store):
        self.path = path
        self.store = store

    def document(self, document_id=None):
        return FakeDocument([*self.path, document_id or "auto-id"], self.store)


class FakeFirestoreClient:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return FakeCollection([name], self.store)


def test_firestore_realtime_delivery_probe_writes_reads_and_cleans_up():
    probe = _load_probe_module()
    client = FakeFirestoreClient()
    times = iter([0.0, 0.005, 0.01, 0.02, 0.03, 0.031])

    result = probe.check_firestore_delivery(
        project_id="kresco-staging",
        database="(default)",
        channel="kresco:ops:realtime-evidence",
        document_id="probe-1",
        client=client,
        clock=lambda: next(times),
    )

    assert result.passed is True
    assert result.mode == "firestore"
    assert result.channel_document_id == "kresco%3Aops%3Arealtime-evidence"
    assert result.document_path == "realtimeChannels/kresco%3Aops%3Arealtime-evidence/events/probe-1"
    assert result.write_elapsed_ms == 5.0
    assert result.read_elapsed_ms == 10.0
    assert result.cleanup_elapsed_ms == 1.0
    assert client.store == {}


def test_firestore_realtime_delivery_probe_fails_closed_without_project():
    probe = _load_probe_module()

    result = probe.check_firestore_delivery(
        project_id="",
        database="(default)",
        channel="kresco:ops:realtime-evidence",
        client=FakeFirestoreClient(),
    )

    assert result.passed is False
    assert result.mode == "contract"
    assert "project_id" in result.errors[0]
    assert "FIREBASE_PROJECT_ID or --project-id" in result.required_inputs


def test_firestore_realtime_delivery_probe_detects_payload_mismatch():
    probe = _load_probe_module()

    class MutatingDocument(FakeDocument):
        def collection(self, name):
            return MutatingCollection([*self.path, name], self.store)

        def get(self):
            stored = dict(self.store[tuple(self.path)])
            stored["data"] = {"probe_id": "different"}
            return FakeSnapshot(stored)

    class MutatingCollection(FakeCollection):
        def document(self, document_id=None):
            return MutatingDocument([*self.path, document_id or "auto-id"], self.store)

    class MutatingClient(FakeFirestoreClient):
        def collection(self, name):
            return MutatingCollection([name], self.store)

    result = probe.check_firestore_delivery(
        project_id="kresco-staging",
        channel="kresco:ops:realtime-evidence",
        document_id="probe-2",
        client=MutatingClient(),
    )

    assert result.passed is False
    assert "Firestore probe payload did not round-trip." in result.errors


def test_firestore_realtime_delivery_probe_reports_client_initialization_failure(monkeypatch):
    probe = _load_probe_module()

    def raise_client(project_id, database):
        raise RuntimeError(f"{project_id}:{database}: credentials unavailable")

    monkeypatch.setattr(probe, "_firestore_client", raise_client)

    result = probe.check_firestore_delivery(
        project_id="kresco-staging",
        database="(default)",
        channel="kresco:ops:realtime-evidence",
        document_id="probe-client-error",
    )

    assert result.passed is False
    assert result.mode == "firestore"
    assert result.document_path == "realtimeChannels/kresco%3Aops%3Arealtime-evidence/events/probe-client-error"
    assert result.errors == (
        "Firestore client initialization failed: RuntimeError: kresco-staging:(default): credentials unavailable",
    )


def test_firestore_realtime_delivery_json_output_uses_injected_client(monkeypatch, capsys):
    probe = _load_probe_module()
    client = FakeFirestoreClient()
    monkeypatch.setattr(probe, "_firestore_client", lambda project_id, database: client)

    exit_code = probe.main([
        "--project-id",
        "kresco-staging",
        "--document-id",
        "probe-json",
        "--json",
    ])
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert exit_code == 0
    assert payload["passed"] is True
    assert payload["document_path"] == "realtimeChannels/kresco%3Aops%3Arealtime-evidence/events/probe-json"
    assert "token" not in captured.out.lower()
    assert "secret" not in captured.out.lower()
