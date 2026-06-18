from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.users import User
from app.services import professor_audit


def _request(path: str, template: str) -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": path,
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("203.0.113.10", 12345),
        "headers": [],
        "route": SimpleNamespace(path=template),
    })


def test_professor_mutation_rate_limit_groups_dynamic_route_instances(run_db):
    suffix = uuid4().hex

    async def _seed_and_check():
        session_factory = get_session_factory()
        async with session_factory() as db:
            professor = User(
                email=f"professor-rate-{suffix}@example.com",
                full_name="Rate Limited Professor",
                role="professor",
                is_active=True,
                is_email_verified=True,
            )
            db.add(professor)
            await db.flush()
            marker = f"professor_user_id={professor.id}"
            now = datetime.now(timezone.utc)
            for index in range(professor_audit.PROFESSOR_MUTATION_BURST_LIMIT):
                db.add(AdminAuditLog(
                    action="update",
                    model_name="ProfessorChatMessage",
                    object_pk=str(index),
                    object_repr="message",
                    request_path=f"/api/professor/chat/conversations/{index}/messages",
                    client_host="203.0.113.10",
                    note=marker,
                    created_at=now,
                ))
            await db.commit()

            with pytest.raises(HTTPException) as exc:
                await professor_audit.enforce_professor_mutation_rate_limit(
                    db,
                    professor,
                    _request(
                        "/api/professor/chat/conversations/999/messages",
                        "/api/professor/chat/conversations/{conversation_id}/messages",
                    ),
                )
            assert exc.value.status_code == 429

    run_db(_seed_and_check())
