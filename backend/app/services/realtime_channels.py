def user_notifications_channel_name(user_id: int | str) -> str:
    return f"kresco:user:{user_id}:notifications"


def user_presence_channel_name(user_id: int | str) -> str:
    return f"kresco:user:{user_id}:presence"


def professor_inbox_channel_name(professor_user_id: int | str) -> str:
    return f"kresco:professor:{professor_user_id}:inbox"


def offering_notifications_channel_name(course_offering_id: int | str) -> str:
    return f"kresco:offering:{course_offering_id}:notifications"


def live_session_channel_name(live_session_id: int | str) -> str:
    return f"kresco:live:{live_session_id}"
