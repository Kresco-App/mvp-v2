# Design Source of Truth

## Canonical Figma file

Primary design source:

https://www.figma.com/design/f9ZR9sGl9lZwWxtXbbvvei/Kresco--Copy-?node-id=1-4&t=2qjCPNqxAHh7pZxh-1

File key:

`f9ZR9sGl9lZwWxtXbbvvei`

Earlier design link:

`https://www.figma.com/design/gWM6XGhwQFnj7xVvHAgeAg/Kresco?node-id=1-4&p=f&t=XTVZyuxdxsQ4cMIE-0`

The earlier file may be inaccessible. Use the copy with file key `f9ZR9sGl9lZwWxtXbbvvei` unless a newer link is explicitly provided.

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

## Known Figma sections

Observed sections include:

- Home/dashboard.
- Subjects.
- Course.
- Exercise.
- Calendar.
- Leaderboard.
- Profile.
- Settings.
- Chat.
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
- Main Path and Study Tools instead of forcing every asset into one linear chapter model.
- Configurable tabs under the primary viewer.
- Search/filter inside the topic.
- Progress and completion indicators across video, quiz, interactive, and resources.

## Design constraints locked so far

- Desktop v1 is the first priority.
- Mobile UX is deferred to design, but the model should remain responsive-friendly.
- English/LTR layout is acceptable for v1.
- Future Arabic/RTL may mirror or adjust the layout later.
- The implementation should not hard-code assumptions that make RTL impossible.

## Agent instruction

Before implementing UI, open this file and then inspect the Figma link if design fidelity matters. Do not invent a generic education dashboard when a Figma pattern already exists.
