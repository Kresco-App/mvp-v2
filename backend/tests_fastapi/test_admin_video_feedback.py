from datetime import datetime, timedelta, timezone

from app.database import get_session_factory
from app.models.courses import Resource, Subject, Topic, TopicItem, TopicSection
from app.models.interactions import Comment
from app.models.users import User, UserPermission
from app.services.auth import create_token


def test_admin_video_feedback_aggregates_ratings_and_comment_samples(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            staff = User(
                email="video-feedback-staff@example.com",
                full_name="Video Feedback Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            student = User(
                email="video-feedback-student@example.com",
                full_name="Feedback Student",
                is_active=True,
                is_email_verified=True,
                is_pro=True,
            )
            db.add_all([staff, student])
            await db.flush()
            db.add(UserPermission(user_id=staff.id, permission="content:change_read", reason="review video feedback"))

            subject = Subject(title="Physics", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="video-feedback-topic", title="Derivatives", status="published")
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()

            weak_resource = Resource(topic_id=topic.id, title="Weak video", resource_type="video", provider="vdocipher", status="published")
            strong_resource = Resource(topic_id=topic.id, title="Strong video", resource_type="video", provider="youtube", status="published")
            reading_resource = Resource(topic_id=topic.id, title="Reading", resource_type="pdf", status="published")
            db.add_all([weak_resource, strong_resource, reading_resource])
            await db.flush()

            weak_video = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                primary_resource_id=weak_resource.id,
                title="Implicit differentiation video",
                item_type="lesson_video",
                status="published",
                duration_seconds=900,
            )
            strong_video = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                primary_resource_id=strong_resource.id,
                title="Limits intro video",
                item_type="video",
                status="published",
                duration_seconds=600,
            )
            reading_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                primary_resource_id=reading_resource.id,
                title="Reading should not appear",
                item_type="reading",
                status="published",
            )
            db.add_all([weak_video, strong_video, reading_item])
            await db.flush()

            db.add_all([
                Comment(user_id=student.id, topic_item_id=weak_video.id, body="Too fast near the chain rule.", rating=2),
                Comment(user_id=student.id, topic_item_id=weak_video.id, body="I got lost after the first example.", rating=1),
                Comment(user_id=student.id, topic_item_id=weak_video.id, body="The final example helped.", rating=5),
                Comment(user_id=student.id, topic_item_id=weak_video.id, body="Hidden negative should not count.", rating=1, status="hidden"),
                Comment(user_id=student.id, topic_item_id=strong_video.id, body="Clear pacing and examples.", rating=5),
                Comment(user_id=student.id, topic_item_id=strong_video.id, body="Good recap.", rating=4),
                Comment(user_id=student.id, topic_item_id=reading_item.id, body="Bad reading item.", rating=1),
            ])
            await db.commit()
            return create_token(student.id, test_settings), create_token(staff.id, test_settings)

    student_token, staff_token = run_db(_seed())

    blocked = app_client.get(
        "/api/admin/video-feedback",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert blocked.status_code == 403

    response = app_client.get(
        "/api/admin/video-feedback?limit=20",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["videos_reviewed"] == 2
    assert data["summary"]["rated_comments"] == 5
    assert data["summary"]["negative_comments"] == 2
    assert data["summary"]["positive_comments"] == 3
    assert data["summary"]["watchlist_videos"] == 1

    titles = [item["title"] for item in data["items"]]
    assert "Reading should not appear" not in titles
    weak = next(item for item in data["items"] if item["title"] == "Implicit differentiation video")
    strong = next(item for item in data["items"] if item["title"] == "Limits intro video")

    assert weak["average_rating"] == 2.67
    assert weak["negative_count"] == 2
    assert weak["positive_count"] == 1
    assert [comment["body"] for comment in weak["negative_comments"]] == [
        "I got lost after the first example.",
        "Too fast near the chain rule.",
    ]
    assert "Hidden negative should not count." not in str(weak)
    assert strong["average_rating"] == 4.5
    assert strong["positive_count"] == 2


def test_admin_video_feedback_samples_are_capped_per_video_and_sentiment(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            staff = User(
                email="video-feedback-sample-staff@example.com",
                full_name="Video Sample Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
            )
            student = User(
                email="video-feedback-sample-student@example.com",
                full_name="Video Sample Student",
                is_active=True,
                is_email_verified=True,
                is_pro=True,
            )
            db.add_all([staff, student])
            await db.flush()
            db.add(UserPermission(user_id=staff.id, permission="content:change_read", reason="review video feedback"))

            subject = Subject(title="Math", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="video-feedback-samples", title="Limits", status="published")
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()

            weak_video = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Old weak sample video",
                item_type="video",
                status="published",
            )
            noisy_video = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Noisy positive video",
                item_type="video",
                status="published",
            )
            db.add_all([weak_video, noisy_video])
            await db.flush()

            old_time = datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc)
            recent_time = datetime(2026, 6, 21, 10, 0, tzinfo=timezone.utc)
            comments = [
                Comment(
                    user_id=student.id,
                    topic_item_id=weak_video.id,
                    body="This older negative sample must still be visible.",
                    rating=1,
                    created_at=old_time,
                )
            ]
            comments.extend(
                Comment(
                    user_id=student.id,
                    topic_item_id=noisy_video.id,
                    body=f"Noisy positive sample {index}",
                    rating=5,
                    created_at=recent_time + timedelta(minutes=index),
                )
                for index in range(140)
            )
            db.add_all(comments)
            await db.commit()
            return create_token(staff.id, test_settings)

    staff_token = run_db(_seed())

    response = app_client.get(
        "/api/admin/video-feedback?limit=20",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    weak = next(item for item in data["items"] if item["title"] == "Old weak sample video")
    noisy = next(item for item in data["items"] if item["title"] == "Noisy positive video")

    assert [comment["body"] for comment in weak["negative_comments"]] == [
        "This older negative sample must still be visible."
    ]
    assert len(noisy["positive_comments"]) == 6
    assert noisy["positive_comments"][0]["body"] == "Noisy positive sample 139"
