# Subject Course Cards

Source: Figma canonical file `f9ZR9sGl9lZwWxtXbbvvei`, node `2024:13568` named `card types`.

Course-page spacing source: same file, node `682:42130` named `math`.

Implementation:

- `frontend/components/figma/subject-course-card.tsx`
- `frontend/app/(dashboard)/home/[subjectId]/page.tsx`
- `frontend/app/(dashboard)/courses/page.tsx`
- `frontend/public/figma-assets/course-card-placeholder.png`

## Component

`FigmaSubjectCourseCard` is the reusable subject/chapter card for the subject page.

Supported states:

| State | Visual |
| --- | --- |
| `completed` | Orange border/background, white title/button, `Well Done` CTA. |
| `current` | Purple border and progress, purple `Continue` CTA. |
| `available` | Neutral border, purple `Start the lesson` CTA. |
| `locked` | Neutral muted card, grey `Locked` CTA, no link. |
| `upcoming` | Neutral muted card, grey `Coming soon` CTA, no link. |

## Current Values

| Token | Value |
| --- | ---: |
| Card group | `344.33px x 327.5px` |
| Card radius | `16px` |
| Card border | `2px` |
| Outer state layer | Visible `3.75px` bottom edge under inner frame |
| Card gap in row | `14px` |
| Inner frame top offset | `-3.75px` |
| Media height | `193.5px` |
| Media padding | `12px` |
| Number badge | `36px x 36px` |
| Number badge radius | `4px` |
| Body height | `134px` |
| Body padding | `12px` |
| Body gap | `10px` |
| Title | `16px`, `700`, `1.1`, `0.24px` letter spacing |
| Progress track | `10px` height, `4.286px` radius |
| Progress fill | `max(24px, progress% * 320px)` for `current`/`available`; hidden for `completed`, `locked`, and `upcoming` |
| CTA height | `44px` |
| CTA radius | `12px` |
| CTA padding | `34px 11px` |
| CTA text | `16px`, `700`, `1.1`, `0.24px` letter spacing |

## Course Page Layout

These values come from Figma node `682:42130` and its parent `subjects - math` frame.

| Token | Value |
| --- | ---: |
| App content max width | `1440px` |
| Main course column | `1077px` |
| Sidebar column | `351px` |
| Main/sidebar gap | `12px` |
| Breadcrumb top offset after nav | `44px` |
| Breadcrumb height | `18px` |
| Breadcrumb to controls gap | `64px` |
| Controls height | `44px` |
| Controls gap | `12px` |
| Controls to title gap | `32px` |
| Title/subtitle block height | `52px` |
| Title block to cards gap | `32px` |
| Card grid gap | `16px` row, `12px` column |

## Figma Colors

| Role | Value |
| --- | --- |
| Completed base | `#f5900b` |
| Completed panel | `#fbae17` |
| Completed border | `#fcc94d` |
| Completed bottom edge | `#f5900b` |
| Current / available primary | `#5b60f9` |
| Current bottom edge | `#383dc7` |
| Neutral border | `#e4e4e7` |
| Neutral image border | `#d4d4d8` |
| Neutral bottom edge | `#d9dadd` |
| Progress track | `#f4f4f5` |
| Text | `#3f3f46` |
| Muted number | `#71717b` |

## State Mapping

On the subject page:

- A chapter is `completed` when all loaded sections are complete.
- A chapter is `current` when it contains the next incomplete unlocked section, or has partial progress.
- A chapter is `available` when unlocked but not current.
- A chapter is `locked` when sections exist but none are accessible to the current user.
- A chapter is `upcoming` when no sections are loaded for that chapter yet.

On the courses page:

- A topic is `upcoming` when it has no content items.
- A topic is `completed` when `progress_pct >= 100` or `completed_count >= item_count`.
- A topic is `current` when `progress_pct > 0` or `completed_count > 0`.
- A topic is `available` when it has content but no recorded progress.
