from sqlalchemy import func, select

from app.database import get_session_factory
from app.models.notifications import Notification
from app.services.notifications import create_notification


def test_create_notification_participates_in_caller_rollback(app_client, auth_token, run_db):
    _token, user_id = auth_token(email="notification-rollback@example.com")

    async def _create_then_rollback():
        session_factory = get_session_factory()
        async with session_factory() as db:
            notification = await create_notification(
                user_id=user_id,
                type="system",
                title="Rollback",
                body="This should not persist.",
                db=db,
            )
            assert notification.id is not None
            await db.rollback()

        async with session_factory() as db:
            count = (
                await db.execute(
                    select(func.count()).where(
                        Notification.user_id == user_id,
                        Notification.title == "Rollback",
                    )
                )
            ).scalar_one()
            assert count == 0

    run_db(_create_then_rollback())


def test_create_notification_persists_when_caller_commits(app_client, auth_token, run_db):
    _token, user_id = auth_token(email="notification-commit@example.com")

    async def _create_then_commit():
        session_factory = get_session_factory()
        async with session_factory() as db:
            notification = await create_notification(
                user_id=user_id,
                type="system",
                title="Committed",
                body="This should persist.",
                db=db,
            )
            assert notification.id is not None
            await db.commit()

        async with session_factory() as db:
            notification = (
                await db.execute(
                    select(Notification).where(
                        Notification.user_id == user_id,
                        Notification.title == "Committed",
                    )
                )
            ).scalar_one()
            assert notification.type == "system"
            assert notification.body == "This should persist."

    run_db(_create_then_commit())
