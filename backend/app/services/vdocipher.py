import httpx
from fastapi import HTTPException

from app.config import Settings


async def get_video_otp(vdocipher_id: str, settings: Settings) -> dict:
    if not vdocipher_id:
        raise HTTPException(status_code=404, detail="No video ID configured for this lesson")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"https://dev.vdocipher.com/api/videos/{vdocipher_id}/otp",
            headers={"Authorization": f"Apisecret {settings.vdocipher_api_secret}"},
            json={"ttl": 300},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to get video OTP from VdoCipher")

    data = response.json()
    return {"otp": data["otp"], "playback_info": data["playbackInfo"]}
