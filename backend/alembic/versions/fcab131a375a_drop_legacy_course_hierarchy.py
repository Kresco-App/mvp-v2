"""Drop legacy course hierarchy

Revision ID: fcab131a375a
Revises: 4557e0cfcf21
Create Date: 2026-05-28 13:55:47.246591

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fcab131a375a'
down_revision: Union[str, None] = '4557e0cfcf21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in (
        "lesson_progress",
        "content_progress",
        "quiz_results",
        "quiz_options",
        "quiz_questions",
        "quizzes",
        "video_quiz_triggers",
        "activities",
        "course_pdfs",
        "lessons",
        "chapter_blocks",
        "chapter_sections",
        "chapters",
    ):
        op.drop_table(table_name, if_exists=True)



def downgrade() -> None:
    pass

