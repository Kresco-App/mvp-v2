# Remaining High Findings Verification

## Summary

- Ran `git status --short` first. The only modified evidence file cited below is `.github/workflows/deploy-backend.yml`, so the DB pool finding is marked `[WIP-PROVISIONAL]`. Other cited source/config files were not modified according to targeted `git status`.
- Read `docs/audits/00-MASTER-REPORT.md`, `docs/audits/_state.md`, `docs/audits/W2-01-firestore-realtime-auth.md`, `docs/audits/W2-06-data-layer-deepening.md`, and `docs/audits/W2-10-backend-security-followup.md`.
- No scoped remaining Firestore/data-layer/security item is proven fixed by current code. Firestore live exploitability versus broken realtime remains partly external-state blocked because deployed rules are not in this repo, but the repo still lacks the rules, membership projection, and live-channel split needed to prove safety.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### HIGH - Still incomplete - Firestore rules and deploy ownership are still missing while clients read server-written channels

Status: current code does not prove fixed. Live behavior is external-state blocked because active deployed Firestore rules for `kresco-staging` and `kresco-prod` are not repo-visible.

Quoted evidence:

- `.firebaserc:3`: `"staging": "kresco-staging",`
- `.firebaserc:4`: `"production": "kresco-prod"`
- `firebase.json:2`: `"hosting": [`
- `firebase.json:104`: `}`
- `frontend/lib/realtime.ts:247`: `firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),`
- `frontend/lib/realtime.ts:251`: `unsubscribe = firestoreSdk.onSnapshot(`
- `backend/app/services/firestore_realtime.py:52`: `client.collection("realtimeChannels")`
- `backend/app/services/firestore_realtime.py:57`: `event_ref.set({`

Concrete fix: add checked-in `firestore.rules`, add the `firebase.json` Firestore deploy block, default-deny all documents, deny client writes under `realtimeChannels`, and allow event reads only through rules-readable membership docs for the exact encoded channel. Add emulator tests for anonymous denial, cross-user denial, expired membership denial, authorized read success, and denied client writes.

### HIGH - Still incomplete - Shared live-session realtime channel still conflicts with student visibility rules

Status: still vulnerable/incomplete if student clients are granted Firestore reads for `kresco:live:{sessionId}`.

Quoted evidence:

- `backend/app/services/professor_live_interactions.py:116`: `LiveSessionInteraction.status.not_in(["deleted", "hidden"]),`
- `backend/app/services/professor_live_interactions.py:118`: `LiveSessionInteraction.kind == "message",`
- `backend/app/services/professor_live_interactions.py:119`: `LiveSessionInteraction.student_user_id == user.id,`
- `backend/app/services/professor_live_interactions.py:120`: `LiveSessionInteraction.status == "answered",`
- `backend/app/services/professor_live_interactions.py:288`: `payload = live_interaction_out(interaction).model_dump(mode="json")`
- `backend/app/services/professor_live_interactions.py:289`: `await enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.created", payload)`
- `backend/app/services/professor_serializers.py:102`: `student_name=interaction.student.full_name if interaction.student else "",`
- `backend/app/services/professor_serializers.py:104`: `body=interaction.body,`
- `backend/app/services/professor_live_sessions.py:127`: `channel=live_session_channel_name(live_session_id),`
- `frontend/lib/liveSessionData.ts:280`: `channelName: liveSessionChannelName(sessionId),`
- `frontend/lib/liveSessionData.ts:356`: ``return `kresco:live:${liveSessionId}```

Concrete fix: split live realtime into separate channel families before allowing client Firestore reads: public participant events, professor/staff moderation events, and per-student own-interaction events. Publish `live.interaction.created/updated/deleted` to the channel matching the same visibility as `list_student_live_interaction_entries`, then add backend/frontend and rules emulator tests proving a student cannot receive hidden or unanswered peer questions.

### HIGH - Still incomplete - No rules-readable realtime membership projection exists

Status: current code still exposes channel discovery, not a Firestore-enforceable ACL.

Quoted evidence:

- `backend/app/models/users.py:39`: `firebase_uid: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)`
- `backend/app/services/realtime_access.py:120`: `channels = [user_notifications_channel_name(user.id)]`
- `backend/app/services/realtime_access.py:121`: `channels.extend(offering_notifications_channel_name(offering_id) for offering_id in offering_ids)`
- `backend/app/services/realtime_access.py:122`: `return RealtimeSubscriptionsOut(notification_channels=channels)`
- `frontend/lib/realtime.ts:339`: `export async function refreshKrescoRealtimeAuthorization() {}`

Concrete fix: have server credentials maintain `realtimeChannels/{channelId}/members/{firebaseUid}` documents whenever Firebase UID, user status, entitlements, offering membership, professor assignment, or live-session access changes. Use those documents, not `/realtime/subscriptions`, as the Firestore rules boundary.

### HIGH - Still vulnerable - Anonymous analytics events can still poison founder metrics

Status: current code proves unfixed. The endpoint remains optional-auth, CSRF-exempt, and stores caller-controlled metric names/values in the table later aggregated by founder metrics.

Quoted evidence:

- `backend/app/routers/telemetry.py:65`: `@router.post("/client-events", response_model=AnalyticsEventOut, status_code=202)`
- `backend/app/routers/telemetry.py:71`: `user: User | None = Depends(get_optional_current_user),`
- `backend/app/security/csrf.py:31`: `"/api/client-events",`
- `backend/app/schemas/founder_ops.py:30`: `event_name: str = Field(min_length=2, max_length=80)`
- `backend/app/schemas/founder_ops.py:39`: `value_int: int = Field(default=1, ge=0, le=1_000_000)`
- `backend/app/services/founder_ops.py:70`: `event_name=payload.event_name,`
- `backend/app/services/founder_ops.py:80`: `value_int=int(payload.value_int),`
- `backend/app/services/founder_ops.py:205`: `ai_events = await _sum(db, AnalyticsEvent.value_int, AnalyticsEvent.event_name == "ai_quota_used", AnalyticsEvent.occurred_at >= start, AnalyticsEvent.occurred_at < end)`
- `backend/app/services/founder_ops.py:216`: `AnalyticsEvent.event_name == "live_joined",`

Concrete fix: require `get_current_user` for rows stored in `AnalyticsEvent` and remove `/api/client-events` from CSRF unauthenticated exemptions, or split anonymous telemetry into a low-trust table excluded from founder/admin metrics. Add an event-name allowlist and derive sensitive counters such as AI usage server-side.

### HIGH - Still vulnerable - Destructive Alembic downgrade still drops finance/admin analytics tables

Status: current code proves unfixed.

Quoted evidence:

- `backend/alembic/versions/0086_founder_operations_rewrite.py:203`: `def downgrade() -> None:`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:205`: `"staff_payment_requests",`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:208`: `"staff_payment_profiles",`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:209`: `"finance_expenses",`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:210`: `"analytics_daily_rollups",`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:211`: `"analytics_events",`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:214`: `op.drop_table(table_name)`

Concrete fix: replace the downgrade with an explicit fail-safe, for example raising `RuntimeError`, unless a tested export/restore downgrade path exists. If downgrade support is required, add archive/restore migration coverage proving rows survive downgrade/upgrade.

### MEDIUM - Still incomplete - Active subject entitlement uniqueness/overlap is not database-enforced

Status: still incomplete. Some redemption-code rows are locked before redemption, but the entitlement invariant remains read-before-insert application logic without a database exclusion/unique constraint, and SQLAdmin can still create rows directly.

Quoted evidence:

- `backend/app/models/users.py:68`: `user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)`
- `backend/app/models/users.py:69`: `subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="CASCADE"), index=True)`
- `backend/app/models/users.py:73`: `status: Mapped[str] = mapped_column(String(30), default="active", index=True)`
- `backend/alembic/versions/0007_add_subject_entitlements.py:34`: `op.create_index("ix_user_subject_entitlements_user_id", "user_subject_entitlements", ["user_id"])`
- `backend/alembic/versions/0007_add_subject_entitlements.py:35`: `op.create_index("ix_user_subject_entitlements_subject_id", "user_subject_entitlements", ["subject_id"])`
- `backend/app/services/payment_entitlements.py:34`: `existing_subject_ids = set(`
- `backend/app/services/payment_entitlements.py:54`: `missing_subject_ids = [subject_id for subject_id in subject_ids if subject_id not in existing_subject_ids]`
- `backend/app/services/payment_entitlements.py:56`: `db.add(`
- `backend/app/services/staff_payments.py:502`: `existing_entitlements = (`
- `backend/app/services/staff_payments.py:524`: `db.add(`
- `backend/app/services/manual_access_grants.py:70`: `existing = await _active_manual_entitlement(`
- `backend/app/services/manual_access_grants.py:90`: `if existing is None:`
- `backend/app/admin/views.py:253`: `can_create = True`
- `backend/app/services/data_integrity.py:30`: `duplicate_specs = (`
- `backend/app/services/data_integrity.py:55`: `)`

Concrete fix: add a PostgreSQL exclusion constraint over active `(user_id, subject_id, tstzrange(starts_at, ends_at))` after failing loudly on existing overlaps, mirror it in SQLAlchemy metadata, and serialize paid/code/manual grant paths with a user row lock or advisory lock before the existence read. Add an integrity audit self-join for active overlapping entitlements and disable direct SQLAdmin creation until the database constraint exists.

### MEDIUM - Still incomplete - Staff payment profile list still has 1 + 2N monthly aggregate queries and no matching order index

Status: current code proves unfixed.

Quoted evidence:

- `backend/app/services/staff_payments.py:70`: `async def list_staff_payment_profiles(db: AsyncSession, *, limit: int = 100) -> list[StaffPaymentProfileOut]:`
- `backend/app/services/staff_payments.py:74`: `.order_by(StaffPaymentProfile.updated_at.desc(), StaffPaymentProfile.user_id.desc())`
- `backend/app/services/staff_payments.py:75`: `.limit(max(1, min(int(limit or 100), 300)))`
- `backend/app/services/staff_payments.py:78`: `return [await profile_out(db, profile) for profile in profiles]`
- `backend/app/services/staff_payments.py:361`: `used_codes = await _staff_monthly_code_count(db, staff_user_id=int(profile.user_id), month_start=current_month)`
- `backend/app/services/staff_payments.py:362`: `used_amount = await _staff_monthly_amount_sum(db, staff_user_id=int(profile.user_id), month_start=current_month)`
- `backend/app/models/operations.py:88`: `__table_args__ = (`
- `backend/app/models/operations.py:89`: `CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),`
- `backend/alembic/versions/0086_founder_operations_rewrite.py:197`: `op.create_index("ix_staff_payment_requests_staff_created", "staff_payment_requests", ["staff_user_id", "created_at"])`

Concrete fix: batch the current-month staff usage into one grouped aggregate query for all listed `user_id`s, build list rows from that map, add `ix_staff_payment_profiles_updated_user` to model metadata and a new Alembic revision, and cover both queries in the query-plan audit.

### MEDIUM - Still incomplete - Query-plan audit still misses staff/admin query patterns

Status: current code proves unfixed.

Quoted evidence:

- `backend/scripts/audit_query_plans.py:42`: `REQUIRED_INDEXES: tuple[RequiredIndex, ...] = (`
- `backend/scripts/audit_query_plans.py:55`: `RequiredIndex("admin_audit_logs", "ix_admin_audit_created_at", ("created_at",)),`
- `backend/scripts/audit_query_plans.py:58`: `PLAN_CHECKS: tuple[PlanCheck, ...] = (`
- `backend/scripts/audit_query_plans.py:99`: `"topic workspace notes",`
- `backend/scripts/audit_query_plans.py:103`: `)`
- `backend/app/services/admin_communications.py:72`: `ProfessorChatMessage.body.ilike(needle, escape=LIKE_ESCAPE),`
- `backend/app/services/admin_communications.py:73`: `ProfessorChatMessage.attachment_name.ilike(needle, escape=LIKE_ESCAPE),`
- `backend/app/services/admin_communications.py:81`: `CourseOffering.title.ilike(needle, escape=LIKE_ESCAPE),`
- `backend/alembic/versions/0025_search_trigram_indexes.py:23`: `("ix_professor_chat_conversations_last_preview_trgm", "professor_chat_conversations", "last_message_preview"),`
- `backend/app/models/professor.py:253`: `Index("ix_professor_chat_messages_conversation_created", "conversation_id", "created_at"),`

Concrete fix: add required index entries and plan checks for staff payment profile ordering and monthly grouped usage. Add trigram indexes for `course_offerings.title`, `professor_chat_messages.body`, and `professor_chat_messages.attachment_name`, then add PostgreSQL-only plan checks and tests requiring those guardrails.

### MEDIUM [WIP-PROVISIONAL] - Still incomplete - Repo-managed DB pool budget can still exceed staging Cloud SQL capacity

Status: still incomplete, but provisional because `.github/workflows/deploy-backend.yml` is modified in the current worktree. Live runtime values are external-state blocked because Secret Manager values are not in the repo.

Quoted evidence:

- `backend/app/config.py:158`: `database_pool_size: int = Field(`
- `backend/app/config.py:159`: `default=10,`
- `backend/app/config.py:162`: `database_max_overflow: int = Field(`
- `backend/app/config.py:163`: `default=20,`
- `.github/workflows/deploy-backend.yml:221`: `--max-instances 3 \`
- `infra/terraform/envs/staging/main.tf:48`: `tier              = "db-custom-1-3840"`
- `infra/terraform/envs/production/main.tf:1`: `# Production is intentionally not instantiated yet.`

Concrete fix: add a repo-owned deploy guard that fails when `max_instances * (DATABASE_POOL_SIZE + DATABASE_MAX_OVERFLOW)` exceeds an approved per-environment budget, parse the runtime secret during deploy, make staging pool values explicit and small, and require production Terraform to declare Cloud SQL tier and Cloud Run max instances before launch-gate approval.

## Leads - remaining questions or `None`

1. Verify active deployed Firestore Security Rules and Firestore database IDs for `kresco-staging` and `kresco-prod`.
2. Confirm whether native mobile will subscribe directly to Firestore or use backend polling.
3. Verify live Secret Manager `kresco-runtime` DB pool values for staging/prod and define approved per-environment connection budgets.
