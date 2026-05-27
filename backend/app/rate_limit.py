from slowapi import Limiter
from slowapi.util import get_remote_address

DEFAULT_RATE_LIMITS = ["120/minute"]
APPLICATION_RATE_LIMITS = ["600/minute"]

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=DEFAULT_RATE_LIMITS,
    application_limits=APPLICATION_RATE_LIMITS,
)
