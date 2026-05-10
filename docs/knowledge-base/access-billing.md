# Access and Billing Model

## Principle

Access is the combination of:

- Subject entitlement.
- Global tier.
- Feature policy.

Example:

```text
User has Physics access + Pro tier
-> can access Physics Pro content/features

User has Math access only
-> cannot access Physics topic items
```

## Subject entitlement

Subject entitlement controls where the student has access.

Suggested fields:

- `user_id`
- `subject_id`
- `starts_at`
- `ends_at`
- `source`
- `status`

Access period can be:

- Monthly.
- Semester.
- Until exam date.
- Any other configured period.

Implementation should not depend on one billing duration.

## Global tier

Tier is global to reduce buying fatigue and confusion.

Examples:

- Basic.
- Pro.
- VIP.

Exact tier meanings are not locked yet.

Do not encode business rules as hard-coded `if tier == vip` checks everywhere. Use policy/feature keys.

## Feature gates

Use feature keys for premium capabilities.

Possible keys:

- `live_sessions`
- `ai_tutor`
- `teacher_chat`
- `interactive_course`
- `simulated_exams`
- `downloads`
- `advanced_quizzes`
- `forum_posting`
- `exam_bank_video_solutions`

## Policy-based access

Content/resources should support:

- `required_subject_access`
- `required_tier`
- `required_feature_key`
- `is_free_preview`

This allows future changes without redesigning the database.

## Locked preview

Locked content should not simply disappear.

Locked cards/items should be able to show:

- Title.
- Lightweight summary.
- Topic context.
- Free preview items.
- Unlock CTA.

This is important for conversion and comprehension.
