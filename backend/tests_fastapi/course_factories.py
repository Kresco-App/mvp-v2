from dataclasses import asdict, dataclass
from typing import Any

from app.database import get_session_factory
from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.quizzes import QuestionSet
from app.models.users import UserSubjectEntitlement


@dataclass(frozen=True)
class SeededCourseHierarchy:
    subject_id: int
    topic_id: int
    section_id: int
    topic_item_id: int
    tab_content_id: int
    resource_id: int | None = None
    secondary_resource_id: int | None = None
    secondary_tab_content_id: int | None = None
    question_set_id: int | None = None

    def as_dict(self) -> dict[str, int | None]:
        return asdict(self)

    def topic_tuple(self) -> tuple[int, int, int, int]:
        return self.subject_id, self.topic_id, self.topic_item_id, self.tab_content_id

    def quiz_tuple(self) -> tuple[int, int, int, int, int]:
        return self.subject_id, self.topic_id, self.section_id, self.topic_item_id, self.tab_content_id


def _merged(defaults: dict[str, Any], overrides: dict[str, Any] | None) -> dict[str, Any]:
    values = dict(defaults)
    if overrides:
        values.update(overrides)
    return values


async def seed_course_hierarchy(
    user_id: int,
    slug: str,
    *,
    subject_kwargs: dict[str, Any] | None = None,
    topic_kwargs: dict[str, Any] | None = None,
    section_kwargs: dict[str, Any] | None = None,
    create_resource: bool = True,
    resource_kwargs: dict[str, Any] | None = None,
    item_kwargs: dict[str, Any] | None = None,
    tab_kwargs: dict[str, Any] | None = None,
    secondary_resource_kwargs: dict[str, Any] | None = None,
    comments_tab_kwargs: dict[str, Any] | None = None,
    secondary_tab_kwargs: dict[str, Any] | None = None,
    question_set_kwargs: dict[str, Any] | None = None,
    entitlement_kwargs: dict[str, Any] | None = None,
) -> SeededCourseHierarchy:
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(**_merged({
            "title": f"Subject {slug}",
            "description": "",
            "is_published": True,
            "order": 1,
        }, subject_kwargs))
        db.add(subject)
        await db.flush()

        topic = Topic(**_merged({
            "subject_id": subject.id,
            "slug": slug,
            "title": f"Topic {slug}",
            "status": "published",
            "is_free_preview": True,
        }, topic_kwargs))
        db.add(topic)
        await db.flush()

        section = TopicSection(**_merged({
            "topic_id": topic.id,
            "title": "Main",
            "section_type": "main",
            "order": 1,
        }, section_kwargs))
        db.add(section)
        await db.flush()

        resource = None
        if create_resource:
            resource = Resource(**_merged({
                "topic_id": topic.id,
                "title": "Resource",
                "resource_type": "pdf",
                "url": "/mock.pdf",
                "status": "published",
            }, resource_kwargs))
            db.add(resource)
            await db.flush()

        item_defaults = {
            "topic_id": topic.id,
            "section_id": section.id,
            "primary_resource_id": resource.id if resource else None,
            "title": "Item",
            "item_type": "reading",
            "status": "published",
        }
        item = TopicItem(**_merged(item_defaults, item_kwargs))
        db.add(item)
        await db.flush()

        tab_defaults = {
            "topic_item_id": item.id,
            "resource_id": resource.id if resource else None,
            "label": "Course",
            "tab_type": "course",
            "content": "Body",
            "status": "published",
            "order": 1,
        }
        tab = TabContent(**_merged(tab_defaults, tab_kwargs))
        db.add(tab)
        await db.flush()

        secondary_resource = None
        if secondary_resource_kwargs:
            secondary_resource = Resource(**_merged({
                "topic_id": topic.id,
                "title": "Secondary Resource",
                "resource_type": "pdf",
                "url": "/secondary.pdf",
                "status": "published",
            }, secondary_resource_kwargs))
            db.add(secondary_resource)
            await db.flush()

        if comments_tab_kwargs:
            db.add(TabContent(**_merged({
                "topic_item_id": item.id,
                "label": "Discussion",
                "tab_type": "comments",
                "status": "published",
                "order": 2,
            }, comments_tab_kwargs)))

        secondary_tab = None
        if secondary_tab_kwargs:
            secondary_tab = TabContent(**_merged({
                "topic_item_id": item.id,
                "resource_id": secondary_resource.id if secondary_resource else None,
                "label": "Secondary",
                "tab_type": "resource",
                "content": "Secondary body",
                "status": "published",
                "order": 3,
            }, secondary_tab_kwargs))
            db.add(secondary_tab)
            await db.flush()

        question_set = None
        if question_set_kwargs:
            question_set = QuestionSet(**_merged({
                "title": "Course quiz",
                "subject_id": subject.id,
                "topic_id": topic.id,
                "topic_item_id": item.id,
                "tab_content_id": tab.id,
                "source_type": "tab",
            }, question_set_kwargs))
            db.add(question_set)
            await db.flush()

        db.add(UserSubjectEntitlement(**_merged({
            "user_id": user_id,
            "subject_id": subject.id,
            "status": "active",
            "source": "test",
        }, entitlement_kwargs)))
        await db.commit()

        return SeededCourseHierarchy(
            subject_id=subject.id,
            topic_id=topic.id,
            section_id=section.id,
            topic_item_id=item.id,
            tab_content_id=tab.id,
            resource_id=resource.id if resource else None,
            secondary_resource_id=secondary_resource.id if secondary_resource else None,
            secondary_tab_content_id=secondary_tab.id if secondary_tab else None,
            question_set_id=question_set.id if question_set else None,
        )


async def seed_subject_entitlement(
    user_id: int,
    title: str,
    *,
    subject_kwargs: dict[str, Any] | None = None,
    entitlement_kwargs: dict[str, Any] | None = None,
) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        subject = Subject(**_merged({
            "title": title,
            "description": "",
            "is_published": True,
            "order": 99,
        }, subject_kwargs))
        db.add(subject)
        await db.flush()
        db.add(UserSubjectEntitlement(**_merged({
            "user_id": user_id,
            "subject_id": subject.id,
            "status": "active",
            "source": "test",
        }, entitlement_kwargs)))
        await db.commit()
        return subject.id
