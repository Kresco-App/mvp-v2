from datetime import datetime, timedelta, timezone

import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.config import Settings


def create_token(user_id: int, settings: Settings) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings) -> int:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    return int(payload["user_id"])


def verify_google_token(credential: str, client_id: str) -> dict:
    return id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        client_id,
    )
