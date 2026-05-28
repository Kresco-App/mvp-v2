# Design Source of Truth

## Canonical Figma file

Primary design source:

https://www.figma.com/design/f9ZR9sGl9lZwWxtXbbvvei/Kresco--Copy-?node-id=1-4&t=2qjCPNqxAHh7pZxh-1

File key:

`f9ZR9sGl9lZwWxtXbbvvei`

## Rule

Figma is the visual and design-system source of truth.

Implementation should follow the Figma closely:

- Layout proportions.
- Spacing rhythm.
- Navigation style.
- Card shapes.
- Button style.
- Sidebar/header behavior.
- Typography scale.
- Color language.
- Icon placement.
- Empty/loading/locked states where present.

If the Figma assumes an architecture that conflicts with the agreed product model, preserve the visual language but adapt the data flow.

Example: if Figma shows Lab replacing the video, but the agreed UX requires the video to stay primary and Lab to appear below/in tabs, keep Figma's styling but change the interaction model.

## Current Figma Sections

Observed sections include:

- Home/dashboard.
- Subjects.
- Course.
- Exercise.
- Calendar.
- Leaderboard.
- Profile.
- Notes.

Course-related screens include:

- Course chapters.
- Course video.
- Course resources.

Exercise-related screens include dedicated exercise views.

The Home design is clean and should inspire the dashboard structure: continuation, subject/course cards, progress widgets, and lightweight right-side context.

## Product-to-Figma alignment

The final implementation should use Figma as the visual shell, while the product model should use:

- Topic Workspace instead of a simple course page.
- Main Path with a final revision section instead of a separate tools mode.
- Configurable tabs under the primary viewer.
- Search/filter inside the topic.
- Progress and completion indicators across video, quiz, interactive, and resources.

## Current Design Constraints

- Desktop v1 is the first priority.
- English/LTR layout is acceptable for v1.
- The model should remain responsive-friendly.

## Agent instruction

Before implementing UI, open this file and then inspect the Figma link if design fidelity matters. Do not invent a generic education dashboard when a Figma pattern already exists.
