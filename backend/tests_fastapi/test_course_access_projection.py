from types import SimpleNamespace
from uuid import uuid4

from app.database import get_session_factory
from app.models.courses import Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.users import User
from app.services.access import AccessContext, AccessDecision
from app.services.course_access import (
    access_for_tab,
    access_for_topic_item,
    apply_access_decision,
    chapter_section_out,
    exam_out,
    redact_locked_exam_problem,
    redact_locked_resource,
    redact_locked_tab,
    resource_out,
    store_access_decision,
    tab_content_out,
    topic_item_out,
)
from app.schemas.courses import ExamProblemOut, ResourceOut, TabContentOut


def locked_decision(**overrides) -> AccessDecision:
    values = {
        "can_access": False,
        "reason": "pro_required",
        "required_tier": "pro",
        "required_feature_key": "downloads",
        "required_subject_id": 7,
    }
    values.update(overrides)
    return AccessDecision(**values)


def unlocked_decision(**overrides) -> AccessDecision:
    values = {"can_access": True, "reason": "unlocked"}
    values.update(overrides)
    return AccessDecision(**values)


async def _seed_locked_topic_graph():
    suffix = uuid4().hex
    session_factory = get_session_factory()
    async with session_factory() as db:
        user = User(
            email=f"course-access-{suffix}@example.com",
            full_name="Basic Student",
            tier="basic",
            is_pro=False,
            is_active=True,
            is_email_verified=True,
            password="!",
        )
        subject = Subject(
            title=f"Locked Subject {suffix}",
            description="",
            is_published=True,
        )
        db.add_all([user, subject])
        await db.flush()

        topic = Topic(
            subject_id=subject.id,
            slug=f"locked-topic-{suffix}",
            title="Locked Topic",
            description="",
            status="published",
            required_tier="pro",
        )
        db.add(topic)
        await db.flush()

        section = TopicSection(
            topic_id=topic.id,
            title="Main",
            section_type="lesson",
            order=1,
        )
        db.add(section)
        await db.flush()

        item = TopicItem(
            topic_id=topic.id,
            section_id=section.id,
            title="Locked Item",
            description="",
            item_type="video",
            order=1,
        )
        db.add(item)
        await db.flush()

        tab = TabContent(
            topic_item_id=item.id,
            label="Practice",
            tab_type="quiz",
            content="private quiz",
            config_json={"questions": []},
            order=1,
        )
        db.add(tab)
        await db.commit()
        return user.id, item.id, tab.id


def test_apply_access_decision_maps_metadata_to_schema():
    out = ResourceOut(id=1, title="Sheet", resource_type="pdf")

    apply_access_decision(out, locked_decision())

    assert out.can_access is False
    assert out.locked_reason == "pro_required"
    assert out.required_tier == "pro"
    assert out.required_feature_key == "downloads"
    assert out.required_subject_id == 7
    assert out.access_reason == "pro_required"


def test_redaction_helpers_hide_locked_payloads():
    resource = ResourceOut(
        id=1,
        title="Protected",
        resource_type="video",
        provider_resource_id="vdo-secret",
        url="https://cdn.example/protected.pdf",
        metadata_json={"answer": "secret"},
        can_access=False,
    )
    tab = TabContentOut(
        id=2,
        label="Quiz",
        tab_type="quiz",
        content="secret explanation",
        config_json={"answer": "A"},
        order=1,
        can_access=False,
    )
    problem = ExamProblemOut(
        id=3,
        exam_id=4,
        title="Problem",
        statement="Question",
        written_solution="secret solution",
        written_solution_url="https://cdn.example/solution.pdf",
        difficulty="medium",
        can_access=False,
    )

    redact_locked_resource(resource)
    redact_locked_tab(tab)
    redact_locked_exam_problem(problem)

    assert resource.provider_resource_id == ""
    assert resource.url == ""
    assert resource.metadata_json == {}
    assert tab.content == ""
    assert tab.config_json == {}
    assert problem.written_solution == ""
    assert problem.written_solution_url == ""


def test_resource_and_tab_projection_redacts_nested_locked_resource():
    resource = SimpleNamespace(
        id=10,
        title="Worksheet",
        resource_type="pdf",
        provider="s3",
        provider_resource_id="private-key",
        url="https://cdn.example/private.pdf",
        summary="Summary stays visible",
        metadata_json={"secret": True},
        is_free_preview=False,
        required_tier="pro",
        required_feature_key="downloads",
    )
    tab = SimpleNamespace(
        id=20,
        label="Exercise",
        tab_type="exercise",
        content="private content",
        config_json={"solution": "A"},
        renderer_key="quiz",
        order=1,
        concept_slugs=[],
        resource=resource,
        required_tier="pro",
        required_feature_key="advanced_quizzes",
    )

    out = tab_content_out(
        tab,
        tab_access={20: locked_decision(required_feature_key="advanced_quizzes")},
        resource_access={10: locked_decision(required_feature_key="downloads")},
    )

    assert out.can_access is False
    assert out.content == ""
    assert out.config_json == {}
    assert out.resource is not None
    assert out.resource.provider_resource_id == ""
    assert out.resource.url == ""
    assert out.resource.metadata_json == {}

    visible = resource_out(resource, {10: unlocked_decision()})
    assert visible.provider_resource_id == "private-key"
    assert visible.url == "https://cdn.example/private.pdf"


def test_topic_item_projection_applies_access_progress_and_published_tab_filter():
    item = SimpleNamespace(
        id=30,
        topic_id=3,
        section_id=4,
        title="Item",
        description="Description",
        item_type="video",
        renderer_key="",
        duration_seconds=120,
        order=1,
        completion_policy="manual",
        is_free_preview=False,
        concept_slugs=["limits"],
        primary_resource_id=None,
        primary_resource=None,
        primary_tab_content_id=None,
        tabs=[
            SimpleNamespace(
                id=31,
                label="Published",
                tab_type="summary",
                content="content",
                config_json={},
                renderer_key="",
                order=1,
                resource_id=None,
                concept_slugs=[],
                resource=None,
                required_tier="",
                required_feature_key="",
                status="published",
            ),
            SimpleNamespace(
                id=32,
                label="Draft",
                tab_type="summary",
                content="draft",
                config_json={},
                renderer_key="",
                order=2,
                resource_id=None,
                concept_slugs=[],
                resource=None,
                required_tier="",
                required_feature_key="",
                status="draft",
            ),
        ],
    )
    progress = SimpleNamespace(status="completed", best_score=90)

    out = topic_item_out(
        item,
        progress_by_item={30: progress},
        item_access={30: locked_decision(required_feature_key="interactive_course")},
    )

    assert out.can_access is False
    assert out.locked_reason == "pro_required"
    assert out.progress_status == "completed"
    assert out.best_score == 90
    assert [tab.label for tab in out.tabs] == ["Published"]
    assert out.primary_tab_content_id == 31
    assert out.primary_tab is not None
    assert out.primary_tab.label == "Published"


def test_topic_item_projection_uses_explicit_primary_tab_over_video_resource():
    video_resource = SimpleNamespace(
        id=41,
        title="Intro video",
        resource_type="video",
        provider="youtube",
        provider_resource_id="abc123",
        url="",
        summary="Video",
        metadata_json={},
        is_free_preview=False,
        required_tier="",
        required_feature_key="",
    )
    video_tab = SimpleNamespace(
        id=42,
        label="Video",
        tab_type="video",
        content="",
        config_json={},
        renderer_key="youtube_embed",
        order=1,
        resource_id=video_resource.id,
        concept_slugs=[],
        resource=video_resource,
        required_tier="",
        required_feature_key="",
        status="published",
    )
    notes_tab = SimpleNamespace(
        id=43,
        label="Course notes",
        tab_type="course",
        content="Read this first.",
        config_json={},
        renderer_key="",
        order=2,
        resource_id=None,
        concept_slugs=[],
        resource=None,
        required_tier="",
        required_feature_key="",
        status="published",
    )
    comments_tab = SimpleNamespace(
        id=44,
        label="Discussion",
        tab_type="comments",
        content="",
        config_json={},
        renderer_key="",
        order=3,
        resource_id=None,
        concept_slugs=[],
        resource=None,
        required_tier="",
        required_feature_key="",
        status="published",
    )
    item = SimpleNamespace(
        id=40,
        topic_id=3,
        section_id=4,
        title="Item",
        description="Description",
        item_type="lesson",
        renderer_key="",
        duration_seconds=120,
        order=1,
        completion_policy="manual",
        is_free_preview=False,
        concept_slugs=[],
        primary_resource_id=video_resource.id,
        primary_resource=video_resource,
        primary_tab_content_id=notes_tab.id,
        tabs=[video_tab, notes_tab, comments_tab],
    )

    out = topic_item_out(item, progress_by_item={})

    assert out.primary_tab_content_id == notes_tab.id
    assert out.primary_tab is not None
    assert out.primary_tab.label == "Course notes"


def test_chapter_section_projection_redacts_locked_section_payload():
    context = AccessContext(
        user_id=1,
        effective_tier="basic",
        feature_keys=frozenset(),
        active_subject_ids=frozenset(),
    )
    section = SimpleNamespace(
        id=40,
        title="Protected video",
        section_type="video",
        order=1,
        is_gating=False,
        is_free_preview=False,
        vdocipher_id="vdo-private",
        duration_seconds=300,
        content="private content",
        quiz_data={"answers": ["A"]},
        pass_score=70,
        activity_type="",
        activity_data={"secret": True},
        chapter_id=5,
        chapter=SimpleNamespace(subject_id=6),
        required_tier="pro",
        required_feature_key="",
    )

    out = chapter_section_out(section, context)

    assert out.vdocipher_id == ""
    assert out.content == ""
    assert out.quiz_data is None
    assert out.activity_data is None


def test_store_access_decision_prefers_unlocked_decision():
    target = {1: locked_decision()}

    store_access_decision(target, 1, unlocked_decision())

    assert target[1].can_access is True


def test_topic_item_and_tab_access_resolve_parent_topic_lock(app_client, run_db):
    user_id, item_id, tab_id = run_db(_seed_locked_topic_graph())

    async def _decisions():
        session_factory = get_session_factory()
        async with session_factory() as db:
            user = await db.get(User, user_id)
            item = await db.get(TopicItem, item_id)
            tab = await db.get(TabContent, tab_id)
            return (
                await access_for_topic_item(db, user, item),
                await access_for_tab(db, user, tab),
            )

    item_decision, tab_decision = run_db(_decisions())

    assert item_decision.can_access is False
    assert item_decision.locked_reason == "pro_required"
    assert item_decision.required_tier == "pro"
    assert tab_decision.can_access is False
    assert tab_decision.locked_reason == "pro_required"
    assert tab_decision.required_tier == "pro"


def test_exam_projection_redacts_locked_problem_and_video_resource():
    context = AccessContext(
        user_id=1,
        effective_tier="basic",
        feature_keys=frozenset(),
        active_subject_ids=frozenset(),
    )
    video_resource = SimpleNamespace(
        id=70,
        title="Video solution",
        resource_type="video",
        provider="vdocipher",
        provider_resource_id="vdo-private",
        url="https://cdn.example/private-video",
        summary="summary",
        metadata_json={"otp": "secret"},
        is_free_preview=False,
        required_tier="pro",
        required_feature_key="",
    )
    problem = SimpleNamespace(
        id=71,
        exam_id=72,
        topic_id=None,
        title="Problem",
        statement="Question statement",
        written_solution="Private written solution",
        written_solution_url="https://cdn.example/solution.pdf",
        difficulty="medium",
        concept_slugs=[],
        video_resource=video_resource,
        is_free_preview=False,
        required_tier="pro",
        required_feature_key="",
    )
    exam = SimpleNamespace(
        id=72,
        subject_id=73,
        subject=SimpleNamespace(title="Physics"),
        title="National Exam",
        year=2025,
        session="Normal",
        statement_url="https://cdn.example/exam.pdf",
        is_free_preview=False,
        required_tier="",
        required_feature_key="",
    )

    out = exam_out(exam, [problem], context)

    assert out.can_access is True
    assert out.subject_title == "Physics"
    assert len(out.problems) == 1
    projected_problem = out.problems[0]
    assert projected_problem.can_access is False
    assert projected_problem.locked_reason == "pro_required"
    assert projected_problem.written_solution == ""
    assert projected_problem.written_solution_url == ""
    assert projected_problem.video_resource is not None
    assert projected_problem.video_resource.provider_resource_id == ""
    assert projected_problem.video_resource.url == ""
    assert projected_problem.video_resource.metadata_json == {}
