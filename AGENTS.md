# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project Stack

- The app lives in `frontend/`.
- This repo uses Next.js 16 and React 19. Do not rely on older Next.js or
  React assumptions when editing routing, server/client boundaries, caching,
  metadata, middleware, server actions, or framework configuration.
- Read framework docs only when touching framework-level behavior. For ordinary
  components, styling, copy, forms, and business logic, follow existing repo
  patterns instead.

## Design Context

- Read `PRODUCT.md` before substantial product or UI work.
- Read `DESIGN.md` for student-facing app surfaces.
- Read `ADMIN_DESIGN.md` for founder/admin/staff workspace surfaces.
- The admin workspace is intentionally different UI-wise from the student app:
  calmer, denser, more analytical, lower-copy, and operations-first.
- The repo does not currently use shadcn as an installed component system.
  Use shadcn-style composition patterns as inspiration, but default to existing
  Kresco/admin primitives unless the user explicitly asks to install shadcn.

## Repository Workflow

- Read the existing code before changing it. Match the current framework,
  component patterns, data-fetching style, and naming conventions.
- Keep changes scoped to the user request. Do not refactor unrelated files,
  rewrite working systems, or revert user changes unless explicitly asked.
- Use `rg` / `rg --files` for search. Prefer `apply_patch` for manual edits.
- Do not rediscover the whole repo. Read only files directly relevant to the
  request.
- Do not start dev servers unless the user asks or a runtime/browser check is
  genuinely needed.
- Prefer exact, focused checks over broad noisy runs.

## Validation Budget

- Default after code edits: run lightweight validation from `frontend/`:
  - `npm run typecheck`
  - `npm run lint`
- Format only files you changed, and only when formatting is needed.
- Add a targeted unit test run only when logic changed and a focused test exists
  for the touched module.
- Run browser verification only when the change affects UI behavior, routing,
  auth, forms, responsive layout, payments, admin data flows, or a bug that only
  appears at runtime.
- Run full tests, builds, E2E, or CI scripts only when the change touches shared
  primitives, framework configuration, auth, billing, permissions, migrations,
  serialization, cross-module contracts, or release/deploy behavior.
- Do not run these by default:
  - `npm run test`
  - `npm run build`
  - Playwright or browser automation
  - broad smoke tests
  - full CI scripts
- Do not rerun the same validation command unless the diff changed after the
  last run or the previous run failed and you made a fix.
- If validation fails, fix only failures caused by the current task. Do not
  chase unrelated existing warnings or legacy failures.
- For docs-only changes, validation can be skipped and reported as skipped.

## Browser and Runtime Checks

- The user usually validates UI manually in the browser.
- Use browser checks intentionally, not as a default loop.
- Browser verification is worth doing for auth, payments, admin data flows,
  complex responsive layouts, navigation, forms, or bugs that only appear at
  runtime.
- Do not keep rerunning browser checks after every small visual tweak unless the
  user asks.

## Tool Cost Discipline

- Browser, computer-use, screenshots, Playwright, full builds, and full test
  suites are expensive. Use them deliberately, not as a reflex.
- Prefer code inspection plus `typecheck` and `lint` for small copy, style,
  component, and business-logic edits.
- Use heavier tools when they are the fastest reliable way to prove the changed
  behavior works.

## Git Discipline

- Do not commit, push, create branches, or open PRs unless the user explicitly
  asks.
- If asked to commit, stage only files changed for the current task and leave
  unrelated working-tree changes untouched.
- Before any commit, check branch and status. Do not switch branches
  automatically.

## Frontend Product Standards

- Build the actual usable app surface first. Avoid marketing-style placeholder
  screens when the request is for an app, dashboard, tool, or workflow.
- Preserve Kresco identity, but keep interfaces clean and operational. Use the
  existing accent colors intentionally, not as a one-note purple theme.
- Admin and founder pages should be dense, high-signal, and scan-friendly.
  Remove filler labels, redundant subtitles, and explanatory copy that does not
  help the operator make a decision.
- Prefer clear hierarchy over more cards. Do not nest cards inside cards. Use
  cards for repeated items, modals, and genuinely framed tools.
- Avoid generic AI-looking UI patterns: gradient text, decorative glassmorphism,
  side-stripe cards, excessive shadows, oversized radii, and decorative blobs.
- Text must never overflow or collide with adjacent content. Use responsive
  constraints, sensible wrapping, and smaller type inside compact surfaces.
- Use familiar icons for tool actions when available. Buttons should communicate
  clear commands, not decorative labels.

## UI Polish Defaults

- Use concentric radii: child elements should have equal or smaller radius than
  their containers, with visually consistent spacing.
- Align optically, not only mathematically. Icons, labels, numbers, and controls
  should sit on a clean visual axis.
- Use tabular numbers for dashboards, counters, prices, timers, and metrics.
- Interactive targets should be at least 40px by 40px unless the surrounding
  component provides an equivalent hit area.
- Body text needs readable contrast. Target at least 4.5:1 for normal text and
  3:1 for large text and UI glyphs.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose
  where browser support allows it.

## Motion and Interaction

- Motion should clarify state changes. Do not add animation that makes content
  feel unstable, squashed, delayed, or harder to read.
- Never use `transition: all`. Transition explicit properties only.
- Prefer transform and opacity for motion. Avoid animating layout properties
  unless the layout change is the point and performance has been checked.
- Press states may scale to about `0.96`; do not go below `0.95` for normal UI.
- Keep durations short and calm. Avoid bounce or elastic easing unless the
  product surface intentionally calls for it.
- Respect reduced-motion preferences.

## React and Next.js Practices

- Prefer existing components, shadcn primitives, hooks, helpers, and data models
  before introducing new abstractions.
- Do not create single-use helper functions or abstractions unless they make a
  complex block easier to understand or match an established local pattern.
- Keep state as local as possible. Do not use global state for isolated UI state.
- Keep derived values derived. Avoid effects for pure calculations.
- Use stable keys, semantic HTML, accessible names, and keyboard-operable
  controls.
- Split components when it improves readability or ownership boundaries, not as
  a default reaction to file length.
- Memoize only when there is a real rendering cost or referential stability
  issue. Do not add `useMemo` / `useCallback` everywhere.
- In Next.js, respect server/client boundaries. Use client components only where
  interactivity or browser APIs are needed.
- Avoid hydration mismatches by keeping time, random values, browser-only state,
  and auth-dependent rendering behind the right boundary.

## Frontend Verification

- For visible UI work, check desktop and mobile widths when practical.
- Confirm loading, empty, error, and populated states for changed views.
- Check that forms have usable focus states, labels or accessible names, and
  clear validation feedback.
- Watch for console errors after navigation and interaction.
- If a page depends on live data, avoid fake zero-value dashboards that look
  successful. Show a deliberate empty or unavailable state.

## Final Response Receipt

- Keep final responses concise.
- Always include what changed and what validation ran.
- If checks were skipped, say which ones and why skipping was acceptable.
- If git was not requested, say it was not run only when relevant.
- Preferred shape:

```text
Done.

Changed:
- ...

Validation:
- typecheck: passed/skipped
- lint: passed/skipped
- tests/build/browser: skipped, with reason

Git:
- not run, unless requested
```

## sqz Token Compression

This workspace is configured for `sqz`, a local context-compression helper.
Use it only for verbose command output where compression will not hide
important details.

Good candidates:

- repeated file reads
- large `git diff` or `git log` output
- long test runs after the first exact failure has already been captured
- noisy build logs

Use:

```powershell
git diff 2>&1 | sqz compress
python -m pytest 2>&1 | sqz compress
gh run view <run-id> --log-failed 2>&1 | sqz compress
```

Do not use `sqz` for:

- exact CI/deploy/security failures where raw lines matter
- short commands
- interactive commands
- commands that may print secrets

If compressed output returns a ref token, expand it with:

```powershell
sqz expand <ref>
```

If `sqz` is unavailable, run commands normally.
