from app.database import get_session_factory
from app.models.courses import (
    Exam,
    ExamProblem,
    Subject,
    TabContent,
    Topic,
    TopicItem,
    TopicSection,
)
from app.models.gamification import TopicItemProgress
from app.models.users import User, UserSubjectEntitlement
from app.services.auth import create_token
from app.services.course_topic_read_models import WORKSPACE_SEARCH_RESULT_LIMIT
from tests_fastapi.course_factories import seed_course_hierarchy


async def _seed_topic(
    user_id: int,
    slug: str,
    *,
    item_tier: str = "",
    tab_tier: str = "",
    resource_status: str = "published",
    provider_resource_id: str = "secret-video",
):
    seeded = await seed_course_hierarchy(
        user_id,
        slug,
        resource_kwargs={
            "title": "Locked video",
            "resource_type": "video",
            "provider": "vdocipher",
            "provider_resource_id": provider_resource_id,
            "url": "https://secret.example/video",
            "status": resource_status,
            "required_tier": tab_tier,
        },
        item_kwargs={
            "title": "Topic item",
            "item_type": "video",
            "status": "published",
            "required_tier": item_tier,
        },
        tab_kwargs={
            "label": "Course",
            "tab_type": "course",
            "content": "secret tab body",
            "config_json": {"answer": "secret"},
            "status": "published",
            "required_tier": tab_tier,
        },
    )
    return seeded.topic_tuple()


def test_topic_workspace_redacts_locked_child_content(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-redaction@example.com", is_pro=False)
    _subject_id, topic_id, _item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-redaction-topic", tab_tier="pro")
    )

    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    item = response.json()["sections"][0]["items"][0]
    tab = item["tabs"][0]
    assert item["can_access"] is True
    assert tab["can_access"] is False
    assert tab["content"] == ""
    assert tab["config_json"] == {}
    assert tab["resource"]["provider_resource_id"] == ""
    assert tab["resource"]["url"] == ""


def test_topic_workspace_compacts_inactive_and_search_tab_bodies(app_client, auth_token, run_db):
    token, user_id = auth_token(email="workspace-compact-bodies@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Workspace compact", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="workspace-compact-bodies",
                title="Workspace compact bodies",
                status="published",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()

            active_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Active item",
                item_type="reading",
                status="published",
                order=1,
            )
            inactive_item = TopicItem(
                topic_id=topic.id,
                section_id=section.id,
                title="Inactive quiz item",
                item_type="quiz",
                status="published",
                order=2,
            )
            db.add_all([active_item, inactive_item])
            await db.flush()
            db.add_all([
                TabContent(
                    topic_item_id=active_item.id,
                    label="Course",
                    tab_type="course",
                    content="active lesson body",
                    config_json={"notes": "active config"},
                    status="published",
                    order=1,
                ),
                TabContent(
                    topic_item_id=inactive_item.id,
                    label="Quiz",
                    tab_type="quiz",
                    content="inactive lesson body with epsilon marker",
                    config_json={
                        "quiz_id": 123,
                        "question_set_id": 456,
                        "questions": [
                            {
                                "id": "q1",
                                "prompt": "large prompt",
                                "answer": "secret",
                            }
                        ],
                        "large_blob": "x" * 4000,
                    },
                    status="published",
                    order=1,
                ),
                UserSubjectEntitlement(
                    user_id=user_id,
                    subject_id=subject.id,
                    status="active",
                    source="test",
                ),
            ])
            await db.commit()
            return topic.id, active_item.id, inactive_item.id

    topic_id, active_item_id, inactive_item_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    response = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers=headers)

    assert response.status_code == 200
    data = response.json()
    section_items = {item["id"]: item for item in data["sections"][0]["items"]}
    assert data["active_item"]["id"] == active_item_id
    assert data["active_item"]["tabs"][0]["content"] == "active lesson body"
    assert data["active_item"]["tabs"][0]["body_omitted"] is False
    assert section_items[active_item_id]["tabs"][0]["content"] == "active lesson body"
    assert section_items[active_item_id]["tabs"][0]["body_omitted"] is False

    inactive_tab = section_items[inactive_item_id]["tabs"][0]
    assert inactive_tab["content"] == ""
    assert inactive_tab["body_omitted"] is True
    assert inactive_tab["config_json"] == {
        "quiz_id": 123,
        "question_set_id": 456,
        "questions": [{"id": "q1"}],
    }

    search_response = app_client.get(f"/api/courses/topics/{topic_id}/workspace?q=epsilon", headers=headers)

    assert search_response.status_code == 200
    search_results = search_response.json()["search_results"]
    assert [item["id"] for item in search_results] == [inactive_item_id]
    assert search_results[0]["tabs"][0]["content"] == ""
    assert search_results[0]["tabs"][0]["body_omitted"] is True

    selected_response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace?item_id={inactive_item_id}",
        headers=headers,
    )

    assert selected_response.status_code == 200
    selected_data = selected_response.json()
    selected_section_items = {item["id"]: item for item in selected_data["sections"][0]["items"]}
    assert selected_data["active_item"]["id"] == inactive_item_id
    assert selected_data["active_item"]["tabs"][0]["content"] == "inactive lesson body with epsilon marker"
    assert selected_data["active_item"]["tabs"][0]["body_omitted"] is False
    assert selected_section_items[inactive_item_id]["tabs"][0]["content"] == "inactive lesson body with epsilon marker"
    assert selected_section_items[inactive_item_id]["tabs"][0]["body_omitted"] is False


def test_topic_workspace_search_results_are_capped(app_client, auth_token, run_db):
    token, user_id = auth_token(email="workspace-search-cap@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Workspace search cap", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="workspace-search-cap",
                title="Workspace search cap",
                status="published",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            item_ids = []
            for index in range(WORKSPACE_SEARCH_RESULT_LIMIT + 8):
                item = TopicItem(
                    topic_id=topic.id,
                    section_id=section.id,
                    title=f"Capstone shared match {index:02d}",
                    item_type="reading",
                    status="published",
                    order=index,
                )
                db.add(item)
                await db.flush()
                item_ids.append(item.id)
                db.add(
                    TabContent(
                        topic_item_id=item.id,
                        label="Course",
                        tab_type="course",
                        content=f"Search cap body {index}",
                        status="published",
                    )
                )
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, source="test", status="active"))
            await db.commit()
            return topic.id, item_ids

    topic_id, item_ids = run_db(_seed())
    response = app_client.get(
        f"/api/courses/topics/{topic_id}/workspace?q=shared",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    search_ids = [item["id"] for item in response.json()["search_results"]]
    assert len(search_ids) == WORKSPACE_SEARCH_RESULT_LIMIT
    assert search_ids == item_ids[:WORKSPACE_SEARCH_RESULT_LIMIT]


def test_topic_workspace_honors_explicit_locked_item_id(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-explicit-locked-item@example.com", is_pro=False)
    seeded = run_db(seed_course_hierarchy(user_id, "access-explicit-locked-item"))

    async def _add_locked_item():
        session_factory = get_session_factory()
        async with session_factory() as db:
            locked_item = TopicItem(
                topic_id=seeded.topic_id,
                section_id=seeded.section_id,
                title="Locked explicit item",
                item_type="reading",
                status="published",
                required_tier="pro",
                order=2,
            )
            db.add(locked_item)
            await db.flush()
            db.add(TabContent(
                topic_item_id=locked_item.id,
                label="Course",
                tab_type="course",
                content="locked item body",
                status="published",
            ))
            await db.commit()
            return locked_item.id

    locked_item_id = run_db(_add_locked_item())
    response = app_client.get(
        f"/api/courses/topics/{seeded.topic_id}/workspace?item_id={locked_item_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    active_item = response.json()["active_item"]
    assert active_item["id"] == locked_item_id
    assert active_item["can_access"] is False
    assert active_item["locked_reason"] == "pro_required"
    assert active_item["tabs"][0]["content"] == ""


def test_topic_workspace_rejects_item_id_from_another_topic(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-cross-topic-item@example.com", is_pro=True)
    first = run_db(seed_course_hierarchy(user_id, "access-cross-topic-item-a"))
    second = run_db(seed_course_hierarchy(user_id, "access-cross-topic-item-b"))

    response = app_client.get(
        f"/api/courses/topics/{first.topic_id}/workspace?item_id={second.topic_item_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Topic item not found"


def test_locked_topic_item_stream_and_completion_are_forbidden(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-forbidden@example.com", is_pro=False)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-forbidden-topic", item_tier="pro")
    )
    headers = {"Authorization": f"Bearer {token}"}

    stream = app_client.get(f"/api/courses/topic-items/{item_id}/stream", headers=headers)
    progress = app_client.post(
        f"/api/courses/topic-items/{item_id}/progress",
        headers=headers,
        json={"watched_seconds": 1},
    )
    complete = app_client.post(f"/api/courses/topic-items/{item_id}/complete", headers=headers, json={"watched_seconds": 0})

    assert stream.status_code == 403
    assert progress.status_code == 403
    assert complete.status_code == 403


def test_topic_item_stream_enforces_primary_resource_access(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-locked-primary-resource@example.com", is_pro=False)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-locked-primary-resource", tab_tier="pro")
    )

    stream = app_client.get(
        f"/api/courses/topic-items/{item_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert stream.status_code == 403
    assert stream.json()["detail"] == "pro_required"


def test_topic_item_stream_rejects_unpublished_primary_resource(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-draft-primary-resource@example.com", is_pro=True)
    _subject_id, _topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-draft-primary-resource", resource_status="draft")
    )

    stream = app_client.get(
        f"/api/courses/topic-items/{item_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert stream.status_code == 404
    assert stream.json()["detail"] == "No video resource configured for this topic item"


def test_topic_workspace_and_stream_include_resume_checkpoint(app_client, auth_token, run_db):
    token, user_id = auth_token(email="access-video-resume@example.com", is_pro=True)
    _subject_id, topic_id, item_id, _tab_id = run_db(
        _seed_topic(user_id, "access-video-resume", provider_resource_id="demo-resume-video")
    )

    async def _add_progress():
        session_factory = get_session_factory()
        async with session_factory() as db:
            db.add(TopicItemProgress(
                user_id=user_id,
                topic_id=topic_id,
                topic_item_id=item_id,
                status="in_progress",
                watched_seconds=83,
            ))
            await db.commit()

    run_db(_add_progress())

    headers = {"Authorization": f"Bearer {token}"}
    workspace = app_client.get(f"/api/courses/topics/{topic_id}/workspace", headers=headers)
    stream = app_client.get(f"/api/courses/topic-items/{item_id}/stream", headers=headers)

    assert workspace.status_code == 200
    workspace_item = workspace.json()["active_item"]
    assert workspace_item["watched_seconds"] == 83
    assert workspace_item["resume_seconds"] == 83
    assert stream.status_code == 200
    assert stream.json()["watched_seconds"] == 83
    assert stream.json()["resume_seconds"] == 83


def test_create_topic_returns_created_card_for_unpublished_subject(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            staff = User(
                email="topic-create-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Draft Subject", description="", is_published=False)
            db.add_all([staff, subject])
            await db.commit()
            await db.refresh(staff)
            await db.refresh(subject)
            return create_token(staff.id, test_settings), subject.id

    token, subject_id = run_db(_seed())
    response = app_client.post(
        "/api/courses/topics",
        headers={"Authorization": f"Bearer {token}"},
        json={"subject_id": subject_id, "title": "Draft Topic", "description": "Created under draft"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["subject_id"] == subject_id
    assert data["subject_title"] == "Draft Subject"
    assert data["title"] == "Draft Topic"
    assert data["item_count"] == 0


def test_create_topic_resolves_slug_collisions_without_looped_lookup(app_client, query_counter, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            staff = User(
                email="topic-collision-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Collision Subject", description="", is_published=False)
            db.add_all([staff, subject])
            await db.flush()
            base_slug = f"collision-topic-{subject.id}"
            db.add_all([
                Topic(subject_id=subject.id, slug=base_slug, title="Existing base", status="published"),
                Topic(subject_id=subject.id, slug=f"{base_slug}-2", title="Existing second", status="published"),
                Topic(subject_id=subject.id, slug=f"{base_slug}-4", title="Existing fourth", status="published"),
            ])
            await db.commit()
            await db.refresh(staff)
            await db.refresh(subject)
            return create_token(staff.id, test_settings), subject.id, base_slug

    token, subject_id, base_slug = run_db(_seed())

    with query_counter() as queries:
        response = app_client.post(
            "/api/courses/topics",
            headers={"Authorization": f"Bearer {token}"},
            json={"subject_id": subject_id, "title": "Collision Topic", "description": "Created under draft"},
        )

    assert response.status_code == 200
    assert response.json()["slug"] == f"{base_slug}-3"
    assert queries.count <= 7, queries.statements


def test_global_course_catalog_mutations_are_staff_only(app_client, run_db, test_settings):
    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            professor = User(
                email="catalog-mutation-professor@example.com",
                full_name="Professor",
                is_active=True,
                is_email_verified=True,
                role="professor",
                password="!",
            )
            staff = User(
                email="catalog-mutation-staff@example.com",
                full_name="Staff",
                is_active=True,
                is_email_verified=True,
                is_staff=True,
                password="!",
            )
            unverified_staff = User(
                email="catalog-mutation-unverified-staff@example.com",
                full_name="Unverified Staff",
                is_active=True,
                is_email_verified=False,
                is_staff=True,
                password="!",
            )
            subject = Subject(title="Staff Only Catalog Subject", description="", is_published=True)
            db.add_all([professor, staff, unverified_staff, subject])
            await db.commit()
            await db.refresh(professor)
            await db.refresh(staff)
            await db.refresh(unverified_staff)
            await db.refresh(subject)
            return (
                create_token(professor.id, test_settings),
                create_token(staff.id, test_settings),
                create_token(unverified_staff.id, test_settings),
                subject.id,
            )

    professor_token, staff_token, unverified_staff_token, subject_id = run_db(_seed())
    professor_headers = {"Authorization": f"Bearer {professor_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    unverified_staff_headers = {"Authorization": f"Bearer {unverified_staff_token}"}

    professor_subject = app_client.post(
        "/api/courses/subjects",
        headers=professor_headers,
        json={"title": "Professor Direct Subject", "description": ""},
    )
    professor_topic = app_client.post(
        "/api/courses/topics",
        headers=professor_headers,
        json={"subject_id": subject_id, "title": "Professor Direct Topic", "description": ""},
    )
    staff_subject = app_client.post(
        "/api/courses/subjects",
        headers=staff_headers,
        json={"title": "Staff Direct Subject", "description": ""},
    )
    staff_topic = app_client.post(
        "/api/courses/topics",
        headers=staff_headers,
        json={"subject_id": subject_id, "title": "Staff Direct Topic", "description": ""},
    )
    unverified_staff_subject = app_client.post(
        "/api/courses/subjects",
        headers=unverified_staff_headers,
        json={"title": "Unverified Staff Direct Subject", "description": ""},
    )

    assert professor_subject.status_code == 403
    assert professor_topic.status_code == 403
    assert unverified_staff_subject.status_code == 403
    assert staff_subject.status_code == 200
    assert staff_topic.status_code == 200
    assert staff_subject.json()["title"] == "Staff Direct Subject"
    assert staff_topic.json()["subject_id"] == subject_id


def test_subject_and_topic_lists_are_paginated_and_query_bounded(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="course-pagination@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            ids = []
            for index in range(6):
                subject = Subject(title=f"Paginated {index}", description="", is_published=True, order=index)
                db.add(subject)
                await db.flush()
                db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
                topic = Topic(subject_id=subject.id, slug=f"paginated-topic-{index}", title=f"Topic {index}", status="published", order=index)
                db.add(topic)
                await db.flush()
                section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
                db.add(section)
                await db.flush()
                db.add(TopicItem(topic_id=topic.id, section_id=section.id, title="Item", item_type="reading", status="published"))
                ids.append(subject.id)
            await db.commit()
            return ids[0]

    subject_id = run_db(_seed())
    headers = {"Authorization": f"Bearer {token}"}

    with query_counter() as subjects_queries:
        subjects_response = app_client.get("/api/courses/subjects?limit=3&offset=1", headers=headers)
    with query_counter() as topics_queries:
        topics_response = app_client.get(f"/api/courses/subjects/{subject_id}/topics?limit=10", headers=headers)

    assert subjects_response.status_code == 200
    assert len(subjects_response.json()) == 3
    assert topics_response.status_code == 200
    assert len(topics_response.json()) == 1
    assert subjects_queries.count <= 6
    assert topics_queries.count <= 8


def test_exam_bank_excludes_exams_under_unpublished_subjects(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="exam-bank-filter@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            published_subject = Subject(title="Published subject", description="", is_published=True, order=1)
            draft_subject = Subject(title="Draft subject", description="", is_published=False, order=2)
            db.add_all([published_subject, draft_subject])
            await db.flush()
            published_exam = Exam(
                subject_id=published_subject.id,
                title="Published exam",
                year=2025,
                session="June",
                statement_url="/published.pdf",
                status="published",
            )
            draft_exam = Exam(
                subject_id=draft_subject.id,
                title="Draft exam",
                year=2024,
                session="June",
                statement_url="/draft.pdf",
                status="published",
            )
            db.add_all([published_exam, draft_exam])
            await db.commit()
            return published_exam.id, draft_exam.id

    published_exam_id, draft_exam_id = run_db(_seed())
    response = app_client.get(
        "/api/courses/exam-bank",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    exams = response.json()
    assert [exam["id"] for exam in exams] == [published_exam_id]
    assert draft_exam_id not in {exam["id"] for exam in exams}


def test_exam_bank_topic_filter_is_applied_before_limit_and_hydration(app_client, auth_token, run_db):
    token, _user_id = auth_token(email="exam-bank-topic-filter-window@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Exam bank topic SQL subject", description="", is_published=True, order=1)
            db.add(subject)
            await db.flush()
            matching_topic = Topic(
                subject_id=subject.id,
                slug="exam-bank-topic-filter-matching",
                title="Exam bank matching topic",
                status="published",
            )
            other_topic = Topic(
                subject_id=subject.id,
                slug="exam-bank-topic-filter-other",
                title="Exam bank other topic",
                status="published",
            )
            db.add_all([matching_topic, other_topic])
            await db.flush()

            matching_exam = Exam(
                subject_id=subject.id,
                title="SQL topic window buried matching exam",
                year=1990,
                session="June",
                statement_url="/buried-match.pdf",
                status="published",
            )
            db.add(matching_exam)
            await db.flush()
            matching_problem = ExamProblem(
                exam_id=matching_exam.id,
                topic_id=matching_topic.id,
                title="Matching topic problem",
                statement="match",
                written_solution="match solution",
                status="published",
            )
            nonmatching_problem = ExamProblem(
                exam_id=matching_exam.id,
                topic_id=other_topic.id,
                title="Nonmatching topic problem",
                statement="other",
                written_solution="other solution",
                status="published",
            )
            db.add_all([matching_problem, nonmatching_problem])

            for index in range(51):
                exam = Exam(
                    subject_id=subject.id,
                    title=f"SQL topic window newer nonmatch {index}",
                    year=2100 + index,
                    session="June",
                    statement_url=f"/newer-nonmatch-{index}.pdf",
                    status="published",
                )
                db.add(exam)
                await db.flush()
                db.add(
                    ExamProblem(
                        exam_id=exam.id,
                        topic_id=other_topic.id,
                        title=f"Other topic problem {index}",
                        statement="other",
                        written_solution="other solution",
                        status="published",
                    )
                )

            await db.commit()
            return matching_topic.id, matching_exam.id, matching_problem.id, nonmatching_problem.id

    matching_topic_id, matching_exam_id, matching_problem_id, nonmatching_problem_id = run_db(_seed())
    response = app_client.get(
        f"/api/courses/exam-bank?topic_id={matching_topic_id}&q=SQL topic window",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    exams = response.json()
    assert [exam["id"] for exam in exams] == [matching_exam_id]
    assert [problem["id"] for problem in exams[0]["problems"]] == [matching_problem_id]
    assert exams[0]["problems"][0]["topic_id"] == matching_topic_id
    assert nonmatching_problem_id not in {problem["id"] for problem in exams[0]["problems"]}


def test_topic_workspace_query_count_is_stable_with_many_items(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="workspace-budget@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Workspace budget", is_published=True)
            db.add(subject)
            await db.flush()
            topic = Topic(subject_id=subject.id, slug="workspace-budget", title="Workspace budget", is_free_preview=True)
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            for index in range(25):
                item = TopicItem(topic_id=topic.id, section_id=section.id, title=f"Item {index}", item_type="reading", status="published")
                db.add(item)
                await db.flush()
                db.add(TabContent(topic_item_id=item.id, label="Course", tab_type="course", content="body", status="published"))
                if index % 3 == 0:
                    db.add(TopicItemProgress(user_id=user_id, topic_id=topic.id, topic_item_id=item.id, status="completed"))
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    with query_counter() as queries:
        response = app_client.get(
            f"/api/courses/topics/{topic_id}/workspace",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["item_count"] == 25
    assert queries.count <= 12


def test_topic_workspace_search_query_count_is_stable_with_many_items(app_client, auth_token, query_counter, run_db):
    token, user_id = auth_token(email="workspace-search-budget@example.com", is_pro=True)

    async def _seed():
        session_factory = get_session_factory()
        async with session_factory() as db:
            subject = Subject(title="Workspace search budget", is_published=True)
            db.add(subject)
            await db.flush()
            topic = Topic(
                subject_id=subject.id,
                slug="workspace-search-budget",
                title="Workspace search budget",
                is_free_preview=True,
            )
            db.add(topic)
            await db.flush()
            section = TopicSection(topic_id=topic.id, title="Main", section_type="main", order=1)
            db.add(section)
            await db.flush()
            for index in range(WORKSPACE_SEARCH_RESULT_LIMIT + 10):
                item = TopicItem(
                    topic_id=topic.id,
                    section_id=section.id,
                    title=f"Searchable budget item {index}",
                    item_type="reading",
                    status="published",
                    order=index,
                )
                db.add(item)
                await db.flush()
                db.add(
                    TabContent(
                        topic_item_id=item.id,
                        label="Course",
                        tab_type="course",
                        content=f"Searchable body {index}",
                        status="published",
                    )
                )
                if index % 4 == 0:
                    db.add(TopicItemProgress(
                        user_id=user_id,
                        topic_id=topic.id,
                        topic_item_id=item.id,
                        status="completed",
                    ))
            db.add(UserSubjectEntitlement(user_id=user_id, subject_id=subject.id, status="active", source="test"))
            await db.commit()
            return topic.id

    topic_id = run_db(_seed())
    with query_counter() as queries:
        response = app_client.get(
            f"/api/courses/topics/{topic_id}/workspace?q=searchable",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["item_count"] == WORKSPACE_SEARCH_RESULT_LIMIT + 10
    assert len(data["search_results"]) == WORKSPACE_SEARCH_RESULT_LIMIT
    assert queries.count <= 13, queries.statements
