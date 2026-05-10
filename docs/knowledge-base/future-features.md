# Future Features

## AI tutor

AI tutor is future-supported, not v1 core.

The model should prepare for screen-aware context.

Potential AI context:

- User.
- Subject.
- Topic.
- Current TopicItem.
- Current tab.
- Transcript/course text.
- Concept tags.
- Resources.
- Quiz mistakes.
- Progress.
- Notes if permission allows.

AI usage must be gated, metered, and logged.

Needed controls:

- Daily/monthly limits.
- Tier gates.
- Token budgets.
- Admin kill switch.
- Model routing later.
- Cached/reused answers where appropriate.

## Live tutoring

Live sessions should remain separate from the normal Main Path in v1.

Future links:

- Live session linked to subject.
- Live session linked to topic.
- Recorded live attached as a resource/tool later.

VIP may eventually unlock live tutoring, but exact tier rules are not locked.

Do not build livestream delivery inside FastAPI/Lambda.

## Chat

Chat is separate for now.

Future chat types:

- Student to professor.
- Student to AI.
- Student to student.
- Topic discussion.
- Live-session chat.

Use managed realtime infrastructure when realtime is needed.

For v1, avoid making always-on global chat a dependency of the learning workspace.

## Forum/community

Forum can be Reddit-like later:

- Posts.
- Comments.
- Images/files.
- Saved posts.
- Tags.
- Topic links.
- Exam/resource sharing.
- Moderation.

Forum should link to learning context but should not be required for Topic Workspace to work.

Possible links:

- Subject.
- Topic.
- TopicItem.
- Resource.
- ExamProblem.

## Mobile

Mobile UX is deferred to design.

Architecture should remain mobile-friendly:

- API-first backend.
- Token-based auth support.
- Stable URLs/deep links.
- Provider SDK compatibility for video/live/chat.

Do not lock v1 desktop decisions in a way that makes mobile impossible, but do not spend implementation time optimizing mobile before the design is ready.
