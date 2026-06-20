import asyncio

import app.models  # noqa: F401
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.base import Base
from app.models.courses import TabContent, Topic, TopicItem
from app.models.quizzes import Question, QuestionSet
from seed_professor_demo import seed_professor_demo


def test_professor_demo_seed_adds_idempotent_exponential_test_quiz(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'professor_demo_seed.sqlite3'}"

    async def exercise():
        engine = create_async_engine(database_url, poolclass=NullPool)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            await seed_professor_demo(db, destructive_confirmed=True)
            await seed_professor_demo(db, destructive_confirmed=True)

            topic = await db.scalar(select(Topic).where(Topic.slug == "professor-demo-exponential-functions"))
            item = await db.scalar(
                select(TopicItem).where(
                    TopicItem.topic_id == topic.id,
                    TopicItem.title == "Quiz express - exponentielle",
                )
            )
            tab = await db.scalar(
                select(TabContent).where(
                    TabContent.topic_item_id == item.id,
                    TabContent.tab_type == "quiz",
                )
            )
            question_set = await db.scalar(select(QuestionSet).where(QuestionSet.tab_content_id == tab.id))
            questions = (
                await db.execute(
                    select(Question)
                    .where(Question.question_set_id == question_set.id)
                    .order_by(Question.order)
                )
            ).scalars().all()
            counts = {
                "items": await db.scalar(
                    select(func.count()).select_from(TopicItem).where(
                        TopicItem.topic_id == topic.id,
                        TopicItem.title == "Quiz express - exponentielle",
                    )
                ),
                "tabs": await db.scalar(
                    select(func.count()).select_from(TabContent).where(
                        TabContent.topic_item_id == item.id,
                        TabContent.tab_type == "quiz",
                    )
                ),
                "question_sets": await db.scalar(
                    select(func.count()).select_from(QuestionSet).where(
                        QuestionSet.tab_content_id == tab.id,
                    )
                ),
                "questions": await db.scalar(
                    select(func.count()).select_from(Question).where(
                        Question.question_set_id == question_set.id,
                    )
                ),
            }

        await engine.dispose()
        return topic, item, tab, question_set, questions, counts

    topic, item, tab, question_set, questions, counts = asyncio.run(exercise())

    assert topic.title == "Fonctions exponentielles"
    assert item.item_type == "checkpoint_quiz"
    assert item.concept_slugs == ["fonctions-exponentielles"]
    assert tab.config_json["pass_score"] == 70
    assert tab.config_json["questions"][0]["id"] == "exp-test-derivative"
    assert question_set.title == "Quiz express - exponentielle"
    assert question_set.topic_id == topic.id
    assert question_set.topic_item_id == item.id
    assert question_set.pass_score == 70
    assert [question.external_id for question in questions] == [
        "exp-test-derivative",
        "exp-test-product-rule",
    ]
    assert questions[0].answer_json == {"answer": 1}
    assert counts == {
        "items": 1,
        "tabs": 1,
        "question_sets": 1,
        "questions": 2,
    }
