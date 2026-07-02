# Backend Security Follow-up

## Summary
- `git status --short` was run first. The working tree had `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`; the backend source files cited below were not modified/untracked, so no backend findings require `[WIP-PROVISIONAL]`.
- Required audit context was read in full: `docs/audits/_state.md`, `docs/audits/00-MASTER-REPORT.md`, and `docs/audits/01-backend-security.md`.
- Confirmed current backend code still has three actionable issues: exercise concept search lacks wildcard escaping/query length bounds, anonymous analytics writes still feed founder metrics, and exam progress mutations still lack route-level limits.
- CMI sorted callback hash fallback remains an external-state lead. Current public CMI material found during this pass did not provide the official callback hash algorithm/order needed to prove whether the fallback is still required.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### MEDIUM - Exercise concept filter still treats caller wildcards as SQL LIKE wildcards and has no query length bound

Exact location: `backend/app/services/exercise_bank.py:328`

Quoted evidence:
- `backend/app/routers/exercises.py:34`: `concept: str | None = None,`
- `backend/app/services/exercise_bank.py:306`: `concept = _normalize_filter(filters["concept"])`
- `backend/app/services/exercise_bank.py:328`: `conditions.append(cast(Exercise.concept_slugs, String).ilike(f"%{concept}%"))`
- Existing safe helper available at `backend/app/services/search.py:1`: `LIKE_ESCAPE = "\\"`
- Existing safe helper available at `backend/app/services/search.py:16`: `def escape_like_wildcards(value: str) -> str:`
- Existing safe helper available at `backend/app/services/search.py:25`: `def substring_search_pattern(value: str) -> str:`

Impact:
`concept` is authenticated but public user input. It is interpolated into the bound `ilike` pattern as a value, so this is not raw SQL injection, but `%`, `_`, and `\` retain LIKE wildcard semantics and can broaden scans over `cast(Exercise.concept_slugs, String)`. The route also accepts an unconstrained string, unlike the existing `MAX_SUBSTRING_SEARCH_CHARS = 80` search helper boundary.

Concrete fix:
In `backend/app/routers/exercises.py`, import `Query` and define `concept: str | None = Query(default=None, max_length=80)`. In `backend/app/services/exercise_bank.py`, reuse `normalize_substring_search`, `substring_search_pattern`, and `LIKE_ESCAPE`; apply `cast(Exercise.concept_slugs, String).ilike(substring_search_pattern(concept), escape=LIKE_ESCAPE)` only after normalization returns a non-empty term.

### HIGH - Anonymous analytics events still write metric-bearing rows consumed by founder dashboards

Exact location: `backend/app/routers/telemetry.py:65`

Quoted evidence:
- `backend/app/routers/telemetry.py:65`: `@router.post("/client-events", response_model=AnalyticsEventOut, status_code=202)`
- `backend/app/routers/telemetry.py:66`: `@limiter.limit("120/minute")`
- `backend/app/routers/telemetry.py:71`: `user: User | None = Depends(get_optional_current_user),`
- `backend/app/security/csrf.py:31`: `"/api/client-events",`
- `backend/app/schemas/founder_ops.py:30`: `event_name: str = Field(min_length=2, max_length=80)`
- `backend/app/schemas/founder_ops.py:39`: `value_int: int = Field(default=1, ge=0, le=1_000_000)`
- `backend/app/services/founder_ops.py:70`: `event_name=payload.event_name,`
- `backend/app/services/founder_ops.py:80`: `value_int=int(payload.value_int),`
- `backend/app/services/founder_ops.py:205`: `ai_events = await _sum(db, AnalyticsEvent.value_int, AnalyticsEvent.event_name == "ai_quota_used", AnalyticsEvent.occurred_at >= start, AnalyticsEvent.occurred_at < end)`
- `backend/app/services/founder_ops.py:216`: `AnalyticsEvent.event_name == "live_joined",`

Impact:
The exact allowlist/auth fix is not present. `POST /api/client-events` still accepts optional auth, is CSRF-exempt, accepts arbitrary `event_name` strings, and stores caller-controlled `value_int`. Founder metrics then aggregate selected `AnalyticsEvent` rows directly, including `ai_quota_used`, video events, and `live_joined`, so unauthenticated traffic can still poison business/usage metrics within the 120/minute endpoint limit.

Concrete fix:
Require `get_current_user` for any event stored in `AnalyticsEvent` and remove `/api/client-events` from `UNAUTHENTICATED_AUTH_PATHS`, or split anonymous telemetry into a separate low-trust table excluded from founder/admin dashboards. Add an explicit event-name allowlist for accepted client events, reject or ignore `value_int` for client-submitted metric-bearing names, and derive sensitive counters such as AI quota usage server-side.

### MEDIUM - Exam progress mutations still lack explicit route-level rate limits

Exact location: `backend/app/routers/exam_bank.py:67`

Quoted evidence:
- `backend/app/routers/exam_bank.py:3`: `from fastapi import APIRouter, Depends, HTTPException`
- `backend/app/routers/exam_bank.py:67`: `@router.post("/problems/{problem_id}/progress", response_model=ExamProblemProgressOut)`
- `backend/app/routers/exam_bank.py:68`: `async def update_exam_bank_problem_progress(`
- `backend/app/routers/exam_bank.py:74`: `return await record_exam_problem_progress(db, user, problem_id=problem_id, body=body)`
- `backend/app/routers/exam_bank.py:77`: `@router.post("/parts/{part_id}/progress", response_model=ExamProblemPartProgressOut)`
- `backend/app/routers/exam_bank.py:78`: `async def update_exam_bank_part_progress(`
- `backend/app/routers/exam_bank.py:84`: `return await record_exam_problem_part_progress(db, user, part_id=part_id, body=body)`
- Adjacent progress pattern at `backend/app/routers/courses.py:248`: `@limiter.limit(COURSE_PROGRESS_MUTATION_RATE_LIMIT)`
- Adjacent progress pattern at `backend/app/routers/exercises.py:67`: `@limiter.limit("30/minute")`
- Default only at `backend/app/rate_limit.py:19`: `DEFAULT_RATE_LIMITS = _rate_limit_values(os.environ.get(DEFAULT_RATE_LIMITS_ENV, ""), "120/minute")`

Impact:
The exact route-level rate-limit change has not been made. The two authenticated exam progress POST routes mutate user progress and can award/alter progress state, but they fall back to the global default 120/minute budget rather than matching the tighter adjacent course/exercise/quiz mutation posture.

Concrete fix:
In `backend/app/routers/exam_bank.py`, import `Request` and `limiter`, add `@limiter.limit("30/minute")` to both progress handlers, add a `request: Request` parameter required by SlowAPI, and `del request` inside each handler. Add focused FastAPI tests asserting the decorators are active for both problem and part progress mutations.

## Leads - precise remaining external-state questions or `None`

1. CMI sorted callback hash fallback remains an external-state lead. Current code accepts both `_cmi_callback_hash_sorted(...)` and `_cmi_hash_from_hashparams(...)` at `backend/app/services/payment_gateway.py:1934`-`1937`, and the sorted fallback is defined at `backend/app/services/payment_gateway.py:1959`-`1968`. Public CMI material found in this pass confirms CMI e-commerce uses a signed integration flow and that merchants receive a technical integration kit after affiliation, but it did not expose the current official callback hash order. The official test merchant page confirms `3D PAY HOSTING` and `ver3` are active options, while a third-party Odoo module documents both sorted-parameter verification and honoring `HASHPARAMS`; because that third-party source is not authoritative, the remaining question is: obtain the current CMI ECOM integration kit or provider support answer and verify whether callbacks without `HASHPARAMS` must still be accepted. Sources checked: [CMI e-commerce page](https://www.cmi.co.ma/fr/solutions-paiement-ecommerce), [CMI e-commerce PDF](https://www.cmi.co.ma/sites/default/files/cmi_solutions_livret_e-com.pdf), [CMI test merchant page](https://testpayment.cmi.co.ma/fim/est3dteststoreutf8?pagelang=en), and [Odoo third-party CMI module](https://apps.odoo.com/apps/modules/18.0/pay_ma_cmi).
