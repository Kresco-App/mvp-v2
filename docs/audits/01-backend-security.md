# Backend Security
## Summary
- `git status --short` showed WIP only in `frontend/app/page.tsx` and `frontend/components/landing/`; no backend finding is WIP-provisional.
- Authenticated backend routes consistently use `get_current_user`, professor active-offering checks, staff permission dependencies, or an internal shared secret.
- CMI callback is unauthenticated at the router but is CSRF-exempt only as a signed webhook and verifies hash, transaction match, success fields, status, and expiry before marking paid.
- No raw SQL string interpolation finding was confirmed in the audited router/service paths; observed raw `text(...)` use was static health/diagnostic SQL.
- Findings are limited to unauthenticated analytics writes and exam progress mutation rate-limit posture.

## Findings
### MEDIUM - Unauthenticated analytics writes can poison founder/admin metrics
Exact location: `backend/app/routers/telemetry.py:65`

Evidence:
- `backend/app/routers/telemetry.py:65`: `@router.post("/client-events", response_model=AnalyticsEventOut, status_code=202)`
- `backend/app/routers/telemetry.py:71`: `user: User | None = Depends(get_optional_current_user),`
- `backend/app/routers/telemetry.py:74`: `return await record_analytics_event(db, user=user, payload=payload)`
- `backend/app/security/csrf.py:30`: `"/api/client-errors",`
- `backend/app/security/csrf.py:31`: `"/api/client-events",`
- `backend/app/services/founder_ops.py:62`: `async def record_analytics_event(`
- `backend/app/services/founder_ops.py:80`: `value_int=int(payload.value_int),`
- `backend/app/services/founder_ops.py:82`: `properties_json=payload.properties,`
- `backend/app/services/founder_ops.py:205`: `ai_events = await _sum(db, AnalyticsEvent.value_int, AnalyticsEvent.event_name == "ai_quota_used", AnalyticsEvent.occurred_at >= start, AnalyticsEvent.occurred_at < end)`
- `backend/app/schemas/founder_ops.py:39`: `value_int: int = Field(default=1, ge=0, le=1_000_000)`

Impact:
`POST /api/client-events` accepts unauthenticated writes via `get_optional_current_user`, is CSRF-exempt, and persists caller-controlled event names and values into `AnalyticsEvent`. Founder metrics read those rows directly, including high-value `ai_quota_used` sums, so unauthenticated clients can manipulate operational analytics and usage reporting despite the 120/minute route limit.

Concrete fix:
Require `get_current_user` for events that feed admin/founder dashboards, or split anonymous telemetry into a separate low-trust table excluded from business metrics. For any remaining anonymous endpoint, allowlist event names, derive sensitive counters server-side, clamp or ignore `value_int`, and store only coarse anonymous metadata.

### LOW - Exam progress mutations rely only on the global default rate limit
Exact location: `backend/app/routers/exam_bank.py:67`

Evidence:
- `backend/app/routers/exam_bank.py:67`: `@router.post("/problems/{problem_id}/progress", response_model=ExamProblemProgressOut)`
- `backend/app/routers/exam_bank.py:74`: `return await record_exam_problem_progress(db, user, problem_id=problem_id, body=body)`
- `backend/app/routers/exam_bank.py:77`: `@router.post("/parts/{part_id}/progress", response_model=ExamProblemPartProgressOut)`
- `backend/app/routers/exam_bank.py:84`: `return await record_exam_problem_part_progress(db, user, part_id=part_id, body=body)`
- `backend/app/services/exam_bank.py:247`: `progress = await _get_or_create_problem_progress(db, user_id=int(user.id), problem_id=problem_id)`
- `backend/app/services/exam_bank.py:278`: `xp_awarded = await award_xp(`
- `backend/app/services/exam_bank.py:346`: `await db.commit()`
- `backend/app/rate_limit.py:19`: `DEFAULT_RATE_LIMITS = _rate_limit_values(os.environ.get(DEFAULT_RATE_LIMITS_ENV, ""), "120/minute")`
- `backend/app/main.py:218`: `app.add_middleware(SlowAPIMiddleware)`

Impact:
These authenticated endpoints do enforce user ownership/access in service code, but they mutate progress rows and one can award XP while lacking the explicit route-level limits used by adjacent course, exercise, and quiz progress writes. They therefore fall back to the broader default 120/minute budget, which is looser than the local mutation pattern for similar endpoints.

Concrete fix:
Add explicit route limits, for example `@limiter.limit("30/minute")`, to both exam progress handlers and add a `Request` parameter required by SlowAPI. Keep the existing service-level `user.id` and content-access checks.

## Endpoint Auth Table
Legend: `get_current_user` validates Kresco JWT/cookie and per-request `auth_token_version`; `get_current_professor_user` also requires professor role, verified email, and an active offering; `require_*` admin/staff dependencies wrap `require_staff_permission(...)`; `default` means SlowAPI default 120/minute plus application 600/minute from `backend/app/rate_limit.py`.

| Module | Line | Method | Endpoint | Handler | Auth dependency | Rate limit |
|---|---:|---|---|---|---|---|
| admin | 94 | GET | `/api/admin/overview` | `get_admin_overview` | `require_admin_overview_read` | 30/minute |
| admin | 105 | GET | `/api/admin/founder-dashboard` | `get_founder_dashboard` | `require_finance_read` | default |
| admin | 115 | GET | `/api/admin/finance/expenses` | `get_finance_expenses` | `require_finance_read` | default |
| admin | 126 | POST | `/api/admin/finance/expenses` | `create_admin_finance_expense` | `require_finance_expense_manage` | 10/minute |
| admin | 138 | GET | `/api/admin/redemption-templates` | `get_redemption_templates` | `require_staff_codes_admin` | default |
| admin | 147 | POST | `/api/admin/redemption-templates` | `create_admin_redemption_template` | `require_staff_codes_admin` | 10/minute |
| admin | 159 | GET | `/api/admin/staff-payment-requests` | `get_staff_payment_requests` | `require_staff_codes_admin` | default |
| admin | 169 | GET | `/api/admin/staff-payment-profiles` | `get_staff_payment_profiles` | `require_staff_codes_admin` | default |
| admin | 178 | PUT | `/api/admin/staff-payment-profiles/{user_id}` | `put_staff_payment_profile` | `require_staff_codes_admin` | 10/minute |
| admin | 191 | GET | `/api/admin/activity` | `get_admin_activity` | `require_audit_read` | default |
| admin | 200 | GET | `/api/admin/student-progress` | `get_admin_student_progress` | `require_students_progress_read` | default |
| admin | 209 | GET | `/api/admin/communications` | `get_admin_communications` | `require_communications_read` | 30/minute |
| admin | 224 | GET | `/api/admin/video-feedback` | `get_admin_video_feedback` | `require_change_requests_read` | default |
| admin | 233 | GET | `/api/admin/users-access` | `get_admin_users_access` | `require_users_read` | default |
| admin | 242 | POST | `/api/admin/users-access/students` | `create_admin_student_account_route` | `require_users_update` | 20/minute |
| admin | 259 | PATCH | `/api/admin/users-access/students/{user_id}` | `patch_admin_student_account` | `require_users_update` | 20/minute |
| admin | 278 | GET | `/api/admin/permissions` | `list_permissions` | `require_roles_manage` | default |
| admin | 289 | POST | `/api/admin/permissions` | `grant_permission` | `require_roles_manage` | 20/minute |
| admin | 310 | POST | `/api/admin/permissions/{permission_id}/revoke` | `revoke_permission` | `require_roles_manage` | 20/minute |
| admin | 331 | POST | `/api/admin/xp-adjustments` | `create_admin_xp_adjustment` | `require_xp_adjust` | 10/minute |
| admin | 350 | GET | `/api/admin/xp-audit` | `get_admin_xp_audit` | `require_audit_read` | default |
| admin | 360 | GET | `/api/admin/reports` | `list_reports` | `require_reports_manage` | default |
| admin | 382 | PATCH | `/api/admin/reports/{report_id}` | `update_report` | `require_reports_manage` | 20/minute |
| admin | 401 | POST | `/api/admin/reports/{report_id}/comment-moderation` | `moderate_reported_comment` | `require_reports_manage` | 20/minute |
| admin | 420 | POST | `/api/admin/reports/{report_id}/live-message-moderation` | `moderate_reported_live_message` | `require_reports_manage` | 20/minute |
| admin | 439 | GET | `/api/admin/change-requests` | `list_professor_change_requests_admin` | `require_change_requests_read` | default |
| admin | 450 | GET | `/api/admin/change-requests/{change_request_id}` | `get_professor_change_request_admin` | `require_change_requests_read` | default |
| admin | 459 | POST | `/api/admin/change-requests/{change_request_id}/review` | `review_professor_change_request_admin` | `require_change_requests_review` | 30/minute |
| calendar | 14 | GET | `/api/calendar/events` | `list_calendar_events` | `get_current_user`; visibility filter by staff/professor/student offering | default |
| calendar | 35 | GET | `/api/calendar/events/{event_id}` | `get_calendar_event` | `get_current_user`; visibility filter by staff/professor/student offering | default |
| courses | 84 | GET | `/api/courses/subjects` | `list_subjects` | `get_current_user` | default |
| courses | 133 | POST | `/api/courses/subjects` | `create_subject` | `get_current_user` plus staff/email check in handler | 30/minute |
| courses | 150 | POST | `/api/courses/topics` | `create_topic` | `get_current_user` plus staff/email check in handler | 30/minute |
| courses | 198 | GET | `/api/courses/topics` | `list_topics` | `get_current_user`; access model redacts locked content | default |
| courses | 210 | GET | `/api/courses/subjects/{subject_id}/topics` | `list_subject_topics` | `get_current_user`; access model redacts locked content | default |
| courses | 221 | GET | `/api/courses/subjects/{subject_id}` | `get_subject` | `get_current_user` | default |
| courses | 236 | GET | `/api/courses/topics/{topic_id}/workspace` | `get_topic_workspace` | `get_current_user`; access model redacts locked content | default |
| courses | 247 | POST | `/api/courses/topic-items/{item_id}/complete` | `complete_topic_item` | `get_current_user`; `require_topic_item_access` | 30/minute |
| courses | 260 | POST | `/api/courses/topic-items/{item_id}/progress` | `record_topic_item_progress` | `get_current_user`; `require_topic_item_access` | 30/minute |
| courses | 273 | GET | `/api/courses/topic-items/{item_id}/stream` | `get_topic_item_stream` | `get_current_user`; primary video access check | default |
| courses | 301 | POST | `/api/courses/resources/{resource_id}/open` | `open_resource` | `get_current_user`; workspace resource access check | 30/minute |
| exam_bank | 26 | GET | `/api/exam-bank` | `list_exam_bank_items` | `get_current_user`; access model redacts locked content | default |
| exam_bank | 55 | GET | `/api/exam-bank/problems/{problem_id}` | `get_exam_bank_problem` | `get_current_user`; access model redacts locked content | default |
| exam_bank | 67 | POST | `/api/exam-bank/problems/{problem_id}/progress` | `update_exam_bank_problem_progress` | `get_current_user`; user progress scoped to `user.id` | default |
| exam_bank | 77 | POST | `/api/exam-bank/parts/{part_id}/progress` | `update_exam_bank_part_progress` | `get_current_user`; user progress scoped to `user.id` | default |
| exercises | 27 | GET | `/api/exercises/subjects/{subject_id}` | `list_subject_exercises` | `get_current_user`; access model redacts locked content | default |
| exercises | 54 | GET | `/api/exercises/{exercise_id}` | `get_exercise` | `get_current_user`; access model redacts locked content | default |
| exercises | 66 | POST | `/api/exercises/{exercise_id}/reveal` | `reveal_exercise` | `get_current_user`; accessible exercise required | 30/minute |
| exercises | 79 | POST | `/api/exercises/{exercise_id}/self-grade` | `self_grade_exercise` | `get_current_user`; accessible exercise required | 30/minute |
| exercises | 98 | POST | `/api/exercises/{exercise_id}/saved` | `save_exercise` | `get_current_user`; accessible exercise required | 60/minute |
| exercises | 112 | PATCH | `/api/exercises/{exercise_id}/notes` | `update_exercise_notes_route` | `get_current_user`; active subject required | 30/minute |
| gamification | 30 | GET | `/api/progress/xp` | `get_xp` | `get_current_user`; user scoped | default |
| gamification | 38 | GET | `/api/progress/xp/history` | `get_xp_history` | `get_current_user`; user scoped | default |
| gamification | 48 | GET | `/api/progress/leaderboard` | `get_leaderboard` | `get_current_user` | default |
| gamification | 69 | GET | `/api/progress/leaderboard/seasons` | `get_season_leaderboard` | `get_current_user` | default |
| gamification | 92 | GET | `/api/progress/daily-quests` | `get_daily_quests` | `get_current_user`; may create daily quest rows | default |
| gamification | 102 | GET | `/api/progress/badges` | `get_badges` | `get_current_user`; may update badge inventory | default |
| gamification | 113 | GET | `/api/progress/concept-mastery` | `get_concept_mastery` | `get_current_user`; user scoped | default |
| gamification | 136 | GET | `/api/progress/sidebar-summary` | `get_sidebar_summary` | `get_current_user`; may create daily quest rows | default |
| gamification | 147 | GET | `/api/progress/mistakes` | `get_mistake_notebook` | `get_current_user`; user scoped | default |
| gamification | 168 | POST | `/api/progress/daily-quests/{quest_id}/claim` | `claim_daily_quest` | `get_current_user`; user scoped claim | 10/minute |
| gamification | 181 | GET | `/api/progress/stats` | `get_stats` | `get_current_user`; user scoped | default |
| interactions | 41 | GET | `/api/interactions/comments` | `list_comments` | `get_current_user`; item/comment access check | default |
| interactions | 62 | POST | `/api/interactions/comments` | `create_comment` | `get_current_user`; item/comment access check | 20/minute |
| interactions | 74 | GET | `/api/interactions/exercise-comments` | `list_comments_for_exercise` | `get_current_user`; exercise access check | default |
| interactions | 93 | POST | `/api/interactions/exercise-comments` | `create_comment_for_exercise` | `get_current_user`; exercise access check | 20/minute |
| interactions | 106 | DELETE | `/api/interactions/comments/{comment_id}` | `delete_comment` | `get_current_user`; `Comment.user_id == user.id` | 20/minute |
| interactions | 118 | GET | `/api/interactions/notes` | `list_notes` | `get_current_user`; `UserNote.user_id == user.id` | default |
| interactions | 141 | POST | `/api/interactions/notes` | `create_note` | `get_current_user`; target access check | 20/minute |
| interactions | 153 | PATCH | `/api/interactions/notes/{note_id}` | `update_note` | `get_current_user`; `UserNote.user_id == user.id` | 20/minute |
| interactions | 166 | DELETE | `/api/interactions/notes/{note_id}` | `delete_note` | `get_current_user`; `UserNote.user_id == user.id` | 20/minute |
| interactions | 178 | GET | `/api/interactions/canvas` | `get_canvas_document` | `get_current_user`; target access and `CanvasDocument.user_id == user.id` | default |
| interactions | 188 | PUT | `/api/interactions/canvas` | `put_canvas_document` | `get_current_user`; target access and `CanvasDocument.user_id == user.id` | 30/minute |
| interactions | 200 | GET | `/api/interactions/saves` | `list_saves` | `get_current_user`; `SavedItem.user_id == user.id` | default |
| interactions | 221 | POST | `/api/interactions/saves` | `save_item` | `get_current_user`; target access and `user_id` scoped save | 20/minute |
| interactions | 233 | DELETE | `/api/interactions/saves/{save_id}` | `delete_save` | `get_current_user`; `SavedItem.user_id == user.id` | 20/minute |
| internal | 29 | POST | `/api/internal/realtime/process-outbox` | `process_realtime_outbox_endpoint` | `_require_internal_secret` header | 30/minute |
| internal | 43 | POST | `/api/internal/realtime/requeue-failed-outbox` | `requeue_failed_realtime_outbox_endpoint` | `_require_internal_secret` header | 10/minute |
| internal | 56 | POST | `/api/internal/realtime/purge-outbox` | `purge_realtime_outbox_endpoint` | `_require_internal_secret` header | 10/minute |
| internal | 70 | POST | `/api/internal/leaderboard/refresh` | `refresh_leaderboard_endpoint` | `_require_internal_secret` header | 10/minute |
| internal | 84 | GET | `/api/internal/diagnostics` | `production_diagnostics_endpoint` | `_require_internal_secret` header | 30/minute |
| notifications | 26 | GET | `/api/notifications` | `list_notifications` | `get_current_user`; `Notification.user_id == user.id` | default |
| notifications | 36 | POST | `/api/notifications/read-all` | `mark_all_notifications_read` | `get_current_user`; `Notification.user_id == user.id` | 30/minute |
| notifications | 47 | DELETE | `/api/notifications` | `delete_all_notifications` | `get_current_user`; signed confirmation token for same user | 10/minute |
| notifications | 60 | GET | `/api/notifications/delete-all-confirmation` | `get_delete_all_confirmation` | `get_current_user`; token embeds user id | default |
| notifications | 72 | DELETE | `/api/notifications/{notification_id}` | `delete_notification` | `get_current_user`; `Notification.user_id == user.id` | 30/minute |
| notifications | 84 | POST | `/api/notifications/{notification_id}/read` | `mark_notification_read` | `get_current_user`; `Notification.user_id == user.id` | 30/minute |
| payments | 67 | POST | `/api/payments/payment-requests` | `create_payment_request` | `get_current_user`; transaction user is current user | 10/minute |
| payments | 86 | GET | `/api/payments/payment-requests/current` | `get_current_payment_request` | `get_current_user`; transaction query filters current user | default |
| payments | 94 | POST | `/api/payments/redemption-codes/redeem` | `redeem_redemption_code` | `get_current_user`; code secret plus current user redemption | 10/minute |
| payments | 106 | GET | `/api/payments/manual-payment-requests` | `list_manual_payment_requests` | `require_finance_read` | default |
| payments | 116 | GET | `/api/payments/finance/ledger` | `list_finance_ledger` | `require_finance_read` | default |
| payments | 126 | GET | `/api/payments/finance/provider-events` | `list_finance_provider_events` | `require_finance_read` | default |
| payments | 136 | GET | `/api/payments/finance/payment-monitoring-summary` | `get_finance_payment_monitoring_summary` | `require_finance_read` | default |
| payments | 144 | GET | `/api/payments/manual-payment-reconciliation-imports` | `list_manual_payment_reconciliation_imports` | `require_finance_read` | default |
| payments | 153 | GET | `/api/payments/finance/reconciliation-rows` | `list_finance_reconciliation_rows` | `require_finance_read` | default |
| payments | 175 | GET | `/api/payments/finance/exports` | `list_finance_export_records` | `require_finance_read` | default |
| payments | 184 | POST | `/api/payments/finance/exports` | `create_finance_export_record` | `require_finance_export` | 5/minute |
| payments | 196 | GET | `/api/payments/finance/manual-access-grants` | `list_manual_access_grant_records` | `require_finance_read` | default |
| payments | 206 | POST | `/api/payments/finance/manual-access-grants` | `create_manual_access_grant_record` | `require_finance_manual_grant` | 10/minute |
| payments | 218 | GET | `/api/payments/finance/refund-requests` | `list_refund_request_records` | `require_finance_read` | default |
| payments | 236 | POST | `/api/payments/finance/refund-requests` | `create_refund_request_record` | `require_finance_refund` | 10/minute |
| payments | 248 | POST | `/api/payments/finance/refund-requests/{refund_request_id}/approve` | `approve_refund_request_record` | `require_finance_refund` | 10/minute |
| payments | 261 | POST | `/api/payments/finance/refund-requests/{refund_request_id}/reject` | `reject_refund_request_record` | `require_finance_refund` | 10/minute |
| payments | 274 | POST | `/api/payments/manual-payment-requests/reconcile` | `reconcile_manual_payment_request` | `require_finance_payment_review`; self-reconcile blocked | 20/minute |
| payments | 290 | POST | `/api/payments/manual-payment-reconciliation-imports` | `import_manual_payment_reconciliation_request` | `require_finance_payment_review` | 5/minute |
| payments | 306 | POST | `/api/payments/manual-payment-requests/{transaction_id}/proof` | `submit_manual_payment_request_proof` | `get_current_user`; transaction filters `user_id` | 10/minute |
| payments | 324 | POST | `/api/payments/manual-payment-requests/{transaction_id}/approve` | `approve_manual_payment_request` | `require_finance_payment_review`; self-approve blocked | 20/minute |
| payments | 342 | POST | `/api/payments/manual-payment-requests/{transaction_id}/reject` | `reject_manual_payment_request` | `require_finance_payment_review` | 20/minute |
| payments | 360 | POST | `/api/payments/cmi/callback` | `cmi_callback` | no user auth; signed CMI callback verified in service | 60/minute |
| professor | 113 | GET | `/api/professor/dashboard` | `get_professor_dashboard` | `get_current_professor_user`; active offering required | default |
| professor | 121 | GET | `/api/professor/offerings` | `list_professor_offerings` | `get_current_professor_user`; filters `professor_user_id` | default |
| professor | 134 | GET | `/api/professor/live-provider-config` | `get_live_provider_config` | `get_current_professor_user` | default |
| professor | 153 | GET | `/api/professor/live-sessions` | `list_live_sessions` | `get_current_professor_user`; offering ownership checked | default |
| professor | 170 | GET | `/api/professor/live-sessions/{live_session_id}/embed` | `get_professor_live_embed` | `get_current_professor_user`; `LiveSession.professor_user_id` | default |
| professor | 187 | POST | `/api/professor/live-sessions/{live_session_id}/stream-credentials/reveal` | `reveal_professor_live_stream_credentials` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 206 | POST | `/api/professor/live-sessions` | `create_live_session` | `get_current_professor_user`; offering ownership checked | 60/minute |
| professor | 227 | DELETE | `/api/professor/live-sessions/{live_session_id}` | `delete_live_session` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 243 | PATCH | `/api/professor/live-sessions/{live_session_id}` | `update_live_session` | `get_current_professor_user`; session/offering ownership checked | 60/minute |
| professor | 265 | POST | `/api/professor/live-sessions/{live_session_id}/cancel` | `cancel_live_session` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 285 | GET | `/api/professor/student-live-sessions` | `list_student_live_sessions` | `get_current_user`; student offering filters | default |
| professor | 295 | GET | `/api/professor/student-live-sessions/{live_session_id}/embed` | `get_student_live_embed` | `get_current_user`; student offering filters | default |
| professor | 314 | GET | `/api/professor/live-sessions/{live_session_id}/interactions` | `list_professor_live_interactions` | `get_current_professor_user`; `LiveSession.professor_user_id` | default |
| professor | 335 | PATCH | `/api/professor/live-sessions/interactions/{interaction_id}` | `update_professor_live_interaction` | `get_current_professor_user`; `LiveSessionInteraction.professor_user_id` | 60/minute |
| professor | 357 | DELETE | `/api/professor/live-sessions/interactions/{interaction_id}` | `delete_professor_live_interaction` | `get_current_professor_user`; `LiveSessionInteraction.professor_user_id` | 60/minute |
| professor | 377 | GET | `/api/professor/student-live-sessions/{live_session_id}/interactions` | `list_student_live_interactions` | `get_current_user`; student offering filters | default |
| professor | 396 | POST | `/api/professor/student-live-sessions/{live_session_id}/interactions` | `create_student_live_interaction` | `get_current_user`; student offering filters plus burst limit | 20/minute |
| professor | 418 | GET | `/api/professor/live-sessions/{live_session_id}/checkpoints` | `list_professor_live_checkpoints` | `get_current_professor_user`; `LiveSession.professor_user_id` | default |
| professor | 435 | POST | `/api/professor/live-sessions/{live_session_id}/checkpoints` | `create_professor_live_checkpoint` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 457 | PATCH | `/api/professor/live-sessions/checkpoints/{checkpoint_id}` | `update_professor_live_checkpoint` | `get_current_professor_user`; `LiveSessionCheckpoint.professor_user_id` | 60/minute |
| professor | 479 | GET | `/api/professor/student-live-sessions/{live_session_id}/checkpoints` | `list_student_live_checkpoints` | `get_current_user`; student offering filters | default |
| professor | 488 | POST | `/api/professor/live-sessions/{live_session_id}/notify` | `notify_live_session` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 508 | POST | `/api/professor/live-sessions/{live_session_id}/start` | `start_live_session` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 528 | POST | `/api/professor/live-sessions/{live_session_id}/end` | `end_live_session` | `get_current_professor_user`; `LiveSession.professor_user_id` | 60/minute |
| professor | 548 | GET | `/api/professor/change-requests` | `list_change_requests` | `get_current_professor_user`; allowed offering ids | default |
| professor | 565 | POST | `/api/professor/change-requests` | `create_change_request` | `get_current_professor_user`; target belongs to offering | 60/minute |
| professor | 581 | GET | `/api/professor/studio/offerings/{offering_id}/tree` | `get_studio_tree` | `get_current_professor_user`; offering ownership checked | default |
| professor | 590 | POST | `/api/professor/studio/change-requests` | `submit_studio_changes` | `get_current_professor_user`; operation targets checked against offering | 60/minute |
| professor | 606 | GET | `/api/professor/studio/change-requests/{change_request_id}` | `get_studio_change_request` | `get_current_professor_user`; request offering ownership checked | default |
| professor | 615 | PUT | `/api/professor/studio/change-requests/{change_request_id}` | `update_studio_changes` | `get_current_professor_user`; request/offering targets checked | 60/minute |
| professor | 633 | DELETE | `/api/professor/studio/change-requests/{change_request_id}` | `withdraw_studio_changes` | `get_current_professor_user`; request offering ownership checked | 60/minute |
| professor | 646 | GET | `/api/professor/chat/conversations` | `list_professor_conversations` | `get_current_professor_user`; filters `professor_user_id` | default |
| professor | 669 | GET | `/api/professor/chat/conversations/{conversation_id}/messages` | `list_professor_messages` | `get_current_professor_user`; conversation professor ownership | default |
| professor | 688 | POST | `/api/professor/chat/conversations/{conversation_id}/messages` | `send_professor_message` | `get_current_professor_user`; conversation professor ownership | 30/minute |
| professor | 711 | POST | `/api/professor/chat/conversations/{conversation_id}/images` | `send_professor_image_message` | `get_current_professor_user`; conversation professor ownership | 10/minute |
| professor | 736 | PATCH | `/api/professor/chat/messages/{message_id}` | `update_chat_message` | `get_current_user`; sender and conversation participant ownership | 30/minute |
| professor | 757 | DELETE | `/api/professor/chat/messages/{message_id}` | `delete_chat_message` | `get_current_user`; sender and conversation participant ownership | 30/minute |
| professor | 775 | PATCH | `/api/professor/chat/conversations/{conversation_id}` | `patch_professor_conversation` | `get_current_professor_user`; conversation professor ownership | 30/minute |
| professor | 795 | GET | `/api/professor/student-chat` | `get_student_professor_chat` | `get_current_user`; student offering/chat access | default |
| professor | 806 | POST | `/api/professor/student-chat/conversations` | `start_student_conversation` | `get_current_user`; student matches offering and chat access | 20/minute |
| professor | 827 | GET | `/api/professor/student-chat/conversations/{conversation_id}/messages` | `list_student_messages` | `get_current_user`; conversation student ownership | default |
| professor | 846 | POST | `/api/professor/student-chat/conversations/{conversation_id}/read` | `mark_student_conversation_read` | `get_current_user`; conversation student ownership | 20/minute |
| professor | 864 | POST | `/api/professor/student-chat/conversations/{conversation_id}/messages` | `send_student_message` | `get_current_user`; conversation student ownership | 20/minute |
| professor | 887 | POST | `/api/professor/student-chat/conversations/{conversation_id}/images` | `send_student_image_message` | `get_current_user`; conversation student ownership | 6/minute |
| quizzes | 32 | GET | `/api/quizzes/subjects/{subject_id}/discovery` | `get_subject_quiz_discovery` | `get_current_user`; access model checks parent content | default |
| quizzes | 84 | GET | `/api/quizzes/{question_set_id}` | `get_quiz` | `get_current_user`; access model checks parent content | default |
| quizzes | 94 | GET | `/api/quizzes/{question_set_id}/attempts` | `get_quiz_attempt_history` | `get_current_user`; attempts scoped to user in service | default |
| quizzes | 112 | POST | `/api/quizzes/{question_set_id}/submit` | `submit_quiz` | `get_current_user`; accessible quiz required | 20/minute |
| realtime | 12 | GET | `/api/realtime/subscriptions` | `get_realtime_subscriptions` | `get_current_user`; channels scoped by user/offering access | default |
| reports | 13 | POST | `/api/reports` | `create_report` | `get_current_user`; reporter must be able to view target | 20/minute |
| staff | 16 | GET | `/api/staff/payments/dashboard` | `get_staff_payment_dashboard` | `require_staff_codes` | default |
| staff | 25 | POST | `/api/staff/payments/requests` | `create_staff_payment_code` | `require_staff_codes`; profile/template quota checks | 10/minute |
| telemetry | 30 | POST | `/api/client-errors` | `record_client_error` | none; telemetry/log-only side effect | 60/minute |
| telemetry | 65 | POST | `/api/client-events` | `record_client_event` | `get_optional_current_user`; DB write - see finding | 120/minute |
| users | 196 | POST | `/api/auth/mobile-session` | `mobile_session` | none; Firebase credential verified | `KRESCO_AUTH_LOGIN_RATE_LIMIT`, default 5/minute |
| users | 209 | POST | `/api/auth/firebase-session` | `firebase_session` | none; Firebase credential verified | `KRESCO_AUTH_LOGIN_RATE_LIMIT`, default 5/minute |
| users | 222 | POST | `/api/google-login` | `google_login` | none; Firebase credential verified | `KRESCO_AUTH_LOGIN_RATE_LIMIT`, default 5/minute |
| users | 235 | POST | `/api/auth/logout` | `logout` | none; revokes valid cookie token if present | `KRESCO_AUTH_SESSION_RATE_LIMIT`, default 20/minute |
| users | 252 | GET | `/api/auth/csrf` | `csrf_token` | `get_current_user` | default |
| users | 269 | GET | `/api/profile/me` | `get_profile` | `get_current_user` | default |
| users | 277 | PATCH | `/api/profile/me` | `update_profile` | `get_current_user`; only `UserUpdateIn` fields, track boundary enforced | `KRESCO_PROFILE_MUTATION_RATE_LIMIT`, default 20/minute |
| users | 290 | POST | `/api/profile/me/media/{kind}` | `upload_profile_media` | `get_current_user`; kind and image validation | `KRESCO_PROFILE_MEDIA_RATE_LIMIT`, default 10/minute |

## Leads
1. `backend/app/services/exercise_bank.py:328` and `backend/app/routers/exercises.py:34` - verify whether the `concept` filter should use the existing escaped `substring_search_pattern` helper and a `Query(max_length=...)`; current SQLAlchemy binding avoids raw SQL injection, but `%`/`_` wildcard semantics and unbounded concept length remain a precise performance/semantic question.
2. `backend/app/services/payment_gateway.py:1934` - verify against current CMI documentation whether `_cmi_callback_hash_sorted(...)` must remain accepted alongside `HASHPARAMS`; if CMI requires only `HASHPARAMS`, remove the sorted-hash fallback to narrow the signed webhook surface.
