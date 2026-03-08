from ninja import Router
from ninja.errors import HttpError
from django.conf import settings
from users.models import User
from users.schemas import GoogleLoginIn, TokenOut, UserOut, UserUpdateIn
from users.auth import create_token, jwt_auth

router = Router()


def _verify_google_token(credential: str) -> dict:
    """Verify Google ID token and return its payload."""
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
        return payload
    except Exception as e:
        raise HttpError(401, f"Invalid Google token: {str(e)}")


@router.post("/google-login", response=TokenOut, auth=None)
def google_login(request, body: GoogleLoginIn):
    payload = _verify_google_token(body.credential)

    google_id = payload.get('sub')
    email = payload.get('email', '')
    full_name = payload.get('name', '')
    avatar_url = payload.get('picture', '')

    # Lazy provision: get or create the user
    user, _ = User.objects.get_or_create(
        email=email,
        defaults={
            'full_name': full_name,
            'avatar_url': avatar_url,
            'google_id': google_id,
        }
    )

    # Sync Google profile updates
    updated = False
    if not user.google_id:
        user.google_id = google_id
        updated = True
    if avatar_url and user.avatar_url != avatar_url:
        user.avatar_url = avatar_url
        updated = True
    if updated:
        user.save()

    token = create_token(user.id)
    return {
        "access_token": token,
        "user": user,
    }


@router.get("/profile/me", response=UserOut, auth=jwt_auth)
def get_my_profile(request):
    return request.auth


@router.patch("/profile/me", response=UserOut, auth=jwt_auth)
def update_my_profile(request, body: UserUpdateIn):
    user = request.auth
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url
    if body.niveau is not None:
        user.niveau = body.niveau
    if body.filiere is not None:
        user.filiere = body.filiere
    user.save()
    return user
