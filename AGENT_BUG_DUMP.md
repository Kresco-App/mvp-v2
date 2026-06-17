# Agent Bug Dump

Last curated: 2026-06-16

This file is the active bug queue for Kresco. It is intentionally not the raw
agent transcript. Fixed, stale, duplicate, and false-positive findings live in
`AGENT_BUG_DUMP_ARCHIVE.md` so this active queue stays actionable.

Status rules:

- `OPEN`: validated against the current worktree and still actionable.
- `VERIFY`: plausible but needs one more code/test pass before implementation.
- `FIXED` or `STALE`: keep only in `AGENT_BUG_DUMP_ARCHIVE.md`.

When an item is fixed, move it out of `Active Queue` into the archive with the
commit hash and the validation command. Do not leave fixed bugs in the active
queue.

Last validation snapshot:

- 2026-06-16 deep audit continuation: six parallel subagents reviewed backend security, backend course/exam flows, frontend routes, frontend components/hooks, tests/tooling/config, and static/migration hygiene while avoiding the active content-authoring/topic-workspace implementation where ownership was unclear. Clear local-code fixes in this pass covered production env validation, production backend rewrite boundaries, e2e script build guarantees, Ably REST smoke-test naming, same-tab auth-session invalidation, lazy activity remount keys, Exercise Bank subject discovery, published-course-chain enforcement for topic-item and quiz routes, staging demo seed hardening, irreversible migration downgrade failure, and drag/drop keyboard assignment controls. Focused validation passed: `npm test -- --run tests/productionEnv.test.ts tests/nextConfig.test.ts tests/playwrightIntegrationConfig.test.ts tests/authSession.test.ts tests/interactiveActivityRenderer.lazy-loading.test.ts tests/exerciseBankPage.test.tsx tests/dragAndDropActivity.test.tsx` (`54 passed`) and `python -m pytest tests_fastapi/test_course_access.py tests_fastapi/test_topic_quiz.py tests_fastapi/test_realtime.py tests_fastapi/test_migrations.py -q` (`50 passed`). Ambiguous or current-work-adjacent findings were kept below as `VERIFY` instead of patched in this pass.
- 2026-06-16 verification append: `npm run lint`, `npm test` (`84 files / 382 tests`), `python -m pytest -q` (`747 passed`), `python scripts/check_secret_hygiene.py`, and `python scripts/check_repo_hygiene.py` passed. `npm run typecheck` currently fails in the active topic-workspace whiteboard implementation; see `BUG-P1-050`. `npm audit --omit=dev` was reduced by the non-forcing audit fix, including `ws` moving to `8.21.0`, but still fails on the Excalidraw whiteboard dependency chain; see `BUG-P1-051`.
- 2026-06-05 current workspace continuation: broad integrated verification passed after multi-agent bug fixing, launch-gate hardening, and staging-evidence collector work: `python -m pytest -q` (`621 passed`), focused backend launch-evidence suites (`80 passed`), focused launch/secret workflow regression tests (`20 passed` before the latest launch-evidence workflow additions), `npm run test` (`76 files / 327 tests passed`), focused frontend production-surface/config/proxy tests (`32 passed`), `npm run typecheck -- --pretty false`, `npm run lint`, `npm run build`, `npm run audit:csp-styles -- --json`, production-env validation with explicit production-shaped placeholders, `python -m py_compile` for launch-gate/evidence scripts, and `git diff --check`. `python scripts/check_secret_hygiene.py` passes on tracked files, but `python scripts/check_secret_hygiene.py --include-local-env` now fails closed on a redacted local `VERCEL_OIDC_TOKEN` JWT/OIDC-token finding in ignored env. `npm run check:production-demo-surface -- --base-url https://mvp-v2-theta.vercel.app --json` fetched 13 routes and 25 assets with zero demo/local findings but still failed because deployed production returns 404 for `/onboarding`; the frontend production deploy workflow now runs that scanner after Vercel deploy and requires configured public production aliases via `FRONTEND_PRODUCTION_BASE_URLS`. This continuation also added a manual staging launch evidence workflow, strict evidence-wrapper JSON validation, scoped staging evidence secrets, structured rotation-checklist validation, production deploy checklist gates, explicit launch-gate required-row inventory validation, backend deploy S3 posture verification, backend CI workflow path-filter coverage, stale Ably-history rejection, and a hard 50-student floor for `fanout-50` evidence. The production launch gate, ignored-env secret scan, and secret rotation checklist still fail closed by design; see `BUG-P0-007`.
- 2026-06-04 current workspace continuation: fixed or materially mitigated in the uncommitted worktree: `BUG-P1-019`, `BUG-P1-021`, `BUG-P1-023` local enforcement pieces, `BUG-P1-024`, `BUG-P1-025`, `BUG-P1-027`, `BUG-P1-028`, `BUG-P1-030`, `BUG-P1-031`, `BUG-P1-032`, `BUG-P2-015`, `BUG-P1-033`, `BUG-P1-034`, `BUG-P1-035`, `BUG-P1-036`, `BUG-P1-037`, `BUG-P1-038`, `BUG-P1-039`, `BUG-P1-041`, `BUG-P1-044`, `BUG-P1-045`, `BUG-P2-016`, `BUG-P2-008`, `BUG-P2-009`, `BUG-P2-010`, `BUG-P2-011`, `BUG-P2-013`, `BUG-P2-014`, and `BUG-P2-017`. Full archive movement should happen when these changes are committed.
- 2026-06-05 current workspace continuation: still open: `BUG-P0-007` needs real production/staging traceability evidence for the launch gate. Local code fixes closed the PDF viewer, topic-workspace payload, professor-chat URL state, exam timer stale finding, CSP inline-style migration, and FE local-rewrite gap; this pass also hardened ignored-env secret scanning, S3 media presign scoping, realtime outbox concurrency/stale-lock handling, topic query-plan guards, FE production rewrite boundaries, the non-Stripe staging verifier, S3 media posture evidence collection, realtime fanout/outbox evidence collection, production-host demo-surface scanning, and ops/perf staging evidence collection. `npm run audit:csp-styles -- --json` reports zero inline style debt and no style `unsafe-inline` allowances.
- Worktree was clean before this rewrite.
- Backend focused checks passed: course access, topic quiz, data integrity, migrations, grading, image uploads, professor platform, interactions, notifications.
- Frontend focused checks passed: auth/session, payments, dashboard search, topic workspace, video player, admin, profile, typecheck, and lint.
- Alembic head is `0052`.
- 2026-06-04 audit append: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm audit --omit=dev`, `python scripts/check_secret_hygiene.py`, and `python scripts/check_repo_hygiene.py` passed.
- 2026-06-04 audit append: `python -m pytest -q` failed with 2 failures / 484 passes; see `BUG-P0-001` and `BUG-P0-006`.
- 2026-06-04 audit append: `python scripts/check_production_launch_gate.py --json` failed at score 5.5 / 9.0; see `BUG-P0-007`. `python scripts/check_http_readiness.py` failed because `BACKEND_READY_URL` is unset; see `BUG-P1-023`.
- 2026-06-04 audit append: `npm run audit:csp-styles -- --json` passed but reported 54 files with inline style debt and 113 inline `style` attributes; see `BUG-P1-029`.
- 2026-06-04 deep audit append: focused locked-course-access tests passed, but the resource stream route still lacks a locked-primary-resource regression; see `BUG-P0-008`.
- 2026-06-04 deep audit append: strict subject validation rejects the current admin new-course payload extras `niveau` and `filiere`; see `BUG-P1-033`.
- 2026-06-04 deep audit append: course interactions, notifications/calendar, and profile/image upload focused suites passed, but interaction context conflict handling is still unguarded; see `BUG-P1-034`.
- 2026-06-04 continuation audit append: payment verification, professor chat read-state, calendar live access, and professor media rendering gained four new validated records; see `BUG-P1-035` through `BUG-P1-038`.
- 2026-06-04 continuation audit append: VdoCipher live auto-create has no provider cleanup after post-create DB failure; see `BUG-P1-039`.
- 2026-06-04 continuation audit append: student live-session pagination, professor chat subject scope, multi-channel realtime retry, and notification bulk delete gained four new validated records; see `BUG-P1-040`, `BUG-P1-041`, `BUG-P2-008`, and `BUG-P2-009`.
- 2026-06-04 dependency/config recheck: `npm audit --omit=dev` passed, `python -m pip_audit -r requirements.txt` was unavailable (`No module named pip_audit`), and `python scripts/check_production_launch_gate.py --json` still failed on the existing launch-readiness gate; see `BUG-P0-007`.
- 2026-06-04 interaction/deploy/admin audit continuation: deploy/admin/payment/media checks mostly mapped to existing records, but top-level interaction notes/saves still bypass access checks; see `BUG-P2-010`.
- 2026-06-04 topic workspace audit continuation: the generic topic `Mark complete` action ignores backend item-type and timed-completion rules; see `BUG-P2-011`.
- 2026-06-04 backend read-path audit continuation: topic workspace query count is bounded, but payload size and serialization still scale with every item/tab body in the topic; see `BUG-P2-012`.

Coverage audit for this rewrite:

- The old dump had 183 raw unresolved lines after extracting unchecked and unboxed audit findings from `HEAD:AGENT_BUG_DUMP.md`.
- Those lines were deduped into 38 active bug records, 23 architecture/product backlog bullets, and explicit fixed/stale archive notes.
- Current active bug count after the 2026-06-16 audit continuation: 6.
- A keyword coverage pass checked the old unresolved topic families against this file before staging.

## Active Queue

### P0 - Release Blockers

#### BUG-P0-007 - Production launch gate remains below release threshold

Status: OPEN

Files: `scripts/check_production_launch_gate.py`, `PRODUCTION-SWITCH.md`, `docs/production-remediation-traceability.md`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-frontend.yml`

Current evidence: `python scripts/check_production_launch_gate.py --json` fails with current score 5.5 / target 9.0. The gate reports 11 unverified traceability rows: `SEC-SECRETS-001`, `MEDIA-S3-001`, `MEDIA-AUTH-001`, `RT-FANOUT-001`, `RT-OUTBOX-001`, `PERF-TOPIC-001`, `FE-DEMO-001`, `OPS-STAGE-001`, `OPS-RDS-001`, `OPS-LAMBDA-001`, and `OPS-RUNBOOK-001`. The reachable Vercel production alias scan has zero demo/local findings but fails on `/onboarding` returning 404, GitHub Actions evidence is partial/stale for the remaining runtime rows, and local AWS/staging collectors fail closed without credentials or required staging inputs. Production deploy workflows enforce the launch gate, structured secret checklist gate, and public production alias surface scans; staging now has a manual all-row evidence workflow, but no successful real staging artifact bundle has been collected yet.

Risk: release readiness can be claimed while required security, media, realtime, performance, frontend demo, and ops evidence is missing or stale.

Fix direction: verify or retire each traceability row with current commands/evidence and keep the launch gate failing until the score reaches the target.

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-048 - Topic workspace search may probe locked tab/resource text before access filtering

Status: VERIFY

Files: `backend/app/services/course_topic_read_models.py`, current topic-workspace frontend files

Current evidence: the topic-workspace read model builds search matches against tab content and resource title/summary before the final response is shaped by locked item/tab/resource visibility. A locked user may be able to infer paid or unpublished text by varying the search query and observing whether otherwise-empty groups remain or counts shift. This is adjacent to the active topic-workspace/content-authoring work in the current dirty tree, so it was not patched in the audit fix set.

Risk: locked course body text, resource summaries, or unpublished authoring text can become searchable side-channel metadata even when the UI does not render the body.

Fix direction: move access/publication gating ahead of all text matching, or split search indexes into public metadata and entitled body text. Add tests where a locked learner searches for a unique paid-only tab/resource term and gets no observable hit.

#### BUG-P1-049 - Student live/chat routes need an explicit role policy decision

Status: VERIFY

Files: `backend/app/routers/professor.py`, `backend/app/services/professor_queries.py`, `frontend/lib/authPolicy.ts`

Current evidence: student-facing live-session and professor-chat routes authenticate with `get_current_user` and rely on entitlement/track checks downstream. If a non-student account also has eligible access records, it may be able to enter flows named and shaped for students. Existing frontend policy intentionally exposes a limited student professor-chat shortcut only for eligible student tiers, so backend role intent needs one more product/code pass before changing behavior.

Risk: mixed-role or staff/professor accounts may reach learner-only realtime surfaces if they carry paid access, creating policy drift between frontend routing and backend authorization.

Fix direction: decide whether learner surfaces are role-gated or entitlement-only. If learner-only, enforce a student role helper at the router/service boundary and add professor/staff denial regressions for live embed, live list, and student professor-chat endpoints.

#### BUG-P1-050 - Topic workspace whiteboard currently breaks frontend typecheck

Status: VERIFY

Files: `frontend/components/topic-workspace/TopicWorkspaceWhiteboard.tsx`

Current evidence: `npm run typecheck` fails because `Excalidraw` receives `initialData` with `elements: unknown[]` and `files: Record<string, unknown>`, which is not assignable to `ExcalidrawInitialDataState`. This file is part of the active topic-workspace implementation already dirty in the current worktree, so the audit pass did not patch it.

Risk: the frontend cannot pass the TypeScript gate while the whiteboard implementation remains in this state.

Fix direction: type the persisted whiteboard payload against Excalidraw's exported initial-data/element/file types, or validate and narrow the decoded cache data before passing it into the component.

#### BUG-P1-051 - Excalidraw whiteboard dependency chain fails production npm audit

Status: VERIFY

Files: `frontend/package.json`, `frontend/package-lock.json`, `frontend/components/topic-workspace/TopicWorkspaceWhiteboard.tsx`

Current evidence: after `npm audit fix --omit=dev` and a normal `npm install`, `npm audit --omit=dev` still reports 9 production vulnerabilities through `@excalidraw/excalidraw@0.18.1`: `@excalidraw/mermaid-to-excalidraw@2.2.2` -> `@mermaid-js/parser@0.6.3` -> `langium`/`chevrotain`/`lodash-es`, plus exact `nanoid` pins at `3.3.3` and `4.0.2`. `npm view` shows `@excalidraw/excalidraw@0.18.1` and `@excalidraw/mermaid-to-excalidraw@2.2.2` are already latest, and npm's force fix would downgrade Excalidraw to `0.17.6`. This dependency was introduced with the active topic-workspace whiteboard work, so the audit pass did not take the breaking downgrade or override exact transitive pins.

Risk: production installs retain known high/moderate dependency advisories in the whiteboard stack, and release security gates cannot pass cleanly while the current Excalidraw version remains in production dependencies.

Fix direction: decide whether the whiteboard needs Excalidraw in production. If yes, replace or patch the mermaid/nanoid surface with compatibility tests; if no, keep it out of production dependencies or behind an authoring-only split that is excluded from the learner app bundle and audit surface.

### P2 - User-Visible Flow Bugs

#### BUG-P2-018 - CMI return pages assume browser-cookie GET returns

Status: VERIFY

Files: `frontend/tests/cmiReturnPages.test.tsx`, frontend CMI return pages, backend CMI payment URL generation

Current evidence: the current return-page tests and frontend pages assume the payment provider redirects the logged-in browser back to app pages with readable query state. If CMI returns by POST, strips cookies, or opens a provider-controlled context, users may land on a generic or unauthenticated status surface even though the backend webhook/verification eventually succeeds. The provider contract needs confirmation before implementation.

Risk: users can complete payment but see a failed or stale payment status page, increasing support load and retry/double-payment confusion.

Fix direction: confirm CMI return method and cookie behavior. If POST or cookie loss is possible, add a route handler or tokenized return lookup that can reconcile the payment reference without relying on the existing logged-in SWR state.

## Architecture and Product Backlog

These are not active correctness bugs unless a later validator proves a user-facing failure. Keep them separate from the bug queue.

- `frontend/public/sw.js` / PWA: offline mode, push opt-in, and offline fallback are not implemented.
- Course progress/XP coverage is partial for notes edited, exam problem opened/attempted, lab opened/completed, and similar product-model actions.
- Daily XP/quest reset policy is UTC-only because account-local timezone is not modeled; keep this as product policy/schema work unless a concrete exploit is proven.
- Tab quiz answers and professor change-request JSON are already structurally bounded; stronger semantic/domain typing is backlog unless a concrete runtime failure is proven.
- Topic search lacks first-class difficulty-tag API fields.
- Embedded source-port wave/optics course navigation is inert in product embeds.
- Account settings and notifications inbox are shallow compared with the product docs.
- Seed-first Bac content pipeline is missing the documented `seed_kresco_v1.py` and `seed_burner_data.py` entry points.
- Admin course authoring remains a shell for full sections/items/resources/tab content/questions/exam problems/publish workflows.
- Activity builder is clipboard/manual and does not persist content.
- Ops emergency disable controls for payments/live/uploads/media are not implemented.
- Professor router/platform tests, SQLAdmin registry, and `backend/app/services/professor_live_sessions.py` live-session transition code remain large and should be split/refactored.
- `frontend/components/quiz/QuizPrimitiveRenderers.tsx` and `frontend/components/figma/profile.tsx` remain large component files and should be decomposed.
- `frontend/app/(dashboard)/professor-chat/page.tsx` still mixes data loading, state, and multiple views in one broad component.
- `backend/app/services/professor_chat_mutations.py` still duplicates professor/student mutation flows and should move to a shared actor-policy pipeline.
- `frontend/tests/e2e/integration.spec.ts` and `frontend/tests/e2e/next16-smoke.spec.ts` remain broad E2E monoliths.
- `backend/tests_fastapi/test_professor_platform.py` still needs fixture extraction and feature-based splitting.
- Relationship cascade/passive-delete behavior is only partially audited; keep a data-integrity backlog item for ORM relationship deletes versus DB `ON DELETE`.
- Source-ported interactive labs still carry broad file-level lint disables.
- Math sets source port still contains visible placeholder interactive content.
- PII scrubbing/retention policy needs a broader pass for email dispatch, telemetry, and deleted users.
- Repository hygiene should explicitly decide how to handle generated artifacts and whether local untracked/ignored artifacts should be reported during agent audits.
- Professor workspace switching is product/backlog unless a real role-switch session model is implemented. Current auth intentionally separates professor routes from student routes, while eligible non-professors already have a limited `Professor Chat` shortcut.
- Performance backlog: core dashboard routes still have heavy first-load JS in `frontend/.next/diagnostics/route-bundle-stats.json` (`/topics/[topicId]` 1,332,953 bytes, `/professor-chat` 1,298,855 bytes, `/live/[sessionId]` 1,291,410 bytes). Animated renderers are already dynamically loaded, so remaining work is profiling shared chunks, lazy-loading inactive tab panels, and adding a CI bundle budget/report.
