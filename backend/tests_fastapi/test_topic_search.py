from app.database import get_session_factory
from app.models.courses import Subject, Topic, TopicItem, TopicSection
from app.models.interactions import UserNote


def test_topic_search_matches_user_notes(app_client, auth_token, run_db):
    token, user_id = auth_token(email="topic-search-notes@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            topic = Topic(
                subject_id=subject.id,
                slug="note-search-topic",
                title="Note Search Topic",
                description="Search should include note bodies.",
                status="published",
            )
            db.add(topic)
            await db.flush()

            section = TopicSection(topic_id=topic.id, title="Main Path", section_type="main_path", order=1)
            db.add(section)
            await db.flush()

            item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Continuity",
                description="Limit laws.",
                item_type="reading",
                status="published",
            )
            db.add(item)
            await db.flush()

            db.add(UserNote(
                user_id=user_id,
                topic_id=topic.id,
                topic_item_id=item.id,
                body="Remember the epsilon bridge for this proof.",
            ))
            await db.commit()
            return topic.id, item.id

    topic_id, item_id = run_db(_seed())
    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace?q=epsilon",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    results = response.json()["search_results"]
    assert [item["id"] for item in results] == [item_id]
