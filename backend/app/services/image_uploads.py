IMAGE_EXTENSIONS_BY_MIME_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def normalize_image_mime_type(mime_type: str | None) -> str:
    return str(mime_type or "").split(";", 1)[0].strip().lower()


def allowed_image_extension(mime_type: str | None) -> str | None:
    return IMAGE_EXTENSIONS_BY_MIME_TYPE.get(normalize_image_mime_type(mime_type))


def image_matches_mime_type(content: bytes, mime_type: str | None) -> bool:
    normalized = normalize_image_mime_type(mime_type)
    if normalized == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if normalized == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if normalized == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    if normalized == "image/gif":
        return content.startswith((b"GIF87a", b"GIF89a"))
    return False
