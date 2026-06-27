from datetime import datetime, timezone
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Resource, Subject, Topic, TopicItem
from app.models.interactions import Comment
from app.models.users import User
from app.schemas.admin import (
    AdminVideoFeedbackCommentOut,
    AdminVideoFeedbackItemOut,
    AdminVideoFeedbackOut,
    AdminVideoFeedbackSummaryOut,
)

VIDEO_ITEM_TYPES = {"lesson", "lesson_video", "video", "correction_video"}
VIDEO_RENDERERS = {"video", "youtube_embed", "vdocipher"}
COMMENT_SAMPLE_LIMIT = 6


def _int(value: Any) -> int:
    return int(value or 0)


def _float(value: Any) -> float:
    return round(float(value or 0), 2)


def _text(value: Any) -> str:
    return str(value or "").strip()


async def build_admin_video_feedback(db: AsyncSession, *, limit: int = 80) -> AdminVideoFeedbackOut:
    bounded_limit = max(1, min(int(limit or 80), 200))
    negative_count = func.coalesce(func.sum(case((Comment.rating <= 2, 1), else_=0)), 0).label("negative_count")
    positive_count = func.coalesce(func.sum(case((Comment.rating >= 4, 1), else_=0)), 0).label("positive_count")
    neutral_count = func.coalesce(func.sum(case((Comment.rating == 3, 1), else_=0)), 0).label("neutral_count")
    rating_count = func.count(Comment.id).label("rating_count")
    average_rating = func.avg(Comment.rating).label("average_rating")
    latest_comment_at = func.max(Comment.created_at).label("latest_comment_at")

    result = await db.execute(
        select(
            TopicItem.id.label("topic_item_id"),
            TopicItem.title.label("title"),
            TopicItem.item_type.label("item_type"),
            TopicItem.duration_seconds.label("duration_seconds"),
            Topic.title.label("topic_title"),
            Subject.title.label("subject_title"),
            Resource.provider.label("resource_provider"),
            Resource.url.label("resource_url"),
            rating_count,
            average_rating,
            positive_count,
            negative_count,
            neutral_count,
            latest_comment_at,
        )
        .select_from(TopicItem)
        .join(Comment, Comment.topic_item_id == TopicItem.id)
        .join(Topic, Topic.id == TopicItem.topic_id)
        .join(Subject, Subject.id == Topic.subject_id)
        .outerjoin(Resource, Resource.id == TopicItem.primary_resource_id)
        .where(
            Comment.status == "visible",
            Comment.rating.is_not(None),
            TopicItem.status == "published",
            or_(
                func.lower(TopicItem.item_type).in_(VIDEO_ITEM_TYPES),
                func.lower(TopicItem.item_type).like("%video%"),
                func.lower(TopicItem.renderer_key).in_(VIDEO_RENDERERS),
                func.lower(Resource.resource_type) == "video",
            ),
        )
        .group_by(
            TopicItem.id,
            TopicItem.title,
            TopicItem.item_type,
            TopicItem.duration_seconds,
            Topic.title,
            Subject.title,
            Resource.provider,
            Resource.url,
        )
        .order_by(negative_count.desc(), average_rating.asc(), rating_count.desc(), TopicItem.id.desc())
        .limit(bounded_limit)
    )

    rows = [dict(row._mapping) for row in result.all()]
    item_ids = [_int(row["topic_item_id"]) for row in rows]
    comment_samples = await _load_comment_samples(db, item_ids=item_ids) if item_ids else {}
    items: list[AdminVideoFeedbackItemOut] = []

    for row in rows:
        topic_item_id = _int(row["topic_item_id"])
        samples = comment_samples.get(topic_item_id, {"negative": [], "positive": []})
        items.append(
            AdminVideoFeedbackItemOut(
                topic_item_id=topic_item_id,
                title=_text(row["title"]),
                topic_title=_text(row["topic_title"]),
                subject_title=_text(row["subject_title"]),
                item_type=_text(row["item_type"]),
                duration_seconds=_int(row["duration_seconds"]),
                resource_provider=_text(row["resource_provider"]),
                resource_url=_text(row["resource_url"]),
                rating_count=_int(row["rating_count"]),
                average_rating=_float(row["average_rating"]),
                positive_count=_int(row["positive_count"]),
                negative_count=_int(row["negative_count"]),
                neutral_count=_int(row["neutral_count"]),
                latest_comment_at=row["latest_comment_at"],
                negative_comments=samples["negative"],
                positive_comments=samples["positive"],
            )
        )

    rated_comments = sum(item.rating_count for item in items)
    weighted_rating = (
        sum(item.average_rating * item.rating_count for item in items) / rated_comments
        if rated_comments
        else 0
    )

    return AdminVideoFeedbackOut(
        generated_at=datetime.now(timezone.utc),
        summary=AdminVideoFeedbackSummaryOut(
            videos_reviewed=len(items),
            rated_comments=rated_comments,
            average_rating=_float(weighted_rating),
            positive_comments=sum(item.positive_count for item in items),
            negative_comments=sum(item.negative_count for item in items),
            watchlist_videos=sum(1 for item in items if item.negative_count > 0 or item.average_rating < 3.5),
        ),
        items=items,
    )


async def _load_comment_samples(
    db: AsyncSession,
    *,
    item_ids: list[int],
) -> dict[int, dict[str, list[AdminVideoFeedbackCommentOut]]]:
    bucket_expr = case((Comment.rating <= 2, "negative"), else_="positive").label("bucket")
    sample_rank = func.row_number().over(
        partition_by=(Comment.topic_item_id, bucket_expr),
        order_by=(Comment.created_at.desc(), Comment.id.desc()),
    ).label("sample_rank")
    ranked_comments = (
        select(
            Comment.id.label("id"),
            Comment.topic_item_id.label("topic_item_id"),
            Comment.body.label("body"),
            Comment.rating.label("rating"),
            Comment.created_at.label("created_at"),
            User.full_name.label("full_name"),
            User.email.label("email"),
            bucket_expr,
            sample_rank,
        )
        .join(User, User.id == Comment.user_id)
        .where(
            Comment.topic_item_id.in_(item_ids),
            Comment.status == "visible",
            Comment.rating.is_not(None),
            or_(Comment.rating <= 2, Comment.rating >= 4),
        )
        .subquery()
    )
    result = await db.execute(
        select(
            ranked_comments.c.id,
            ranked_comments.c.topic_item_id,
            ranked_comments.c.body,
            ranked_comments.c.rating,
            ranked_comments.c.created_at,
            ranked_comments.c.full_name,
            ranked_comments.c.email,
            ranked_comments.c.bucket,
        )
        .where(ranked_comments.c.sample_rank <= COMMENT_SAMPLE_LIMIT)
        .order_by(
            ranked_comments.c.topic_item_id.asc(),
            ranked_comments.c.bucket.asc(),
            ranked_comments.c.created_at.desc(),
            ranked_comments.c.id.desc(),
        )
    )
    samples: dict[int, dict[str, list[AdminVideoFeedbackCommentOut]]] = {
        item_id: {"negative": [], "positive": []}
        for item_id in item_ids
    }

    for row in result.all():
        data = row._mapping
        item_id = _int(data["topic_item_id"])
        rating = _int(data["rating"])
        bucket = data["bucket"] if data["bucket"] in {"negative", "positive"} else ("negative" if rating <= 2 else "positive")
        target = samples.setdefault(item_id, {"negative": [], "positive": []})[bucket]
        target.append(
            AdminVideoFeedbackCommentOut(
                comment_id=_int(data["id"]),
                author_name=_text(data["full_name"]) or _text(data["email"]) or "Student",
                body=_text(data["body"]),
                rating=rating,
                created_at=data["created_at"],
            )
        )

    return samples
