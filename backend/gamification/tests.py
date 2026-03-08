import json

from django.test import Client, TestCase

from courses.models import Chapter, ChapterSection, Subject
from gamification.models import ContentProgress
from users.auth import create_token
from users.models import User


class SectionCompletionApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email='pro@example.com',
            full_name='Pro Student',
            password='testpass123',
            is_pro=True,
        )
        self.auth_headers = {
            'HTTP_AUTHORIZATION': f'Bearer {create_token(self.user.id)}',
        }

        self.subject = Subject.objects.create(title='Math', is_published=True)
        self.chapter = Chapter.objects.create(subject=self.subject, title='Chapter 1', order=0)
        self.video_section = ChapterSection.objects.create(
            chapter=self.chapter,
            title='Video 1',
            section_type='video',
            order=0,
            duration_seconds=120,
            is_gating=True,
        )
        self.next_section = ChapterSection.objects.create(
            chapter=self.chapter,
            title='Video 2',
            section_type='video',
            order=1,
            duration_seconds=120,
            is_gating=True,
        )

    def test_section_complete_accepts_json_body_and_unlocks_next_section(self):
        locked_response = self.client.get(
            f'/api/progress/sections/{self.next_section.id}/access',
            **self.auth_headers,
        )
        self.assertEqual(locked_response.status_code, 200)
        self.assertEqual(locked_response.json()['reason'], 'previous_incomplete')

        complete_response = self.client.post(
            '/api/progress/section-complete',
            data=json.dumps({
                'section_id': self.video_section.id,
                'score': 0,
                'correct_answers': 0,
                'total_questions': 0,
            }),
            content_type='application/json',
            **self.auth_headers,
        )
        self.assertEqual(complete_response.status_code, 200)
        self.assertTrue(
            ContentProgress.objects.filter(
                user=self.user,
                item_type='section',
                item_id=self.video_section.id,
            ).exists()
        )

        unlocked_response = self.client.get(
            f'/api/progress/sections/{self.next_section.id}/access',
            **self.auth_headers,
        )
        self.assertEqual(unlocked_response.status_code, 200)
        self.assertTrue(unlocked_response.json()['can_access'])
