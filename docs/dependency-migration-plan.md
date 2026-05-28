# Dependency Migration Plan

This plan governs the docs-driven, test-driven dependency migration for the Kresco MVP app. It is intentionally split into small verified batches so the app is never upgraded and debugged as one large unknown.

## Source Of Truth

- Next.js 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- Next.js Turbopack config: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
- Next.js Turbopack API: https://nextjs.org/docs/app/api-reference/turbopack
- Next.js Cache Components: https://nextjs.org/docs/app/getting-started/cache-components
- Next.js ESLint config: https://nextjs.org/docs/app/api-reference/config/eslint
- Next.js lazy loading: https://nextjs.org/docs/app/guides/lazy-loading
- Next.js CLI analyzer: https://nextjs.org/docs/api-reference/cli
- React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- Playwright for Next.js: https://nextjs.org/docs/app/guides/testing/playwright
- Playwright web server config: https://playwright.dev/docs/test-webserver
- FastAPI release notes: https://fastapi.tiangolo.com/release-notes/
- Starlette release notes: https://www.starlette.io/release-notes/
- HTTPX changelog: https://github.com/encode/httpx/blob/master/CHANGELOG.md
- SQLAlchemy changelog: https://docs.sqlalchemy.org/en/20/changelog/
- Alembic changelog: https://alembic.sqlalchemy.org/en/latest/changelog.html

## Current Baseline

Verified locally before starting migration work:

- `frontend`: `npm run test`, `npm run lint`, `npm run build`, and `npx tsc --noEmit` pass.
- `backend`: `python -m pytest -q` passes with 22 tests.
- Current `next build` highlights these large routes:
  - `/topics/[topicId]`: 557 kB first-load JS.
  - `/animated-showcase`: 485 kB first-load JS.
  - dashboard routes such as `/home`, `/courses`, `/profile`, `/exam-bank`: about 201-203 kB first-load JS.

The first migration requirement is to keep these gates green before and after every dependency batch.

## Implemented Status

Completed in the first frontend migration slice:

- Upgraded the framework baseline to Next.js 16.2.6 and React 19.2.6.
- Switched frontend linting from removed `next lint` behavior to ESLint flat config.
- Added a Turbopack `root` and `resolveAlias` config for the optional native `canvas` module path.
- Kept a Webpack alias fallback for the same `canvas` stub while the app remains compatible with both bundler paths.
- Removed unused `@monaco-editor/react`.
- Replaced the single Mafs-based function explorer with a local SVG implementation and removed `mafs`, avoiding a React 19 peer mismatch from `use-resize-observer`.
- Updated `axios`, `postcss`, and `vitest`; `npm audit` currently reports zero vulnerabilities.
- Centralized the watch page's raw lesson HTML rendering behind `frontend/lib/sanitizeHtml.ts` and added unit coverage for blocked tags, event handlers, safe links, and unsafe link protocols.
- Split `watch/[lessonId]` heavy client panes with `next/dynamic`: VdoCipher video playback, video quiz overlay, section quiz, activity renderer, and chapter sidebar now load as separate chunks. The watch page also dispatches mascot events locally instead of importing the full mascot component for a helper function.
- Removed cosmetic `framer-motion` usage from shared dashboard chrome (`TopNav`) and `PermanentSidebar`, replacing it with CSS transitions so common dashboard routes do not inherit Framer Motion through the persistent layout/sidebar path.
- Replaced the static root `sonner` `Toaster` import with a small `AppToaster` client wrapper that imports `sonner` after mount, keeping the SDK out of the root server layout and initial module graph for routes that do not need toast behavior immediately.
- Added a Next.js 16 `proxy.ts` auth boundary: the client mirrors `kresco_token` into a same-site cookie, protected routes redirect server-side when the token is missing or expired, `/` redirects to `/home` for valid sessions, and the existing client `AuthGuard` remains as a fallback.
- Confirmed production build runs through `Next.js 16.2.6 (Turbopack)`.
- Added Playwright smoke coverage for browser-level migration confidence. It starts `next start`, mocks frontend API calls, seeds auth where needed, and verifies auth/reset, calendar, payment success, admin overview, topic workspace, watch page, and a lazy animated Lab renderer path.
- Added Playwright Chromium install and browser smoke steps to frontend CI and the frontend deploy workflow.
- Lazy-loaded animated renderer families with `next/dynamic` so the topic workspace no longer imports every animated source-port family on first paint.
- Narrowed the topic route imports from the animated barrel to registry runtime code plus type-only imports.
- Generated Next 16 Turbopack analyzer output with `npx next experimental-analyze --output` at `frontend/.next/diagnostics/analyze`.
- Upgraded backend SQL, web/admin/config, and external dependencies through:
  - `fastapi==0.136.1`
  - `sqlalchemy[asyncio]==2.0.49`
  - `asyncpg==0.31.0`
  - `aiosqlite==0.22.1`
  - `alembic==1.18.4`
  - `pydantic-settings==2.14.1`
  - `python-multipart==0.0.29`
  - `uvicorn==0.47.0`
  - `httpx==0.28.1`
  - `sqladmin==0.26.0`
  - `PyJWT==2.12.1`
  - `google-auth==2.53.0`
  - `requests==2.34.2`
  - `python-dotenv==1.2.2`
  - `stripe==15.1.0`
  - `resend==2.30.1`
- Updated test/CI JWT secrets to meet PyJWT's 32-byte HS256 recommendation and changed the payment webhook test to HTTPX's `content=` API.
- Added Stripe and Resend service-contract tests before moving those SDKs. The Stripe service now uses the Stripe 15 `client.v1` namespace and persists newly created customer IDs on the user model.
- Removed unused backend `Pillow`; no `PIL` import or backend image-processing path exists to justify keeping it, and the backend suite still passes after uninstalling it from the local venv.

The external-client batch now has contract coverage for Stripe checkout/session verification, webhook branch behavior, Resend verification/reset payloads, and auth routes that intentionally swallow email-provider failures.

React Compiler-oriented lint rules found real future refactor candidates, but they are not enabled as blocking errors in the base migration gate. The disabled rules are tracked as refactor work rather than mixed into the framework upgrade:

- `react-hooks/immutability`
- `react-hooks/purity`
- `react-hooks/set-state-in-effect`
- `react-hooks/static-components`
- `react-hooks/preserve-manual-memoization`
- `react-hooks/use-memo`

Local verification after this slice:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --json`
- `npx next experimental-analyze --output`
- `python -m pip check`
- `python -m pytest -q`
- Alembic `upgrade head` against disposable SQLite
- FastAPI startup smoke with deterministic test env
- HTTP smoke against a fresh upgraded frontend server for `/`, `/auth/reset-password?token=test`, and `/calendar`
- One-off `next build --webpack` check to compare the fallback bundler path; both Turbopack and Webpack builds compile under Next.js 16.2.6.

Current continuation note:

- A backend pytest rerun on May 21, 2026 exposed a time-dependent fixture leak between `tests_fastapi/test_calendar.py` cases: the row named `Outside range` had become an upcoming live event relative to the current date and could appear before the sidebar test's seeded event. The fixture has been changed to a stable past date outside the calendar query window.
- The focused/full backend pytest rerun requires escalated execution because `backend/venv/Scripts/python.exe` depends on `C:\Users\ilyas\AppData\Local\Programs\Python\Python311\python.exe`, which is access-denied from the sandbox, and system Python 3.13 does not have `pytest` installed. With that permission, the focused calendar suite and full backend suite now pass.
- The final backend dependency slice upgraded Stripe to 15.1.0 and Resend to 2.30.1, removed unused Pillow, and verifies with `python -m pytest -q`, `python -m pip check`, FastAPI startup smoke, and Alembic disposable SQLite upgrade.
- Final frontend wrap-up on May 21, 2026 verified `http://127.0.0.1:3000`, `http://127.0.0.1:8000/health`, and the active ngrok tunnel to frontend port 3000. `npm run test:e2e` passed all 3 Playwright smoke tests after the auth proxy/cookie slice.

The earlier Codex in-app browser reported `ERR_BLOCKED_BY_CLIENT` for local URLs. That gap is now covered by the committed Playwright browser smoke suite rather than by the in-app browser.

## Non-Negotiable Gates

Frontend gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- Browser smoke tests for auth, dashboard navigation, topic workspace, watch page, payment success, and admin overview before enabling high-risk Next.js 16 features.

Backend gates:

- `python -m pytest -q`
- Alembic `upgrade head` against a disposable database.
- Startup smoke via `create_app()`.
- HTTP smoke for `/health`, `/api/docs`, admin auth/session wiring, payment endpoints, and a course workspace endpoint.

CI must run lint, typecheck, tests, and build as separate gates so failures point to the responsible layer.

## Phase 1 - Test And CI Hardening

Goal: make regressions visible before dependency versions move.

- Replace `next lint` with the ESLint CLI because Next.js 16 removes `next lint`.
- Add explicit frontend `typecheck`, `test`, and `build` gates to CI.
- Add an Alembic migration check and deterministic startup environment to backend CI.
- Add browser smoke tests with mocked or seeded backend data where practical.

Status: complete for the current migration slice. Browser smoke is now part of `npm run ci`, frontend CI, and frontend deploy validation.

Exit criteria:

- All current frontend and backend gates pass locally.
- GitHub Actions can fail on type, unit, build, migration, and startup regressions independently.

## Phase 2 - Next.js 16 And React 19 Base Migration

Goal: upgrade the framework with minimum behavior change.

- Run the official Next.js upgrade codemod from the version 16 guide.
- Upgrade `next`, `react`, `react-dom`, `eslint-config-next`, `@types/react`, and `@types/react-dom`.
- Generate Next.js route types with `next typegen` after the upgrade.
- Convert any async request API usage flagged by the codemod or build.
- Verify `useSearchParams` routes, especially:
  - `frontend/app/(dashboard)/calendar/page.tsx`
  - `frontend/app/(dashboard)/topics/[topicId]/page.tsx`
  - `frontend/app/(dashboard)/courses/page.tsx`
  - `frontend/app/auth/verify-email/page.tsx`
  - `frontend/app/auth/reset-password/page.tsx`
  - `frontend/app/payment-success/page.tsx`

Exit criteria:

- All frontend gates pass on Next.js 16 and React 19.
- No hydration warnings appear in browser smoke tests for high-risk routes.
- The app still builds without using broad compatibility workarounds except a documented temporary `--webpack` fallback if Turbopack config blocks the migration.

Status: command-line gates pass, Turbopack production build succeeds, and Playwright browser smoke tests pass without collected hydration/page errors on the high-risk routes covered by the suite.

## Phase 3 - Turbopack And Build Performance

Goal: use Next.js 16's default bundler intentionally.

- Convert `frontend/next.config.mjs` from `webpack.resolve.alias.canvas = false` to `turbopack.resolveAlias` according to the Turbopack config docs.
- Keep the existing Webpack config only as a temporary fallback if a package is not yet Turbopack-compatible.
- Measure `next build` duration and route bundle sizes before and after.
- If Turbopack hits memory or graph issues, capture a trace with `NEXT_TURBOPACK_TRACING=1 next dev`.

Status: default Turbopack production build is passing. The built-in analyzer is available and `npx next experimental-analyze --output` writes route/module analysis files to `frontend/.next/diagnostics/analyze`.

Exit criteria:

- `npm run build` runs through the default Next.js 16 bundler path.
- Build time and route size deltas are recorded.
- Any fallback is time-boxed with a tracking item.

## Phase 4 - Next.js 16 Runtime Performance

Goal: improve real app performance, not just version numbers.

- Benefit from enhanced routing and navigation automatically, then verify dashboard route transitions in browser tests.
- Do not enable `cacheComponents` in the base migration PR.
- After the base migration is stable, selectively enable Cache Components only where data is safe to cache:
  - static dashboard shell structure
  - subject/course metadata that is not user-specific
  - pricing and public informational pages
  - reusable design-token or catalog pages
- Keep these dynamic unless explicitly redesigned:
  - auth state
  - progress and XP
  - notes
  - payment state
  - admin data
- Add `Suspense` boundaries around dynamic islands before using Cache Components.

Exit criteria:

- No stale user-specific content is cached.
- Navigation smoke tests pass with preserved behavior.
- Route size and browser timings show no regression against the baseline.

Status: Cache Components are intentionally not enabled yet. The base migration first proves behavior under Next.js 16, then caching can be introduced on static/non-user-specific surfaces with browser tests.

## Phase 5 - Bundle Reduction Refactors

Goal: reduce client JavaScript where the current app is heavy.

- Split `frontend/app/(dashboard)/topics/[topicId]/page.tsx` into smaller data, state, and presentation modules.
- Split `frontend/app/watch/[lessonId]/page.tsx` into focused content, comments, notes, support, and completion modules.
- Lazy-load D3, Recharts, Mafs, KaTeX, and animated source-port renderers only at the point of use.
- Remove `@monaco-editor/react` if it remains unused.
- Centralize raw HTML rendering and sanitization policy before expanding content features.

Status: unused Monaco and Mafs are removed. Animated renderer families are now lazy-loaded behind `next/dynamic`, and the Playwright topic smoke verifies a lazy `wave_periodicity` Lab renderer. The first auth-shell reduction is complete through the cookie-backed Next.js proxy redirect boundary. The larger route/component splits for the topic and watch pages remain follow-up refactors, not dependency-migration blockers.

The watch page no longer injects backend lesson HTML directly; `section.text_content` is sanitized through `frontend/lib/sanitizeHtml.ts` before it reaches `dangerouslySetInnerHTML`.

Current frontend bundle audit:

- Many dashboard routes are still full client pages that fetch initial data in `useEffect`: `home`, `home/[subjectId]`, `courses`, `profile`, `calendar`, and `exam-bank`.
- `topics/[topicId]` and `exam/[subjectId]` still do too much discovery and payload assembly in the browser.
- Shared dashboard chrome still hydrates broadly through `AuthGuard`, `permanent-sidebar`, `Leaderboard`, `XPBar`, `ChapterSidebar`, and legacy sidebar components. `TopNav` no longer brings Framer Motion into the persistent dashboard layout.
- `permanent-sidebar` auto-fetches data and has a multi-request fallback path even where sidebar data could be passed from a page/layout boundary.
- `watch/[lessonId]` still combines lesson metadata loading, playback bootstrap, progress polling, completion persistence, comments, notes, support, quiz, and activity rendering in one client page.
- `app/layout.tsx` no longer imports `sonner` directly; the remaining work is to stop page-level static `toast` imports where a route can defer toast behavior behind user actions.

Next performance order:

1. Move user-facing dashboard initial data fetches behind server/page boundaries or dedicated loaders, keeping search/filter/modal state as small client islands.
2. Continue reducing the client auth shell now that route-level auth redirects are handled by the server proxy.
3. Pass sidebar summary data into `permanent-sidebar` instead of auto-fetching from inside shared chrome.
4. Continue replacing page-level static `toast` imports with lazy action-time imports where the route does not need immediate toast behavior.

Exit criteria:

- `/topics/[topicId]` and `/animated-showcase` first-load JS are lower or the reason they are not lower is documented.
- Heavy libraries are not imported into common dashboard paths unless needed on first paint.

## Phase 6 - Backend Dependency Batches

Goal: modernize backend dependencies without mixing ORM, web, and external-client regressions.

Upgrade in this order:

1. SQL layer: `sqlalchemy`, `alembic`, `asyncpg`, `aiosqlite`.
2. Web layer: `fastapi`, Starlette via FastAPI, `httpx`, `uvicorn`.
3. Config and admin: `pydantic-settings`, `sqladmin`, `slowapi`, `a2wsgi`.
4. External clients: `stripe`, `google-auth`, `resend`, `requests`, `Pillow`.

Status:

- SQL layer upgraded and verified.
- Web layer upgraded and verified. FastAPI 0.136.1 resolves Starlette 1.0.0 in the local environment.
- Config/admin layer upgraded for `pydantic-settings` and `sqladmin`; `slowapi` and `a2wsgi` remain unchanged because they were not reported stale in the current inventory.
- External packages upgraded for `PyJWT`, `google-auth`, `requests`, `python-dotenv`, `stripe`, and `resend`.
- `Pillow` was removed instead of upgraded because backend runtime code does not import `PIL` or process images.
- Contract tests now cover `backend/app/services/stripe_service.py`, payment webhook branches, Resend payload shape, and non-blocking email-provider failures in auth routes.

Exit criteria for each batch:

- Backend tests pass.
- Alembic upgrade check passes.
- Startup and `/health` smoke pass.
- A representative endpoint from auth, courses, progress, payments, and admin is verified.

## Complexity Hotspots To Refactor Separately

Frontend:

- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`
- `frontend/app/watch/[lessonId]/page.tsx`
- repeated URL-state parsing in calendar, courses, and topics
- repeated animation-loop/canvas setup in animated source-port components

Backend:

- `backend/app/routers/courses.py`
- `backend/app/routers/gamification.py`
- `backend/app/admin/views.py`
- `backend/app/routers/admin.py`
- mutable defaults in `backend/app/schemas/courses.py`

These refactors should be separate from dependency version bumps unless a dependency upgrade directly forces the change.

## Delegation Model

- Parent agent: migration planner, docs validation, integration, final review, and verification.
- Cheap agents: inventory, codemod dry-runs, import scans, simple script and CI edits.
- Strong agents: Turbopack failures, React 19 behavior changes, backend ORM/FastAPI regressions, and large route/module refactors.
