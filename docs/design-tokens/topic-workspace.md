# Topic Workspace Figma Tokens

Source: canonical Figma file `f9ZR9sGl9lZwWxtXbbvvei`.

Measured nodes:

- Course video frame: `301:391`
- Course/content accordion: `538:2437` and `538:2439`

Implementation:

- `frontend/components/figma/workspace.tsx`
- `frontend/components/figma/rail.tsx`
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx`

## Workspace Shell

| Token | Value | Use |
| --- | ---: | --- |
| `workspace.canvas.width` | `1918px` | Node `301:391` frame width |
| `workspace.canvas.height` | `994px` | Node `301:391` frame height |
| `workspace.content.width` | `1440px` | Centered main content rail |
| `workspace.content.x` | `239px` | `(1918 - 1440) / 2` |
| `workspace.main.width` | `1057px` | Main video/tabs/content column |
| `workspace.rail.width` | `351px` | Right course-content rail beside the player |
| `workspace.grid.behavior` | `justify-between` | Produces the Figma 32px gap between 1057px main and 351px rail |
| `workspace.header.paddingTop` | `32px` | Top inset below nav |
| `workspace.header.toGridGap` | `12px` | Figma parent column gap |
| `workspace.main.paddingTop` | `48px` | Gap from header row to video |
| `workspace.rail.paddingTop` | `44px` | Gap from header row to right rail |
| `workspace.video.width` | `1057px` | Video surface width |
| `workspace.video.height` | `596px` | Video surface height |
| `workspace.video.radius` | `17.617px` | Video player frame radius |
| `workspace.video.border` | `2.239px #e4e4e7` | Flat Figma border, no shadow |
| `workspace.tabs.height` | `57px` | Flat underline tab row |
| `workspace.tabs.border` | `2px #e4e4e7` | Bottom divider |
| `workspace.tabs.button` | `16px / 700 / 18px icon` | Tab label and icon sizing |
| `workspace.body.paddingTop` | `46px` | Gap from tabs divider to lesson body copy |
| `workspace.body.copy` | `16px / 700 / 1.2` | Course body typography |

## V1 Tab Model

Visible tab slots are intentionally fixed to the current Figma workspace shell:

| Slot | Icon | Backing `TabContent.tab_type` values |
| --- | --- | --- |
| `Course` | book | `course`, `summary`, `transcript`, `formula`, `definitions`, `vocabulary`, `methods`, `mistakes`, `text` |
| `Lab` | flask | `lab`, `interactive`, `simulator` |
| `Resources` | document | `resources`, `resource`, `pdf`, `attachment`, `worksheet` |
| `Notes` | document | `notes`; if no note tab is seeded, the UI still renders a note composer and saves against the topic item |

This preserves the knowledge-base model: tabs are configurable `TabContent` under a `TopicItem`, while the visible v1 Figma shell remains Course/Lab/Resources/Notes. Quizzes remain first-class data and can be main-path items or final revision items; they are not shown as a fifth tab in this shell unless the Figma direction changes.

## Course Content Accordion

The course-video frame uses the compact 351px accordion rail. Wider rail variants are not used on node `301:391`.

| Token | Value | Use |
| --- | ---: | --- |
| `rail.compact.card.width` | `351px` | Shared compact accordion card width |
| `rail.compact.card.padding` | `18px` | Header/list horizontal padding |
| `rail.compact.card.radius` | `16px` | Card radius |
| `rail.compact.card.border` | `2px #e4e4e7` | Flat Figma border |
| `rail.compact.card.headerGap` | `8px` | Gap between title group and chevron |
| `rail.compact.item.gap` | `12px` | Open list row rhythm |
| `rail.compact.dot.size` | `24px` | Status/check dot |
| `rail.compact.title` | `16px / 700 / 0.24px` | Section title typography |
| `rail.compact.subtitle` | `14px / 600 / 0.21px` | Section subtitle typography |
| `rail.compact.item.label` | `16px / 700 / 0.24px` | Item row label typography |

The rail is controlled by data: parent pages provide `sections`, `items`, `open`, active/completed state, and item/section handlers.
