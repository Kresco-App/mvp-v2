# Data Layer
## Summary
- `git status --short` showed WIP only in `frontend/app/page.tsx` and `frontend/components/landing/`; no backend finding is marked `[WIP-PROVISIONAL]`.
- Existing `backend/find_n1.py` reports no direct looped `execute/scalar/scalars`, but it misses awaited serializers that issue DB queries.
- Main risks are destructive rollback hygiene for new data-bearing tables, entitlement grant races, and unguarded admin/staff query patterns.
- I did not edit source, tests, config, or migrations.

## Findings

### HIGH - Destructive downgrade drops payment/admin data instead of failing safely

Evidence:

- `backend/alembic/versions/0086_founder_operations_rewrite.py:203`

```py
def downgrade() -> None:
    for table_name in (
        "staff_payment_requests",
        "redemption_codes",
        "redemption_code_templates",
        "staff_payment_profiles",
        "finance_expenses",
        "analytics_daily_rollups",
        "analytics_events",
    ):
        if table_name in _tables():
            op.drop_table(table_name)
```

Why it matters: the migration adds data-bearing finance, analytics, and staff redemption-code tables. A rollback that runs Alembic downgrade would delete live operational/payment-adjacent data, which is not expand/contract safe.

Concrete fix: replace this downgrade with a loud `RuntimeError` unless a tested export/restore path exists, and treat rollback as code-backward-compatible with the additive tables left in place. If a reversible downgrade is required, add an explicit archive/restore migration and tests that verify rows survive downgrade/upgrade.

### MEDIUM - Subject entitlement grants can duplicate active rows under concurrent payments/codes

Evidence:

- `backend/app/services/payment_entitlements.py:34`

```py
existing_subject_ids = set(
    (
        await db.execute(
            select(UserSubjectEntitlement.subject_id)
            .where(
                UserSubjectEntitlement.user_id == int(user.id),
                UserSubjectEntitlement.subject_id.in_(subject_ids),
                UserSubjectEntitlement.status == "active",
```

- `backend/app/services/payment_entitlements.py:54`

```py
missing_subject_ids = [subject_id for subject_id in subject_ids if subject_id not in existing_subject_ids]
for subject_id in missing_subject_ids:
    db.add(
```

- `backend/app/services/staff_payments.py:502`

```py
existing_entitlements = (
    await db.execute(
        select(UserSubjectEntitlement)
        .where(
            UserSubjectEntitlement.user_id == int(user.id),
            UserSubjectEntitlement.subject_id.in_(subject_ids),
            UserSubjectEntitlement.status == "active",
```

- `backend/app/services/staff_payments.py:524`

```py
db.add(
    UserSubjectEntitlement(
        user_id=int(user.id),
        subject_id=int(subject_id),
```

- `backend/app/models/users.py:64`

```py
class UserSubjectEntitlement(Base):
    __tablename__ = "user_subject_entitlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
```

Why it matters: both grant paths do a non-locking existence read and then insert missing rows. The model has indexes but no uniqueness/exclusion constraint. Two concurrent successful payments or redemptions for the same user/subject can both see no current row and both insert active entitlements.

Concrete fix: serialize entitlement grants per user before the existence read, e.g. `SELECT users.id ... FOR UPDATE` or a transaction-scoped advisory lock keyed by user id in `grant_paid_subject_entitlements`, `_grant_code_entitlements`, and manual grant paths. If overlapping entitlement windows should be disallowed, add a PostgreSQL exclusion constraint over `(user_id, subject_id, active time range)` and convert inserts to conflict-safe logic.

### MEDIUM - Staff payment profile list has an N+1 aggregate pattern missed by `find_n1.py`

Evidence:

- `backend/app/services/staff_payments.py:70`

```py
async def list_staff_payment_profiles(db: AsyncSession, *, limit: int = 100) -> list[StaffPaymentProfileOut]:
    profiles = (
        await db.execute(
            select(StaffPaymentProfile)
            .order_by(StaffPaymentProfile.updated_at.desc(), StaffPaymentProfile.user_id.desc())
            .limit(max(1, min(int(limit or 100), 300)))
        )
    ).scalars().all()
    return [await profile_out(db, profile) for profile in profiles]
```

- `backend/app/services/staff_payments.py:359`

```py
async def profile_out(db: AsyncSession, profile: StaffPaymentProfile) -> StaffPaymentProfileOut:
    current_month = _month_start(datetime.now(timezone.utc).date())
    used_codes = await _staff_monthly_code_count(db, staff_user_id=int(profile.user_id), month_start=current_month)
    used_amount = await _staff_monthly_amount_sum(db, staff_user_id=int(profile.user_id), month_start=current_month)
```

Why it matters: `/api/admin/staff-payment-profiles` allows up to 300 profiles, and each profile triggers two more aggregate queries. That is 1 + 2N queries for the page. `backend/find_n1.py` does not flag it because the DB calls are inside an awaited helper rather than directly inside the loop body.

Concrete fix: keep `profile_out` for single-profile responses, but make `list_staff_payment_profiles` run one grouped monthly aggregate over `StaffPaymentRequest` for all selected `user_id`s, then build output rows from `used_codes_by_user` and `used_amount_by_user` maps.

### LOW - Staff profile pagination sorts on columns without a matching index

Evidence:

- `backend/app/services/staff_payments.py:73`

```py
select(StaffPaymentProfile)
.order_by(StaffPaymentProfile.updated_at.desc(), StaffPaymentProfile.user_id.desc())
.limit(max(1, min(int(limit or 100), 300)))
```

- `backend/app/models/operations.py:86`

```py
class StaffPaymentProfile(Base):
    __tablename__ = "staff_payment_profiles"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),
        CheckConstraint("monthly_code_limit >= 0", name="ck_staff_payment_profiles_monthly_code_limit"),
        CheckConstraint("monthly_amount_limit_centimes >= 0", name="ck_staff_payment_profiles_monthly_amount_limit"),
    )
```

- `backend/alembic/versions/0086_founder_operations_rewrite.py:96`

```py
if "staff_payment_profiles" not in tables:
    op.create_table(
        "staff_payment_profiles",
```

Why it matters: the model and migration create the table without an index that matches the endpoint's `ORDER BY updated_at DESC, user_id DESC`. As staff profiles grow, the admin list will require a sort instead of an ordered index scan.

Concrete fix: add `Index("ix_staff_payment_profiles_updated_user", "updated_at", "user_id")` to `StaffPaymentProfile.__table_args__`, add the matching Alembic migration, and include this route in `backend/scripts/audit_query_plans.py`.

### LOW - Admin communications message search uses unindexed leading-wildcard `ILIKE`

Evidence:

- `backend/app/services/admin_communications.py:71`

```py
or_(
    ProfessorChatMessage.body.ilike(needle, escape=LIKE_ESCAPE),
    ProfessorChatMessage.attachment_name.ilike(needle, escape=LIKE_ESCAPE),
    sender.full_name.ilike(needle, escape=LIKE_ESCAPE),
)
```

- `backend/app/models/professor.py:251`

```py
class ProfessorChatMessage(Base):
    __tablename__ = "professor_chat_messages"
    __table_args__ = (
        Index("ix_professor_chat_messages_conversation_created", "conversation_id", "created_at"),
    )
```

- `backend/alembic/versions/0025_search_trigram_indexes.py:17`

```py
TRGM_INDEXES = (
    ("ix_users_full_name_trgm", "users", "full_name"),
    ("ix_users_email_trgm", "users", "email"),
    ("ix_topics_title_trgm", "topics", "title"),
    ("ix_topics_description_trgm", "topics", "description"),
    ("ix_topics_slug_trgm", "topics", "slug"),
    ("ix_professor_chat_conversations_last_preview_trgm", "professor_chat_conversations", "last_message_preview"),
)
```

Why it matters: `substring_search_pattern()` produces `%term%`, so B-tree indexes cannot support the message body/attachment predicates. The existing trigram migration covers users, topics, and chat conversation previews, but not chat message body or attachment name.

Concrete fix: add PostgreSQL `pg_trgm` GIN indexes for `professor_chat_messages.body` and `professor_chat_messages.attachment_name`, then add a plan check for the admin communications search path. If `CourseOffering.title` search is expected to scale, add a trigram index there too.

## Leads

1. `backend/scripts/audit_query_plans.py:42` - After fixing the staff-profile and admin-communications index gaps, verify `REQUIRED_INDEXES` and `PLAN_CHECKS` include those real admin query patterns; the current guardrail list only covers topic workspace, saved item lookup, and admin audit created-at indexes.
