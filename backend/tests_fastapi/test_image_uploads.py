from app.services.image_uploads import (
    allowed_image_extension,
    image_matches_mime_type,
    normalize_image_mime_type,
)


def test_image_mime_helpers_normalize_content_type_values():
    content_type = " Image/PNG; charset=binary "

    assert normalize_image_mime_type(content_type) == "image/png"
    assert allowed_image_extension(content_type) == ".png"
    assert image_matches_mime_type(b"\x89PNG\r\n\x1a\npayload", content_type) is True


def test_image_mime_helpers_reject_mismatched_signature():
    assert image_matches_mime_type(b"<script>alert(1)</script>", "image/png") is False
