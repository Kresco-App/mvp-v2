# Design

Shared design memory for the student-facing Kresco app. Admin and founder surfaces use `ADMIN_DESIGN.md` instead.

## Scope

Applies to:

- `frontend/app/(dashboard)/**`
- student learning routes such as home, courses, topics, exam bank, exercise bank, calendar, live, leaderboard, Zed Mode, and profile
- shared student-facing components in `frontend/components/**`

Does not define the admin workspace. For `frontend/app/admin/**`, read `ADMIN_DESIGN.md`.

## Visual Intent

The student app should feel focused, friendly, and structured. It should help students understand progress, continue studying, and recover from empty or confusing states quickly.

The UI can be more expressive than the admin workspace, but it should still behave like a serious learning product. Motivation should come from clear progress, useful actions, and small moments of feedback, not decorative clutter.

## Existing Tokens

Primary source of truth:

- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`

Core identity:

- Kresco accent: `#453dee` / Tailwind `kresco`
- Page surface: `--surface-page`
- Card surface: `--surface-card`
- Border: `--border`
- Primary text: `--text-primary`
- Secondary text: `--text-secondary`
- Soft primary background: `--primary-soft`

Use the Kresco accent for primary actions, selected navigation, active states, focus states, and key progress indicators. Do not turn entire pages into purple-tinted surfaces.

## Typography

- Use the existing rounded sans stack from `--font-rounded`.
- Keep product UI type fixed and readable; do not use fluid hero typography inside app surfaces.
- Use strong headings sparingly. Most app screens need compact section titles, not hero copy.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose where available.
- Use tabular numbers for XP, streaks, timers, counts, rankings, prices, and dashboard values.

## Layout

- Use full app surfaces, not marketing landing sections.
- Keep the main content plus right rail pattern where it helps study workflows.
- Make responsive behavior structural: columns collapse, tables scroll, rails stack, and controls wrap.
- Avoid nested cards. Use cards for repeated lessons, exams, exercises, profile modules, and framed tools.
- Empty states should offer useful next actions, not long explanations.

## Product Composition

- Start with the working surface, not an intro banner.
- Organize app screens around a primary workspace, navigation, optional secondary context, and one clear accent for action or state.
- Each section should have one job: continue, practice, search, review, compare, configure, or recover.
- If a panel can become plain layout without losing meaning, remove the card treatment.
- Keep copy in product language. Avoid campaign-style headlines inside routine app workflows.

## Components

Common component expectations:

- Buttons use clear actions with icon support where useful.
- Forms have labels or accessible names, visible focus, clear errors, and usable mobile input sizes.
- Search and filter controls should feel integrated, not like floating promo cards.
- Student progress should be shown with clear metrics, progress bars, or task lists.
- Navigation should keep selected states obvious without overusing color.
- Use skeletons for loading content regions. Use spinners only for small blocking actions.
- Give all async actions loading, success, and error feedback when the result is not otherwise obvious.

## Motion

- Motion should support feedback: hover, press, reveal, loading, progress, and completion.
- Default durations should stay around 150ms to 250ms.
- Use `active:scale-[0.96]` for tactile button press when appropriate.
- Never use `transition: all`.
- Respect reduced motion.

## Anti-patterns

Avoid:

- large decorative banners on normal app pages
- repeated uppercase eyebrows
- gradient text
- glassmorphism by default
- hand-drawn placeholder SVGs
- card grids where a table, list, tabs, or compact controls would scan better
- text that wraps awkwardly inside buttons or cards

## Verification

For student-facing UI changes:

- Check desktop and mobile widths when layout changes.
- Confirm loading, empty, error, and populated states when the touched screen supports them.
- Prefer `npm run typecheck` and `npm run lint` for normal edits.
- Use browser checks only when the change is visual, responsive, interactive, or runtime-sensitive.
- For responsive work, think in at least four widths: 375px, 768px, 1024px, and 1440px.
- Confirm icon-only controls have accessible names and visible focus.
