import jwt
from datetime import datetime, timedelta, timezone
from django.conf import settings
from ninja.security import HttpBearer


class JWTAuth(HttpBearer):
    def authenticate(self, request, token: str):
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
            from users.models import User
            return User.objects.get(id=payload['user_id'], is_active=True)
        except (jwt.PyJWTError, KeyError, Exception):
            return None


def create_token(user_id: int) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


jwt_auth = JWTAuth()
