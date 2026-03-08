from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from courses.vdocipher import fetch_video_duration_seconds


class FetchVideoDurationSecondsTests(SimpleTestCase):
    @override_settings(VDOCIPHER_API_SECRET="mock-vdocipher-secret")
    def test_returns_none_when_vdocipher_is_not_configured(self):
        self.assertIsNone(fetch_video_duration_seconds("video-123"))

    @override_settings(VDOCIPHER_API_SECRET="real-secret")
    @patch("courses.vdocipher.requests.get")
    def test_returns_length_from_vdocipher_metadata(self, mock_get):
        response = Mock()
        response.json.return_value = {"length": 1765}
        response.raise_for_status.return_value = None
        mock_get.return_value = response

        duration_seconds = fetch_video_duration_seconds("video-123")

        self.assertEqual(duration_seconds, 1765)
        mock_get.assert_called_once()

    @override_settings(VDOCIPHER_API_SECRET="real-secret")
    @patch("courses.vdocipher.requests.get")
    def test_returns_none_when_length_is_missing(self, mock_get):
        response = Mock()
        response.json.return_value = {"title": "No length"}
        response.raise_for_status.return_value = None
        mock_get.return_value = response

        self.assertIsNone(fetch_video_duration_seconds("video-123"))
