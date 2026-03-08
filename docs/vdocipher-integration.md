# VdoCipher Integration Guide

## Overview
VdoCipher provides DRM-protected video hosting. Videos are streamed via signed OTP tokens — clients never get a raw video URL.

---

## Step 1: Create a VdoCipher Account
1. Sign up at https://www.vdocipher.com
2. Go to **Settings → API Keys** and copy your `API Secret`.
3. Set it in `.env`:
   ```
   VDOCIPHER_API_SECRET=your_api_secret_here
   ```

---

## Step 2: Upload Videos
1. In the VdoCipher dashboard, go to **Videos → Upload**.
2. Upload your `.mp4` files or bulk import.
3. After processing, each video gets a **Video ID** (e.g. `abc123xyz`).
4. Store this Video ID in your database — in the `Lesson.vdo_cipher_id` field:
   ```python
   # In Django admin or seed script:
   lesson.vdo_cipher_id = "abc123xyz"
   lesson.save()
   ```

---

## Step 3: Backend OTP Endpoint (already implemented)
The endpoint `/api/courses/lessons/{id}/stream` calls VdoCipher's API to generate a short-lived OTP:

```python
# courses/api.py — stream endpoint
import requests

VDOCIPHER_API_SECRET = settings.VDOCIPHER_API_SECRET

def get_vdo_otp(video_id: str):
    url = f"https://dev.vdocipher.com/api/videos/{video_id}/otp"
    headers = {"Authorization": f"Apisecret {VDOCIPHER_API_SECRET}"}
    body = {"ttl": 300}  # OTP valid for 5 minutes
    r = requests.post(url, json=body, headers=headers)
    r.raise_for_status()
    return r.json()  # {"otp": "...", "playbackInfo": "..."}
```

The response `{"otp": "...", "playbackInfo": "..."}` is returned to the frontend.

---

## Step 4: Frontend Video Player (already implemented)
`components/VideoPlayer.jsx` embeds the VdoCipher iframe:

```jsx
const src = `https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}`
<iframe src={src} allowFullScreen allow="encrypted-media" />
```

This iframe is DRM-protected — users cannot download or screen-capture.

---

## Step 5: Add `vdo_cipher_id` to the Lesson Model
```python
# courses/models.py
class Lesson(models.Model):
    ...
    vdo_cipher_id = models.CharField(max_length=100, blank=True)
    duration_seconds = models.IntegerField(default=0)
```

Run migration:
```bash
python manage.py makemigrations courses
python manage.py migrate
```

---

## Step 6: Set Video IDs via Admin
1. Go to Django Admin → Courses → Lessons
2. For each lesson, paste the VdoCipher Video ID into the `vdo_cipher_id` field.
3. Also set `duration_seconds` (in seconds) for accurate progress tracking.

---

## Step 7: Configure CORS on VdoCipher
In the VdoCipher dashboard → **Settings → Whitelisted Domains**, add:
- `localhost:3000` (development)
- `yourdomain.com` (production)

This prevents other sites from embedding your videos.

---

## Testing
```bash
curl -X GET http://localhost:8000/api/courses/lessons/1/stream \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Expected response:
```json
{"otp": "...", "playbackInfo": "..."}
```

---

## Production Notes
- OTPs expire in 5 minutes — always fetch fresh on each page load.
- Never expose `VDOCIPHER_API_SECRET` in the frontend.
- Enable **Watermarking** in VdoCipher dashboard for extra protection.
