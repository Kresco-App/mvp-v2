from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import String, cast, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, joinedload, load_only, selectinload, with_loader_criteria
from sqlalchemy.orm.attributes import set_committed_value

from app.models.courses import Resource, Subject, TabContent, Topic, TopicItem, TopicSection
from app.models.gamification import TopicItemProgress
from app.models.interactions import UserNote
from app.models.users import User
from app.schemas.courses import TabContentOut, TopicCardOut, TopicItemOut, TopicSectionOut, TopicWorkspaceOut
from app.services.access import AccessDecision, build_access_context
from app.services.course_access import store_access_decision, topic_item_out
from app.services.search import LIKE_ESCAPE, normalize_substring_search, substring_search_pattern

WORKSPACE_SEARCH_RESULT_LIMIT = 25
UNSUPPORTED_TOPIC_WORKSPACE_TAB_TYPES = {"quiz", "checkpoint_quiz", "questions"}


async def _matching_topic_item_ids(
    db: AsyncSession,
    *,
    user: User,
    topic_id: int,
    query: str,
    limit: int = WORKSPACE_SEARCH_RESULT_LIMIT,
) -> set[int]:
    normalized_query = normalize_substring_search(query)
    if not normalized_query:
        return set()

    needle = substring_search_pattern(normalized_query)
    tab_resource = aliased(Resource)
    primary_resource_match = exists(
        select(Resource.id).where(
            Resource.id == TopicItem.primary_resource_id,
            Resource.status == "published",
            or_(
                Resource.title.ilike(needle, escape=LIKE_ESCAPE),
                Resource.summary.ilike(needle, escape=LIKE_ESCAPE),
            ),
        )
    )
    tab_match = exists(
        select(TabContent.id)
        .outerjoin(
            tab_resource,
            (tab_resource.id == TabContent.resource_id) & (tab_resource.status == "published"),
        )
        .where(
            TabContent.topic_item_id == TopicItem.id,
            TabContent.status == "published",
            or_(
                TabContent.label.ilike(needle, escape=LIKE_ESCAPE),
                TabContent.content.ilike(needle, escape=LIKE_ESCAPE),
                cast(TabContent.concept_slugs, String).ilike(needle, escape=LIKE_ESCAPE),
                tab_resource.title.ilike(needle, escape=LIKE_ESCAPE),
                tab_resource.summary.ilike(needle, escape=LIKE_ESCAPE),
            ),
        )
    )
    note_match = exists(
        select(UserNote.id).where(
            UserNote.user_id == user.id,
            UserNote.topic_id == topic_id,
            UserNote.topic_item_id == TopicItem.id,
            UserNote.body.ilike(needle, escape=LIKE_ESCAPE),
        )
    )

    result = await db.execute(
        select(TopicItem.id).where(
            TopicItem.topic_id == topic_id,
            TopicItem.status == "published",
            or_(
                TopicItem.title.ilike(needle, escape=LIKE_ESCAPE),
                TopicItem.description.ilike(needle, escape=LIKE_ESCAPE),
                TopicItem.item_type.ilike(needle, escape=LIKE_ESCAPE),
                cast(TopicItem.concept_slugs, String).ilike(needle, escape=LIKE_ESCAPE),
                primary_resource_match,
                tab_match,
                note_match,
            ),
        )
        .order_by(TopicItem.order, TopicItem.id)
        .limit(max(1, limit))
    )
    return set(result.scalars().all())


async def list_topic_cards(
    db: AsyncSession,
    *,
    user: User,
    subject_id: int | None = None,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
) -> list[TopicCardOut]:
    stmt = (
        select(Topic)
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.sections)
            .load_only(
                TopicSection.id,
                TopicSection.topic_id,
                TopicSection.title,
                TopicSection.section_type,
                TopicSection.order,
            )
            .selectinload(TopicSection.items)
            .load_only(
                TopicItem.id,
                TopicItem.topic_id,
                TopicItem.section_id,
                TopicItem.status,
                TopicItem.concept_slugs,
            ),
            with_loader_criteria(TopicItem, TopicItem.status == "published"),
        )
        .join(Subject, Subject.id == Topic.subject_id)
        .where(Topic.status == "published", Subject.is_published == True)  # noqa: E712
        .order_by(Topic.order, Topic.title)
    )
    if subject_id is not None:
        stmt = stmt.where(Topic.subject_id == subject_id)
    normalized_query = normalize_substring_search(q)
    if normalized_query:
        needle = substring_search_pattern(normalized_query)
        stmt = stmt.where(or_(
            Topic.title.ilike(needle, escape=LIKE_ESCAPE),
            Topic.description.ilike(needle, escape=LIKE_ESCAPE),
            Topic.slug.ilike(needle, escape=LIKE_ESCAPE),
        ))

    result = await db.execute(stmt.offset(offset).limit(limit))
    topics = result.scalars().unique().all()
    access_context = await build_access_context(db, user)

    item_ids = [item.id for topic in topics for section in topic.sections for item in section.items]
    progress_by_item: set[int] = set()
    if item_ids:
        progress_result = await db.execute(
            select(TopicItemProgress.topic_item_id).where(
                TopicItemProgress.user_id == user.id,
                TopicItemProgress.topic_item_id.in_(item_ids),
                TopicItemProgress.status == "completed",
            )
        )
        progress_by_item = set(progress_result.scalars().all())

    cards = []
    for topic in topics:
        items = [item for section in topic.sections for item in section.items if item.status == "published"]
        concepts = sorted({slug for item in items for slug in (item.concept_slugs or [])})
        completed = len([item for item in items if item.id in progress_by_item])
        progress_pct = round((completed / len(items)) * 100) if items else 0
        access = access_context.decide_for(topic, subject_id=topic.subject_id)
        cards.append(TopicCardOut(
            id=topic.id,
            subject_id=topic.subject_id,
            subject_title=topic.subject.title if topic.subject else "",
            slug=topic.slug,
            title=topic.title,
            description=topic.description,
            is_free_preview=topic.is_free_preview,
            item_count=len(items),
            completed_count=completed,
            progress_pct=progress_pct,
            concepts=concepts[:8],
            can_access=access.can_access,
            locked_reason=access.locked_reason,
            access_reason=access.reason,
            required_subject_id=access.required_subject_id,
            required_tier=access.required_tier,
            required_feature_key=access.required_feature_key,
        ))
    return cards


def _compact_tab_config(config: dict) -> dict:
    if not isinstance(config, dict):
        return {}
    return {}


def _compact_tab_body(tab: TabContentOut) -> None:
    tab.content = ""
    tab.config_json = _compact_tab_config(tab.config_json)
    tab.body_omitted = True


def _compact_workspace_item(item: TopicItemOut) -> TopicItemOut:
    compact = item.model_copy(deep=True)
    if compact.primary_tab:
        _compact_tab_body(compact.primary_tab)
    for tab in compact.tabs:
        _compact_tab_body(tab)
    return compact


async def build_topic_workspace(
    db: AsyncSession,
    *,
    user: User,
    topic_id: int,
    item_id: int | None = None,
    q: str = "",
) -> TopicWorkspaceOut:
    topic_row = (
        await db.execute(
            select(Topic, Subject.title)
            .join(Subject, Subject.id == Topic.subject_id)
            .where(
                Topic.id == topic_id,
                Topic.status == "published",
                Subject.is_published == True,  # noqa: E712
            )
        )
    ).first()
    if topic_row is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    topic, subject_title = topic_row
    access_context = await build_access_context(db, user)
    topic_access = access_context.decide_for(topic, subject_id=topic.subject_id)

    section_rows = list((await db.execute(
        select(TopicSection)
        .options(
            load_only(
                TopicSection.id,
                TopicSection.topic_id,
                TopicSection.title,
                TopicSection.section_type,
                TopicSection.order,
            )
        )
        .where(TopicSection.topic_id == topic.id)
        .order_by(TopicSection.order, TopicSection.id)
    )).scalars().all())
    section_ids = [section.id for section in section_rows]

    items: list[TopicItem] = []
    if section_ids:
        items = list((await db.execute(
            select(TopicItem)
            .options(
                joinedload(TopicItem.primary_resource),
                with_loader_criteria(Resource, Resource.status == "published"),
            )
            .where(
                TopicItem.topic_id == topic.id,
                TopicItem.section_id.in_(section_ids),
                TopicItem.status == "published",
            )
            .order_by(TopicItem.section_id, TopicItem.order, TopicItem.id)
        )).scalars().all())

    item_ids = [item.id for item in items]
    tabs_by_item: dict[int, list[TabContent]] = {item.id: [] for item in items}
    if item_ids:
        tab_rows = (await db.execute(
            select(TabContent)
            .options(
                joinedload(TabContent.resource),
                with_loader_criteria(Resource, Resource.status == "published"),
            )
            .where(TabContent.topic_item_id.in_(item_ids), TabContent.status == "published")
            .order_by(TabContent.topic_item_id, TabContent.order, TabContent.id)
        )).scalars().all()
        for tab in tab_rows:
            if str(tab.tab_type or "").lower() in UNSUPPORTED_TOPIC_WORKSPACE_TAB_TYPES:
                continue
            tabs_by_item.setdefault(tab.topic_item_id, []).append(tab)
    for item in items:
        set_committed_value(item, "tabs", tabs_by_item.get(item.id, []))

    progress_by_item = {}
    if item_ids:
        progress_result = await db.execute(
            select(TopicItemProgress).where(
                TopicItemProgress.user_id == user.id,
                TopicItemProgress.topic_id == topic.id,
                TopicItemProgress.topic_item_id.in_(item_ids),
            )
        )
        progress_by_item = {p.topic_item_id: p for p in progress_result.scalars().all()}

    item_access: dict[int, AccessDecision] = {}
    for item in items:
        item_access[item.id] = access_context.decide_child(topic_access, item, subject_id=topic.subject_id)

    tab_access: dict[int, AccessDecision] = {}
    resource_access: dict[int, AccessDecision] = {}
    for item in items:
        current_item_access = item_access[item.id]
        if item.primary_resource:
            store_access_decision(
                resource_access,
                item.primary_resource.id,
                access_context.decide_child(current_item_access, item.primary_resource, subject_id=topic.subject_id),
            )
        for tab in item.tabs:
            if tab.status != "published":
                continue
            current_tab_access = access_context.decide_child(current_item_access, tab, subject_id=topic.subject_id)
            tab_access[tab.id] = current_tab_access
            if tab.resource:
                store_access_decision(
                    resource_access,
                    tab.resource.id,
                    access_context.decide_child(current_tab_access, tab.resource, subject_id=topic.subject_id),
                )

    accessible_items = [item for item in items if item_access.get(item.id, topic_access).can_access]
    if item_id is not None:
        active_item = next((item for item in items if item.id == item_id), None)
        if active_item is None:
            raise HTTPException(status_code=404, detail="Topic item not found")
    else:
        active_item = None

    if active_item is None:
        started = [progress_by_item.get(item.id) for item in accessible_items if progress_by_item.get(item.id)]
        started = sorted(started, key=lambda p: p.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        if started:
            active_item = next((item for item in accessible_items if item.id == started[0].topic_item_id), None)
    if active_item is None:
        active_item = next((item for item in accessible_items if progress_by_item.get(item.id, None) is None), None) or (
            accessible_items[0] if accessible_items else (items[0] if items else None)
        )

    def workspace_item_out(item: TopicItem, *, include_body: bool) -> TopicItemOut:
        out = topic_item_out(item, progress_by_item, item_access, tab_access, resource_access)
        return out if include_body else _compact_workspace_item(out)

    section_outputs = [
        TopicSectionOut(
            id=section.id,
            title=section.title,
            section_type=section.section_type,
            order=section.order,
            items=[
                workspace_item_out(
                    item,
                    include_body=active_item is not None and item.id == active_item.id,
                )
                for item in items
                if item.section_id == section.id
            ],
        )
        for section in section_rows
    ]
    completed_count = len([
        item
        for item in accessible_items
        if progress_by_item.get(item.id) and progress_by_item[item.id].status == "completed"
    ])
    progress_pct = round((completed_count / len(accessible_items)) * 100) if accessible_items else 0

    normalized_query = normalize_substring_search(q)
    matching_item_ids = await _matching_topic_item_ids(
        db,
        user=user,
        topic_id=topic.id,
        query=normalized_query,
    ) if normalized_query else set()

    search_results = [
        workspace_item_out(item, include_body=False)
        for item in items
        if item.id in matching_item_ids
    ]

    return TopicWorkspaceOut(
        id=topic.id,
        subject_id=topic.subject_id,
        subject_title=subject_title,
        slug=topic.slug,
        title=topic.title,
        description=topic.description,
        progress_pct=progress_pct,
        completed_count=completed_count,
        item_count=len(accessible_items),
        can_access=topic_access.can_access,
        locked_reason=topic_access.locked_reason,
        access_reason=topic_access.reason,
        required_subject_id=topic_access.required_subject_id,
        required_tier=topic_access.required_tier,
        required_feature_key=topic_access.required_feature_key,
        active_item_id=active_item.id if active_item else None,
        sections=section_outputs,
        active_item=workspace_item_out(active_item, include_body=True) if active_item else None,
        search_results=search_results,
    )
