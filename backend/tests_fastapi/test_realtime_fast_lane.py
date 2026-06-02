"""Regression guards for the realtime outbox fast-lane.

Chat/live write endpoints must schedule an immediate outbox drain via
BackgroundTasks so realtime events are delivered without waiting for the
~1 minute cron. These are structural guards (matching the codebase's static
regression style) so the wiring cannot be silently removed.
"""
import inspect

from app.routers import professor as professor_router
from app.services import realtime_outbox

FAST_LANE_WRITE_ENDPOINTS = [
    "start_student_conversation",
    "send_student_message",
    "send_student_image_message",
    "send_professor_message",
    "send_professor_image_message",
    "notify_live_session",
]


def test_realtime_write_endpoints_schedule_fast_lane_drain():
    for name in FAST_LANE_WRITE_ENDPOINTS:
        endpoint = getattr(professor_router, name)
        source = inspect.getsource(endpoint)
        assert "background_tasks.add_task(drain_realtime_outbox_in_background" in source, (
            f"{name} must schedule the realtime fast-lane drain after the write"
        )


def test_fast_lane_helper_uses_fresh_session_and_is_best_effort():
    source = inspect.getsource(realtime_outbox.drain_realtime_outbox_in_background)
    # Fresh session: the request session is closed by the time the task runs.
    assert "get_session_factory()" in source
    assert "process_realtime_outbox(" in source
    # Best-effort: failures are swallowed because the cron is the safety net.
    assert "except Exception" in source


def test_fast_lane_limit_is_bounded():
    assert 0 < realtime_outbox.FAST_LANE_OUTBOX_LIMIT <= 100
