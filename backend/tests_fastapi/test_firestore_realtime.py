from types import SimpleNamespace
import sys

from app.services import firestore_realtime


def test_publish_firestore_message_writes_channel_event(monkeypatch, test_settings):
    firestore_realtime._firestore_client.cache_clear()
    writes = []

    class FakeDocument:
        def __init__(self, path):
            self.path = path

        def collection(self, name):
            return FakeCollection([*self.path, name])

        def set(self, payload):
            writes.append((self.path, payload))

    class FakeCollection:
        def __init__(self, path):
            self.path = path

        def document(self, document_id=None):
            return FakeDocument([*self.path, document_id or "auto-id"])

    class FakeFirestoreClient:
        def collection(self, name):
            return FakeCollection([name])

    clients = []

    def fake_client(*, project, database=None):
        clients.append((project, database))
        return FakeFirestoreClient()

    fake_firestore = SimpleNamespace(Client=fake_client)
    monkeypatch.setitem(sys.modules, "google.cloud.firestore", fake_firestore)
    monkeypatch.setitem(sys.modules, "google.cloud", SimpleNamespace(firestore=fake_firestore))
    settings = test_settings.model_copy(update={
        "firebase_project_id": "kresco-staging",
        "firestore_database": "(default)",
    })

    firestore_realtime._publish_firestore_message_sync(
        settings,
        "kresco:user:1:notifications",
        "chat.message",
        {"message_id": 123},
    )

    assert clients == [("kresco-staging", None)]
    path, payload = writes[0]
    assert path == [
        "realtimeChannels",
        "kresco%3Auser%3A1%3Anotifications",
        "events",
        "auto-id",
    ]
    assert payload["channel"] == "kresco:user:1:notifications"
    assert payload["name"] == "chat.message"
    assert payload["data"] == {"message_id": 123}
    assert payload["createdAt"].tzinfo is not None
    firestore_realtime._firestore_client.cache_clear()


def test_publish_firestore_message_retries_sync_writer_and_fails_closed(monkeypatch, run_db, test_settings):
    settings = test_settings.model_copy(update={"firebase_project_id": "kresco-staging"})
    calls = []
    sleeps = []

    def flaky_writer(settings_arg, channel, name, data):
        calls.append((settings_arg, channel, name, data))
        if len(calls) == 1:
            raise RuntimeError("transient firestore failure")

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(firestore_realtime, "_publish_firestore_message_sync", flaky_writer)
    monkeypatch.setattr(firestore_realtime.asyncio, "sleep", fake_sleep)

    result = run_db(
        firestore_realtime.publish_firestore_message(
            settings,
            "kresco:user:1:notifications",
            "chat.message",
            {"message_id": 123},
            attempts=2,
            retry_delay_seconds=0.01,
        )
    )

    assert result is True
    assert len(calls) == 2
    assert [call[1:] for call in calls] == [
        ("kresco:user:1:notifications", "chat.message", {"message_id": 123}),
        ("kresco:user:1:notifications", "chat.message", {"message_id": 123}),
    ]
    assert sleeps == [0.01]

    calls.clear()

    def failing_writer(settings_arg, channel, name, data):
        calls.append((settings_arg, channel, name, data))
        raise RuntimeError("persistent firestore failure")

    monkeypatch.setattr(firestore_realtime, "_publish_firestore_message_sync", failing_writer)

    failed = run_db(
        firestore_realtime.publish_firestore_message(
            settings,
            "kresco:user:1:notifications",
            "chat.message",
            {"message_id": 456},
            attempts=2,
            retry_delay_seconds=0.01,
        )
    )
    assert failed is False
    assert len(calls) == 2

    calls.clear()
    empty_settings = test_settings.model_copy(update={"firebase_project_id": " "})
    try:
        run_db(
            firestore_realtime.publish_firestore_message(
                empty_settings,
                "kresco:user:1:notifications",
                "chat.message",
                {"message_id": 789},
            )
        )
    except firestore_realtime.FirestoreRealtimeConfigurationError as exc:
        assert "FIREBASE_PROJECT_ID" in str(exc)
    else:
        raise AssertionError("Expected FirestoreRealtimeConfigurationError")
    assert calls == []
