from ninja import Router
from ninja.errors import HttpError
from django.contrib.contenttypes.models import ContentType
from interactions.models import Comment
from interactions.schemas import CommentOut, CommentCreateIn, CommentAuthorOut
from users.auth import jwt_auth
from courses.models import Lesson, Chapter, ChapterSection

router = Router(auth=jwt_auth)

ALLOWED_TYPES = {
    'lesson': Lesson,
    'chapter': Chapter,
    'section': ChapterSection,
    'chaptersection': ChapterSection,
}


@router.get("/comments", response=list[CommentOut])
def list_comments(request, content_type: str, object_id: int):
    model_class = ALLOWED_TYPES.get(content_type.lower())
    if not model_class:
        raise HttpError(400, "Invalid content_type")

    ct = ContentType.objects.get_for_model(model_class)

    comments = Comment.objects.filter(
        content_type=ct, object_id=object_id, parent=None
    ).select_related('user').prefetch_related('replies')

    result = []
    for c in comments:
        result.append(CommentOut(
            id=c.id,
            body=c.body,
            author=CommentAuthorOut(
                id=c.user.id,
                full_name=c.user.full_name,
                avatar_url=c.user.avatar_url,
            ),
            parent_id=c.parent_id,
            reply_count=c.replies.count(),
            created_at=c.created_at,
        ))
    return result


@router.post("/comments", response=CommentOut)
def create_comment(request, body: CommentCreateIn):
    model_class = ALLOWED_TYPES.get(body.content_type.lower())
    if not model_class:
        raise HttpError(400, "Invalid content_type")

    ct = ContentType.objects.get_for_model(model_class)

    parent = None
    if body.parent_id:
        try:
            parent = Comment.objects.get(id=body.parent_id)
        except Comment.DoesNotExist:
            raise HttpError(404, "Parent comment not found")

    comment = Comment.objects.create(
        user=request.auth,
        content_type=ct,
        object_id=body.object_id,
        body=body.body,
        parent=parent,
    )

    return CommentOut(
        id=comment.id,
        body=comment.body,
        author=CommentAuthorOut(
            id=request.auth.id,
            full_name=request.auth.full_name,
            avatar_url=request.auth.avatar_url,
        ),
        parent_id=comment.parent_id,
        reply_count=0,
        created_at=comment.created_at,
    )
