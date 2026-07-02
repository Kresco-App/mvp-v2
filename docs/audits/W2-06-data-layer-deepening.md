# Data Layer Deepening Follow-up

## Summary

- `git status --short` was run first and showed `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`.
- I read the required audit inputs in full: `docs/audits/_state.md`, `docs/audits/00-MASTER-REPORT.md`, `docs/audits/03-data-layer.md`, and `docs/audits/08-backend-gcp-cost.md`.
- No source finding below is marked `[WIP-PROVISIONAL]`: the findings cite backend, workflow, and Terraform files outside the modified/untracked frontend WIP. The report itself is the permitted audit artifact under untracked `docs/audits/`.
- I did not edit source, tests, config, migrations, workflows, or existing audit files.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### MEDIUM - Staff payment profile list still executes 1 + 2N aggregate queries and has no matching profile-order index

Evidence:

- `backend/app/services/staff_payments.py:70`

```py
70: async def list_staff_payment_profiles(db: AsyncSession, *, limit: int = 100) -> list[StaffPaymentProfileOut]:
71:     profiles = (
72:         await db.execute(
73:             select(StaffPaymentProfile)
74:             .order_by(StaffPaymentProfile.updated_at.desc(), StaffPaymentProfile.user_id.desc())
75:             .limit(max(1, min(int(limit or 100), 300)))
76:         )
77:     ).scalars().all()
78:     return [await profile_out(db, profile) for profile in profiles]
```

- `backend/app/services/staff_payments.py:359`

```py
359: async def profile_out(db: AsyncSession, profile: StaffPaymentProfile) -> StaffPaymentProfileOut:
360:     current_month = _month_start(datetime.now(timezone.utc).date())
361:     used_codes = await _staff_monthly_code_count(db, staff_user_id=int(profile.user_id), month_start=current_month)
362:     used_amount = await _staff_monthly_amount_sum(db, staff_user_id=int(profile.user_id), month_start=current_month)
```

- `backend/app/services/staff_payments.py:538`

```py
538: async def _staff_monthly_code_count(db: AsyncSession, *, staff_user_id: int, month_start: date) -> int:
542:             select(func.count())
543:             .select_from(StaffPaymentRequest)
545:                 StaffPaymentRequest.staff_user_id == staff_user_id,
546:                 StaffPaymentRequest.created_at >= start,
547:                 StaffPaymentRequest.created_at < end,
554: async def _staff_monthly_amount_sum(db: AsyncSession, *, staff_user_id: int, month_start: date) -> int:
558:             select(func.coalesce(func.sum(StaffPaymentRequest.amount_centimes), 0))
560:                 StaffPaymentRequest.staff_user_id == staff_user_id,
561:                 StaffPaymentRequest.created_at >= start,
562:                 StaffPaymentRequest.created_at < end,
563:                 StaffPaymentRequest.status.in_(("code_generated", "redeemed")),
```

- `backend/app/models/operations.py:86`

```py
86: class StaffPaymentProfile(Base):
87:     __tablename__ = "staff_payment_profiles"
89:         CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),
90:         CheckConstraint("monthly_code_limit >= 0", name="ck_staff_payment_profiles_monthly_code_limit"),
91:         CheckConstraint("monthly_amount_limit_centimes >= 0", name="ck_staff_payment_profiles_monthly_amount_limit"),
```

- `backend/alembic/versions/0086_founder_operations_rewrite.py:96`

```py
96:     if "staff_payment_profiles" not in tables:
98:             "staff_payment_profiles",
108:             sa.CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),
109:             sa.CheckConstraint("monthly_code_limit >= 0", name="ck_staff_payment_profiles_monthly_code_limit"),
110:             sa.CheckConstraint("monthly_amount_limit_centimes >= 0", name="ck_staff_payment_profiles_monthly_amount_limit"),
197:         op.create_index("ix_staff_payment_requests_staff_created", "staff_payment_requests", ["staff_user_id", "created_at"])
```

Why this is still a finding: the list endpoint can return 300 profiles, and each row calls two monthly aggregate helpers. The staff request table already has the right leading index for per-staff monthly aggregates, but `staff_payment_profiles` has no index matching `ORDER BY updated_at DESC, user_id DESC`.

Concrete fix:

1. Keep `profile_out()` for single-profile responses, but make `list_staff_payment_profiles()` compute one usage map for all listed profiles.

```py
from sqlalchemy import case

async def _staff_monthly_usage_by_user(
    db: AsyncSession,
    *,
    staff_user_ids: list[int],
    month_start: date,
) -> dict[int, tuple[int, int]]:
    if not staff_user_ids:
        return {}
    start, end = _month_datetimes(month_start)
    rows = (
        await db.execute(
            select(
                StaffPaymentRequest.staff_user_id,
                func.count().label("used_codes"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                StaffPaymentRequest.status.in_(("code_generated", "redeemed")),
                                StaffPaymentRequest.amount_centimes,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("used_amount_centimes"),
            )
            .where(
                StaffPaymentRequest.staff_user_id.in_(staff_user_ids),
                StaffPaymentRequest.created_at >= start,
                StaffPaymentRequest.created_at < end,
            )
            .group_by(StaffPaymentRequest.staff_user_id)
        )
    ).mappings().all()
    return {
        int(row["staff_user_id"]): (int(row["used_codes"] or 0), int(row["used_amount_centimes"] or 0))
        for row in rows
    }
```

2. Build the list response from the map instead of awaiting `profile_out()` inside the list loop. Either add a small `profile_out_from_usage(profile, used_codes, used_amount)` helper or add optional precomputed arguments to `profile_out()`.
3. Add the model index:

```py
Index("ix_staff_payment_profiles_updated_user", "updated_at", "user_id")
```

4. Add an Alembic revision after `0086`:

```py
op.create_index(
    "ix_staff_payment_profiles_updated_user",
    "staff_payment_profiles",
    ["updated_at", "user_id"],
)
```

5. Add query-plan checks for both the profile ordering query and the grouped monthly usage query as described in the guardrail finding below.

### MEDIUM - Active entitlement uniqueness is not enforced across paid, staff-code, manual, and SQLAdmin grant paths

Evidence:

- `backend/app/models/users.py:64`

```py
64: class UserSubjectEntitlement(Base):
65:     __tablename__ = "user_subject_entitlements"
67:     id: Mapped[int] = mapped_column(Integer, primary_key=True)
68:     user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
69:     subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
70:     starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
71:     ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
73:     status: Mapped[str] = mapped_column(String(30), default="active", index=True)
```

- `backend/alembic/versions/0007_add_subject_entitlements.py:24`

```py
24:         "user_subject_entitlements",
26:         sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
27:         sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
31:         sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
34:     op.create_index("ix_user_subject_entitlements_user_id", "user_subject_entitlements", ["user_id"])
35:     op.create_index("ix_user_subject_entitlements_subject_id", "user_subject_entitlements", ["subject_id"])
36:     op.create_index("ix_user_subject_entitlements_status", "user_subject_entitlements", ["status"])
```

- `backend/app/services/payment_entitlements.py:34`

```py
34:     existing_subject_ids = set(
37:                 select(UserSubjectEntitlement.subject_id)
39:                     UserSubjectEntitlement.user_id == int(user.id),
40:                     UserSubjectEntitlement.subject_id.in_(subject_ids),
41:                     UserSubjectEntitlement.status == "active",
54:     missing_subject_ids = [subject_id for subject_id in subject_ids if subject_id not in existing_subject_ids]
55:     for subject_id in missing_subject_ids:
56:         db.add(
57:             UserSubjectEntitlement(
```

- `backend/app/services/staff_payments.py:502`

```py
502:     existing_entitlements = (
504:             select(UserSubjectEntitlement)
506:                 UserSubjectEntitlement.user_id == int(user.id),
507:                 UserSubjectEntitlement.subject_id.in_(subject_ids),
508:                 UserSubjectEntitlement.status == "active",
513:     existing_by_subject = {
517:     for subject_id in subject_ids:
518:         existing = existing_by_subject.get(int(subject_id))
524:         db.add(
525:             UserSubjectEntitlement(
```

- `backend/app/services/manual_access_grants.py:62`

```py
62: async def _grant_subject_access(
70:     existing = await _active_manual_entitlement(
88:     db.add(record)
90:     if existing is None:
91:         entitlement = UserSubjectEntitlement(
99:         db.add(entitlement)
```

- `backend/app/admin/views.py:241`

```py
241: class UserSubjectEntitlementAdmin(PowerModelView, model=UserSubjectEntitlement):
245:     column_list = [
246:         UserSubjectEntitlement.id, UserSubjectEntitlement.user_id,
247:         UserSubjectEntitlement.subject_id, UserSubjectEntitlement.status,
248:         UserSubjectEntitlement.source, UserSubjectEntitlement.starts_at,
249:         UserSubjectEntitlement.ends_at,
253:     can_create = True
254:     can_edit = True
255:     can_delete = True
```

- `backend/app/services/data_integrity.py:30`

```py
30:     duplicate_specs = (
32:             "saved_item_duplicate_user_target",
38:             "daily_quest_duplicate_user_type_date",
44:             "topic_item_progress_duplicate_user_item",
50:             "xp_transaction_duplicate_idempotency_key",
56:     for check, model, columns, where_clause in duplicate_specs:
```

Why this is still a finding: all production grant paths perform an existence read before insert, but the database only has separate indexes. SQLAdmin can also create entitlement rows directly. There is no data-integrity audit check for overlapping active entitlements, so existing duplicates would not be caught by the current integrity guard.

Concrete fix:

1. Add a migration that first fails loudly if existing overlapping active rows are present, then adds a PostgreSQL exclusion constraint. A plain partial unique index on `(user_id, subject_id) WHERE status = 'active'` would be too strict if scheduled future active rows are intentionally allowed, so use the entitlement time range.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE user_subject_entitlements
ADD CONSTRAINT ex_user_subject_entitlements_active_overlap
EXCLUDE USING gist (
  user_id WITH =,
  subject_id WITH =,
  tstzrange(
    COALESCE(starts_at, '-infinity'::timestamptz),
    COALESCE(ends_at, 'infinity'::timestamptz),
    '[]'
  ) WITH &&
)
WHERE (status = 'active');
```

2. Add the same invariant to SQLAlchemy metadata using `sqlalchemy.dialects.postgresql.ExcludeConstraint` so metadata tests can assert it exists.
3. Serialize application grant paths before the read-then-insert block. Use either `select(User.id).where(User.id == target_user_id).with_for_update()` or a transaction-scoped advisory lock keyed by user id in:
   - `grant_paid_subject_entitlements()`
   - `_grant_code_entitlements()`
   - `_grant_subject_access()`
4. Keep SQLAdmin mutable only if the database constraint is in place; otherwise set `UserSubjectEntitlementAdmin.can_create = False` and route manual grants through `manual_access_grants`.
5. Extend `audit_data_integrity()` with a self-join overlap check for `user_subject_entitlements` where both rows have `status = 'active'`, same `(user_id, subject_id)`, different ids, and overlapping `[starts_at, ends_at]` ranges.

### MEDIUM - `audit_query_plans.py` is CI-enforced but misses the new admin/staff query patterns

Evidence:

- `.github/workflows/ci-backend.yml:83`

```yaml
83:       - name: Run query plan audit on Postgres
85:           DATABASE_URL="$CI_POSTGRES_DATABASE_URL" python scripts/audit_query_plans.py
```

- `backend/scripts/audit_query_plans.py:42`

```py
42: REQUIRED_INDEXES: tuple[RequiredIndex, ...] = (
43:     RequiredIndex("topic_sections", "ix_topic_sections_topic_order", ("topic_id", "order", "id")),
44:     RequiredIndex("topic_items", "ix_topic_items_workspace_order", ("topic_id", "status", "section_id", "order", "id")),
45:     RequiredIndex("tab_contents", "ix_tab_contents_item_status_order", ("topic_item_id", "status", "order", "id")),
46:     RequiredIndex("topic_item_progress", "ix_topic_item_progress_user_topic_item", ("user_id", "topic_id", "topic_item_id")),
47:     RequiredIndex("topic_item_progress", "ix_topic_item_progress_user_item_status", ("user_id", "topic_item_id", "status")),
48:     RequiredIndex("topic_item_progress", "ix_topic_item_progress_user_topic_status", ("user_id", "topic_id", "status")),
49:     RequiredIndex("user_notes", "ix_user_notes_user_topic_updated", ("user_id", "topic_id", "updated_at")),
54:     RequiredIndex("saved_items", "ix_saved_items_target_lookup", ("target_type", "target_id")),
55:     RequiredIndex("admin_audit_logs", "ix_admin_audit_created_at", ("created_at",)),
```

- `backend/scripts/audit_query_plans.py:58`

```py
58: PLAN_CHECKS: tuple[PlanCheck, ...] = (
59:     PlanCheck(
60:         "topic workspace sections",
98:     PlanCheck(
99:         "topic workspace notes",
100:         "SELECT id FROM user_notes WHERE user_id = 1 AND topic_id = 1 ORDER BY updated_at DESC",
103: )
```

- `backend/app/services/admin_communications.py:58`

```py
58: def _conversation_search_filter(search: str | None, professor: Any, student: Any) -> tuple[Any | None, str]:
63:     needle = substring_search_pattern(normalized)
65:     message_match = (
72:                 ProfessorChatMessage.body.ilike(needle, escape=LIKE_ESCAPE),
73:                 ProfessorChatMessage.attachment_name.ilike(needle, escape=LIKE_ESCAPE),
81:             CourseOffering.title.ilike(needle, escape=LIKE_ESCAPE),
85:             ProfessorChatConversation.last_message_preview.ilike(needle, escape=LIKE_ESCAPE),
```

- `backend/alembic/versions/0025_search_trigram_indexes.py:17`

```py
17: TRGM_INDEXES = (
18:     ("ix_users_full_name_trgm", "users", "full_name"),
19:     ("ix_users_email_trgm", "users", "email"),
20:     ("ix_topics_title_trgm", "topics", "title"),
21:     ("ix_topics_description_trgm", "topics", "description"),
22:     ("ix_topics_slug_trgm", "topics", "slug"),
23:     ("ix_professor_chat_conversations_last_preview_trgm", "professor_chat_conversations", "last_message_preview"),
24: )
```

- `backend/app/models/professor.py:24`

```py
24: class CourseOffering(Base):
28:         Index("ix_course_offerings_professor_status", "professor_user_id", "status"),
35:     title: Mapped[str] = mapped_column(String(255), default="")
250: class ProfessorChatMessage(Base):
253:         Index("ix_professor_chat_messages_conversation_created", "conversation_id", "created_at"),
259:     body: Mapped[str] = mapped_column(Text)
262:     attachment_name: Mapped[str] = mapped_column(String(255), default="")
```

Why this is still a finding: the CI guard is wired, but it currently cannot fail on the staff-payment profile N+1/index fix regressing, nor on admin communications search falling back to scans. The discovered admin query patterns are real code paths and are absent from both `REQUIRED_INDEXES` and `PLAN_CHECKS`.

Concrete fix:

1. Add the staff payment indexes and plan checks:

```py
RequiredIndex("staff_payment_profiles", "ix_staff_payment_profiles_updated_user", ("updated_at", "user_id")),
RequiredIndex("staff_payment_requests", "ix_staff_payment_requests_staff_created", ("staff_user_id", "created_at")),

PlanCheck(
    "admin staff payment profiles order",
    "SELECT user_id FROM staff_payment_profiles ORDER BY updated_at DESC, user_id DESC LIMIT 100",
    ("ix_staff_payment_profiles_updated_user",),
),
PlanCheck(
    "admin staff payment monthly usage",
    (
        "SELECT staff_user_id, count(*) FROM staff_payment_requests "
        "WHERE staff_user_id IN (1, 2, 3) "
        "AND created_at >= '2026-07-01T00:00:00+00:00' "
        "AND created_at < '2026-08-01T00:00:00+00:00' "
        "GROUP BY staff_user_id"
    ),
    ("ix_staff_payment_requests_staff_created",),
),
```

2. Add migrations and metadata for admin communications trigram indexes:

```py
("ix_course_offerings_title_trgm", "course_offerings", "title"),
("ix_professor_chat_messages_body_trgm", "professor_chat_messages", "body"),
("ix_professor_chat_messages_attachment_name_trgm", "professor_chat_messages", "attachment_name"),
```

3. Extend `PlanCheck` with an optional dialect allowlist, for example `dialects: tuple[str, ...] | None = None`, and skip PostgreSQL-only trigram checks on SQLite. Then add PostgreSQL-only `ILIKE '%term%'` checks expecting those trigram index names.
4. Extend `backend/tests_fastapi/test_query_plan_audit.py` to require the new `RequiredIndex` entries, the new plan-check names, and the new migration text.

### MEDIUM - Repo-managed DB pool defaults allow 90 backend connections against the small staging Cloud SQL footprint

Evidence:

- `backend/app/config.py:158`

```py
158:     database_pool_size: int = Field(
159:         default=10,
162:     database_max_overflow: int = Field(
163:         default=20,
166:     database_pool_timeout: int = Field(
167:         default=30,
```

- `backend/app/main.py:162`

```py
162:     engine, _ = init_engine(
163:         settings.database_url,
164:         settings.pgsslrootcert,
165:         pool_size=settings.database_pool_size,
166:         max_overflow=settings.database_max_overflow,
167:         pool_timeout=settings.database_pool_timeout,
```

- `backend/app/scheduled.py:139`

```py
139:     init_engine(
140:         settings.database_url,
141:         settings.pgsslrootcert,
142:         pool_size=settings.database_pool_size,
143:         max_overflow=settings.database_max_overflow,
144:         pool_timeout=settings.database_pool_timeout,
```

- `.github/workflows/deploy-backend.yml:205`

```yaml
205:             --project "$PROJECT_ID" \
206:             --region "$REGION" \
207:             --image "$BACKEND_IMAGE" \
208:             --min-instances 0 \
209:             --max-instances 3 \
211:             --update-env-vars "KRESCO_ENV=$KRESCO_ENV,KRESCO_RELEASE_SHA=$SHORT_SHA,KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest" \
```

- `infra/terraform/envs/staging/main.tf:45`

```tf
45:   project_id        = var.project_id
46:   name              = local.cloud_sql_instance
47:   region            = var.region
48:   tier              = "db-custom-1-3840"
49:   availability_type = "ZONAL"
50:   activation_policy = "NEVER"
51:   disk_size_gb      = 20
```

- `infra/terraform/modules/cloud-run-service/variables.tf:33`

```tf
33: variable "max_instances" {
36:   default     = 3
37: }
```

- `infra/terraform/envs/production/main.tf:1`

```tf
1: # Production is intentionally not instantiated yet.
3: # Keep production manual/dark until staging deployment evidence, provider rotation
4: # evidence, and launch gate sign-off are complete. Copy the staging module shape
```

Why this is still a finding: from repo-managed defaults, backend Cloud Run alone can open `3 * (10 + 20) = 90` database connections before migration jobs or scheduled workers. The repo-managed staging Cloud SQL instance is `db-custom-1-3840`. Production Cloud SQL sizing is not present in Terraform yet, so there is no repo-owned production connection budget to compare against.

Concrete fix:

1. Add a repo-owned pool-budget guard, for example `backend/scripts/check_database_pool_budget.py`, that accepts `--max-instances`, `--pool-size`, `--max-overflow`, and `--max-allowed-connections`, then fails if `max_instances * (pool_size + max_overflow)` exceeds the approved budget.
2. In `.github/workflows/deploy-backend.yml`, after fetching `kresco-runtime`, parse `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_TIMEOUT` from the runtime JSON and run the guard with `--max-instances 3`.
3. Make staging explicit in `kresco-runtime`, for example start with `DATABASE_POOL_SIZE=3`, `DATABASE_MAX_OVERFLOW=2`, and `DATABASE_POOL_TIMEOUT=10`, then raise only with load-test evidence.
4. Add a production launch-gate requirement that production Terraform declares Cloud SQL tier and Cloud Run max instances before `enforce_production_launch_gate=true` can pass. The guard should compare the runtime pool against that production budget.
5. Add unit tests proving production-like settings or deploy validation reject missing pool values and reject the current default `3 * (10 + 20)` budget for staging.

## Leads

1. External-state: verify live Secret Manager values for `projects/kresco-staging/secrets/kresco-runtime` and `projects/kresco-prod/secrets/kresco-runtime` contain intentional `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_TIMEOUT`; the repo currently does not contain those values.
2. Ops decision: define the approved per-environment database connection budgets that the new deploy guard should enforce. Staging can be derived from `db-custom-1-3840`; production cannot be derived from repo-managed Terraform until `infra/terraform/envs/production/main.tf` is instantiated.
