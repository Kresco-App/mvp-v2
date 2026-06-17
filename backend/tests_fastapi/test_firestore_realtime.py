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
