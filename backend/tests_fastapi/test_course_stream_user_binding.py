from app.database import get_session_factory
from app.models.courses import Resource, Subject, Topic, TopicItem, TopicSection
from app.models.users import UserSubjectEntitlement


def test_topic_item_stream_binds_vdocipher_request_to_user_id(app_client, auth_token, run_db, monkeypatch):
    token, user_id = auth_token(email="stream-user-binding@example.com", is_pro=True)
    item_id = run_db(_seed_stream_topic(user_id=user_id))
    calls = []

    async def fake_stream(video_id, settings, *, user_id=None):
        calls.append({"video_id": video_id, "user_id": user_id})
        return {"otp": "otp-value", "playback_info": "playback-value"}

    monkeypatch.setattr("app.routers.courses.get_video_stream_data", fake_stream)

    response = app_client.get(
        f"/api/courses/topic-items/{item_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["otp"] == "otp-value"
    assert calls == [{"video_id": "vdocipher-stream-user-binding", "user_id": user_id}]


async def _seed_stream_topic(*, user_id: int) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(title="Stream binding subject", description="", is_published=True)
        db.add(subject)
        await db.flush()
        topic = Topic(
            subject_id=subject.id,
            slug=f"stream-user-binding-{user_id}",
            title="Stream binding topic",
            status="published",
            is_free_preview=True,
        )
        db.add(topic)
        await db.flush()
        section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
        db.add(section)
        await db.flush()
        resource = Resource(
            topic_id=topic.id,
            title="Stream binding video",
            resource_type="video",
            provider="vdocipher",
            provider_resource_id="vdocipher-stream-user-binding",
            status="published",
        )
        db.add(resource)
        await db.flush()
        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            title="Stream binding item",
            item_type="video",
            status="published",
            primary_resource_id=resource.id,
        )
        db.add_all([
            item,
            UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"),
        ])
        await db.commit()
        return int(item.id)
