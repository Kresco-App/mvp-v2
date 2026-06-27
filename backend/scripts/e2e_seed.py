from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import UserXP
from app.models.interactions import Comment
from app.models.quizzes import Question, QuestionSet
from app.models.users import User, UserSubjectEntitlement
from seed_professor_demo import seed_professor_demo
from seed_safety import require_destructive_seed_session


async def seed_e2e_database(db: AsyncSession, *, destructive_confirmed: bool = False) -> None:
    require_destructive_seed_session(
        db,
        "scripts.e2e_seed.seed_e2e_database",
        confirmed=destructive_confirmed,
    )
    await clear_database(db)
    await seed_professor_demo(db, destructive_confirmed=True)
    await seed_e2e_accounts_and_course_surfaces(db)
    await db.commit()


async def clear_database(db: AsyncSession) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        await db.execute(table.delete())
    await db.flush()


async def seed_e2e_accounts_and_course_surfaces(db: AsyncSession) -> None:
    student = await upsert_user(
        db,
        "student@example.com",
        "Kresco Student",
        role="student",
        tier="pro",
        niveau="2BAC",
        filiere="Sciences Math B",
        is_pro=True,
    )
    admin = await upsert_user(
        db,
        "admin@example.com",
        "Kresco Admin",
        role="admin",
        tier="vip",
        niveau="",
        filiere="",
        is_pro=True,
        is_staff=True,
        is_superuser=True,
    )
    professor = await require_user(db, "professor@example.com")
    vip = await require_user(db, "vip@example.com")
    second_vip = await require_user(db, "second_vip@example.com")

    math = await require_subject(db, "Mathematics")
    await ensure_entitlement(db, student, math)
    await ensure_entitlement(db, vip, math)
    await ensure_entitlement(db, second_vip, math)
    await ensure_entitlement(db, admin, math)
    await ensure_topic_flow(db, math, authors=[student, vip, second_vip, professor])

    for user, xp in [(student, 1250), (vip, 2400), (second_vip, 2600), (admin, 5000)]:
        await ensure_xp(db, user, total_xp=xp)

    await db.flush()


async def upsert_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    *,
    role: str,
    tier: str,
    niveau: str,
    filiere: str,
    is_pro: bool = False,
    is_staff: bool = False,
    is_superuser: bool = False,
) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)
    user.full_name = full_name
    user.role = role
    user.tier = tier
    user.niveau = niveau
    user.filiere = filiere
    user.is_pro = is_pro
    user.is_active = True
    user.is_email_verified = True
    user.is_staff = is_staff
    user.is_superuser = is_superuser
    user.updated_at = now()
    await db.flush()
    return user


async def require_user(db: AsyncSession, email: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise RuntimeError(f"Expected seeded user missing: {email}")
    return user


async def require_subject(db: AsyncSession, title: str) -> Subject:
    subject = await db.scalar(select(Subject).where(Subject.title == title))
    if subject is None:
        raise RuntimeError(f"Expected seeded subject missing: {title}")
    subject.is_published = True
    return subject


async def ensure_entitlement(db: AsyncSession, user: User, subject: Subject) -> None:
    entitlement = await db.scalar(
        select(UserSubjectEntitlement).where(
            UserSubjectEntitlement.user_id == user.id,
            UserSubjectEntitlement.subject_id == subject.id,
        )
    )
    if entitlement is None:
        entitlement = UserSubjectEntitlement(user_id=user.id, subject_id=subject.id)
        db.add(entitlement)
    entitlement.status = "active"
    entitlement.starts_at = now() - timedelta(days=1)
    entitlement.ends_at = now() + timedelta(days=365)
    entitlement.source = "e2e_seed"
    await db.flush()


async def ensure_topic_flow(db: AsyncSession, subject: Subject, *, authors: list[User]) -> None:
    topic = await db.scalar(select(Topic).where(Topic.subject_id == subject.id, Topic.slug == "e2e-watch-flow"))
    if topic is None:
        topic = Topic(subject_id=subject.id, slug="e2e-watch-flow", title="E2E Watch Flow")
        db.add(topic)
    topic.description = "Backend-backed browser fixture for topic progress."
    topic.status = "published"
    topic.order = 900
    topic.is_free_preview = True
    await db.flush()

    section = await db.scalar(select(TopicSection).where(TopicSection.topic_id == topic.id, TopicSection.title == "E2E Items"))
    if section is None:
        section = TopicSection(topic_id=topic.id, title="E2E Items", section_type="lessons")
        db.add(section)
    section.order = 1
    await db.flush()

    resource = await db.scalar(select(Resource).where(Resource.topic_id == topic.id, Resource.title == "E2E Demo Video"))
    if resource is None:
        resource = Resource(topic_id=topic.id, title="E2E Demo Video", resource_type="video")
        db.add(resource)
    resource.provider = "vdocipher"
    resource.provider_resource_id = "demo-e2e-watch-flow"
    resource.status = "published"
    resource.is_free_preview = True
    await db.flush()

    item = await db.scalar(select(TopicItem).where(TopicItem.topic_id == topic.id, TopicItem.title == "E2E Exam Item"))
    if item is None:
        item = TopicItem(topic_id=topic.id, section_id=section.id, title="E2E Exam Item", item_type="lesson")
        db.add(item)
    item.item_type = "lesson"
    item.primary_resource_id = resource.id
    item.duration_seconds = 0
    item.is_free_preview = True
    item.status = "published"
    item.order = 1
    await db.flush()

    course_tab = await db.scalar(select(TabContent).where(TabContent.topic_item_id == item.id, TabContent.tab_type == "course"))
    if course_tab is None:
        course_tab = TabContent(topic_item_id=item.id, label="Course", tab_type="course")
        db.add(course_tab)
    course_tab.content = "E2E course content for backend-backed topic progress."
    course_tab.config_json = {}
    course_tab.status = "published"
    course_tab.order = 1
    await db.flush()
    item.primary_tab_content_id = course_tab.id

    tab = await db.scalar(select(TabContent).where(TabContent.topic_item_id == item.id, TabContent.tab_type == "quiz"))
    if tab is None:
        tab = TabContent(topic_item_id=item.id, label="Quiz", tab_type="quiz")
        db.add(tab)
    tab.config_json = {
        "pass_score": 70,
        "questions": [
            {
                "id": "e2e-q1",
                "type": "multiple_choice",
                "prompt": "What is the E2E answer?",
                "options": [{"id": 1, "text": "Correct"}, {"id": 2, "text": "Incorrect"}],
                "answer": 1,
            }
        ],
    }
    tab.status = "published"
    tab.order = 2
    await db.flush()

    comments_tab = await db.scalar(
        select(TabContent).where(
            TabContent.topic_item_id == item.id,
            TabContent.tab_type == "comments",
        )
    )
    if comments_tab is None:
        comments_tab = TabContent(topic_item_id=item.id, label="Comments", tab_type="comments")
        db.add(comments_tab)
    comments_tab.label = "Comments"
    comments_tab.content = "E2E comments fixture with ratings and replies."
    comments_tab.config_json = {"source": "e2e_seed", "features": ["ratings", "replies"]}
    comments_tab.status = "published"
    comments_tab.order = 3
    comments_tab.required_tier = ""
    comments_tab.required_feature_key = ""
    await db.flush()

    await seed_comment_threads(db, item, authors=authors)

    question_set = await db.scalar(select(QuestionSet).where(QuestionSet.tab_content_id == tab.id))
    if question_set is None:
        question_set = QuestionSet(tab_content_id=tab.id, title="E2E Exam Quiz")
        db.add(question_set)
    question_set.subject_id = subject.id
    question_set.topic_id = topic.id
    question_set.topic_section_id = section.id
    question_set.topic_item_id = item.id
    question_set.pass_score = 70
    question_set.status = "published"
    await db.flush()

    question = await db.scalar(select(Question).where(Question.question_set_id == question_set.id, Question.external_id == "e2e-q1"))
    if question is None:
        question = Question(question_set_id=question_set.id, external_id="e2e-q1", type="multiple_choice", prompt="What is the E2E answer?")
        db.add(question)
    question.config_json = {"options": [{"id": 1, "text": "Correct"}, {"id": 2, "text": "Incorrect"}]}
    question.answer_json = {"answer": 1}
    question.status = "published"
    question.order = 1
    await db.flush()


async def seed_comment_threads(db: AsyncSession, item: TopicItem, *, authors: list[User]) -> None:
    users_by_email = {user.email: user for user in authors}
    timestamp = now()
    parent = await upsert_comment(
        db,
        item=item,
        author=users_by_email["vip@example.com"],
        body="The E2E checkpoint comment includes a rating so the comments panel shows the full review UI.",
        rating=5,
        created_at=timestamp - timedelta(minutes=25),
    )
    await upsert_comment(
        db,
        item=item,
        author=users_by_email["professor@example.com"],
        body="This reply keeps the expandable thread path covered in the seeded workspace.",
        parent=parent,
        created_at=timestamp - timedelta(minutes=20),
    )
    second_parent = await upsert_comment(
        db,
        item=item,
        author=users_by_email["student@example.com"],
        body="I can see the discussion tab, rating pill, reply button, and loaded replies in one place.",
        rating=4,
        created_at=timestamp - timedelta(minutes=15),
    )
    await upsert_comment(
        db,
        item=item,
        author=users_by_email["second_vip@example.com"],
        body="Confirmed. The mock data also exercises a second author avatar and nested reply.",
        parent=second_parent,
        created_at=timestamp - timedelta(minutes=10),
    )


async def upsert_comment(
    db: AsyncSession,
    *,
    item: TopicItem,
    author: User,
    body: str,
    rating: int | None = None,
    parent: Comment | None = None,
    created_at: datetime,
) -> Comment:
    parent_filter = Comment.parent_id == parent.id if parent is not None else Comment.parent_id.is_(None)
    comment = await db.scalar(
        select(Comment).where(
            Comment.topic_item_id == item.id,
            Comment.user_id == author.id,
            Comment.body == body,
            parent_filter,
        )
    )
    if comment is None:
        comment = Comment(topic_item_id=item.id, user_id=author.id, body=body)
        db.add(comment)
    comment.exercise_id = None
    comment.topic_item_id = item.id
    comment.user_id = author.id
    comment.body = body
    comment.rating = rating
    comment.parent_id = parent.id if parent is not None else None
    comment.status = "visible"
    comment.moderated_by_user_id = None
    comment.moderated_at = None
    comment.moderation_reason = ""
    comment.created_at = created_at
    comment.updated_at = created_at
    await db.flush()
    return comment


async def ensure_xp(db: AsyncSession, user: User, *, total_xp: int) -> None:
    xp = await db.scalar(select(UserXP).where(UserXP.user_id == user.id))
    if xp is None:
        xp = UserXP(user_id=user.id)
        db.add(xp)
    xp.total_xp = total_xp
    xp.streak_days = 5
    xp.last_active_date = date.today()
    xp.updated_at = now()
    await db.flush()


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)
