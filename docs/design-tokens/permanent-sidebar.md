# Permanent Sidebar Tokens

Source of truth: Figma file `f9ZR9sGl9lZwWxtXbbvvei`, node `2024:13568`, named `premanenet sidebar`.

These values were extracted from Figma on 2026-05-09 for the reusable dashboard/sidebar rail.

Implementation: `frontend/components/figma/permanent-sidebar.tsx`.

Exported reusable components:

| Component | Purpose |
| --- | --- |
| `PermanentSidebar` | Composes the full five-card rail and can auto-load live quest/leaderboard data. |
| `PermanentSidebarCard` | Shared Figma card shell. |
| `PermanentSidebarPanelTitle` | Shared title/subtitle header. |
| `ChronoCard` | Countdown card. Accepts `units`, `title`, `subtitle`. |
| `CalendarCard` | Looping calendar strip and live agenda card. Accepts `days`, `events`, `windowSize`, `liveHref`, `onDaySelect`, `onWindowChange`, `title`, `subtitle`. |
| `CalendarArrow` | Calendar arrow button primitive. |
| `WeeklyStrikeCard` | Weekly streak card. Accepts `days`, `onDaySelect`, `title`, `subtitle`. |
| `DailyQuestPanel` | Mission/progress card. Accepts `quests`, `onQuestSelect`, `title`, `subtitle`. Bars are derived from `progress / target`. |
| `LeaderboardPanel` | Ranking card. Accepts `entries`, `href`, `title`, `subtitle`. Rows link to the shared `/classement` route by default. |
| `RankMarker` | Leaderboard rank marker. |
| `LeaderboardAvatar` | Leaderboard avatar renderer with Figma fallback assets. |

Exported defaults:

`permanentSidebarCountdownDefaults`, `permanentSidebarCalendarDefaults`, `permanentSidebarLiveEventDefaults`, `permanentSidebarStrikeDefaults`, `permanentSidebarQuestDefaults`, `permanentSidebarLeaderboardDefaults`.

## Data Contract

Primary endpoint: `GET /api/progress/sidebar-summary`.

Frontend type: `PermanentSidebarData`.

| Field | Purpose |
| --- | --- |
| `chrono_units` / `chronoUnits` | Countdown tiles for the Chrono card. |
| `calendar_days` / `calendarDays` | Looping calendar strip. |
| `live_events` / `liveEvents` | Burner live agenda rows inside the Calendar card. Rows link to `/live` until the Live page is implemented. |
| `strike_days` / `strikeDays` | Weekly strike dots/checkmarks. |
| `quests` | Daily quest rows. Completion bars are programmatic from `progress` and `target`. |
| `leaderboard_entries` / `leaderboardEntries` | Shared leaderboard rows. Rows link to `/classement` by default. |

Fallback behavior: if `/progress/sidebar-summary` is not available, the component falls back to `/progress/daily-quests`, `/progress/leaderboard`, `/progress/xp`, and local burner live data.

## Rail

| Token | Value | Notes |
| --- | ---: | --- |
| `sidebar.width` | `351px` | Fixed desktop rail width. |
| `sidebar.height` | `1917px` | Figma source frame height. Runtime page may scroll. |
| `sidebar.paddingTop` | `44px` | Top offset before first card. |
| `sidebar.paddingBottom` | `120px` | Bottom breathing room. |
| `sidebar.gap` | `14px` | Vertical gap between cards. |

## Shared Card

| Token | Value |
| --- | ---: |
| `card.width` | `351px` |
| `card.paddingX` | `18px` |
| `card.paddingTop` | `18px` |
| `card.paddingBottom` | `24px` |
| `card.border` | `2px #e4e4e7` |
| `card.radius` | `16px` |
| `card.background` | `#ffffff` |
| `card.shadow` | `none` |

## Typography

| Token | Value |
| --- | --- |
| `title.font` | `SF Pro Rounded Bold` |
| `title.size` | `16px` |
| `title.lineHeight` | `1.1` |
| `title.letterSpacing` | `0.24px` |
| `title.color` | `#3f3f46` |
| `subtitle.font` | `SF Pro Rounded Semibold` |
| `subtitle.size` | `14px` |
| `subtitle.lineHeight` | `1.1` |
| `subtitle.letterSpacing` | `0.21px` |
| `subtitle.color` | `#71717b` |

## Card Heights

| Component | Height |
| --- | ---: |
| `Chrono` | `157px` |
| `Calendar` | `415px` |
| `Weekly Strike` | `157px` |
| `Daily Quests` | `305px` |
| `Leaderboard` | `663px` |

## Internal Measurements

| Element | Value |
| --- | ---: |
| Chrono tile | `58px x 54px` |
| Chrono tile gap | `6px` |
| Calendar arrow | `32px x 32px` |
| Calendar day tile | `44px x 48px` |
| Calendar day gap | `6px` |
| Weekly strike item | `39.857px x 54px` |
| Weekly strike circle | `28px x 28px` |
| Daily quest icon | `32px x 32px` |
| Daily quest text/progress column | `267px` |
| Daily quest progress height | `14px` |
| Leaderboard row | `315px x 40px` |
| Leaderboard row gap | `16px` |
| Leaderboard avatar | `40px x 40px`, radius `12.727px` |
