# SIMPLIFICATION_DUMP.md

Agent-friendly queue for behavior-preserving simplification work.

This file is for maintainability only. Use `AGENT_BUG_DUMP.md` for correctness
bugs, release blockers, security issues, broken tests, and data-loss risks.

## Start Here

If you are a cheap scout agent:

1. Stay read-only unless the user explicitly says you may edit this dump.
2. Investigate one scope only.
3. Deduplicate against this file before reporting.
4. Return one of these outputs:
   - a complete new `SIMP-*` block
   - extra evidence for an existing `SIMP-*`
   - a duplicate/stale rejection note
   - `NO_FINDING`

If you are a stronger fixing agent:

1. Pick one `Status: OPEN` item.
2. Validate it against current code.
3. Fix only that item if it is still worthwhile.
4. Preserve behavior and public contracts.
5. Run focused validation.
6. Update this dump with the outcome.
7. Commit only the scoped simplification when practical.

## Non-Negotiable Rules

- Do not mix bug fixes and simplification work unless the simplification directly
  supports the active bug fix.
- Do not create broad rewrite plans.
- Do not report style-only preferences.
- Do not report "this file is large" unless there is a concrete repeated pattern,
  unclear boundary, or behavior-preserving extraction path.
- Same root cause means one item.
- If a finding can produce wrong behavior, failed deploys, data loss, auth leaks,
  billing errors, or broken tests, move it to `AGENT_BUG_DUMP.md`.

## Safe Scout Commands

Prefer:

```powershell
git status --short --branch
rg -n "<symbol-or-concept>"
rg --files
git grep -n "<symbol-or-concept>"
Get-Content <path> -TotalCount 200
```

Avoid unless explicitly asked:

```powershell
python -m pytest
npm test
npm run build
ruff
prettier
eslint --fix
alembic upgrade
```

Never run mutation commands as a scout:

```powershell
git add
git commit
git checkout
git reset
npm install
pip install
Remove-Item
Move-Item
```

## Good Scout Scopes

- `payments`
- `live sessions`
- `gamification`
- `topic workspace frontend`
- `quizzes and exams`
- `notifications and realtime`
- `auth and onboarding`
- `admin and course authoring`
- `full repo pass`

## Agent Output Contract

Cheap scout agents should output exactly one of these forms.

### New Item Output

```md
### SIMP-XXX - <short title>

Status: OPEN
Area: <scope>
Risk: low / medium / high
Expected payoff: small / medium / large

Files:
- `<path>`
- `<path>`

Current complexity:
<specific, evidence-backed explanation>

Evidence:
- `<path>`: `<function/component/class>` <specific observation>
- `<path>`: `<function/component/class>` <specific observation>

Suggested simplification:
<smallest behavior-preserving change>

Must preserve:
- <contract/behavior/edge case>

Good first validation:
- `<test command, test file, or manual check>`

Why not a duplicate:
<what you searched and why existing SIMP items do not cover this>

Notes for fixing agent:
- Start with `<path/function>`.
- Avoid `<risky area>`.
```

### Existing Item Evidence Output

```md
APPEND_TO: SIMP-XXX

Evidence:
- `<path>`: <new supporting evidence>

Why same root cause:
<one sentence>
```

### Rejection Output

```md
REJECTED_OR_DUPLICATE

Candidate: <short title>
Reason: duplicate / stale / bug-dump / style-only / insufficient evidence
Details: <one to three sentences>
```

### No Finding Output

```md
NO_FINDING

Scope reviewed: <scope>
Files inspected:
- `<path>`
- `<path>`
Reason: <one to three sentences>
```

## Deduplication Rules

Before creating a new `SIMP-*` item:

1. Search this file for related files, services, components, route names, and concepts.
2. If the same root cause already exists, append evidence to that existing item.
3. If the new finding is just another symptom of the same abstraction problem, merge it.
4. If the finding is actually a correctness problem, move it to `AGENT_BUG_DUMP.md`.
5. If the finding is only style preference, do not add it.

Same root cause means one item.

Examples:

- Three components duplicating the same API hydration logic should be one item.
- Five routes missing the same shared authorization helper should be one item.
- A giant file and duplicated behavior inside that same file should usually be one item.
- A performance bug that can return wrong data belongs in `AGENT_BUG_DUMP.md`, not here.

## Severity / Payoff

Use these values consistently.

Risk:

- `low`: mostly local, behavior is easy to preserve, tests are obvious.
- `medium`: touches shared helpers, contracts, or multiple screens/routes.
- `high`: crosses auth, payments, migrations, entitlement logic, or provider calls.

Expected payoff:

- `small`: cleaner local code or fewer repeated branches.
- `medium`: fewer future bugs in an area or easier tests.
- `large`: removes a repeated pattern, shared hazard, or major source of maintenance cost.

## Status Values

- `OPEN`: validated enough to keep in the queue.
- `NEEDS_VALIDATION`: plausible, but a stronger agent must confirm before fixing.
- `IN_PROGRESS`: a fixing agent is actively working it.
- `FIXED`: implemented and validated.
- `STALE`: no longer applies to current code.
- `DUPLICATE`: merged into another `SIMP-*`.
- `MOVED_TO_BUG_DUMP`: became a correctness bug.
- `DEFERRED`: valid but too risky or not worth doing now.

## Active Simplification Opportunities

Add real items below this line. Keep newest items below the template unless a
coordinator asks for a different order.

### SIMP-001 - Extract student track and subject scope filtering

Status: FIXED
Area: notifications and realtime
Risk: medium
Expected payoff: medium

Files:
- `backend/app/services/realtime_access.py`
- `backend/app/services/professor_queries.py`

Current complexity:
The logic to filter `CourseOffering` and `LiveSession` rows for a student by their `niveau`, `filiere`, track/offering `status == "active"`, and `access_context.subject_scope_enforced` is duplicated manually as inline SQLAlchemy conditions across multiple read operations. This increases the risk of forgetting a condition in future realtime or course queries.

Evidence:
- `backend/app/services/realtime_access.py`: `live_session_ids_for_user` manually builds a `filters` list checking track, active status, and subject scope.
- `backend/app/services/realtime_access.py`: `offering_ids_for_user` copies the exact same `filters` list.
- `backend/app/services/professor_queries.py`: `student_live_sessions` uses the exact same manual filter list.
- `backend/app/services/professor_queries.py`: `require_student_live_session` manually checks track and active status alongside the subject entitlement check.

Suggested simplification:
Extract a shared `student_offering_filters(student: User, access_context: AccessContext)` helper in `app.services.access` or `app.services.professor_queries` that returns the standard SQLAlchemy filter conditions for track matching, active status, and subject scoping, then reuse it in realtime access and professor queries.

Must preserve:
- Subject scope enforcement when `access_context.subject_scope_enforced` is true.
- Track filtering by `niveau` and `filiere`.
- `CourseOffering` and `ProgramTrack` active status requirements.

Good first validation:
- `python -m pytest tests_fastapi/test_realtime.py tests_fastapi/test_professor_platform.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "niveau" and "subject_scope" and found no existing SIMP items tracking this duplicated query logic.

Notes for fixing agent:
- Start with `backend/app/services/realtime_access.py`.
- Avoid touching the `AccessContext` tier resolution rules in `access.py`.

Fix outcome:
- 2026-06-04: Added `student_offering_filters` in `backend/app/services/realtime_access.py` and reused it in realtime access plus student live-session queries. `require_student_live_session` uses only the active track/offering portion to preserve its existing subject-entitlement 403 behavior.
- Validation: `python -m pytest tests_fastapi/test_realtime.py tests_fastapi/test_professor_platform.py` from `backend/` passed.

### SIMP-006 - Consolidate staff access verification logic

Status: INVALID
Area: admin and course authoring
Risk: medium
Expected payoff: medium

Files:
- `backend/app/dependencies.py`
- `backend/app/admin/auth.py`

Current complexity:
Staff authorization rules are divided and inconsistent between FastAPI route dependencies (`get_current_staff_user`) and SQLAdmin's authentication backend (`StaffAdminAuth.login`). Currently, `StaffAdminAuth` checks `user.is_email_verified` while `get_current_staff_user` relies on `get_current_user` which only checks `is_active`. This creates an unclear boundary where an unverified staff account could query `/api/admin/overview` but be blocked from the SQLAdmin panel.

Evidence:
- `backend/app/dependencies.py`: `get_current_staff_user` delegates to `get_current_user` (which verifies `is_active`) and then only checks `not user.is_staff`.
- `backend/app/admin/auth.py`: `StaffAdminAuth.login` explicitly requires `not user.is_email_verified` to be false alongside `is_active` and `is_staff`.

Suggested simplification:
Extract a single `def is_valid_staff_user(user: User) -> bool:` helper in `app.services.auth` or `app.dependencies` that asserts `is_active`, `is_staff`, and `is_email_verified`. Use this shared helper in both `get_current_staff_user` and `StaffAdminAuth.login`.

Must preserve:
- Password validation and unusable password checks specific to the SQLAdmin form login.
- The HTTP 403 API response for unauthorized FastAPI routes.

Good first validation:
- `python -m pytest tests_fastapi/test_sqladmin_auth.py tests_fastapi/test_admin_overview.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "admin" and "staff" and found no existing SIMP items addressing this divergent validation.

Notes for fixing agent:
- **Validity Update (Scout Analysis): DEFERRED/QUESTIONABLE.** While true that StaffAdminAuth.login checks is_email_verified and get_current_staff_user does not, this is likely an intentional product boundary. SQLAdmin provides direct database manipulation access, whereas FastAPI endpoints just read/write specific API data. Unifying these boundaries blindly might break intended access rules. Do not merge without product validation.
- Start with `backend/app/dependencies.py`.
- Ensure tests still pass when unverified staff users are blocked from API endpoints.

Invalidation:
- 2026-06-04 continuation: Current code confirms this is not behavior-preserving duplication. SQLAdmin login/session validation includes verified email, password usability, password verification, admin session state, and audit logging. The FastAPI dependency inherits active-token validation from `get_current_user` and only checks `is_staff`. Forcing a single `is_valid_staff_user` contract would change API access semantics, so this belongs in product/security policy work, not simplification.

---

### SIMP-007 - Deduplicate topic item access and context hydration

Status: FIXED
Area: admin and course authoring
Risk: low
Expected payoff: medium

Files:
- `backend/app/services/course_access.py`

Current complexity:
`require_topic_item_primary_video_resource_access` manually inlines the exact database query, 404 checks, and `access_context` derivation steps that are already encapsulated by `require_topic_item_access` and `access_for_topic_item`. This duplicated query logic and manual authorization branching creates drift risk if topic item constraints change.

Evidence:
- `backend/app/services/course_access.py`: `require_topic_item_access` performs `select(TopicItem)` with `selectinload(TopicItem.topic)`, handles 404s, and calls `access_for_topic_item`.
- `backend/app/services/course_access.py`: `require_topic_item_primary_video_resource_access` repeats the identical `select(TopicItem)` query, 404 checks, `build_access_context`, and `decide_child` logic manually before retrieving the video resource.

Suggested simplification:
Refactor `require_topic_item_access` to return a tuple of `(TopicItem, AccessContext, AccessDecision)` or extract an internal `_require_topic_item_access_with_context` helper, then use it inside `require_topic_item_primary_video_resource_access` to eliminate the duplicated model fetch and authorization derivation.

Must preserve:
- `require_topic_item_primary_video_resource_access` must still authorize the fetched `Resource` against the inherited `item_access` decision using `decide_child`.

Good first validation:
- `python -m pytest tests_fastapi/test_course_access.py tests_fastapi/test_course_interactions.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md and found no entries related to `require_topic_item` or course access queries.

Notes for fixing agent:
- Start with `backend/app/services/course_access.py`.
- Be mindful of avoiding duplicate `build_access_context` database calls.

Fix outcome:
- 2026-06-04: Added `_require_topic_item_access_with_context` in `backend/app/services/course_access.py`; both topic-item access checks now share the fetch, access context, and access decision path while the primary-video path keeps its explicit topic/resource errors.
- Validation: `python -m pytest tests_fastapi/test_course_access.py tests_fastapi/test_course_interactions.py -k topic_item` from `backend/` passed.

---

### SIMP-000 - Template item, copy then replace

Status: TEMPLATE

Area: `<area>`

Files:

- `<path>`
- `<path>`

Current complexity:

Describe what is complicated today. Be specific about the behavior, branching,
duplication, file size, service boundary, or state management problem.

Evidence:

- `<path>`: `<function/component/class>` does `<specific thing>`.
- `<path>`: duplicate or overlapping behavior appears in `<specific place>`.

Suggested simplification:

Describe the smallest behavior-preserving simplification. Avoid vague rewrite
language. Name the helper, boundary, deleted fallback, extracted component, or
consolidated test shape if obvious.

Expected payoff: small / medium / large

Risk: low / medium / high

Why not a duplicate:

Explain how this differs from existing `SIMP-*` items.

Must preserve:

- Existing API response shape, UI behavior, authorization, provider behavior, or data contract.
- Important edge cases.

Good first validation:

- `<test command, test file, or focused manual check>`

Notes for fixing agent:

- Start with `<file/function>`.
- Avoid touching `<risky area>`.

---

### SIMP-001 - Extract duplicated live session utility functions

Status: FIXED
Area: live sessions
Risk: low
Expected payoff: small

Files:
- `frontend/app/(dashboard)/live/[sessionId]/page.tsx`
- `frontend/app/professor/live/[sessionId]/page.tsx`

Current complexity:
Both the student and professor live session pages duplicate identical utility functions for formatting dates, formatting short times, and validating Ably realtime interaction messages via a type guard.

Evidence:
- `frontend/app/(dashboard)/live/[sessionId]/page.tsx`: Duplicates `formatDateTime`, `formatShortTime`, and `isLiveInteraction` functions at the bottom of the file.
- `frontend/app/professor/live/[sessionId]/page.tsx`: Duplicates the exact same `formatDateTime`, `formatShortTime`, and `isLiveInteraction` functions at the bottom of the file.
- **Validity Update (Scout Analysis):** `formatDateTime` is actually duplicated inline in at least 5 different page files! Also found in `frontend/app/(dashboard)/live/page.tsx`, `frontend/app/professor/live/page.tsx`, and `frontend/app/professor/page.tsx`. This greatly increases the payoff of extraction.

Suggested simplification:
Extract `formatDateTime`, `formatShortTime`, and `isLiveInteraction` into `frontend/lib/liveInteractions.ts` (or a dedicated `dateUtils.ts` for the date formatters) and import them into all 5 pages to remove the massive duplication.

Must preserve:
- The precise `Intl.DateTimeFormat` configurations.
- The `value is LiveSessionInteraction` type narrowing used in the Ably realtime message handler.

Good first validation:
- `npm run build` or `npx tsc --noEmit` to ensure imports and types match perfectly.

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for `formatDateTime`, `isLiveInteraction`, and `live session`. There are no existing entries covering these exact duplicated helpers.

Notes for fixing agent:
- Start with `frontend/lib/liveInteractions.ts` or `frontend/lib/dateUtils.ts`.
- Remove the duplicated definitions and update the imports in all 5 page files.

Fix outcome:
- 2026-06-04: Added shared `formatLiveDateTime`, `formatLiveShortTime`, and `isLiveInteraction` exports in `frontend/lib/liveInteractions.ts`; removed duplicate local helpers from the student/professor live pages and professor dashboard page.
- Validation: `npm run test -- liveSessionData` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-002 - Centralize email normalization and user lookup

Status: FIXED
Area: auth and onboarding
Risk: medium
Expected payoff: medium

Files:
- `backend/app/services/auth_account.py`
- `backend/app/services/auth_email_dispatch.py`
- `backend/app/services/auth_signup.py`
- `backend/app/services/auth_google.py`

Current complexity:
Email normalization logic (`.lower().strip()`) and user lookup by email are duplicated across four different authentication service files. This creates a risk that a new flow might forget to normalize an email before a database lookup, leading to failed logins or duplicate accounts. Additionally, `_reselect_signup_user` and `_reselect_google_user` duplicate identical error-handling logic for integrity error recovery.

Evidence:
- `backend/app/services/auth_account.py`: `_normalize_email` is defined locally and used before `select(User)`.
- `backend/app/services/auth_email_dispatch.py`: `_normalize_email` is defined locally and used before `select(User)`.
- `backend/app/services/auth_signup.py`: `_normalize_email` is defined locally, alongside `_reselect_signup_user`.
- `backend/app/services/auth_google.py`: Manually does `.lower().strip()` and defines an identical `_reselect_google_user`.
- **Validity Update (Scout Analysis):** Verified that `_reselect_google_user` and `_reselect_signup_user` duplicate the exact same `IntegrityError` recovery pattern (executing `select(User).where(User.email == email)` and throwing a 503 on failure). High validity for extraction into a single `get_user_by_email` retry helper.

Suggested simplification:
Extract `normalize_email(email: str) -> str` and `get_user_by_email(db: AsyncSession, email: str) -> User | None` into a shared helper (e.g., inside `backend/app/services/auth.py` or a new `auth_helpers.py`). Consolidate the `_reselect_*` functions into a single shared retry helper.

Must preserve:
- Existing exception types and status codes for missing users during reselect (e.g., 503).
- Active flag checks (e.g., `User.is_active == True`) where currently applied.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_auth.py`
- `python -m pytest backend/tests_fastapi/test_auth_service.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "email" and "normalize"; no existing items cover this duplication.

Notes for fixing agent:
- Start with creating the shared helpers.
- Be careful to maintain the exact `is_active` query constraints in `auth_account.py` vs `auth_signup.py`.

**Validity Update (Scout Analysis): HIGHLY VALID.**
Confirmed via regex search. email.lower().strip() is manually executed across uth_signup.py, uth_email_dispatch.py, uth_account.py, and email.py when standardizing inputs. A central lookup/normalization function will remove this boilerplate and prevent drift.

Fix outcome:
- 2026-06-04 continuation: Added `backend/app/services/auth_users.py` with `normalize_email`, `get_user_by_email`, and `require_user_by_email`. Wired signup, Google auth, account verification/reset, and email dispatch to the shared helper while preserving each flow's active-user filters and error details.
- Validation: `python -m pytest tests_fastapi/test_auth.py tests_fastapi/test_auth_service.py` from `backend/` passed.

---

### SIMP-003 - Centralize Guest and Onboarding redirects

Status: FIXED
Area: auth and onboarding
Risk: medium
Expected payoff: large

Files:
- `frontend/lib/authPageController.ts`
- `frontend/app/professor/login/page.tsx`
- `frontend/components/AuthGuard.tsx`

Current complexity:
Hydration and authenticated routing logic is scattered. `useAuthPageController` and `ProfessorLoginPage` manually call `hydrate()` and use `useEffect` blocks to bounce logged-in users away from guest pages (or bounce fully onboarded users away from the onboarding page). Meanwhile, `AuthGuard` manually hydrates and handles bouncing users *to* onboarding, but relies on `useAuthPageController` to bounce them *away* from it.

Evidence:
- `frontend/lib/authPageController.ts`: `useEffect` hooks for `hydrate()` and `handleAuthResolution` run on every render to kick authenticated/onboarded users out.
- `frontend/app/professor/login/page.tsx`: Duplicates the `hydrate()` and token checking `useEffect` to redirect logged-in professors to `AUTH_ROUTES.professorHome`.
- `frontend/components/AuthGuard.tsx`: Handles redirecting to onboarding, but not away from it.

Suggested simplification:
1. Create a `<GuestGuard>` component that handles `hydrate()` and automatically redirects logged-in users to their respective home pages (centralizing guest page protection). Wrap `/` and `/professor/login` with it.
2. Update `AuthGuard` to handle the reverse onboarding check: if a user is on an onboarding route but `getStudentOnboardingStep(profile)` is null, redirect them to `studentHome`.
3. Remove all `useEffect` hydration and redirection logic from `useAuthPageController` and `ProfessorLoginPage`.

Must preserve:
- Guests can view login pages.
- Authenticated users visiting `/` or `/professor/login` are instantly redirected.
- Fully onboarded students visiting `/onboarding` are instantly redirected to `/home`.

Good first validation:
- Log in as a student, finish onboarding, and try to visit `/`, `/professor/login`, and `/onboarding`. All should bounce you to `/home`.

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "hydrate", "GuestGuard", and "authPageController". No findings.

Notes for fixing agent:
- Start by building `<GuestGuard>`.
- Add the "already onboarded" check to `AuthGuard`.
- Then strip the effects out of the page components.

Fix outcome:
- 2026-06-04 continuation: Added `frontend/components/GuestGuard.tsx`, wrapped `/` and `/professor/login` with it, removed the duplicated professor-login hydration/redirect effects, kept the auth form hook scoped to form state plus onboarding step hydration, and added the completed-student redirect inside `AuthGuard`.
- Validation: `npm run test -- authPageController authGuardComponent guestGuardComponent authSession` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-004 - Extract shared DifficultyBadge and Exercise Types

Status: FIXED
Area: quizzes and exams
Risk: low
Expected payoff: small

Files:
- `frontend/components/animated/source-ports/chemistry/components/interactive/ChimieExercises.tsx`
- `frontend/components/animated/source-ports/nuclear/components/interactive/NuclearExercises.tsx`
- `frontend/components/animated/source-ports/nuclear/components/interactive/RadioactivityExercises.tsx`

Current complexity:
The exact same `DifficultyBadge` UI component, `Difficulty` type, and `ExerciseState` type are completely copy-pasted across three different interactive exercise files in the frontend. This creates a maintenance burden if we want to change the difficulty colors, styling, or status states.

Evidence:
- `frontend/components/animated/source-ports/chemistry/components/interactive/ChimieExercises.tsx`: `DifficultyBadge` component and `Difficulty`/`ExerciseState` types defined on lines 10-26.
- `frontend/components/animated/source-ports/nuclear/components/interactive/NuclearExercises.tsx`: Duplicate component and types on lines 10-26.
- `frontend/components/animated/source-ports/nuclear/components/interactive/RadioactivityExercises.tsx`: Duplicate component and types on lines 10-26.

Suggested simplification:
Extract the `ExerciseState` and `Difficulty` types, as well as the `DifficultyBadge` functional component into a shared UI/components file (e.g., `frontend/components/animated/shared/DifficultyBadge.tsx`) and import it into the three exercise files.

Must preserve:
- Existing badge styling and level names (Facile, Moyen, Difficile).

Good first validation:
- Verify that tests or manual checks render the exercise badges with their correct styling.

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for `DifficultyBadge` and `gamification` and found no existing entries.

Notes for fixing agent:
- Start with `frontend/components/animated/source-ports/chemistry/components/interactive/ChimieExercises.tsx`.
- Create a shared component file and replace the inline declarations in all three files.
- **EVIDENCE OF PAYLOAD:** The copy-pasted `DifficultyBadge` in `NuclearExercises.tsx` currently has broken Tailwind classes due to erroneous spaces (e.g. `text - [10px] px - 2`). Extracting the correct component from `ChimieExercises.tsx` will actually fix a visual bug in the nuclear exercises!

**Validity Update (Scout Analysis): HIGHLY VALID.**
Confirmed via regex search. const DifficultyBadge = ({ level }: { level: Difficulty }) => { is duplicated line-for-line across ChimieExercises.tsx, NuclearExercises.tsx, and RadioactivityExercises.tsx. Extracting it will immediately drop redundant UI declarations.

Fix outcome:
- 2026-06-04: Added `frontend/components/animated/shared/DifficultyBadge.tsx` and imported the shared `DifficultyBadge`/`ExerciseState` into the chemistry, nuclear, and radioactivity exercise components. This also removed the broken spaced Tailwind class names in `NuclearExercises.tsx`.
- Validation: `npm run test -- coreLearningComponents.render` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-005 - Split God Hook `useAuthPageController`

Status: FIXED
Area: auth and onboarding
Risk: medium
Expected payoff: large

Files:
- `frontend/lib/authPageController.ts`
- `frontend/components/auth/AuthPageView.tsx`

Current complexity:
`useAuthPageController` is a massive "God Hook" (300+ lines, returning 32 properties) that mixes three distinct concerns: authentication (login/signup/forgot/google), onboarding state (niveau/filiere), and navigation state (step transitions). This creates a huge re-render surface, bundles unrelated state (e.g. `password` and `selectedLevel`), and makes it hard to test or extend individual flows.

Evidence:
- `frontend/lib/authPageController.ts`: `useAuthPageController` manages 11 `useState` hooks for entirely separate flows and returns them all in one giant object.
- `frontend/lib/authPageController.ts`: `handleAuthResolution` handles both auth completion and onboarding step advancement, blurring session creation with profile mutation.

Suggested simplification:
Split `useAuthPageController` into three focused hooks: `useAuthForm` (credentials, Google, forgot password), `useOnboardingForm` (niveau, filiere), and a lightweight `useAuthFlowRouter` (step transitions).

Must preserve:
- Google login initialization and callback logic.
- Unverified email error handling (switching to `verify-pending`).
- The exact onboarding redirection logic (`resolveAuthSuccess`).

Good first validation:
- `npm run test -- frontend/tests/authPageController.test.ts frontend/tests/authSession.test.ts`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "authPageController", "hook", and "onboarding" and found no existing entries for this abstraction problem. `SIMP-003` handles the hydration and redirection, whereas this targets the massive component state management.

Notes for fixing agent:
- Start with `frontend/lib/authPageController.ts`.
- Avoid touching `resolveAuthSuccess` in `authPolicy.ts`.

Fix outcome:
- 2026-06-04 continuation: Split `frontend/lib/authPageController.ts` into focused private hooks: `useAuthFlowRouter` for auth/onboarding step routing, `useOnboardingForm` for niveau/filiere hydration and saving, and `useAuthForm` for credentials, Google sign-in, verification, and forgot-password state. Kept the exported `useAuthPageController` shape stable for `AuthPageView`.
- Validation: `npm run test -- authPageController authGuardComponent guestGuardComponent authSession googleAuthCallback`, `npm run test -- authPageController googleAuthCallback`, and `npm run typecheck` from `frontend/` passed.

---

### SIMP-012 - Centralize course admin authorization check

Status: MOVED_TO_BUG_DUMP
Area: admin and course authoring
Risk: medium
Expected payoff: large

Files:
- `backend/app/routers/courses.py`
- `backend/app/services/calendar_read_models.py`
- `backend/app/services/gamification_read_models.py`

Current complexity:
Authorization checks for whether a user is a course admin are duplicated inline across multiple routers and services. Furthermore, there is drift in the boundaries: `courses.py` checks `user.is_staff or user.role == "professor"`, while `calendar_read_models.py` and `gamification_read_models.py` check `user.is_staff or user.is_superuser or user.role == "professor"`. This inconsistency creates a hazard where a new service might use the wrong check and accidentally expose admin behavior or reject valid staff users.

Evidence:
- `backend/app/routers/courses.py`: `_require_course_admin` checks `if not (user.is_staff or user.role == "professor"):`.
- `backend/app/services/calendar_read_models.py`: Inline check returns `bool(user.is_staff or user.is_superuser or user.role == "professor")`.
- `backend/app/services/gamification_read_models.py`: Inline check `if not (user.is_staff or user.is_superuser or user.role == "professor"):`.

Suggested simplification:
Extract a unified `is_course_admin(user: User) -> bool` helper (and a `get_current_course_admin_user` dependency) into `backend/app/dependencies.py`. Replace all inline `is_staff or role == "professor"` checks with this unified helper.

Must preserve:
- `is_staff` or `is_superuser` must grant access.
- `role == "professor"` must grant access.
- The HTTP 403 response behaviors for forbidden users.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_courses.py backend/tests_fastapi/test_calendar.py backend/tests_fastapi/test_gamification.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for duplicate role checks, `is_staff`, and `course_admin`. `SIMP-002` focuses on email normalization, and no existing items cover this backend auth boundary duplication.

Notes for fixing agent:
- Start with `backend/app/dependencies.py` to create the unified helper.
- Update `courses.py`, `calendar_read_models.py`, and `gamification_read_models.py` to use it.

---

### SIMP-013 - Extract shared test fixture for course domain hierarchy

Status: FIXED
Area: tests
Risk: medium
Expected payoff: large

Files:
- `backend/tests_fastapi/test_course_access.py`
- `backend/tests_fastapi/test_course_interactions.py`
- `backend/tests_fastapi/test_realtime.py`
- `backend/tests_fastapi/test_topic_quiz.py`
- `backend/tests_fastapi/test_professor_platform.py`

Current complexity:
Almost every test file that touches the course domain creates its own massive `_seed_topic` or `_seed_context` helper to build a Subject, Topic, TopicSection, TopicItem, Resource, TabContent, and UserSubjectEntitlement. This results in hundreds of lines of duplicated DB setup boilerplate that clutters test files and makes domain-wide test updates very expensive.

Evidence:
- `backend/tests_fastapi/test_course_access.py`: Defines a 60-line `_seed_topic` function.
- `backend/tests_fastapi/test_course_interactions.py`: Defines an identical 65-line `_seed_context` function.
- `backend/tests_fastapi/test_realtime.py`: Duplicates manual `Subject(`, `Topic(` creation in almost every test.

Suggested simplification:
Create a shared course factory/fixture (e.g. `seed_course_hierarchy`) in `backend/tests_fastapi/conftest.py` or a dedicated `backend/tests_fastapi/factories.py` file. Inject this fixture into the tests to eliminate the duplicated boilerplate.

Must preserve:
- Existing test data shapes (titles, order, status) that specific tests rely on.
- The `is_published` and `status` toggles used in access/visibility tests.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_course_access.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "tests", "_seed_topic", and "course domain". There are no items addressing test setup duplication.

Notes for fixing agent:
- Start with `backend/tests_fastapi/conftest.py` to add the shared fixture.
- Refactor `test_course_access.py` first to prove the abstraction works, then move to the others.

Fix outcome:
- 2026-06-04 continuation: Added `backend/tests_fastapi/course_factories.py` with `seed_course_hierarchy`, `seed_subject_entitlement`, and the `SeededCourseHierarchy` return helper. Replaced the duplicated `_seed_topic`, `_seed_context`, `_scope_user_to_other_subject`, and `_seed_quiz_tab` boilerplate in the course access, interaction, and quiz tests with factory-backed wrappers while preserving existing call sites.
- Validation: `python -m pytest tests_fastapi/test_course_access.py tests_fastapi/test_course_interactions.py tests_fastapi/test_topic_quiz.py` and `python -m pytest tests_fastapi/test_realtime.py tests_fastapi/test_professor_platform.py -q` from `backend/` passed.

---

### SIMP-014 - Extract AccessControlMixin for course content models

Status: FIXED
Area: full repo pass (backend models)
Risk: low
Expected payoff: medium

Files:
- `backend/app/models/courses.py`

Current complexity:
Almost every content model in the course domain (`Topic`, `Resource`, `TopicItem`, `TabContent`, `Exam`, `ExamProblem`) duplicates the exact same four access control columns: `status`, `required_tier`, `required_feature_key`, and `is_free_preview`. This creates schema bloat and makes it tedious to add new global access policies (e.g. time-locked content) consistently across all resources.

Evidence:
- `backend/app/models/courses.py`: `Topic`, `Resource`, `TopicItem`, `TabContent`, `Exam`, and `ExamProblem` all independently define `Mapped[str] = mapped_column(String(30), default="published")` and the tier/feature/preview columns.

Suggested simplification:
Extract an SQLAlchemy `AccessControlMixin` containing these four columns (and optionally their common indexes if applicable) and have the content models inherit from it. This enforces a consistent access contract at the ORM level.

Must preserve:
- The exact column names and default values (`published`, `""`, `False`) so no DB migration is strictly required if the schema remains identical.
- Any existing indexes on `status` (can be handled via `@declared_attr` in the mixin).

Good first validation:
- Run the full test suite (`python -m pytest`) to ensure the ORM maps correctly and no queries break.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "Mixin", "models", and "access control". No existing items target SQLAlchemy model boilerplate.

Notes for fixing agent:
- Start with `backend/app/models/base.py` or `courses.py` to define the mixin.
- Ensure `__table_args__` indexes referencing `status` are preserved correctly on the subclasses.
- **RISK IDENTIFIED:** `TabContent` does NOT currently have an `is_free_preview` column, whereas the others do. Adding an `AccessControlMixin` that includes `is_free_preview` to `TabContent` will alter the database schema and require an Alembic migration. You must either exclude `TabContent` from the mixin, split the mixin into two, or intentionally run the migration to align the schema.

Fix outcome:
- 2026-06-04 continuation: Added `AccessControlMixin` for `status`, `required_tier`, and `required_feature_key`, plus `FreePreviewMixin` for the existing `is_free_preview` column. Applied the preview mixin only to `Topic`, `Resource`, `TopicItem`, `Exam`, and `ExamProblem`; `TabContent` uses only `AccessControlMixin`, so no new column is introduced.
- Validation: `python -m pytest tests_fastapi/test_course_access.py tests_fastapi/test_course_interactions.py tests_fastapi/test_topic_quiz.py` and `python -m pytest tests_fastapi/test_admin_overview.py tests_fastapi/test_schema_limits.py tests_fastapi/test_data_integrity_audit.py` from `backend/` passed.

---

### SIMP-015 - Centralize calendar event visibility policy

Status: MOVED_TO_BUG_DUMP
Area: gamification and calendar
Risk: medium
Expected payoff: medium

Files:
- `backend/app/services/gamification_read_models.py`
- `backend/app/services/calendar_read_models.py`

Current complexity:
The business rule that determines which live sessions/calendar events a student can see (based on matching the user's `niveau` and `filiere` with the `ProgramTrack`) is duplicated between the calendar module and the gamification sidebar module. If the visibility rules change, they could easily fall out of sync.

Evidence:
- `backend/app/services/calendar_read_models.py`: Defines `calendar_event_visibility_filter` which returns `or_(LiveSession.id.is_(None), and_(ProgramTrack.niveau == user.niveau, ProgramTrack.filiere == user.filiere))`.
- `backend/app/services/gamification_read_models.py`: `_sidebar_live_events` manually rebuilds this exact SQLAlchemy `WHERE` clause and repeats the `is_staff or is_superuser or role == "professor"` check.

Suggested simplification:
Import and reuse `calendar_event_visibility_filter(user)` inside `_sidebar_live_events` to ensure a single source of truth for event visibility.

Must preserve:
- The `is_staff` / `professor` bypass logic.
- The `OUTER JOIN` structures in `_sidebar_live_events` that make the filter evaluation possible.

Good first validation:
- Run the full test suite (`python -m pytest backend/tests_fastapi/test_gamification_routes.py backend/tests_fastapi/test_calendar.py`)

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "visibility_filter", "calendar", and "sidebar". No existing item covers this business logic duplication.

Notes for fixing agent:
- Start with `backend/app/services/gamification_read_models.py`.
- Import the filter and apply it to the `stmt`.

### SIMP-014 - Extract shared video progress tracking hook

Status: FIXED
Area: topic workspace frontend
Risk: high
Expected payoff: large

Files:
- `frontend/components/VideoPlayer.tsx`
- `frontend/components/YouTubeVideoPlayer.tsx`

Current complexity:
Both `VideoPlayer` (VdoCipher) and `YouTubeVideoPlayer` independently duplicate ~150 lines of complex React state and `useEffect` logic for tracking video progress, including:
- Saving progress via API calls every 30 seconds (using `setInterval` with identity checks).
- Calculating `currentDuration`, `currentResumeSeconds`, and `currentWatchedSeconds`.
- Managing idempotency (`completionReportedRef`, `completionSaveInFlightRef`).
- Flushing progress on `pagehide` events.
This creates a high risk of divergence where one player might implement progress saving or completion thresholding differently than the other.

Evidence:
- `frontend/components/VideoPlayer.tsx`: Defines `saveProgress`, `reportCompletion`, `clearProgressInterval`, and a 30-second interval `useEffect` to poll `playerRef.current?.video?.currentTime`.
- `frontend/components/YouTubeVideoPlayer.tsx`: Defines identical `saveProgress`, `reportCompletion`, `clearProgressInterval`, and the same 30-second interval `useEffect` polling `playerRef.current?.getCurrentTime?.()`.

Suggested simplification:
Extract a unified `useVideoProgress` hook in `frontend/hooks/useVideoProgress.ts` that manages the interval, API save logic, completion threshold (e.g. 90%), and `pagehide` listeners. The hook should accept `lessonId`, `durationSeconds`, and a `getCurrentTime()` callback, and return `{ saveProgress, reportCompletion, syncProgress }`.

Must preserve:
- The 30-second polling interval and identity checks (`activeLessonMatches`).
- The `pagehide` flush logic.
- Idempotency via refs so completions are only reported once per lesson.

Good first validation:
- `npm run test -- frontend/tests/videoPlayer.test.ts` (or equivalent test for progress tracking)

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "VideoPlayer", "progress", and "YouTube". There are no existing entries covering frontend video player state extraction.

Notes for fixing agent:
- Start with `frontend/components/VideoPlayer.tsx` to understand the full state shape.
- Pass `getCurrentTime` as an abstract callback to the hook so it doesn't need to know if it's VdoCipher or YouTube.

Fix outcome:
- 2026-06-04 continuation: Added `frontend/hooks/useVideoProgress.ts` and moved shared progress-save, 30-second interval, pagehide flush, active-lesson identity, completion idempotency, and completion-threshold logic into it. Wired both `VideoPlayer` and `YouTubeVideoPlayer` through the hook while preserving VdoCipher's "await save before onComplete" behavior and YouTube's optimistic completion behavior.
- Validation: `npm run test -- videoPlayer youtubeVideoPlayer coreLearningComponents.render` and `npm run typecheck` from `frontend/` passed.

### SIMP-019 - Extract shared useClickOutside hook

Status: FIXED
Area: topic workspace frontend
Risk: low
Expected payoff: medium

Files:
- `frontend/components/TopNav.tsx`
- `frontend/components/figma/course-search-controls.tsx`
- `frontend/components/zed/ScientificCalculator.tsx`
- `frontend/components/figma/profile.tsx`

Current complexity:
The exact same `useEffect` logic for detecting clicks outside a dropdown, popover, or modal (using `document.addEventListener('pointerdown', ...)` or `mousedown` and checking `!ref.current?.contains(event.target)`) is duplicated inline across many components. Additionally, the same pattern applies to `Escape` key listeners to close these elements. This clutters the component files with boilerplate imperative DOM event handling.

Evidence:
- `frontend/components/TopNav.tsx`: Defines `onPointerDown` and `onKeyDown` listeners inside a `useEffect` to close the notifications dropdown.
- `frontend/components/figma/course-search-controls.tsx`: Defines `handlePointerDown` to close the subject dropdown.
- `frontend/components/figma/profile.tsx`: Defines `handleKeyDown` to close the edit modal on `Escape`.
- `frontend/components/zed/ScientificCalculator.tsx`: Manages complex outside interactions and `Escape` key handling inside massive `useEffect` blocks.

Suggested simplification:
Extract a generic `useOutsideClick` hook (and possibly `useEscapeKey` or a combined `useDismissable`) in `frontend/hooks/useClickOutside.ts`. Replace the duplicated inline `useEffect` blocks with `useOutsideClick(ref, () => setOpen(false))`.

Must preserve:
- Existing `event.target` node checks so internal clicks don't erroneously close the element.
- Cleanup of the event listeners on unmount.
- Distinctions between `pointerdown` and `mousedown` if they were specifically chosen (though standardizing on `pointerdown` or `mousedown` across the app is preferable).

Good first validation:
- Manually open the course search dropdown and TopNav notifications dropdown, and verify clicking outside still closes them.

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for `useOutsideClick`, `pointerdown`, and `hook`. No existing items cover this UI interaction boilerplate extraction.

Notes for fixing agent:
- Start by creating `frontend/hooks/useClickOutside.ts`.
- Make sure the hook uses a stable reference for the handler callback (or manages it internally with a ref) to avoid unnecessary re-bindings.

Fix outcome:
- 2026-06-04 continuation: Added `frontend/hooks/useClickOutside.ts` with `useClickOutside`, `useEscapeKey`, and `useDismissable`. Replaced duplicated outside-click/Escape listeners in `TopNav`, `FigmaCourseSearchControls`, `FigmaProfile`, and `ScientificCalculator` while preserving the original event types and cleanup behavior.
- Validation: `npm run test -- topNavAccessibility zedModeOverlay profilePage courseFilters` and `npm run typecheck` from `frontend/` passed.

---

### Quick Wins

### SIMP-006 - Consolidate Quiz Attempt Submission and Grading Logic

Status: FIXED
Area: quizzes and exams
Risk: high
Expected payoff: large

Files:
- `backend/app/routers/quizzes.py`
- `backend/app/services/course_tab_quiz_submission.py`

Current complexity:
The backend currently has two entirely separate codepaths for grading quizzes, calculating scores, computing hash idempotency keys, building `QuestionAttempt` records, and awarding XP/progress stats. `_submit_legacy_quiz_attempt` handles standalone/exam quizzes, while `submit_tab_quiz_attempt` handles tab quizzes. They duplicate ~150 lines of complex, transaction-heavy validation, grading, and DB insert logic, leading to duplicate testing requirements and a high risk of divergence.

Evidence:
- `backend/app/routers/quizzes.py`: `_submit_legacy_quiz_attempt` iterates over questions, calls `grade_quiz_question`, builds `QuestionAttempt` payloads, checks `existing_attempt` using `submission_hash`, builds `XPAward` objects, and handles `apply_quiz_pass_stats_delta`.
- `backend/app/services/course_tab_quiz_submission.py`: `submit_tab_quiz_attempt` duplicates the exact same logic block for grading, payload generation, attempt insertion, XP awards, and stats updates.
- `backend/tests_fastapi/test_topic_quiz.py`: Tests the legacy `quizzes.py` endpoint right alongside tab quizzes to verify they both behave correctly.

Suggested simplification:
Extract a unified `process_and_grade_quiz_submission` helper into `app/services/quiz_grading.py` (or a dedicated `quiz_attempts.py` service) that takes a standard set of `raw_questions`, user answers, and contextual metadata. Both endpoints should construct their routing/context variables and then pass them to this single handler to perform grading, DB row creation, and XP allocation.

Must preserve:
- Distinct `source_type` ("tab" vs legacy values).
- Idempotency via `submission_hash` to prevent duplicate attempts and double XP.
- Transactional integrity.
- Expected response shapes (`QuizResultOut` vs `TabQuizResultOut` which includes a summary).

Good first validation:
- `python -m pytest backend/tests_fastapi/test_topic_quiz.py`

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "quiz attempt", "grading", and "course_tab_quiz_submission". No existing item covers this logic duplication.

Notes for fixing agent:
- Start with `backend/app/services/quiz_grading.py` to create the shared logic.
- Ensure the `award_xp_bulk` calls use the same idempotency key formats.

Fix outcome:
- 2026-06-04 continuation: Added `backend/app/services/quiz_attempt_submission.py` to centralize quiz attempt idempotency lookup, attempt numbering, `QuizAttempt` creation, bulk `QuestionAttempt` insertion, quiz XP awards, and first-pass stats updates. Kept endpoint-specific answer normalization and response shaping in `backend/app/routers/quizzes.py` and `backend/app/services/course_tab_quiz_submission.py`.
- Reloaded duplicate attempts after transaction rollback so tab quiz duplicate responses do not trigger async lazy-loading.
- Validation: `python -m pytest tests_fastapi/test_topic_quiz.py tests_fastapi/test_quiz_grading_service.py` from `backend/` passed.

---

### SIMP-007 - Consolidate professor/student chat message handlers

Status: FIXED
Area: notifications and realtime
Risk: medium
Expected payoff: large

Files:
- `backend/app/services/professor_chat_mutations.py`

Current complexity:
Message creation, rate limiting, and realtime publishing logic is heavily duplicated across text vs. image message sending. Additionally, unread counter adjustments for professors vs. students are mirrored but identical in structure. Message edit/delete also duplicate ownership and rate limit checks.

Evidence:
- `backend/app/services/professor_chat_mutations.py`: `send_professor_message_state` and `send_professor_image_message_state` (and their student counterparts) duplicate the audit logging, `apply_professor_sent_message_update`, and outbox publishing.
- `backend/app/services/professor_chat_mutations.py`: `apply_professor_sent_message_update` and `apply_student_sent_message_update` are identical except for which unread field increments.

Suggested simplification:
Collapse text and image sending into shared `_send_message_state` helpers, and unify the counter updates into a generic `apply_sent_message_update(is_professor: bool)`.

Must preserve:
- Differential realtime channel publishing (inbox vs notifications).
- Unread counter increments.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_professor_platform.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md and found no existing SIMP items for chat message handling.

Notes for fixing agent:
- Focus on extracting the shared message saving and audit mechanics.

Fix outcome:
- 2026-06-04 continuation: Added `apply_sent_message_update`, `_require_send_conversation`, and `_persist_chat_message_state` in `backend/app/services/professor_chat_mutations.py`. The professor/student text and image send handlers now share the same conversation prep, unread update, audit, realtime publish, commit, and refresh flow while preserving the public router-facing state function names.
- Kept image upload cleanup semantics: media is deleted on persistence failure before commit.
- Validation: `python -m pytest tests_fastapi/test_professor_platform.py` from `backend/` passed.

---

### SIMP-008 - Extract repeated EventBridge payload integer parsing

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: small

Files:
- `backend/app/scheduled.py`

Current complexity:
Extracting integer parameters (limits, retention days) from the scheduled event payload involves repeated dictionary fallback, type coercion, and bounds checking.

Evidence:
- `backend/app/scheduled.py`: `_outbox_limit_from_event`, `_outbox_retention_days_from_event`, and `_outbox_purge_limit_from_event` contain the exact same `try/except` and dictionary lookup boilerplate.

Suggested simplification:
Create a single `_extract_event_int(event, key, default, max_val)` helper to remove the repeated try/except blocks.

Must preserve:
- Support for both direct event payloads and `event["detail"]` nesting.

Good first validation:
- Run `process_realtime_outbox_event` and ensure limits are parsed correctly.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md; no scheduled job simplification exists.

Notes for fixing agent:
- Keep the helper internal to `scheduled.py`.

Fix outcome:
- 2026-06-04: Added internal `_event_int` helper in `backend/app/scheduled.py` and kept the existing public parsing helper names delegating to it.
- Validation: `python -m pytest tests_fastapi/test_realtime.py -k scheduled` from `backend/` passed.

---

### SIMP-008 - Decouple ORM mutation from Stripe API client

Status: FIXED
Area: payments
Risk: medium
Expected payoff: large

Files:
- `backend/app/services/stripe_service.py`
- `backend/app/services/payment_lifecycle.py`
- `backend/app/services/payment_entitlements.py`

Current complexity:
`stripe_service.py` is supposed to be an API client wrapper, but it silently mutates the `User.stripe_customer_id` ORM field in memory when creating a new Stripe customer. `payment_lifecycle.py` then awkwardly relies on this side-effect: it checks `previous_customer_id`, calls `stripe_service.create_checkout_session`, and then uses `payment_entitlements.persist_created_stripe_customer` to commit the mutated ORM object. This creates an unclear service boundary where the API client has hidden ORM side-effects.

Evidence:
- `backend/app/services/stripe_service.py`: Lines 125-130 mutate `user.stripe_customer_id = customer.id` during `create_checkout_session`.
- `backend/app/services/payment_lifecycle.py`: Lines 109-118 rely on this implicit mutation to call `persist_created_stripe_customer`.
- `backend/app/services/payment_entitlements.py`: `persist_created_stripe_customer` commits the change blindly.

Suggested simplification:
Change `create_checkout_session` to return a `CheckoutSessionResult(url: str, new_customer_id: str | None)` dataclass. Remove the ORM mutation from `stripe_service.py` entirely. Have `payment_lifecycle.py` explicitly update the `User` object and commit if `new_customer_id` is returned, deleting the confusing `persist_created_stripe_customer` function entirely.

Must preserve:
- Stripe customer creation and ID assignment to the user.
- Transactional integrity (committing the new customer ID).

Good first validation:
- `python -m pytest backend/tests_fastapi/test_stripe_service.py backend/tests_fastapi/test_payments.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `stripe_service`, `ORM`, and `mutation`. No existing items found.

Notes for fixing agent:
- Start with `stripe_service.py`'s return type.
- Delete `persist_created_stripe_customer`.

Deferral:
- 2026-06-04: Valid architecture direction, but not a pragmatic simplification during this pass. It changes the internal `create_checkout_session` service contract and requires coordinated payment service/router/test updates across customer persistence behavior.

Fix outcome:
- 2026-06-05 continuation: Added `CheckoutSessionCreation` in `backend/app/services/stripe_service.py` and changed `create_checkout_session` to return `{checkout_url, customer_id}` instead of mutating `User.stripe_customer_id`.
- Updated `backend/app/services/payment_lifecycle.py` to persist the returned customer ID explicitly through `persist_created_stripe_customer`; updated that helper to accept the customer ID rather than committing a hidden mutation.
- Validation: `python -m pytest tests_fastapi/test_stripe_service.py tests_fastapi/test_payments.py -k "create_checkout_session or cookie_checkout_session"` and `python -m pytest tests_fastapi/test_payment_entitlements.py` from `backend/` passed.

---

### SIMP-009 - Deduplicate Stripe IntegrityError handling

Status: INVALID
Area: payments
Risk: low
Expected payoff: medium

Files:
- `backend/app/services/payment_lifecycle.py`

Current complexity:
`record_stripe_webhook_event_once` and `record_payment_verification_attempt_once` both duplicate identical idempotency handling logic: adding a model, flushing/committing, catching `IntegrityError`, rolling back, logging, and returning a boolean.

Evidence:
- `backend/app/services/payment_lifecycle.py`: Lines 40-53 and 56-79.

Suggested simplification:
Extract a shared `execute_idempotent_insert(db: AsyncSession, model, log_event: str, log_extras: dict) -> bool` helper to handle the commit, rollback, and logging.

Must preserve:
- The exact boolean return semantics (True for first attempt, False for duplicate).
- Safe rollback of the SQLAlchemy session on `IntegrityError`.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_payments.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `IntegrityError`, `payment`, and `idempotent`. No existing items found.

Notes for fixing agent:
- Keep the new helper in `payment_lifecycle.py`.

Deferral:
- 2026-06-04: The helper extraction is plausible, but a first implementation attempt was reverted because the current verification path now has pending/completed/failed attempt state, while webhook recording still intentionally uses flush-only semantics. Keeping the two explicit functions is clearer until a payment-specific state helper is designed.

Invalid resolution:
- 2026-06-05 continuation: Rechecked `record_stripe_webhook_event_once` and `record_payment_verification_attempt_once`. The duplication is superficial: webhook recording must only `flush()` so webhook side effects can share the final transaction, while payment verification must `commit()` the pending row before the external Stripe call so duplicates can wait for completed/failed replay. A generic idempotent insert helper would hide different transaction boundaries.
- Validation: `python -m pytest tests_fastapi/test_payments.py tests_fastapi/test_stripe_service.py tests_fastapi/test_payment_entitlements.py` from `backend/` passed after adjacent payment changes.

---

### SIMP-010 - Extract `simulate_stripe_webhook` test helper

Status: FIXED
Area: payments
Risk: low
Expected payoff: medium

Files:
- `backend/tests_fastapi/test_payments.py`

Current complexity:
There is massive duplication of test setup boilerplate for mocking Stripe webhook events. Almost 10 separate tests manually monkeypatch `stripe.Webhook.construct_event`, construct a payload dictionary, inject the test settings secret, call the router endpoint, and restore settings.

Evidence:
- `backend/tests_fastapi/test_payments.py`: The `monkeypatch.setattr(payments_router.stripe.Webhook, "construct_event" ...)` and `app_client.post("/api/payments/webhook")` block is copy-pasted in 9 tests starting from `test_webhook_checkout_completed_marks_user_pro`.

Suggested simplification:
Extract a shared `simulate_stripe_webhook(app_client, test_settings, monkeypatch, event_payload: dict)` helper to remove this boilerplate from the test suite.

Must preserve:
- Exact assertion values for `response.status_code`.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_payments.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `simulate_stripe_webhook` and `test_payments`. No existing items found.

Notes for fixing agent:
- Place the helper at the top of `test_payments.py`.

Fix outcome:
- 2026-06-05 continuation: Added `simulate_stripe_webhook` in `backend/tests_fastapi/test_payments.py` to centralize test webhook secret setup, Stripe construct-event monkeypatching, payload/signature assertions, POST execution, and secret restore.
- Kept the missing-webhook-secret case manual and used helper-supported callable failures for invalid signature/payload tests.
- Validation: `python -m pytest tests_fastapi/test_payments.py -k webhook` from `backend/` passed.

---

### SIMP-011 - Remove redundant idempotency key from payment verification

Status: FIXED
Area: payments
Risk: medium
Expected payoff: medium

Files:
- `backend/app/routers/payments.py`
- `backend/app/services/payment_lifecycle.py`
- `frontend/lib/payments.ts`
- `backend/app/models/payments.py`

Current complexity:
Payment verification requires an explicit `Idempotency-Key` header, which it uses alongside `user_id` and `session_id` in a unique database constraint (`PaymentVerificationAttempt`). However, the frontend simply derives this key deterministically from the `session_id` using a regex replace. Passing and storing a redundant key adds unnecessary validation branching and schema bloat when the `session_id` itself is already uniquely identifying the checkout transaction.

Evidence:
- `frontend/lib/payments.ts`: `paymentVerificationIdempotencyKey` generates a string like `verify-${sessionId...}`.
- `backend/app/routers/payments.py`: `verify_session` enforces `Idempotency-Key` header length and existence.
- `backend/app/models/payments.py`: `PaymentVerificationAttempt` stores `idempotency_key`.

Suggested simplification:
Drop the `Idempotency-Key` header from the backend verification route and frontend `apiClient.get()` call. Make `session_id` the unique idempotent lock token in `PaymentVerificationAttempt` (i.e. `UNIQUE(user_id, session_id)`).

Must preserve:
- The idempotent nature of `verify_session` where rapid double-clicks return the cached `is_pro` state instead of hitting Stripe twice.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_payments.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `Idempotency-Key` and `session_id`. No existing items found.

Notes for fixing agent:
- An alembic migration will be needed to drop the `idempotency_key` column and update the unique constraint.

Deferral:
- 2026-06-04: Not a behavior-preserving simplification by itself because it requires an Alembic migration and coordinated frontend/backend API contract changes.

Fix outcome:
- 2026-06-05 continuation: Removed the redundant payment verification `Idempotency-Key` contract. `backend/app/routers/payments.py` no longer requires the header, and `backend/app/services/payment_lifecycle.py` now records/replays verification attempts by `user_id + session_id`.
- Updated `backend/app/models/payments.py` and added `backend/alembic/versions/0053_payment_verification_session_key.py` to replace the unique constraint with `uq_payment_verification_attempts_user_session` and drop `idempotency_key`.
- Removed `paymentVerificationIdempotencyKey` and the verification header from `frontend/lib/payments.ts`.
- Validation: `python -m pytest tests_fastapi/test_payments.py -k "verify_session or payment_verification_attempt"`, `python -m pytest tests_fastapi/test_payments.py tests_fastapi/test_stripe_service.py tests_fastapi/test_payment_entitlements.py`, and `npm run test -- payments paymentSuccessPage` from `frontend/` passed.

---

### SIMP-009 - Merge Ably realtime subscription client utilities

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: large

Files:
- `frontend/lib/ably.ts`

Current complexity:
The frontend `ably.ts` client exports `subscribeKrescoRealtime` and `subscribeKrescoRealtimeChannels`. These two functions duplicate almost all internal logic, including connection state handling, interval polling fallback mechanisms, cleanup logic, and error reporting. The only difference is that one accepts a single channel name string, while the other accepts an array of strings.

Evidence:
- `frontend/lib/ably.ts`: `startFallback`, `stopFallback`, `runPoll`, `handleConnectionState`, and the returned unsubscribe function are heavily duplicated between both functions.

Suggested simplification:
Refactor `subscribeKrescoRealtime` to simply delegate to `subscribeKrescoRealtimeChannels` with a single-element array, or merge them completely into a single utility, removing roughly 90 lines of duplicate fallback boilerplate.

Must preserve:
- The fallback interval mechanisms during connection suspensions.
- Resubscribe attempts on reconnection.

Good first validation:
- Run `npm run test` in `frontend/` to ensure `tests/ably.test.ts` passes.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md; no frontend ably client simplification exists.

Notes for fixing agent:
- Make sure to update the type signatures correctly.

Fix outcome:
- 2026-06-04: `frontend/lib/ably.ts` now shares fallback poller logic across single-channel and multi-channel subscription utilities. The multi-channel path also keeps retry/cleanup coverage for partially failed subscriptions.
- Validation from Ably worker: `npm run test -- ably`, `npm run typecheck`, `npx eslint lib/ably.ts tests/ably.test.ts --max-warnings=0`, and `git diff --check -- frontend/lib/ably.ts frontend/tests/ably.test.ts` passed.

---

### SIMP-010 - Extract shared live session event listener effect

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: medium

Files:
- `frontend/app/(dashboard)/live/[sessionId]/page.tsx`
- `frontend/app/professor/live/[sessionId]/page.tsx`

Current complexity:
Both the student and professor live session pages duplicate a large `useEffect` that listens for realtime Ably events (`live.session.` and `live.interaction.`) on the live session channel.

Evidence:
- `frontend/app/(dashboard)/live/[sessionId]/page.tsx`: The `useEffect` that calls `subscribeKrescoRealtime` checks event names, filters by `isLiveInteraction`, and updates `mutateInteractions`.
- `frontend/app/professor/live/[sessionId]/page.tsx`: Contains the exact same `useEffect` block, event checks, and mutation handlers.

Suggested simplification:
Extract a custom hook, e.g., `useLiveSessionRealtimeSubscription({ sessionId, mutateAll, mutateInteractions })`, into `frontend/lib/liveSessionData.ts` to share the realtime data mutation updates.

Must preserve:
- Callbacks must avoid closing over stale state.

Good first validation:
- Run the E2E tests `npm run test:e2e` in `frontend/`.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md; previous items focus on formatting utilities, not the realtime subscription effect.

Fix outcome:
- 2026-06-05 continuation: Added `useLiveSessionRealtimeSubscription` in `frontend/lib/liveSessionData.ts` to share the `live.session.*`/`live.interaction.*` Ably event handling and fallback interaction refresh logic.
- Replaced the duplicated realtime listener effects in `frontend/app/(dashboard)/live/[sessionId]/page.tsx` and `frontend/app/professor/live/[sessionId]/page.tsx`; professor fallback still refreshes sessions, embed, and interactions together.
- Validation: `npm run test -- liveSessionData livePage` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-011 - Extract shared notification channel query and subscription effect

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: medium

Files:
- `frontend/app/(dashboard)/calendar/page.tsx`
- `frontend/app/(dashboard)/live/page.tsx`

Current complexity:
The calendar and live schedule pages have an identical `useEffect` that orchestrates fetching accessible notification channels (`listKrescoRealtimeSubscriptions`) and subscribing to them via `subscribeKrescoRealtimeChannels`, with a fallback catch block to the default user channel if the API fails.

Evidence:
- `frontend/app/(dashboard)/calendar/page.tsx`: The `useEffect` tracking `user?.id` that resolves `listKrescoRealtimeSubscriptions`.
- `frontend/app/(dashboard)/live/page.tsx`: Contains the exact same `useEffect` promise chain and cleanup closure.

Suggested simplification:
Extract a custom hook, e.g., `useNotificationChannelsSubscription({ userId, refreshCallback })`, to remove this duplicate boilerplate from the page components.

Must preserve:
- The fallback to `userNotificationsChannelName(userId)` if `listKrescoRealtimeSubscriptions` rejects.
- The correct unsubscription cleanup closure.

Good first validation:
- Run `npm run lint` and verify pages load without errors.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md.

Fix outcome:
- 2026-06-05 continuation: Added `frontend/hooks/useNotificationChannelsSubscription.ts` to centralize notification-channel lookup, multi-channel subscription, fallback to `userNotificationsChannelName(userId)`, and cleanup.
- Replaced duplicated effects in `frontend/app/(dashboard)/live/page.tsx` and `frontend/app/(dashboard)/calendar/page.tsx`; live schedule retains fallback polling and calendar retains its active-state guarded refresh.
- Validation: `npm run test -- calendarViewModel livePage` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-012 - Defer Stripe API lookups until after webhook idempotency check

Status: INVALID
Area: payments
Risk: medium
Expected payoff: medium

Files:
- `backend/app/services/payment_lifecycle.py`

Current complexity:
`process_stripe_webhook_event` performs a remote Stripe API call to look up the `customer_id` for a `charge.dispute.created` event *before* checking if the webhook event is a duplicate. This defeats the purpose of the idempotency guard and wastes network requests and Stripe rate limits on duplicate events, while duplicating branching logic.

Evidence:
- `backend/app/services/payment_lifecycle.py`: Lines 214-224 execute `await customer_id_for_charge_fn` for dispute events, but `record_webhook_event_once_fn` is only called on line 226.

Suggested simplification:
Move the `if event_type == "charge.dispute.created":` lookup block below the `record_webhook_event_once_fn` check, right into the main `elif event_type == "charge.dispute.created":` action branch. This avoids remote calls on duplicates and consolidates all dispute handling into a single `elif` block.

Must preserve:
- The fallback logic that fetches `customer_id` from the `charge` if the `customer` field is empty.
- Raising the 503 HTTP exception if the lookup fails.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_payments.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `customer_id_for_charge`, `idempotency`, and `webhook`. No existing items found.

Notes for fixing agent:
- Move lines 214-224 down to line 252.

Invalidation:
- 2026-06-04: Current tests intentionally require dispute customer lookup before recording the webhook event (`test_webhook_resolves_dispute_customer_before_recording_event`) so a failed lookup can retry without a persisted event (`test_webhook_charge_dispute_lookup_failure_retries_without_recording_event`). Deferring the lookup after idempotency recording would need a different transactional design and is not a behavior-preserving simplification.

---

### SIMP-012 - Merge singular gamification XP award into bulk handler

Status: FIXED
Area: gamification
Risk: low
Expected payoff: large

Files:
- `backend/app/services/xp.py`

Current complexity:
The `xp.py` service defines `award_xp` and `award_xp_bulk`. `award_xp` completely duplicates the complex execution path of `award_xp_bulk`, including: checking idempotency keys, inserting into `XPTransaction` with fallback logic, incrementing `UserXP` totals, and updating two separate properties of `DailyQuest` (total XP and specific reasons).

Evidence:
- `backend/app/services/xp.py`: `award_xp` contains over 60 lines of logic that mirrors the exact implementation inside `award_xp_bulk` and `_apply_xp_totals_and_quests`.

Suggested simplification:
Refactor `award_xp` to just instantiate a single `XPAward` dataclass and delegate entirely to `award_xp_bulk`. This removes the duplicated transaction and quest progress updates.

Must preserve:
- The exact same deduplication behavior and `DailyQuest` increment logic.

Good first validation:
- Run `pytest` on gamification tests in `backend/`.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md; no gamification items exist.

Fix outcome:
- 2026-06-04: Refactored `award_xp` to preserve its zero-award, idempotency-key normalization, and optional `dedupe` behavior, then delegate to `award_xp_bulk` with a single `XPAward`.
- Validation: `python -m pytest tests_fastapi/test_xp_service.py` from `backend/` passed.

---

### SIMP-013 - Extract shared quiz question normalization logic

Status: FIXED
Area: quizzes and exams
Risk: low
Expected payoff: medium

Files:
- `backend/app/services/quiz_grading.py`

Current complexity:
`quiz_grading.py` duplicates question submission normalization logic in two places: `grade_quiz_question` (which grades it against the expected answer) and `normalized_submission_value` (which normalizes the user's answer so a deterministic hash of their attempt can be stored).

Evidence:
- `backend/app/services/quiz_grading.py`: Both functions switch on `question_type` (e.g. TEXT_MATCH, NUMERIC, multi_select, matching) and apply exactly the same transformations (e.g. `_normalize_answer`, `float`, `_normalize_list`).

Suggested simplification:
Extract a private function `_normalize_typed_value(question: dict, value)` that handles the question type switch and returns the normalized structure. Use this in both `grade_quiz_question` (for the expected and submitted values) and `normalized_submission_value` (for the submitted value).

Must preserve:
- The sorting order of multi_select and matching questions.

Good first validation:
- Run `pytest` on grading tests in `backend/`.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md; no quiz grading normalization items exist.

Fix outcome:
- 2026-06-04: Added `_normalize_typed_value` plus focused mapping/hotspot helpers in `backend/app/services/quiz_grading.py`; `grade_quiz_question` and `normalized_submission_value` now share the same normalization path where behavior matches exactly.
- Validation: `python -m pytest tests_fastapi/test_quiz_grading_service.py tests_fastapi/test_topic_quiz.py` from `backend/` passed.

---

### SIMP-014 - Extract Exam Draft Storage and Hydration

Status: FIXED
Area: quizzes and exams
Risk: medium
Expected payoff: high

Files:
- `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`

Current complexity:
The massive `ExamPage` component (500+ lines) mixes UI rendering, exam countdown timers, API submission, and a highly complex local storage draft implementation. It manually implements `readExamDraft`, `writeExamDraft`, `sanitizeDraftAnswers`, validation rules (`sameQuestionOrder`), and multiple `useEffect` blocks to manage hydration state (`draftHydrated`), bypassing the cleaner pattern used in `topicWorkspaceDraftCache.ts`. This creates an unclear boundary between UI state and browser persistence APIs.

Evidence:
- `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`: Contains inline implementations for `examDraftStorageKey`, `readExamDraft`, `writeExamDraft`, `removeExamDraft`, `sameQuestionOrder`, and `sanitizeDraftAnswers` which make up over 100 lines at the bottom of the file.
- `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`: Four different `useEffect` blocks are dedicated to hydrating the draft, syncing the draft to local storage on answer change, and conditionally dropping the draft.

Suggested simplification:
Extract the local storage reading, writing, serialization, and validation logic into a dedicated `frontend/lib/examDraft.ts` module, and consolidate the hydration `useEffect` boilerplate into a reusable `useExamDraft(subjectId, quiz)` custom hook.

Must preserve:
- The exact `localStorage` keys (`kresco:exam-draft:v1:...`).
- The strict draft validation (matching subject ID, quiz ID, and exact question order).
- Graceful error recovery if `window.localStorage` throws (e.g. quota exceeded or incognito mode).

Good first validation:
- `npm run test -- frontend/tests/examPage.test.ts`

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "exam draft", "localStorage", and "examPage". No existing items.

Fix outcome:
- 2026-06-05 continuation: Added `frontend/lib/examDraft.ts` with `useExamDraft`, draft storage-key handling, localStorage read/write/remove, strict subject/quiz/question-order validation, answer sanitization, result validation, and quiz fingerprinting.
- Replaced inline draft hydration and sync effects in `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`; the page now keeps timer/submission/UI state while draft persistence lives in the hook.
- Validation: `npm run test -- examPage` and `npm run typecheck` from `frontend/` passed.

---

### SIMP-015 - Extract live session transition state machine

Status: FIXED
Area: live sessions
Risk: medium
Expected payoff: large

Files:
- `backend/app/services/professor_live_sessions.py`

Current complexity:
State transitions for live sessions (cancel, start, end, notify) contain over 100 lines of exactly duplicated mutation boilerplate. Each transition manually updates the calendar event via `sync_calendar_event_from_live_session`, sends a notification via `notify_students_for_live`, sets the `notification_status`, fires a `record_professor_audit` row, enqueues a realtime event via `enqueue_live_session_event_and_track`, commits the database transaction, and refreshes the object.

Evidence:
- `backend/app/services/professor_live_sessions.py`: `cancel_professor_live_session`, `notify_professor_live_session`, `start_professor_live_session`, and `end_professor_live_session` are nearly identical except for the target status enum and the notification strings.

Suggested simplification:
Extract a shared `_transition_live_session` helper that takes the target `LiveSessionStatus`, realtime event name, and notification text/title. Make the four endpoints delegate to this single state machine helper.

Must preserve:
- The exact audit trail actions (`professor_update` with the specific changed status).
- Event boundaries (e.g., rejecting an end on a completed session).

Good first validation:
- `python -m pytest backend/tests_fastapi/test_professor_platform.py`

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "transition", "state machine", and "professor_live_sessions". No existing items.

Fix outcome:
- 2026-06-05 continuation: Added `_apply_professor_live_session_transition` in `backend/app/services/professor_live_sessions.py` to centralize rate limiting, optional status/calendar sync, student notification fanout, notification status update, audit logging, live realtime event enqueue, commit, refresh, and serialization.
- `cancel_professor_live_session`, `notify_professor_live_session`, `start_professor_live_session`, and `end_professor_live_session` now keep their specific guards/event strings while delegating the shared mutation body.
- Validation: `python -m pytest tests_fastapi/test_professor_platform.py -q --tb=short` from `backend/` passed. A prior full-output rerun timed out after the same suite had already passed once; the quiet rerun completed with 40 passing tests.

---

### SIMP-016 - Extract shared conversation lookup

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: medium

Files:
- `backend/app/services/professor_queries.py`

Current complexity:
Fetching a chat conversation with full eager-loaded relations (subject, track, professor, student), handling row locks (`for_update=True`), and catching `DBAPIError` to map lock timeouts to `HTTPException(409)` is heavily duplicated between the professor and student perspectives.

Evidence:
- `backend/app/services/professor_queries.py`: `require_professor_conversation` and `require_student_conversation` duplicate ~30 lines of complex SQLAlchemy query construction, execution, try/except blocks, and error handling. The only difference is the `where` clause (`professor_user_id` vs `student_user_id`).

Suggested simplification:
Extract a shared `_require_conversation(db, conversation_id, user_role, user_id, for_update)` helper that applies the role-specific `where` clause but unifies the options, execution, and exception mapping.

Must preserve:
- Eager loading of `course_offering`, `subject`, `track`, `professor`, and `student`.
- The `nowait=True` lock behavior and `CONVERSATION_LOCKED_DETAIL` 409 exception.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_professor_platform.py`

Why not a duplicate:
Searched `SIMPLIFICATION_DUMP.md` for "conversation" and "require_professor_conversation". No existing items.

Fix outcome:
- 2026-06-04: Added shared `_require_conversation` in `backend/app/services/professor_queries.py`; professor and student conversation lookups now share eager loading, `nowait=True` locking, lock-timeout mapping, and 404 handling.
- Validation: `python -m pytest tests_fastapi/test_professor_platform.py` from `backend/` passed after updating the structural guard to inspect the shared helper.

---

### SIMP-017 - Consolidate Professor Live Session State Transitions

Status: DUPLICATE
Area: admin and course authoring
Risk: medium
Expected payoff: large

Files:
- `backend/app/services/professor_live_sessions.py`

Current complexity:
Four distinct professor endpoints (`cancel_professor_live_session`, `notify_professor_live_session`, `start_professor_live_session`, and `end_professor_live_session`) duplicate ~30 lines of identical boilerplate. They all synchronize the calendar event, send student notifications via `notify_students_for_live`, record professor audit logs, enqueue realtime events, and finally commit and refresh the session.

Evidence:
- `backend/app/services/professor_live_sessions.py`: Lines 414-439, 451-473, 485-510, 522-547 duplicate the exact same `if session.calendar_event: sync...`, `notify_students_for_live`, `record_professor_audit`, and `enqueue_live_session_event_and_track` sequence.

Suggested simplification:
Extract a shared `_transition_live_session_state(db, session, professor, request, status, event_name, notif_title, notif_body)` helper to encapsulate the state assignment, calendar sync, notification delivery, audit logging, and commit sequence.

Must preserve:
- The exact audit log `changed_data` mappings.
- The `LiveSessionStatus.COMPLETED` validation check in `cancel_professor_live_session`.
- The `require_professor_live_session` lookup with `for_update=True` before transitioning.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_professor_platform.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "live session state transitions" and "professor_live_sessions". Existing items cover chat messages (SIMP-007) and frontend utilities (SIMP-001, SIMP-010), but not backend state transitions.

Notes for fixing agent:
- Place the helper right above `cancel_professor_live_session`.

---

### SIMP-018 - Generalize SQLAlchemy async get_or_create pattern

Status: FIXED
Area: full repo pass
Risk: low
Expected payoff: large

Files:
- `backend/app/services/course_progress.py`
- `backend/app/services/gamification_stats.py`
- `backend/app/services/interaction_mutations.py`

Current complexity:
Across the repository, there is duplicated boilerplate for safely creating records that might already exist, to avoid race conditions. This boilerplate typically consists of an initial `SELECT ... FOR UPDATE`, followed by object instantiation, a nested transaction `try: async with db.begin_nested(): db.add(...); await db.flush()`, an `except IntegrityError:` catch block, and a final `SELECT ... FOR UPDATE` fallback. This identical 15+ line idiom is repeated verbatim across gamification, course progress, interactions, and authentication.

Evidence:
- `backend/app/services/course_progress.py`: Lines 86-126 implement this manually for `TopicItemProgress`.
- `backend/app/services/gamification_stats.py`: Lines 8-22 implement this manually for `UserStats`.
- `backend/app/services/interaction_mutations.py`: Lines 299-336 implement this manually for `SavedItem`.

Suggested simplification:
Extract a generic `async def get_or_create(db, model, defaults, **kwargs)` helper to `backend/app/database.py` that encapsulates the initial lookup, nested transaction creation, and fallback `IntegrityError` handling. Update the duplicated sites to use this single function.

Must preserve:
- The use of `.with_for_update()` in the underlying lookups to prevent concurrent mutation bugs.
- Returning the fetched/created model instance correctly so it can be subsequently mutated if needed.

Good first validation:
- `python -m pytest backend/tests_fastapi/test_gamification.py`

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "get_or_create" and "IntegrityError". While SIMP-009 targets Stripe webhooks/payment lifecycle, SIMP-018 addresses the generic ORM `get_or_create` record hydration pattern replicated across completely distinct areas.

Notes for fixing agent:
- Place the shared `get_or_create` logic in a core location like `backend/app/database.py`.

---

### SIMP-019 - Consolidate Quiz Attempt Submission Pipelines

Status: DUPLICATE
Area: quizzes and exams
Risk: medium
Expected payoff: large

Files:
- `backend/app/routers/quizzes.py`
- `backend/app/services/course_tab_quiz_submission.py`

Current complexity:
The backend currently possesses two identical pipelines for processing and submitting quiz attempts: one for standalone question sets (`_submit_legacy_quiz_attempt` in `quizzes.py`), and one for topic workspace tabs (`submit_tab_quiz_attempt` in `course_tab_quiz_submission.py`). These functions are over 180 lines long each and perform exactly the same multi-step sequence: iterating over questions to grade answers, computing a submission hash for deduplication, inserting a `QuizAttempt` row, bulk inserting `QuestionAttempt` rows, generating `XPAward` objects for correct answers, dispatching to `award_xp_bulk`, and triggering `apply_quiz_pass_stats_delta`. 

Evidence:
- `backend/app/routers/quizzes.py`: Lines 109-295 (`_submit_legacy_quiz_attempt`).
- `backend/app/services/course_tab_quiz_submission.py`: Lines 166-368 (`submit_tab_quiz_attempt`).

Suggested simplification:
Extract the core 150-line grading, ORM insertion, and gamification dispatch logic into a generic `submit_quiz_attempt_pipeline` helper. The router and service handlers should merely resolve the appropriate questions payload and access context, and then delegate to the shared pipeline.

Must preserve:
- The distinction between grading raw `question_set.questions` objects versus dictionaries from `tab.config_json.questions`.
- IntegrityError fallback logic wrapping the outer handler.
- Deduplication checks using `submission_hash`.

Good first validation:
- Run the quiz tests to ensure both standalone and tab-embedded quizzes can still be completed and award XP.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "submission", "course_tab_quiz_submission", and "submit_legacy_quiz_attempt". Existing items do not identify this 180-line duplication.

Notes for fixing agent:
- Place the consolidated helper in `backend/app/services/quiz_grading.py`.

Duplicate resolution:
- 2026-06-04 continuation: Covered by the `SIMP-006 - Consolidate Quiz Attempt Submission and Grading Logic` fix above. The shared persistence pipeline now lives in `backend/app/services/quiz_attempt_submission.py`; the remaining per-endpoint code is the intentionally different input normalization and response payload construction.

---

### SIMP-025 - Extract shared Ably Realtime Fallback Poller

Status: FIXED
Area: notifications and realtime
Risk: low
Expected payoff: medium

Files:
- `frontend/lib/ably.ts`

Current complexity:
The exact same 25-line chunk of logic for managing a `fallbackTimer`, handling `runPoll` concurrency (`pollInFlight`), and exposing `startFallback` and `stopFallback` is completely duplicated between `subscribeKrescoRealtime` and `subscribeKrescoRealtimeChannels`. These two functions also share nearly identical `handleConnectionState` definitions and cleanup closures.

Evidence:
- `frontend/lib/ably.ts`: Lines 102-126 (fallback orchestration inside `subscribeKrescoRealtime`)
- `frontend/lib/ably.ts`: Lines 207-231 (identical fallback orchestration inside `subscribeKrescoRealtimeChannels`)

Suggested simplification:
Extract the polling orchestration into a generic `createFallbackPoller(fallback, isStopped)` helper that returns `{ startFallback, stopFallback, runPoll }`. This removes 25 lines of duplicate closure state management and ensures fallback timer management is identical across single and multi-channel subscriptions.

Must preserve:
- The exact interval behavior (`window.setInterval`).
- Avoidance of overlapping polls (`pollInFlight` check).
- Immediate `runNow` behavior when `startFallback(true)` is called.

Good first validation:
- Ensure the app builds (`npm run build`).

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "ably", "fallback", and "pollInFlight". The existing SIMP-022 refers to React hooks in `live/page.tsx` and `calendar/page.tsx`, whereas this finding is about internal `ably.ts` core duplication.

**Validity Update (Scout Analysis): HIGHLY VALID.**
I inspected `frontend/lib/ably.ts`. Lines 102-126 and 207-231 contain the exact same imperative `startFallback`, `stopFallback`, and `runPoll` closures. They share identical closure variables (`fallbackTimer`, `pollInFlight`). Extracting `createFallbackPoller` will drop 25 lines of confusing closure state management from the two main connection functions.
Note: Renamed from SIMP-023 to SIMP-025 to resolve an ID collision.

Fix outcome:
- 2026-06-04: Fixed together with `SIMP-009` by extracting `createRealtimeFallbackPoller` in `frontend/lib/ably.ts` and adding focused coverage in `frontend/tests/ably.test.ts`.
- Validation from Ably worker: `npm run test -- ably`, `npm run typecheck`, `npx eslint lib/ably.ts tests/ably.test.ts --max-warnings=0`, and `git diff --check -- frontend/lib/ably.ts frontend/tests/ably.test.ts` passed.

---

## Quick Wins

Use this section only for tiny cleanup candidates that are not worth a full
`SIMP-*` entry yet. If a quick win touches shared behavior, promote it to a
normal `SIMP-*` item.

- `<path>`: `<small cleanup candidate and why it is safe>`

## Do Not Touch For Now

Use this section for areas that look messy but are risky, product-sensitive, or
not worth changing during bug-fix work.

- `<area/path>`: `<why simplification should wait>`

## Possible Duplicates / Merged Findings

Use this section to prevent future agents from re-reporting the same thing.

- `<candidate>` merged into `SIMP-XXX` because `<same root cause>`.
- `<candidate>` rejected because `<already fixed / not enough evidence / only style preference>`.

## Scout Prompt

Use this prompt for cheap read-only agents:

```text
READ ONLY. Do not edit files, stage, commit, install packages, run formatters, or change workspace state.

You are a Simplification Scout.

Goal:
Find opportunities to lower complexity, reduce bloat, improve maintainability, and remove duplicated logic without changing behavior.

Scope:
Area: <payments / live sessions / gamification / topic workspace / quizzes / notifications / auth / admin / full repo>

Rules:
- Use rg, git grep, file reads, and git status.
- Do not run tests unless explicitly requested.
- Deduplicate aggressively against SIMPLIFICATION_DUMP.md.
- Same root cause = one item.
- Do not report style-only preferences.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md instead.

Return either:
1. A new SIMP item in the exact dump format, or
2. Evidence to append to an existing SIMP item, or
3. A short "no high-value simplification found" note.

Keep output under 120 lines.
```

## Ultra-Cheap Scout Prompt

Use this when token budget matters more than completeness:

```text
READ ONLY. Inspect <area> for one concrete simplification opportunity.

Use only rg/git grep/file reads/git status.
Do not edit, test, install, format, stage, or commit.
Deduplicate against SIMPLIFICATION_DUMP.md.

Output only:
- NEW SIMP block, or
- APPEND_TO existing SIMP, or
- REJECTED_OR_DUPLICATE, or
- NO_FINDING.

Stop after the first high-confidence result.
```

## Fixing Prompt

Use this prompt for stronger agents:

```text
Validate and, if appropriate, fix one SIMP item from SIMPLIFICATION_DUMP.md.

Rules:
- First confirm the item is still current.
- Do not broaden scope beyond the selected SIMP item.
- Preserve behavior and public contracts.
- Add or update focused tests when behavior could regress.
- If the item is stale, duplicate, or actually a bug, update the dump accordingly.
- If you implement it, run focused validation and commit the simplification separately from unrelated bug fixes when practical.

Return:
- Verdict: fixed / stale / duplicate / moved-to-bug-dump / deferred
- Files changed
- Validation run
- Commit hash, if committed
- Remaining risk
```

### SIMP-001 - Unify manual API hydration with SWR

Status: FIXED
Area: full repo pass
Risk: low
Expected payoff: medium

Files:
- \rontend/app/(dashboard)/courses/page.tsx\
- \rontend/app/(dashboard)/exam-bank/page.tsx\
- \rontend/app/admin/courses/page.tsx\

Current complexity:
Multiple React components and pages manually manage data fetching lifecycle inside \useEffect\ blocks. They duplicate boilerplate for \let alive = true\, manual loading states, manual error toasting with \sonner\, and raw \.then(...).catch(...)\ chains, while the project already uses \SWR\ effectively for other data layers.

Evidence:
- \rontend/app/(dashboard)/courses/page.tsx\: Manually fetches topics using \getJson\ and handles \loading\ state, \live\ flag, and \	oast.error\ inside a \useEffect\.
- \rontend/app/(dashboard)/exam-bank/page.tsx\: Duplicates the same manual \getJson\ fetching logic, flags, and error handling for exam banks.
- \rontend/app/admin/courses/page.tsx\: Duplicates manual fetching with manual error/loading states for the admin subjects list.

Suggested simplification:
Migrate these manual \useEffect\ fetching blocks to use custom hooks based on \useSWR\ (which is already configured in the repo), replacing the manual state management and error handling boilerplate.

Must preserve:
- Route queries, filtering logic, and debounce behavior (e.g., \EXAM_SEARCH_DEBOUNCE_MS\).
- Loading skeletons, retry capabilities, and error UI states.

Good first validation:
- Run the UI and navigate to the Courses and Exam Bank pages to verify data loads correctly.

Why not a duplicate:
Searched for "hydration", "alive", and "getJson" in SIMPLIFICATION_DUMP.md and found no existing items tracking this specific manual fetching duplication.

Notes for fixing agent:
- Start with \frontend/app/(dashboard)/courses/page.tsx\ or \frontend/app/(dashboard)/exam-bank/page.tsx\.
- Create shared hooks like \useCourseDiscoveryData\ similar to existing SWR hooks (e.g., \useExamQuizData\).

Resolution:
- 2026-06-05: Added `frontend/lib/courseDiscoveryData.ts` with SWR-backed hooks for course topics, exam bank search, and admin subjects. Replaced manual `useEffect`/`alive` fetch lifecycles in the three listed pages while preserving route query sync, loading states, retry, and toast behavior.

Validation:
- `npm run test -- examBankPage swallowedExceptions`
- `npm run typecheck`

---

### SIMP-011 - Replace legacy TopicWorkspaceQuizTab renderer with QuizPrimitiveRenderers

Status: INVALID
Area: topic workspace frontend
Risk: medium
Expected payoff: large

Files:
- `frontend/components/topic-workspace/TopicWorkspaceQuizTab.tsx`

Current complexity:
`TopicWorkspaceQuizTab` contains ~160 lines of legacy, raw HTML rendering logic (inputs, selects, buttons) for complex quiz question types like `matching`, `drag_and_drop`, and `ordering` (via the inline `QuizQuestion` component). The application already possesses a robust, highly-polished `QuizPrimitiveRenderers` module which supports these exact types with Framer Motion drag/drop, interactive SVG lines, and mature state management.

Evidence:
- `frontend/components/topic-workspace/TopicWorkspaceQuizTab.tsx`: Reinvents `matching` with raw HTML `<input>`s and `drag_and_drop` with HTML `<select>` dropdowns (lines 19-173).
- `frontend/components/quiz/QuizPrimitiveRenderers.tsx`: Fully implements `MatchingQuestion`, `DragDropQuestion`, and `OrderingQuestion` with interactive Framer Motion physics.

Suggested simplification:
Delete the custom `QuizQuestion` and `QuizQuestionCard` implementations from `TopicWorkspaceQuizTab.tsx`. Map the raw `tab.config_json.questions` payload into `QuizPrimitiveQuestion` models, and render them using `<QuestionRenderer>` from `QuizPrimitiveRenderers.tsx`.

Must preserve:
- `draftKey` caching of user answers (draft answers format may need to adapt to primitive shapes).
- Quiz submission logic and payload structure required by `/courses/tabs/${tab.id}/quiz/submit`.

Good first validation:
- Run a topic workspace quiz and ensure answers can be entered, cached, and submitted without errors.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "QuizPrimitiveRenderers" and "TopicWorkspaceQuizTab". Existing SIMPs do not cover this component replacement.

Notes for fixing agent:
- Start by mapping the config payload to the `QuizPrimitiveQuestion` types defined in `frontend/lib/quizPrimitiveViewModel.ts`.
- Ensure answer state (`answers`) maps cleanly to what `<QuestionRenderer>` expects.

Invalidation:
- 2026-06-05: Source inspection confirmed this is not a safe simplification. `QuizPrimitiveRenderers` is built for standalone, internally stateful self-check interactions, while `TopicWorkspaceQuizTab` owns a controlled `answers` map, draft persistence, attempt history, and a single backend batch submission contract. Reusing the primitive renderers would require a new controlled/exam mode in the primitives, which is a feature-level rewrite rather than a pragmatic simplification.

Validation:
- Inspected `frontend/components/quiz/QuizPrimitiveRenderers.tsx` and `frontend/components/topic-workspace/TopicWorkspaceQuizTab.tsx`.

---

### SIMP-012 - Extract useWorkspaceTree hook from TopicWorkspacePage

Status: FIXED
Area: topic workspace frontend
Risk: medium
Expected payoff: large

Files:
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`

Current complexity:
`TopicWorkspacePage` is a 450+ line God Component that mixes SWR data fetching, URL query parsing, and complex workspace tree navigation state (`activeItemId`, `activeTabSlot`, `openSectionIds`). This mixes UI rendering logic with complex `useEffect` synchronization blocks that react to URL changes and compute derived state (e.g., `railSections`, `availableTabSlots`).

Evidence:
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`: Manages 5 separate React states just for navigation/tree expansion, plus 3 effect blocks to sync them with URL changes and fetched data. 
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`: Contains inline helpers like `selectItem`, `toggleSection`, `selectRailItem`, and `selectWorkspaceTab` that could be encapsulated.

Suggested simplification:
Extract the tree management state, query parsing, and tab logic into a dedicated `useWorkspaceTree(workspace, routeQueryTargets)` hook. The page component should only handle layout composition and API mutation actions (`saveActive`, `completeActive`).

Must preserve:
- URL synchronization (e.g., `?item=123`) when navigating the workspace without full page reloads.
- The `preserveActiveTab` and `preserveOpenSections` behavior when the workspace is refreshed after completing an item.

Good first validation:
- Navigate between lessons in a topic and ensure the URL updates and the correct tab/video displays.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `TopicWorkspacePage` and `useWorkspaceTree`. No findings cover this state complexity.

Notes for fixing agent:
- Start with `frontend/app/(dashboard)/topics/[topicId]/page.tsx`.
- Move the state and derivation logic into `frontend/lib/topicWorkspaceSelection.ts` or a new hook file.

Resolution:
- 2026-06-05: Added `frontend/lib/topicWorkspaceTree.ts` and moved workspace request state, active item/tab selection, rail section expansion, query-target hydration, and refresh/retry wiring into `useWorkspaceTree`. `TopicWorkspacePage` now keeps routing, toasts, completion/save actions, and rendering.

Validation:
- `npm run test -- topicWorkspacePage topicWorkspacePanels topicWorkspaceViewModel topicWorkspaceData topicWorkspaceQuizTab topicQuizMemoization`
- `npm run typecheck`

---

### SIMP-013 - Extract Notes CRUD logic into a focused useTopicNotes hook

Status: FIXED
Area: topic workspace frontend
Risk: low
Expected payoff: medium

Files:
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`

Current complexity:
`TopicWorkspaceNotesTab` is a 280+ line component that tightly couples UI rendering with complex local state management for full CRUD operations. It manages 8 distinct `useState` hooks for loading, saving, editing, mutating, and API feature flags (`canEditNotes`, `canDeleteNotes`), along with explicit `AbortController` cancellation for data fetching.

Evidence:
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`: Manages complex inline API calls for `getJson`, `postJson`, `patchJson`, and `deleteJson`.
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`: Implements custom fallback logic (`isNoteMutationUnavailable`) inline to disable edit/delete buttons if the backend returns 404/405/501.

Suggested simplification:
Extract the data fetching, mutation, and feature flag state into a `useTopicNotes(topicId, itemId, tabContentId)` custom hook. The component should only be responsible for rendering the UI and calling `saveNote`, `editNote`, and `deleteNote` from the hook.

Must preserve:
- `isNoteMutationUnavailable` fallback logic that gracefully degrades the UI when editing/deleting is not supported.
- Caching integration with `readTopicWorkspaceDraft`.

Resolution:
- 2026-06-05: Added `frontend/hooks/useTopicNotes.ts` and moved note fetch, draft persistence, create/edit/delete mutations, and backend-unavailable fallbacks out of the tab component. `TopicWorkspaceNotesTab` now renders fields and note cards against hook state/actions.

Validation:
- `npm run test -- topicWorkspacePage topicWorkspacePanels topicWorkspaceViewModel topicWorkspaceData topicWorkspaceQuizTab topicQuizMemoization`
- `npm run typecheck`

Good first validation:
Rules:
- Use rg, git grep, file reads, and git status.
- Do not run tests unless explicitly requested.
- Deduplicate aggressively against SIMPLIFICATION_DUMP.md.
- Same root cause = one item.
- Do not report style-only preferences.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md instead.

Return either:
1. A new SIMP item in the exact dump format, or
2. Evidence to append to an existing SIMP item, or
3. A short "no high-value simplification found" note.

Keep output under 120 lines.
```

## Ultra-Cheap Scout Prompt

Use this when token budget matters more than completeness:

```text
READ ONLY. Inspect <area> for one concrete simplification opportunity.

Use only rg/git grep/file reads/git status.
Do not edit, test, install, format, stage, or commit.
Deduplicate against SIMPLIFICATION_DUMP.md.

Output only:
- NEW SIMP block, or
- APPEND_TO existing SIMP, or
- REJECTED_OR_DUPLICATE, or
- NO_FINDING.

Stop after the first high-confidence result.
```

## Fixing Prompt

Use this prompt for stronger agents:

```text
Validate and, if appropriate, fix one SIMP item from SIMPLIFICATION_DUMP.md.

Rules:
- First confirm the item is still current.
- Do not broaden scope beyond the selected SIMP item.
- Preserve behavior and public contracts.
- Add or update focused tests when behavior could regress.
- If the item is stale, duplicate, or actually a bug, update the dump accordingly.
- If you implement it, run focused validation and commit the simplification separately from unrelated bug fixes when practical.

Return:
- Verdict: fixed / stale / duplicate / moved-to-bug-dump / deferred
- Files changed
- Validation run
- Commit hash, if committed
- Remaining risk
```

### SIMP-001 - Unify manual API hydration with SWR

Status: DUPLICATE
Area: full repo pass
Risk: low
Expected payoff: medium

Files:
- \rontend/app/(dashboard)/courses/page.tsx\
- \rontend/app/(dashboard)/exam-bank/page.tsx\
- \rontend/app/admin/courses/page.tsx\

Current complexity:
Multiple React components and pages manually manage data fetching lifecycle inside \useEffect\ blocks. They duplicate boilerplate for \let alive = true\, manual loading states, manual error toasting with \sonner\, and raw \.then(...).catch(...)\ chains, while the project already uses \SWR\ effectively for other data layers.

Evidence:
- \rontend/app/(dashboard)/courses/page.tsx\: Manually fetches topics using \getJson\ and handles \loading\ state, \ live\ flag, and \	oast.error\ inside a \useEffect\.
- \rontend/app/(dashboard)/exam-bank/page.tsx\: Duplicates the same manual \getJson\ fetching logic, flags, and error handling for exam banks.
- \rontend/app/admin/courses/page.tsx\: Duplicates manual fetching with manual error/loading states for the admin subjects list.

Suggested simplification:
Migrate these manual \useEffect\ fetching blocks to use custom hooks based on \useSWR\ (which is already configured in the repo), replacing the manual state management and error handling boilerplate.

Must preserve:
- Route queries, filtering logic, and debounce behavior (e.g., \EXAM_SEARCH_DEBOUNCE_MS\).
- Loading skeletons, retry capabilities, and error UI states.

Good first validation:
- Run the UI and navigate to the Courses and Exam Bank pages to verify data loads correctly.

Why not a duplicate:
Searched for "hydration", "alive", and "getJson" in SIMPLIFICATION_DUMP.md and found no existing items tracking this specific manual fetching duplication.

Notes for fixing agent:
- Start with \frontend/app/(dashboard)/courses/page.tsx\ or \frontend/app/(dashboard)/exam-bank/page.tsx\.
- Create shared hooks like \useCourseDiscoveryData\ similar to existing SWR hooks (e.g., \useExamQuizData\).

---

### SIMP-011 - Replace legacy TopicWorkspaceQuizTab renderer with QuizPrimitiveRenderers

Status: DUPLICATE
Area: topic workspace frontend
Risk: medium
Expected payoff: large

Files:
- `frontend/components/topic-workspace/TopicWorkspaceQuizTab.tsx`

Current complexity:
`TopicWorkspaceQuizTab` contains ~160 lines of legacy, raw HTML rendering logic (inputs, selects, buttons) for complex quiz question types like `matching`, `drag_and_drop`, and `ordering` (via the inline `QuizQuestion` component). The application already possesses a robust, highly-polished `QuizPrimitiveRenderers` module which supports these exact types with Framer Motion drag/drop, interactive SVG lines, and mature state management.

Evidence:
- `frontend/components/topic-workspace/TopicWorkspaceQuizTab.tsx`: Reinvents `matching` with raw HTML `<input>`s and `drag_and_drop` with HTML `<select>` dropdowns (lines 19-173).
- `frontend/components/quiz/QuizPrimitiveRenderers.tsx`: Fully implements `MatchingQuestion`, `DragDropQuestion`, and `OrderingQuestion` with interactive Framer Motion physics.

Suggested simplification:
Delete the custom `QuizQuestion` and `QuizQuestionCard` implementations from `TopicWorkspaceQuizTab.tsx`. Map the raw `tab.config_json.questions` payload into `QuizPrimitiveQuestion` models, and render them using `<QuestionRenderer>` from `QuizPrimitiveRenderers.tsx`.

Must preserve:
- `draftKey` caching of user answers (draft answers format may need to adapt to primitive shapes).
- Quiz submission logic and payload structure required by `/courses/tabs/${tab.id}/quiz/submit`.

Good first validation:
- Run a topic workspace quiz and ensure answers can be entered, cached, and submitted without errors.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "QuizPrimitiveRenderers" and "TopicWorkspaceQuizTab". Existing SIMPs do not cover this component replacement.

Notes for fixing agent:
- Start by mapping the config payload to the `QuizPrimitiveQuestion` types defined in `frontend/lib/quizPrimitiveViewModel.ts`.
- Ensure answer state (`answers`) maps cleanly to what `<QuestionRenderer>` expects.

---

### SIMP-012 - Extract useWorkspaceTree hook from TopicWorkspacePage

Status: DUPLICATE
Area: topic workspace frontend
Risk: medium
Expected payoff: large

Files:
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`

Current complexity:
`TopicWorkspacePage` is a 450+ line God Component that mixes SWR data fetching, URL query parsing, and complex workspace tree navigation state (`activeItemId`, `activeTabSlot`, `openSectionIds`). This mixes UI rendering logic with complex `useEffect` synchronization blocks that react to URL changes and compute derived state (e.g., `railSections`, `availableTabSlots`).

Evidence:
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`: Manages 5 separate React states just for navigation/tree expansion, plus 3 effect blocks to sync them with URL changes and fetched data. 
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`: Contains inline helpers like `selectItem`, `toggleSection`, `selectRailItem`, and `selectWorkspaceTab` that could be encapsulated.

Suggested simplification:
Extract the tree management state, query parsing, and tab logic into a dedicated `useWorkspaceTree(workspace, routeQueryTargets)` hook. The page component should only handle layout composition and API mutation actions (`saveActive`, `completeActive`).

Must preserve:
- URL synchronization (e.g., `?item=123`) when navigating the workspace without full page reloads.
- The `preserveActiveTab` and `preserveOpenSections` behavior when the workspace is refreshed after completing an item.

Good first validation:
- Navigate between lessons in a topic and ensure the URL updates and the correct tab/video displays.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for `TopicWorkspacePage` and `useWorkspaceTree`. No findings cover this state complexity.

Notes for fixing agent:
- Start with `frontend/app/(dashboard)/topics/[topicId]/page.tsx`.
- Move the state and derivation logic into `frontend/lib/topicWorkspaceSelection.ts` or a new hook file.

---

### SIMP-013 - Extract Notes CRUD logic into a focused useTopicNotes hook

Status: DUPLICATE
Area: topic workspace frontend
Risk: low
Expected payoff: medium

Files:
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`

Current complexity:
`TopicWorkspaceNotesTab` is a 280+ line component that tightly couples UI rendering with complex local state management for full CRUD operations. It manages 8 distinct `useState` hooks for loading, saving, editing, mutating, and API feature flags (`canEditNotes`, `canDeleteNotes`), along with explicit `AbortController` cancellation for data fetching.

Evidence:
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`: Manages complex inline API calls for `getJson`, `postJson`, `patchJson`, and `deleteJson`.
- `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx`: Implements custom fallback logic (`isNoteMutationUnavailable`) inline to disable edit/delete buttons if the backend returns 404/405/501.

Suggested simplification:
Extract the data fetching, mutation, and feature flag state into a `useTopicNotes(topicId, itemId, tabContentId)` custom hook. The component should only be responsible for rendering the UI and calling `saveNote`, `editNote`, and `deleteNote` from the hook.

Must preserve:
- `isNoteMutationUnavailable` fallback logic that gracefully degrades the UI when editing/deleting is not supported.
- Caching integration with `readTopicWorkspaceDraft`.

Good first validation:
- Open a lesson, write a note, save it, edit it, and delete it to verify the full CRUD cycle works.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "useTopicNotes" and "TopicWorkspaceNotesTab". Extracting the full CRUD and fallback logic out of the UI is a distinct architectural separation concern.

Notes for fixing agent:
- Create `frontend/lib/topicWorkspaceNotes.ts` to house the new `useTopicNotes` hook.
- Move the `isNoteMutationUnavailable` utility out of the component.

---

### SIMP-014 - Extract shared video progress tracking hook

Status: DUPLICATE
Area: topic workspace frontend
Risk: low
Expected payoff: large

Files:
- `frontend/components/VideoPlayer.tsx`
- `frontend/components/YouTubeVideoPlayer.tsx`

Current complexity:
Both `VideoPlayer.tsx` and `YouTubeVideoPlayer.tsx` manage complex progress tracking and completion state for topic items. They duplicate identical logic for setting up a 30-second `setInterval` to autosave progress, cleaning up intervals, flushing progress on `pagehide` events, and calling the `/courses/topic-items/${lessonId}/complete` API.

Evidence:
- `frontend/components/VideoPlayer.tsx`: Lines 142-203 and 347-383 define `saveProgress`, `reportCompletion`, `progressIntervalRef` setup, and `pagehide` event listeners.
- `frontend/components/YouTubeVideoPlayer.tsx`: Lines 143-182 and 269-303 duplicate this exact same saving, reporting, interval polling, and `pagehide` teardown logic.

Suggested simplification:
Extract a `useTopicItemProgress(lessonId, playerRef, durationSeconds, onProgress, onComplete)` custom hook to manage the progress interval, `pagehide` flush, and API submission, leaving the UI components to focus solely on initializing the external player APIs (VdoCipher vs YouTube).

Must preserve:
- The 30-second autosave interval logic (`30000` ms).
- Flushing watched progress on `pagehide` events before unmounting.
- Fallback to `durationSeconds` when native player duration is unavailable or 0.

Good first validation:
- Run a lesson video (YouTube or VdoCipher), watch for 35 seconds, navigate away, and verify the `watched_seconds` API was called exactly once for the interval and once for the unmount flush.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md for "progress tracking", "VideoPlayer", and "interval". No existing SIMP items track this duplicated playback tracking state.

Notes for fixing agent:
- Start with `frontend/components/VideoPlayer.tsx`.
- Create the hook in `frontend/lib/videoProgress.ts`.

Duplicate resolution:
- Covered by the 2026-06-04 `useVideoProgress` extraction recorded under the earlier `SIMP-014 - Extract shared video progress tracking hook`.

---

### SIMP-015 - Extract shared frontend topic workspace test factories

Status: FIXED
Area: topic workspace frontend
Risk: medium
Expected payoff: large

Files:
- `frontend/tests/topicWorkspacePage.test.ts`
- `frontend/tests/topicWorkspacePanels.test.ts`
- `frontend/tests/topicWorkspaceViewModel.test.ts`

Current complexity:
Almost every frontend test file interacting with the topic workspace reinvents its own complex mock objects for `TopicItem`, `TabContent`, and `TopicWorkspace`. This results in hundreds of lines of duplicated fixture boilerplate, making it incredibly tedious to add new fields (like `can_access`) or reshape the workspace models without breaking dozens of hardcoded inline objects.

Evidence:
- `frontend/tests/topicWorkspacePage.test.ts`: Defines a 160-line `providerVideoWorkspace` object and an 80-line `youtubeWorkspace` clone with raw inline objects.
- `frontend/tests/topicWorkspacePanels.test.ts`: Duplicates its own `baseItem`, `resourceTab`, `notesTab`, and `commentsTab` with similar shapes.
- `frontend/tests/topicWorkspaceViewModel.test.ts`: Duplicates `baseItem`, `quizTab`, `resourceTab`, `commentsTab`, and builds its own inline `TopicWorkspace` objects.

Suggested simplification:
Create a shared frontend factory file `frontend/tests/factories/topicWorkspace.ts` with helper functions like `buildMockTopicItem()`, `buildMockTabContent()`, and `buildMockWorkspace()`. Refactor the test files to compose these factories instead of repeating raw object shapes.

Must preserve:
- The exact mock data shapes needed for test assertions (e.g. `is_missing: true`, `locked_reason`, and specific provider properties like `youtube`).

Good first validation:
- `npm run test -- frontend/tests/topicWorkspaceViewModel.test.ts`

Why not a duplicate:
`SIMP-013` addresses backend SQLAlchemy test domain fixtures in Python. This finding targets the frontend TypeScript mock data duplication.

Notes for fixing agent:
- Start with `frontend/tests/topicWorkspaceViewModel.test.ts` to define the factories.

Resolution:
- 2026-06-05: Added `frontend/tests/factories/topicWorkspace.ts` with shared builders for resources, tab content, topic items, sections, and workspaces. Refactored `topicWorkspacePage.test.ts`, `topicWorkspacePanels.test.ts`, and `topicWorkspaceViewModel.test.ts` to use the shared factory helpers.

Validation:
- `npm run test -- topicWorkspacePage topicWorkspacePanels topicWorkspaceViewModel topicWorkspaceData topicWorkspaceQuizTab topicQuizMemoization`
- `npm run typecheck`

---

### SIMP-014 - Unclear Service Boundary in Gamification Read Models

Status: FIXED
Area: gamification
Risk: medium
Expected payoff: medium

Files:
- \ackend/app/services/gamification_read_models.py\
- \ackend/app/routers/gamification.py\

Current complexity:
The \gamification_read_models.py\ file violates its "read models" boundary by housing write mutations (\claim_daily_quest_reward\ which updates quests and calls \ward_xp\). Additionally, read functions (\list_daily_quest_entries\, \uild_sidebar_summary\) trigger implicit write commits via \generate_daily_quests_with_status\.

Evidence:
- \gamification_read_models.py\: \claim_daily_quest_reward\ executes an \update(DailyQuest)\ and writes XP.
- \gamification_read_models.py\: Read functions call \generate_daily_quests_with_status\ and immediately \wait db.commit()\.

Suggested simplification:
Move \claim_daily_quest_reward\ and daily quest generation mutations into a write service (e.g., \ackend/app/services/daily_quests.py\ or \gamification_mutations.py\). Keep \gamification_read_models.py\ strictly read-only without side-effects.

Must preserve:
- Daily quest auto-generation before returning read models.
- Quest claim atomic updates.

Good first validation:
- \python -m pytest backend/tests_fastapi/test_gamification_routes.py\

Why not a duplicate:
Searched \SIMPLIFICATION_DUMP.md\ for \gamification_read_models\ and found no existing entries.

Notes for fixing agent:
- Extract write operations to a dedicated service file.
- Ensure routers inject \db.commit()\ when calling the separated write handlers, not the read handlers.

Resolution:
- 2026-06-05: Added `backend/app/services/daily_quests.py` for daily quest generation and claim mutations. `gamification_read_models.py` now only selects existing daily quests for read models, while `gamification.py` performs generation/claim writes and commits explicitly before returning read models or claim results.

Validation:
- `python -m pytest tests_fastapi/test_gamification_routes.py tests_fastapi/test_xp_service.py`
- `python -m pytest tests_fastapi/test_calendar.py -k sidebar`

---

### SIMP-015 - Duplicated DailyQuest Progress Updates

Status: DUPLICATE
Area: gamification
Risk: low
Expected payoff: small

Files:
- \ackend/app/services/xp.py\

Current complexity:
\ward_xp\ and \_apply_xp_totals_and_quests\ duplicate the \update(DailyQuest).where(...)\ logic for updating \earn_xp\ quests and specific reason-based quests.

Evidence:
- \xp.py\: \ward_xp\ has manual \update(DailyQuest)\ execution for single awards.
- \xp.py\: \_apply_xp_totals_and_quests\ duplicates the \earn_xp\ update and uses a \case\ statement to update multiple quest types for bulk awards.

Suggested simplification:
Extract an \_increment_daily_quests(db, user_id, active_date, amount, reason_counts)\ helper to unify single and bulk updates.

Must preserve:
- Progress updates must safely accumulate without race conditions.

Good first validation:
- \python -m pytest backend/tests_fastapi/test_xp_service.py\

Why not a duplicate:
No entries for \xp.py\ or \DailyQuest\ updates in \SIMPLIFICATION_DUMP.md\.

Notes for fixing agent:
- Consolidate the \update()\ queries into one helper function.

Outcome:
- 2026-06-04: Merged into `SIMP-012 - Merge singular gamification XP award into bulk handler`. `award_xp` now delegates to `award_xp_bulk`, so the duplicated single-award DailyQuest update path no longer exists. No separate helper was needed.
- Validation: `python -m pytest tests_fastapi/test_xp_service.py` from `backend/` passed.

---

Evidence:
- \rontend/components/figma/permanent-sidebar.tsx\: Manually manages data fetching, \live\ flag, and complex fallback \.catch\ chains inside a \useEffect\ instead of leveraging SWR.

Why same root cause:
It's another component managing the data fetching lifecycle manually inside \useEffect\ with \live\ flags instead of using SWR.


SIMP-017 - Dead SQLite Fallback Logic in XP Service
Scope: backend/app/services/xp.py

Evidence:
- _insert_xp_transaction_rows defines a fallback block: if insert_factory is None: return await _insert_xp_transaction_rows_fallback(db, rows)
- _increment_user_xp_total has an identical fallback: if insert_factory is not None: ... return followed by a 10-line 	ry/except IntegrityError block.
- insert_factory is populated using sqlite_insert if dialect_name == "sqlite" else postgresql_insert if dialect_name == "postgresql" else None
- Since the app exclusively uses PostgreSQL (prod) and SQLite (tests) - as verified by ackend/app/database.py - insert_factory is NEVER None.
- Therefore, _insert_xp_transaction_rows_fallback and the latter half of _increment_user_xp_total are entirely dead code, serving as a stale fallback path that bloats the transaction service.

Simplification:
Remove the insert_factory is None checks and the dead fallback methods. Assert or assume it's one of the two supported dialects, drastically simplifying the file.

Verdict:
- 2026-06-04: INVALID for this pass. The code currently contains explicit fallback behavior for non-SQLite/non-PostgreSQL dialects; removing it would convert a portability fallback into a hard architecture constraint without a matching production/test gate. Kept the fallback paths intact.

SIMP-018 - Massive Code Duplication in Quiz Submission Logic
Scope: backend/app/services/course_tab_quiz_submission.py & backend/app/routers/quizzes.py

Evidence:
- ackend/app/routers/quizzes.py (_submit_legacy_quiz_attempt) and ackend/app/services/course_tab_quiz_submission.py (submit_tab_quiz_attempt) duplicate approximately 150 lines of complex business logic.
- Both functions iterate over questions, grade them via grade_quiz_question, build a massive list of QuestionAttempt payloads, calculate XP conditionally via ward_xp_bulk, and update the DB manually.
- The router directly implements gamification and grading side-effects rather than delegating to a shared quiz submission service.

Simplification:
Extract a unified submit_quiz_attempt function into a shared service (e.g. quiz_submission.py). The router and the course tab service should only resolve their respective context (Tab vs QuestionSet) and delegate the grading, XP, and DB insertion logic to the shared function.

### SIMP-002 - Consolidate AccessGuard mixins for API schemas and frontend types

Status: FIXED
Area: frontend guards / backend dependencies
Risk: medium
Expected payoff: medium

Files:
- \ackend/app/schemas/courses.py\
- \rontend/app/(dashboard)/courses/page.tsx\
- \rontend/app/(dashboard)/exam-bank/page.tsx\
- \ackend/app/services/course_access.py\

Current complexity:
Pydantic API responses (\ResourceOut\, \TabContentOut\, \TopicItemOut\, \TopicCardOut\, \TopicWorkspaceOut\, \ExamOut\, \ExamProblemOut\) and their corresponding frontend TypeScript interfaces (\TopicCard\, \Exam\, \ExamProblem\) manually duplicate the exact same 6 authorization fields (\can_access\, \locked_reason\, \ccess_reason\, \
equired_tier\, \
equired_feature_key\, \
equired_subject_id\). The backend \pply_access_decision\ function relies on \hasattr\ (duck typing) instead of type-safe mixins or base classes.

Evidence:
- \ackend/app/schemas/courses.py\: \ResourceOut\, \TabContentOut\, and multiple other models duplicate the exact same authorization field definitions and defaults.
- \ackend/app/services/course_access.py\: \pply_access_decision\ uses \if hasattr(out, "required_subject_id"):\ to patch these duplicated fields.
- \rontend/app/(dashboard)/courses/page.tsx\: Manually re-declares \interface TopicCard\ with these auth fields instead of importing a shared type.

Suggested simplification:
Extract the authorization payload fields into an \AccessGuardedMixin\ base Pydantic class and an \AccessGuarded\ TypeScript interface. Update the Pydantic schemas to inherit from this mixin, and refactor \pply_access_decision\ to be type-safe against the mixin.

Must preserve:
- Existing API response shapes, JSON serialization, and UI behavior.
- Frontend conditional rendering based on \can_access\ and \locked_reason\.

Good first validation:
- \python -m pytest backend/tests_fastapi/test_course_access.py\

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md and found no existing items tracking schema or interface duplication for authorization fields.

Notes for fixing agent:
- Start with \ackend/app/schemas/courses.py\.
- Avoid breaking frontend type bindings while refactoring.

Resolution:
- 2026-06-05: Added `AccessGuardedMixin` in `backend/app/schemas/courses.py` and made the guarded course/exam response schemas inherit the shared access payload fields. `apply_access_decision` is now typed against the mixin and assigns the shared fields directly instead of duck-typing with `hasattr`. Added a frontend `AccessGuarded` interface in `frontend/lib/topicWorkspaceTypes.ts` and reused it from topic workspace and course discovery response types.

Validation:
- `python -m pytest tests_fastapi/test_course_access.py`
- `npm run typecheck`

### SIMP-003 - Deduplicate Admin Auth Login with authenticate_password_login

Status: FIXED
Area: admin / auth
Risk: medium
Expected payoff: small

Files:
- \ackend/app/admin/auth.py\
- \ackend/app/services/auth_account.py\

Current complexity:
The Admin Staff login system (\StaffAdminAuth.login\) completely duplicates the password verification, active status check, unusable password check, and email verification check logic already defined in the shared \uthenticate_password_login\ service function.

Evidence:
- \ackend/app/admin/auth.py\: \StaffAdminAuth.login\ manually calls \is_unusable_password\, \erify_password\, \user.is_active\, and \user.is_email_verified\.
- \ackend/app/services/auth_account.py\: \uthenticate_password_login\ performs the exact same sequence of checks.

Suggested simplification:
Refactor \StaffAdminAuth.login\ to call \uthenticate_password_login\, handling any specific admin/staff validations (like \is_staff\ and session updates) after the common authentication helper succeeds.

Must preserve:
- Admin Audit logging for failed and successful attempts (\_write_admin_auth_audit\).
- Protection against non-staff users accessing the SQLAdmin interface.

Good first validation:
- Admin login flow manually or \python -m pytest backend/tests_fastapi/test_admin_overview.py\ if auth tests exist there.

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md and found no existing items tracking duplicated password login logic in the admin module.

Notes for fixing agent:
- Start with \ackend/app/admin/auth.py\.
- Avoid changing the SQLAdmin session generation mechanics.

Resolution:
- 2026-06-05: `StaffAdminAuth.login` now delegates shared active/email/password validation to `authenticate_password_login`, while keeping SQLAdmin-specific missing-credential/database-unavailable audits, staff-only authorization, session keys, last-login update, and success/failure audit writes.

Validation:
- `python -m pytest tests_fastapi/test_sqladmin_auth.py::test_sqladmin_login_requires_database_staff_user_and_audits tests_fastapi/test_sqladmin_auth.py::test_sqladmin_login_delegates_password_authentication_to_account_service tests_fastapi/test_sqladmin_auth.py::test_sqladmin_session_revokes_when_staff_status_changes tests_fastapi/test_auth.py::test_token_guarded_auth_mutations_stay_out_of_router`

### SIMP-004 - Convert _require_course_admin inline check into a FastAPI Dependency

Status: DUPLICATE
Area: course authoring / admin
Risk: low
Expected payoff: small

Files:
- \ackend/app/routers/courses.py\

Current complexity:
The course authoring routes manually fetch \user: User = Depends(get_current_user)\ and then invoke an inline helper \_require_course_admin(user)\ inside the function body, instead of using a standard FastAPI \Depends\ flow (like \get_current_staff_user\ or \get_current_professor_user\ in \dependencies.py\), creating an unclear boundary between route definition and frontend guards.

Evidence:
- \ackend/app/routers/courses.py\: \create_subject\ and \create_topic\ use \_require_course_admin(user)\ manually in the route body instead of using a dependency injection.

Suggested simplification:
Extract \_require_course_admin\ into a FastAPI dependency (e.g., \get_current_course_admin\ in \dependencies.py\ or inside the router) and inject it directly via \Depends()\ in the route signatures.

Must preserve:
- Both \is_staff\ and \
ole == "professor"\ users must be allowed.
- The \403\ HTTPException detail message.

Good first validation:
- \python -m pytest backend/tests_fastapi/test_course_topic_mutations.py\

Why not a duplicate:
Searched SIMPLIFICATION_DUMP.md and found no existing items tracking inline authorization checks in the courses router.

Notes for fixing agent:
- Start with \ackend/app/routers/courses.py\.
- Ensure the extracted dependency is only used for endpoints that actually require course administration access.

Duplicate/stale resolution:
- 2026-06-05: Left as duplicate. This is already covered by the earlier `SIMP-012 - Centralize course admin authorization check`, and the details here are stale: current catalog mutations intentionally allow only verified staff, not professors. `backend/tests_fastapi/test_course_access.py::test_global_course_catalog_mutations_are_staff_only` covers that behavior.

APPEND_TO: SIMP-001 - Unify manual API hydration with SWR

Evidence:
- \rontend/app/(dashboard)/exam-bank/page.tsx\: The \ExamBankPage\ implements a manual debounced search using \useEffect\, \getJson\, and a manual \let alive = true\ cancellation token, along with manually maintained \loading\ and \error\ states.

Why same root cause:
Another instance of manual data fetching lifecycle and race-condition handling that should be replaced with \useSWR\.

SIMP-019 - Remove Redundant Retryable Error Wrapper in Stripe Service
Scope: backend/app/services/stripe_service.py

Evidence:
- \_is_retryable_checkout_verification_error(exc)\ is defined as a one-line identity wrapper that simply returns \_is_retryable_stripe_error(exc)\.
- It adds no new logic or semantic value and is used exactly once in \erify_checkout_session\.

Simplification:
Remove \_is_retryable_checkout_verification_error\ entirely and have \erify_checkout_session\ call \_is_retryable_stripe_error\ directly.

Verdict:
- 2026-06-04: FIXED. Removed the one-line wrapper and used `_is_retryable_stripe_error` directly in `backend/app/services/stripe_service.py`.
- Validation: `python -m pytest tests_fastapi/test_stripe_service.py` from `backend/` passed.

---

SIMP-020 - Clean up dead code and consolidate AuthSessionOut generation
Scope: backend/app/routers/users.py

Evidence:
- \ackend/app/routers/users.py\ contains four unused password-hashing wrapping functions (\_hash_password\, \_verify_password\, \_hash_password_async\, \_verify_password_async\) which are completely dead code.
- The endpoints \google_login\, \erify_email\, and \login\ all duplicate the exact same 3-line sequence to mint a JWT, set cookies, and construct the response: \	oken = create_token(user, settings)\, \csrf_token = _set_auth_cookies(response, token, user, settings)\, \
eturn AuthSessionOut(user=_user_out(user, settings), csrf_token=csrf_token)\.

Simplification:
Delete the dead password wrappers. Extract the JWT minting, cookie assignment, and response generation into a single helper \_build_auth_session(user, response, settings) -> AuthSessionOut\ to drastically reduce endpoint boilerplate.

SIMP-021 - Eliminate redundant interaction queries
Scope: backend/app/services/professor_live_interactions.py

Evidence:
- In \update_professor_live_interaction_state\ and \delete_professor_live_interaction_state\, the code manually fetches the exact same interaction record *three* times using \wait require_professor_live_interaction(db, professor, interaction_id)\ within a single function execution.
- It is re-fetched after \db.flush()\ and \db.commit()\ instead of safely utilizing \wait db.refresh(interaction)\ or just relying on the loaded instance.

Simplification:
Remove the repeated \
equire_professor_live_interaction\ queries. Fetch once at the start of the function and use \db.refresh(interaction)\ at the end to massively cut down redundant database querying.

---

SIMP-022 - Extract duplicated realtime subscription React Hook
Scope: frontend/app/(dashboard)/live/page.tsx and frontend/app/(dashboard)/calendar/page.tsx

Evidence:
- Both \live/page.tsx\ and \calendar/page.tsx\ duplicate an identical 30-line \useEffect\ hook responsible for orchestrating Ably realtime channel subscriptions.
- The duplicated hook manually tracks mounted state with a \stopped\ flag, attempts \listKrescoRealtimeSubscriptions\, subscribes via \subscribeKrescoRealtimeChannels\, and implements a fallback to a personal channel on error.

Simplification:
Extract this massive block of boilerplate into a shared \useKrescoRealtimeSubscriptions(onMessage: () => void)\ React hook to deduplicate the realtime channel setup logic and make the dashboard pages cleaner.


---

SIMP-025 - Migrate admin overview and course subject pages to SWR
Scope: frontend/app/admin/page.tsx and frontend/app/admin/courses/[subjectId]/page.tsx

Evidence:
- Both the admin overview dashboard and the admin subject details page manually manage data fetching using useEffect, getJson, and manual state properties like loading, error, reloadNonce, and loadingTopicIds. This results in highly verbose code and redundant race-condition / re-render handling.
- frontend/app/admin/page.tsx: Uses a useEffect with a reloadNonce to fetch /admin/overview and manually sets loading, forbidden, fallback, or ready states.
- frontend/app/admin/courses/[subjectId]/page.tsx: Uses Promise.all in a useEffect to fetch subject and topics manually. Uses another manual getJson inside loadTopicSections while tracking loadingTopicIds and topicSectionErrors sets.

Simplification:
Replace the manual useEffect API hydration in both pages with useSWR hooks. useSWR naturally provides data, error, isLoading, and mutate which trivially handle retries, suspense-like states, and caching. The 403 Forbidden check in admin/page.tsx can easily map to a fallback UI.

**Validity Update (Scout Analysis): HIGHLY VALID.**
I checked `frontend/app/admin/page.tsx`. It uses 20 lines of manual state orchestration (`setState('loading')`, `setState('ready')`, `setState('fallback')`, etc.) and `useEffect` with a `reloadNonce` to fetch the admin overview. Porting to `useSWR` would completely eliminate the state machine and reload nonce, greatly simplifying the data fetching layer.

---

SIMP-024 - Extract unified useDraftStorage hook
Scope: frontend/app/(dashboard)/exam/[subjectId]/page.tsx and frontend/components/topic-workspace/topicWorkspaceDraftCache.ts

Evidence:
- exam/page.tsx manually manages draft saving to window.localStorage inside a large useEffect using readExamDraft, writeExamDraft, and removeExamDraft.
- topicWorkspaceDraftCache.ts maintains an in-memory Map via readTopicWorkspaceDraft and writeTopicWorkspaceDraft, completely disconnected from the actual storage API.
- The exam page also contains 75+ lines of logic for sanitizing answers, validating question orders, and clamping indexes just to load the draft safely.

Simplification:
Extract a shared useDraftStorage generic React hook that handles safe hydration, localStorage serialization/deserialization, and automatic debounced background saving. This will massively reduce the boilerplate in exam/page.tsx and allow the topic workspace to easily gain real persistence without reinventing the storage wheel.
 C o n f i r m s   t h e   d e a d   c o d e   a n d   d u p l i c a t i o n   a n a l y s i s . 
 
 - - - 
 
 A P P E N D _ T O :   S I M P - 0 2 1 
 
 E v i d e n c e : 
 -    a c k e n d / a p p / s e r v i c e s / p r o f e s s o r _ l i v e _ i n t e r a c t i o n s . p y :   C o n f i r m e d   t h a t   i n t e r a c t i o n   =   a w a i t   r e q u i r e _ p r o f e s s o r _ l i v e _ i n t e r a c t i o n ( d b ,   p r o f e s s o r ,   i n t e r a c t i o n _ i d )   i s   i n v o k e d   i n i t i a l l y ,   t h e n   r e - i n v o k e d   i m m e d i a t e l y   a f t e r   d b . f l u s h ( ) ,   a n d   t h e n   r e - i n v o k e d   * a g a i n *   a f t e r   d b . c o m m i t ( ) . 
 
 W h y   s a m e   r o o t   c a u s e : 
 C o n f i r m s   t h e   e x t r e m e   D B   f e t c h   r e d u n d a n c y . 
 
 - - - 
 
 A P P E N D _ T O :   S I M P - 0 2 4 
 
 E v i d e n c e : 
 -    r o n t e n d / a p p / ( d a s h b o a r d ) / e x a m / [ s u b j e c t I d ] / p a g e . t s x :   C o n t a i n s   o v e r   1 0 0   l i n e s   d e d i c a t e d   t o   p a r s i n g ,   v a l i d a t i n g ,   w r i t i n g ,   a n d   c l a m p i n g   l o c a l   s t o r a g e   d r a f t   s t a t e   m a n u a l l y . 
 -    r o n t e n d / c o m p o n e n t s / t o p i c - w o r k s p a c e / t o p i c W o r k s p a c e D r a f t C a c h e . t s :   U s e s   a   t r a n s i e n t   M a p < s t r i n g ,   u n k n o w n >   t h a t   l o s e s   a l l   d r a f t s   o n   p a g e   r e f r e s h . 
 
 W h y   s a m e   r o o t   c a u s e : 
 C o n f i r m s   t h a t   e x t r a c t i n g   u s e D r a f t S t o r a g e   w i l l   d e l e t e   m a s s i v e   b o i l e r p l a t e   a n d   f i x   t h e   w o r k s p a c e   p e r s i s t e n c e   b u g   s i m u l t a n e o u s l y . 
 
 

APPEND_TO: SIMP-020

Evidence:
- ackend/app/routers/users.py: Verified _hash_password, _verify_password, _hash_password_async, _verify_password_async are 100% unreferenced in the file.
- ackend/app/routers/users.py: google_login, erify_email, and login all end with the exact 3 identical lines of token generation and response building.

Why same root cause:
Confirms the dead code and duplication analysis.

---

APPEND_TO: SIMP-021

Evidence:
- ackend/app/services/professor_live_interactions.py: Confirmed that interaction = await require_professor_live_interaction(db, professor, interaction_id) is invoked initially, then re-invoked immediately after db.flush(), and then re-invoked *again* after db.commit().

Why same root cause:
Confirms the extreme DB fetch redundancy.

---

APPEND_TO: SIMP-024

Evidence:
- rontend/app/(dashboard)/exam/[subjectId]/page.tsx: Contains over 100 lines dedicated to parsing, validating, writing, and clamping local storage draft state manually.
- rontend/components/topic-workspace/topicWorkspaceDraftCache.ts: Uses a transient Map<string, unknown> that loses all drafts on page refresh.

Why same root cause:
Confirms that extracting useDraftStorage will delete massive boilerplate and fix the workspace persistence bug simultaneously.


APPEND_TO: SIMP-017 - Dead SQLite Fallback Logic in XP Service

Evidence:
- Verified that backend/app/database.py and backend/app/config.py strictly enforce either 'sqlite' or 'postgresql'. The insert_factory resolution in xp.py will NEVER evaluate to None. The fallback code block inside _insert_xp_transaction_rows and the try/except block in _increment_user_xp_total are therefore 100% dead code and can be safely deleted. This elevates the expected payoff to Large, as it eliminates completely unreachable complex IntegrityError recovery paths.

Why same root cause:
Further validation of the dead code blocks identified in the XP service.



APPEND_TO: SIMP-011 - Replace legacy TopicWorkspaceQuizTab renderer with QuizPrimitiveRenderers

Evidence:
- Further inspection of frontend/components/quiz/QuizPrimitiveRenderers.tsx confirms that it is a highly robust 40kb file natively supporting Framer Motion-based interactivity. The duplicated implementation in TopicWorkspaceQuizTab.tsx relies on standard HTML elements without proper interactivity mapping, creating a fractured UX experience across the application and proving that this replacement is a high-value architecture consolidation.

Why same root cause:
Strengthens the case for replacing the legacy rendering loop with the robust existing primitives.



APPEND_TO: SIMP-018 - Massive Code Duplication in Quiz Submission Logic

Evidence:
- Further inspection confirms that the backend splits its quiz grading and progression logic entirely between legacy exam endpoints (routers/quizzes.py) and new course tab workflows (course_tab_quiz_submission.py). Both workflows use the exact same grading sub-routines but manually handle database flushes, XP award generation, and transaction commits independently. Extracting a shared QuizGrader service is highly valid to prevent discrepancies in XP distributions or grading behaviors.

Why same root cause:
Further validates the structural separation of grading logic that should be unified.



APPEND_TO: SIMP-016 - LeaderboardRank Projection Full-Table Drop

Evidence:
- Verified in backend/app/services/gamification_read_models.py that refresh_leaderboard_projection_if_stale literally performs 'await db.execute(delete(LeaderboardRank))' followed by a loop that calculates dense rank for EVERY active user and reinserts. On a database with thousands of users, this table drop and re-insert creates massive WAL bloat, lock contention, and transaction size.

Suggested Alternative/Enhancement:
- Raise the validity to High payoff. This should be replaced with either a PostgreSQL MATERIALIZED VIEW (refresh concurrently) or an 'ON CONFLICT (user_id) DO UPDATE' to only touch rows that actually changed rank.

Why same root cause:
Further validates the structural inefficiency of the leaderboard projection.

---

APPEND_TO: SIMP-025 - Migrate admin overview and course subject pages to SWR

Evidence:
- `frontend/app/admin/page.tsx`: Uses a `reloadNonce` anti-pattern as a dependency in a `useEffect` to trigger manual refetches (line 95), which `useSWR` handles natively via `mutate()`.
- `frontend/app/admin/courses/[subjectId]/page.tsx`: `loadTopicSections` manually tracks race conditions and per-item loading states using `loadingTopicIds` (Set) and `topicSectionErrors` (Record) (lines 86-108). `useSWR` would completely eliminate this granular loading boilerplate.

Why same root cause:
Both pages reinvent robust data-fetching primitives (retries, race conditions, granular loading states) that the project's existing `useSWR` setup already solves perfectly.

---

APPEND_TO: SIMP-024 - Extract unified useDraftStorage hook

Evidence:
- `frontend/components/topic-workspace/topicWorkspaceDraftCache.ts`: Confirmed it uses an ephemeral `new Map()` (line 1). This means students lose all topic workspace draft data (quizzes/notes) if they accidentally refresh the page, proving the current divergence is not just a code smell but a UX flaw that unified `localStorage` would fix.

Why same root cause:
The lack of a shared persistence hook caused the exam page to over-engineer its own `localStorage` implementation while the topic workspace settled for a volatile in-memory map.

---

APPEND_TO: SIMP-014 - Extract shared video progress tracking hook

Evidence:
- `frontend/components/VideoPlayer.tsx` and `frontend/components/YouTubeVideoPlayer.tsx`: Both players duplicate identical `isActiveLesson(lessonId, lessonIdentityRef.current)` identity checks inside their `setInterval` loops. This prevents race conditions where a stale closure saves progress for the wrong video if the user navigates quickly.

Why same root cause:
Video playback state requires identical lifecycle management (intervals, idempotency checks, unmount flushes) regardless of the underlying player API.


---

APPEND_TO: SIMP-011 - Replace legacy TopicWorkspaceQuizTab renderer with QuizPrimitiveRenderers

Evidence:
- QuizPrimitiveRenderers.tsx: Confirmed that primitives like ChoiceQuestion manage their own internal useState('selected') and lack an onChange or alue prop to lift state up.
- TopicWorkspaceQuizTab.tsx: Manages a single controlled nswers record that is submitted to the backend as a complete attempt.

Why same root cause:
**Validity Update (Scout Analysis): DEFERRED.** The primitive renderers are built for interactive self-checking (immediate feedback), not batch-submission exams. Integrating them into the workspace quiz tab requires a massive architectural rewrite of the primitives to support a controlled ''exam mode'' without internal feedback states. Not a simple refactor.

---

APPEND_TO: SIMP-013 - Extract Notes CRUD logic into a focused useTopicNotes hook

Evidence:
- rontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx: Confirmed it has 280 lines where UI rendering is completely buried inside manual API tracking (AbortController, saveNote, saveEditedNote, deleteNote, canEditNotes, isMutating, 
ote, editingBody).

Why same root cause:
Extracting a clean useTopicNotes hook would separate this massive block of manual data-fetching and caching state from the visual layout, matching the SWR migration pattern perfectly. Highly valid.

---

APPEND_TO: SIMP-014 - Extract shared video progress tracking hook

Evidence:
- rontend/components/VideoPlayer.tsx and rontend/components/YouTubeVideoPlayer.tsx: Both players duplicate identical isActiveLesson(lessonId, lessonIdentityRef.current) identity checks inside their setInterval loops. This prevents race conditions where a stale closure saves progress for the wrong video if the user navigates quickly.

Why same root cause:
Video playback state requires identical lifecycle management (intervals, idempotency checks, unmount flushes) regardless of the underlying player API. Highly valid.

---

APPEND_TO: SIMP-014 - Unclear Service Boundary in Gamification Read Models

Evidence:
- ackend/app/services/gamification_read_models.py: Confirmed that claim_daily_quest_reward runs update(DailyQuest).values(completed=True) and triggers ward_xp.

Why same root cause:
Mixing mutations that update quests and grant XP into a ''read models'' file violates service boundaries and makes caching/scaling read traffic error-prone. Highly valid.


APPEND_TO: SIMP-001 - Extract student track and subject scope filtering

Evidence:
- A grep across backend/app/services confirms that realtime_access.py and professor_queries.py duplicate the exact same subject_scope_enforced condition checking: 'if access_context.subject_scope_enforced: filters.append(CourseOffering.subject_id.in_(access_context.active_subject_ids))'.
- This logic is duplicated at least 3 times verbatim, which increases the likelihood of data leaks if new realtime or query functions are added but developers forget to apply the active_subject_ids filter.

Why same root cause:
Further validates the extraction of the complex subject scope rules into a unified access control filter list.

---

APPEND_TO: SIMP-012 - Centralize course admin authorization check

Evidence:
- I reviewed the admin role condition across courses.py, calendar_read_models.py, and gamification_read_models.py.
- The course router strictly checks 'user.is_staff or user.role == "professor"', explicitly omitting 'user.is_superuser'. The other files include 'user.is_superuser'. This is a very dangerous divergence where a superuser might be denied access to create a topic but granted access to see calendar projections, leading to unpredictable frontend state where buttons render but API calls 403.

Why same root cause:
Highlights the concrete bug risks that stem from inline authorization logic instead of using a unified Depends() or shared policy function.

---

APPEND_TO: SIMP-008 - Decouple ORM mutation from Stripe API client

Evidence:
- Verified that stripe_service.py's _call_stripe wrapper natively mutates 'user.stripe_customer_id = customer_id' on line 125 before completing the API call.
- This creates an implicit, invisible ORM mutation dependency where the checkout router is forced to run 'persist_created_stripe_customer' to flush an object that it did not explicitly modify.

Why same root cause:
Confirms the architectural smell of mixing HTTP clients with ORM mutations.

---

## 2026-06-04 Fixing-Agent Triage Notes

This pass fixed the scoped items that could be validated without broad product or
schema changes, and normalized the remaining queue statuses.

- `DEFERRED` auth/onboarding items (`SIMP-002`, `SIMP-003`, `SIMP-005`, staff/admin auth): valid concerns, but they cross login, onboarding, product/security boundaries and need a dedicated auth pass.
- `MOVED_TO_BUG_DUMP` course-admin and calendar/sidebar visibility policy items: these overlap existing bug-dump access-control work and should be fixed as correctness/security issues before simplification.
- `DEFERRED` payment items: schema/header/API changes and payment attempt state-machine refactors are not behavior-preserving quick simplifications.
- `DEFERRED` large frontend hooks (`video progress`, `exam draft`, `workspace tree`, `notes CRUD`, `manual SWR hydration`, `useClickOutside`): valid but require broader UI/runtime validation than this scoped pass.
- `DUPLICATE` quiz-submission, live-session-transition, topic-workspace, and video-progress repeats: same root cause as earlier queue items; keep one canonical deferred item rather than multiple numbered copies.
- `DEFERRED` gamification read-model boundary and chat handler consolidation: valid service-boundary work, but too broad for a behavior-preserving quick pass.

