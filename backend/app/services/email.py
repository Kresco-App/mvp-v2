import asyncio
from dataclasses import dataclass

from itsdangerous import URLSafeTimedSerializer

import resend as resend_sdk

from app.config import Settings


@dataclass(frozen=True)
class ResetTokenPayload:
    email: str
    token_version: int


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.jwt_secret_key)


def generate_verification_token(email: str, settings: Settings) -> str:
    return _serializer(settings).dumps(email, salt="email-verify")


def verify_verification_token(token: str, settings: Settings, max_age: int = 86400) -> str | None:
    try:
        return _serializer(settings).loads(token, salt="email-verify", max_age=max_age)
    except Exception:
        return None


def generate_reset_token(email: str, settings: Settings, *, token_version: int = 0) -> str:
    return _serializer(settings).dumps(
        {"email": email, "token_version": token_version},
        salt="password-reset",
    )


def verify_reset_token(token: str, settings: Settings, max_age: int = 3600) -> ResetTokenPayload | None:
    try:
        payload = _serializer(settings).loads(token, salt="password-reset", max_age=max_age)
    except Exception:
        return None

    if isinstance(payload, str):
        return ResetTokenPayload(email=payload, token_version=0)

    if not isinstance(payload, dict):
        return None

    email = payload.get("email")
    if not isinstance(email, str) or not email:
        return None

    try:
        token_version = int(payload.get("token_version", 0) or 0)
    except (TypeError, ValueError):
        return None

    return ResetTokenPayload(email=email, token_version=token_version)


def _send_email_sync(api_key: str, params: dict) -> None:
    resend_sdk.api_key = api_key
    resend_sdk.Emails.send(params)


async def send_verification_email(email: str, full_name: str, token: str, settings: Settings) -> None:
    verify_url = f"{settings.frontend_url}/auth/verify-email?token={token}"
    name = full_name or email
    params = {
        "from": "Kresco <onboarding@resend.dev>",
        "to": [email],
        "subject": "Verifiez votre email Kresco",
        "html": f"""
<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 32px;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <span style="font-size:22px;font-weight:700;color:#453dee;">Kresco</span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#3f3f46;margin:0 0 10px;">Bienvenue, {name} !</h1>
  <p style="color:#71717b;font-size:15px;line-height:1.6;margin:0 0 28px;">
    Merci de vous etre inscrit. Cliquez sur le bouton ci-dessous pour verifier votre adresse email
    et activer votre compte Kresco.
  </p>
  <a href="{verify_url}"
     style="display:inline-block;background:#453dee;color:#ffffff;padding:14px 32px;
            border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;">
    Verifier mon email
  </a>
  <p style="color:#9f9fa9;font-size:13px;margin-top:28px;line-height:1.5;">
    Ce lien expire dans 24 heures.<br>
    Si vous n'avez pas cree de compte sur Kresco, ignorez cet email.
  </p>
</div>
""",
    }
    await asyncio.to_thread(_send_email_sync, settings.resend_api_key, params)


async def send_reset_email(email: str, token: str, settings: Settings) -> None:
    reset_url = f"{settings.frontend_url}/auth/reset-password?token={token}"
    params = {
        "from": "Kresco <onboarding@resend.dev>",
        "to": [email],
        "subject": "Reinitialiser votre mot de passe Kresco",
        "html": f"""
<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 32px;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <span style="font-size:22px;font-weight:700;color:#453dee;">Kresco</span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#3f3f46;margin:0 0 10px;">Reinitialisation du mot de passe</h1>
  <p style="color:#71717b;font-size:15px;line-height:1.6;margin:0 0 28px;">
    Cliquez sur le bouton ci-dessous pour reinitialiser votre mot de passe.
    Ce lien est valable pendant 1 heure.
  </p>
  <a href="{reset_url}"
     style="display:inline-block;background:#453dee;color:#ffffff;padding:14px 32px;
            border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;">
    Reinitialiser mon mot de passe
  </a>
  <p style="color:#9f9fa9;font-size:13px;margin-top:28px;line-height:1.5;">
    Si vous n'avez pas demande de reinitialisation, ignorez cet email.
  </p>
</div>
""",
    }
    await asyncio.to_thread(_send_email_sync, settings.resend_api_key, params)
