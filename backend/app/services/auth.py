import asyncio
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
import logging

import jwt

from app.config import Settings, get_settings

AUTH_COOKIE_NAME = "__session"
AUTH_ROLE_COOKIE_NAME = "kresco_user_role"
FIREBASE_AUTH_APP_NAME_PREFIX = "kresco-auth-"
FIREBASE_CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit"
FIREBASE_ID_TOKEN_ISSUER_PREFIX = "https://securetoken.google.com/"
FIREBASE_IDENTITY_TOOLKIT_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
FIREBASE_PROVIDER_GOOGLE = "google.com"
FIREBASE_PROVIDER_PASSWORD = "password"
SUPPORTED_FIREBASE_SIGN_IN_PROVIDERS = {
    FIREBASE_PROVIDER_GOOGLE,
    FIREBASE_PROVIDER_PASSWORD,
}

logger = logging.getLogger("kresco.auth")


@dataclass(frozen=True)
class AuthTokenPayload:
    user_id: int
    token_version: int


def _token_subject(subject: int | object, token_version: int | None) -> AuthTokenPayload:
    if isinstance(subject, int):
        return AuthTokenPayload(
            user_id=_coerce_user_id(subject),
            token_version=_coerce_token_version(0 if token_version is None else token_version),
        )

    user_id = getattr(subject, "id", None)
    if user_id is None:
        raise ValueError("Token subject must be a user id or object with an id")

    version = token_version
    if version is None:
        version = getattr(subject, "auth_token_version", 0)
        if version is None:
            version = 0

    return AuthTokenPayload(
        user_id=_coerce_user_id(user_id),
        token_version=_coerce_token_version(version),
    )


def _coerce_user_id(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("Token user id must be a positive integer")
    try:
        user_id = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Token user id must be a positive integer") from exc
    if user_id <= 0:
        raise ValueError("Token user id must be a positive integer")
    return user_id


def _coerce_token_version(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("Token version must be a non-negative integer")
    try:
        token_version = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Token version must be a non-negative integer") from exc
    if token_version < 0:
        raise ValueError("Token version must be a non-negative integer")
    return token_version


def create_token(subject: int | object, settings: Settings, *, token_version: int | None = None) -> str:
    token_subject = _token_subject(subject, token_version)
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": token_subject.user_id,
        "token_version": token_subject.token_version,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": now,
    }
    if not isinstance(subject, int):
        role = getattr(subject, "role", None)
        if isinstance(role, str):
            payload["role"] = role
        is_staff = getattr(subject, "is_staff", None)
        if is_staff is not None:
            payload["is_staff"] = bool(is_staff)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings) -> AuthTokenPayload:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    try:
        user_id = _coerce_user_id(payload["user_id"])
        raw_token_version = payload.get("token_version", 0)
        token_version = _coerce_token_version(0 if raw_token_version is None else raw_token_version)
    except (KeyError, TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("Invalid auth token payload") from exc
    return AuthTokenPayload(user_id=user_id, token_version=token_version)


def _firebase_auth_app(project_id: str):
    import firebase_admin

    app_name = f"{FIREBASE_AUTH_APP_NAME_PREFIX}{project_id}"
    try:
        return firebase_admin.get_app(app_name)
    except ValueError:
        return firebase_admin.initialize_app(options={"projectId": project_id}, name=app_name)


def _firebase_string_claim(payload: dict, *names: str) -> str:
    for name in names:
        value = payload.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _firebase_claim(payload: dict) -> dict:
    firebase_claim = payload.get("firebase")
    if not isinstance(firebase_claim, dict):
        raise jwt.InvalidTokenError("Firebase provider claim is missing")
    return firebase_claim


def _firebase_sign_in_provider(firebase_claim: dict) -> str:
    provider = firebase_claim.get("sign_in_provider")
    if not isinstance(provider, str) or not provider.strip():
        raise jwt.InvalidTokenError("Firebase sign-in provider is missing")
    provider = provider.strip()
    if provider not in SUPPORTED_FIREBASE_SIGN_IN_PROVIDERS:
        raise jwt.InvalidTokenError("Firebase sign-in provider is not supported")
    return provider


def _firebase_provider_identity(firebase_claim: dict, provider: str) -> str | None:
    identities = firebase_claim.get("identities")
    provider_identities = identities.get(provider) if isinstance(identities, dict) else None
    if isinstance(provider_identities, list):
        for identity in provider_identities:
            if isinstance(identity, str) and identity.strip():
                return identity.strip()
    return None


def _firebase_session_payload_from_firebase(payload: dict) -> dict:
    firebase_uid = _firebase_string_claim(payload, "uid", "user_id", "sub")
    if not firebase_uid:
        raise jwt.InvalidTokenError("Firebase UID is missing")

    firebase_claim = _firebase_claim(payload)
    provider = _firebase_sign_in_provider(firebase_claim)
    provider_identity = _firebase_provider_identity(firebase_claim, provider)
    google_id = provider_identity if provider == FIREBASE_PROVIDER_GOOGLE else None
    if provider == FIREBASE_PROVIDER_GOOGLE and not google_id:
        raise jwt.InvalidTokenError("Firebase Google identity is missing")

    return {
        "email": payload.get("email"),
        "email_verified": payload.get("email_verified"),
        "name": payload.get("name") or "",
        "picture": payload.get("picture") or "",
        "firebase_uid": firebase_uid,
        "provider": provider,
        "google_id": google_id,
        "phone_number": payload.get("phone_number") or "",
    }


def _validate_firebase_id_token_shape(credential: str, project_id: str) -> None:
    try:
        header = jwt.get_unverified_header(credential)
        payload = jwt.decode(
            credential,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
        )
    except jwt.PyJWTError as exc:
        raise jwt.InvalidTokenError("Invalid Firebase credential") from exc

    issuer = payload.get("iss")
    audience = payload.get("aud")
    subject = payload.get("sub")
    expected_issuer = f"{FIREBASE_ID_TOKEN_ISSUER_PREFIX}{project_id}"

    if audience == FIREBASE_CUSTOM_TOKEN_AUDIENCE:
        raise jwt.InvalidTokenError("Firebase credential must be an ID token, not a custom token")
    if not header.get("kid"):
        raise jwt.InvalidTokenError('Firebase ID token has no "kid" claim')
    if header.get("alg") != "RS256":
        raise jwt.InvalidTokenError("Firebase ID token must use RS256")
    if audience != project_id:
        raise jwt.InvalidTokenError("Firebase ID token has incorrect audience")
    if issuer != expected_issuer:
        raise jwt.InvalidTokenError("Firebase ID token has incorrect issuer")
    if not isinstance(subject, str) or not subject or len(subject) > 128:
        raise jwt.InvalidTokenError("Firebase ID token has invalid subject")


def _verify_firebase_token_without_admin_credentials(credential: str, project_id: str) -> dict:
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token as google_id_token

    _validate_firebase_id_token_shape(credential, project_id)
    payload = dict(
        google_id_token.verify_firebase_token(
            credential,
            Request(),
            audience=project_id,
        )
    )
    if isinstance(payload.get("sub"), str):
        payload["uid"] = payload["sub"]
    return payload


def _identity_toolkit_provider_info(user: dict) -> tuple[str, str | None]:
    provider_infos = user.get("providerUserInfo")
    if not isinstance(provider_infos, list):
        provider_infos = []

    for provider_info in provider_infos:
        if not isinstance(provider_info, dict):
            continue
        provider_id = provider_info.get("providerId")
        raw_id = provider_info.get("rawId")
        if provider_id == FIREBASE_PROVIDER_GOOGLE:
            return FIREBASE_PROVIDER_GOOGLE, raw_id.strip() if isinstance(raw_id, str) and raw_id.strip() else None

    for provider_info in provider_infos:
        if not isinstance(provider_info, dict):
            continue
        if provider_info.get("providerId") == FIREBASE_PROVIDER_PASSWORD:
            return FIREBASE_PROVIDER_PASSWORD, None

    if isinstance(user.get("email"), str) and user["email"].strip():
        return FIREBASE_PROVIDER_PASSWORD, None
    raise jwt.InvalidTokenError("Firebase sign-in provider is missing")


def _verify_firebase_token_with_identity_toolkit(
    credential: str,
    project_id: str,
    web_api_key: str,
) -> dict:
    import requests

    web_api_key = web_api_key.strip()
    if not web_api_key:
        raise jwt.InvalidAudienceError("Firebase web API key is not configured")
    _validate_firebase_id_token_shape(credential, project_id)

    response = requests.post(
        FIREBASE_IDENTITY_TOOLKIT_LOOKUP_URL,
        params={"key": web_api_key},
        json={"idToken": credential},
        timeout=10,
    )
    if response.status_code != 200:
        raise jwt.InvalidTokenError("Firebase Identity Toolkit rejected the credential")

    try:
        body = response.json()
    except ValueError as exc:
        raise jwt.InvalidTokenError("Firebase Identity Toolkit returned invalid JSON") from exc

    users = body.get("users")
    if not isinstance(users, list) or not users or not isinstance(users[0], dict):
        raise jwt.InvalidTokenError("Firebase Identity Toolkit user is missing")

    user = users[0]
    firebase_uid = user.get("localId")
    if not isinstance(firebase_uid, str) or not firebase_uid.strip():
        raise jwt.InvalidTokenError("Firebase UID is missing")

    provider, google_id = _identity_toolkit_provider_info(user)
    if provider == FIREBASE_PROVIDER_GOOGLE and not google_id:
        raise jwt.InvalidTokenError("Firebase Google identity is missing")

    return {
        "email": user.get("email"),
        "email_verified": user.get("emailVerified"),
        "name": user.get("displayName") or "",
        "picture": user.get("photoUrl") or "",
        "firebase_uid": firebase_uid,
        "provider": provider,
        "google_id": google_id,
        "phone_number": user.get("phoneNumber") or "",
    }


async def verify_firebase_token(credential: str, project_id: str, web_api_key: str | None = None) -> dict:
    project_id = project_id.strip()
    if not project_id:
        raise jwt.InvalidAudienceError("Firebase project id is not configured")

    try:
        from firebase_admin import auth as firebase_auth
    except ModuleNotFoundError:
        firebase_auth = None

    try:
        if firebase_auth is None:
            raise ModuleNotFoundError("firebase_admin")

        app = _firebase_auth_app(project_id)
        payload = await asyncio.to_thread(firebase_auth.verify_id_token, credential, app=app)
        return _firebase_session_payload_from_firebase(payload)
    except Exception as admin_verify_error:
        logger.info(
            "firebase_admin_verifier_failed falling_back_to_cert_verifier error_type=%s",
            type(admin_verify_error).__name__,
        )

    try:
        payload = await asyncio.to_thread(
            _verify_firebase_token_without_admin_credentials,
            credential,
            project_id,
        )
    except Exception as cert_verify_error:
        logger.info(
            "firebase_cert_verifier_failed falling_back_to_identity_toolkit error_type=%s",
            type(cert_verify_error).__name__,
        )
        fallback_key = web_api_key if web_api_key is not None else get_settings().firebase_web_api_key
        return await asyncio.to_thread(
            _verify_firebase_token_with_identity_toolkit,
            credential,
            project_id,
            fallback_key,
        )
    return _firebase_session_payload_from_firebase(payload)
