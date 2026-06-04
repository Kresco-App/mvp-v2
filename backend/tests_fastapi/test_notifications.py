import inspect

from sqlalchemy import func, select

import app.routers.notifications as notifications_router
from app.database import get_session_factory
from app.models.notifications import Notification
import app.services.notifications as notification_service
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


def test_list_notifications_has_bounded_query_count(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="notification-query-count@example.com")

    async def _seed_notifications():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add_all([
                Notification(
                    user_id=user_id,
                    type="system",
                    title=f"Notification {index}",
                    body="Query count guard",
                    is_read=index % 2 == 0,
                )
                for index in range(25)
            ])
            await db.commit()

    run_db(_seed_notifications())

    with query_counter() as queries:
        response = app_client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert queries.count <= 4, queries.statements
    body = response.json()
    assert len(body["notifications"]) == 20
    assert body["unread_count"] == 12

    second_page = app_client.get(
        "/api/notifications?limit=5&offset=20",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second_page.status_code == 200
    assert len(second_page.json()["notifications"]) == 5

    invalid_limit = app_client.get(
        "/api/notifications?limit=101",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid_limit.status_code == 422


def test_mark_read_is_noop_for_already_read_notifications(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="notification-read-noop@example.com")

    async def _seed_notification():
        session_factory = get_session_factory()
        async with session_factory() as db:
            notification = Notification(
                user_id=user_id,
                type="system",
                title="Already read",
                body="This should not update again.",
                is_read=True,
            )
            db.add(notification)
            await db.commit()
            await db.refresh(notification)
            return notification.id

    notification_id = run_db(_seed_notification())

    with query_counter() as queries:
        response = app_client.post(
            f"/api/notifications/{notification_id}/read",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["is_read"] is True
    assert not any("update notifications" in statement.lower() for statement in queries.statements)


def test_notification_db_mutations_stay_out_of_router():
    router_source = inspect.getsource(notifications_router)
    service_source = inspect.getsource(notification_service)

    assert "from app.services.notifications import" in router_source
    assert "select(Notification)" not in router_source
    assert "update(Notification)" not in router_source
    assert "delete(Notification)" not in router_source
    assert ".commit(" not in router_source

    for function_name in (
        "list_user_notifications",
        "mark_all_user_notifications_read",
        "delete_all_user_notifications",
        "delete_user_notification",
        "mark_user_notification_read",
    ):
        assert f"async def {function_name}" in service_source

    assert "Notification.user_id == user.id" in service_source
    assert "Notification.created_at.desc()" in service_source
    assert "select(func.count())" in service_source
    assert ".over(" not in service_source
    assert 'detail="Notification not found"' in service_source
    assert "await db.refresh(notification)" in service_source


def test_delete_all_notifications_requires_signed_confirmation_token(app_client, auth_token, run_db):
    token, user_id = auth_token(email="notification-delete-confirm@example.com")

    async def _seed_notifications():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add_all(
                [
                    Notification(
                        user_id=user_id,
                        type="system",
                        title=f"Delete me {index}",
                        body="Bulk delete check",
                    )
                    for index in range(3)
                ]
            )
            await db.commit()

    run_db(_seed_notifications())

    missing_confirmation = app_client.delete(
        "/api/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert missing_confirmation.status_code == 422

    confirmation = app_client.get(
        "/api/notifications/delete-all-confirmation",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert confirmation.status_code == 200
    confirmation_token = confirmation.json()["confirmation_token"]
    assert confirmation.json()["expires_in_seconds"] == 60

    deleted = app_client.delete(
        f"/api/notifications?confirmation_token={confirmation_token}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}

    async def _assert_deleted():
        session_factory = get_session_factory()
        async with session_factory() as db:
            count = (
                await db.execute(
                    select(func.count()).where(
                        Notification.user_id == user_id,
                    )
                )
            ).scalar_one()
            assert count == 0

    run_db(_assert_deleted())


def test_delete_all_notifications_rejects_forged_or_expired_confirmation_tokens(app_client, auth_token):
    token, _user_id = auth_token(email="notification-delete-reject@example.com")

    forged = "not-a-real-token"
    invalid = app_client.delete(
        f"/api/notifications?confirmation_token={forged}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"] == "Valid confirmation token required"
