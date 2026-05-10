from app.database import get_session_factory
from app.models.courses import Chapter, Lesson, Subject


def test_non_pro_user_cannot_access_locked_lesson(app_client, auth_token, run_db):
    token, _ = auth_token(email="nonpro@example.com", is_pro=False)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Math", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()

            chapter = Chapter(subject_id=subject.id, title="Chapter 1", description="", order=1)
            db.add(chapter)
            await db.flush()

            lesson = Lesson(
                chapter_id=chapter.id,
                title="Paid Lesson",
                order=1,
                duration_seconds=600,
                is_free_preview=False,
            )
            db.add(lesson)
            await db.commit()
            await db.refresh(lesson)
            return lesson.id

    lesson_id = run_db(_seed())
    response = app_client.get(
        f"/api/progress/lessons/{lesson_id}/access",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["can_access"] is False
    assert body["reason"] == "pro_required"
