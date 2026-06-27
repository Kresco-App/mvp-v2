# Admin Design

Separate design memory for the founder, operator, admin, and staff workspace. This exists because the admin board is different UI-wise from the student app.

## Scope

Applies to:

- `frontend/app/admin/**`
- `frontend/components/admin/**`
- founder analytics, finance, students, communications, accounts, courses, reviews, audit, and statistics pages
- staff/manual-payment operational surfaces when they share admin patterns

Use `DESIGN.md` for the student-facing app.

## Users

The admin workspace is for founders, operators, and trusted staff. Professors already have their own dashboard and should not be the target user for the founder/admin UI.

Admin users are trying to:

- understand business health quickly
- review growth, revenue, costs, profit, MRR, ARR, and manual payments
- inspect student accounts, access, AI quota, and learning status
- search private professor/student messages by professor and chat
- operate WhatsApp/manual payment code flows without fraud or duplicate transfers
- audit activity and resolve exceptions

## Visual Intent

The admin workspace should feel like an operations command center: calm, dense, structured, and trustworthy.

It should not feel like the student app with different labels. It should use the Kresco identity, but with less playfulness, less copy, fewer decorative moments, and more analytical structure.

## Existing Admin Primitives

Primary implementation file:

- `frontend/components/admin/AdminDesign.tsx`

Core classes to prefer:

- `adminPageClass`
- `adminPanelClass`
- `adminPanelHeaderClass`
- `adminSubtlePanelClass`
- `adminButtonClass`
- `adminPrimaryButtonClass`
- `AdminPageHeader`
- `AdminMonthPicker`
- `AdminDatePicker`
- `AdminSearchBox`
- `AdminTable`
- `AdminProgressBar`

When changing admin pages, use these primitives first. Improve them centrally when a repeated admin pattern needs polish.

Do not install or initialize shadcn/ui unless the user explicitly asks. Use shadcn-style composition as inspiration, but implement with the existing Kresco admin primitives unless the repo adopts shadcn directly.

## Information Architecture

Default admin page structure:

1. Compact page header with title and primary controls.
2. High-signal metric strip or summary panel.
3. Main decision surface: chart, table, inbox, ledger, review queue, or editor.
4. Secondary details only when they help the current task.

Do not add explanatory paragraphs unless the page would be unclear without them.

## Admin Composition Recipes

Use these standard patterns before inventing new surfaces:

- Overview dashboard: metric strip, date filter, trend chart, composition chart, priority actions.
- Finance: summary metrics, month filter, payment review table, expense ledger, focused expense form.
- Students/accounts: filters, searchable table, status composition, detail drawer or inline expansion.
- Private messages: professor list, selected professor conversations, transcript pane, global search.
- Course/content admin: table or tree navigation, editor workspace, inspector panel, publish/review actions.
- Audit/activity: filters, timeline or table, event detail, severity/status badges.
- Settings-like admin pages: tabs or segmented controls, grouped forms, explicit save actions.
- Destructive flows: confirmation surface with clear object name, impact, and cancel path.

## Data Visualization

Use charts when they improve pattern recognition:

- line charts for growth over time
- bar charts for comparisons across categories
- pie or donut charts for composition such as student status
- stacked bars for status breakdowns
- tables for exact review, audit, ledger, or account rows

Avoid random progress bars that do not communicate a ranking, threshold, or trend. Every chart needs a reason.

## Copy Density

Admin copy should be minimal.

Keep:

- page titles
- control labels
- table headers
- metric labels
- short empty states
- action labels
- short error messages

Remove:

- decorative eyebrows
- redundant subtitles
- generic descriptions like "stay up to date"
- repeated summaries that restate visible data
- filler labels that do not change the operator's decision

## Layout

- Favor dense but readable grids over oversized cards.
- Larger cards are acceptable when they contain a real chart, table, or workflow.
- Do not nest cards inside cards.
- Keep filter and date controls visually aligned with the header.
- Use tables for review queues, ledgers, account lists, and audit logs.
- Use split panes for professor-first private message review.
- Use tabs or segmented controls when switching between related operational modes.
- Pick one density per page: compact for tables/queues, comfortable for forms/editors. Do not mix both without a clear hierarchy.
- Use side panels or inline expansion for details when it keeps operators in flow. Use modals only when interruption is necessary.

## Components

Admin controls should feel consistent:

- date/month pickers use the styled admin picker pattern, not raw browser inputs
- search boxes use `AdminSearchBox`
- tables use `AdminTable`
- primary actions use `adminPrimaryButtonClass`
- secondary actions use `adminButtonClass`
- numbers use tabular numerals
- destructive actions need clear tone and confirmation
- IDs, timestamps, transfer references, and audit metadata can use monospace or tighter tabular treatment for scanning.
- Badges should encode status, not decoration. Pair color with text.
- Icon-only controls need tooltips or accessible names.

## Motion

Admin motion should be quiet and functional:

- 150ms to 250ms transitions
- hover, focus, press, loading, panel reveal, and selected-state changes only
- no page-load choreography
- no decorative motion
- no content squashing when expanding replies, rows, or panels

## Empty and Error States

Never show fake zero-value success when admin data fails to load.

Use:

- unavailable state when real data failed
- empty state when data loaded and there is genuinely nothing to show
- retry action when useful
- short error text with the status or cause when available

## Admin Anti-patterns

Avoid:

- card spam
- nested cards
- oversized hero metrics
- full-purple dashboard sections
- generic SaaS dashboard decoration
- raw date inputs
- random bars without analytical structure
- long explanatory page copy
- professor-facing assumptions inside founder/admin pages
- live-message-level granularity when only private messages need review

## Verification

For admin UI changes:

- Run `npm run typecheck` and `npm run lint` from `frontend/` after code edits.
- Browser-check only when layout, charts, forms, routing, auth, or runtime data behavior changed.
- Check laptop/desktop width first; then verify the responsive fallback does not break.
- Confirm loading, unavailable, empty, and populated states when relevant.
- Confirm every table or review queue has a useful empty state, loading skeleton, and error/unavailable state.
- Confirm financial values use consistent currency formatting and tabular numbers.
- Confirm charts still communicate when values are zero, sparse, or heavily skewed.
