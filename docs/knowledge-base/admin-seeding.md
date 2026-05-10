# Admin and Seeding

## Principle

V1 should be seed-first with light admin editing.

Do not block implementation on a perfect CMS for every content type.

Seed most structured content, then allow editing/reordering/publishing where practical.

## Initial content focus

Focus initial seed work on:

- Physics.
- Math.
- Bac content.

Starter topics can come from:

- Existing local/database content.
- Reliable Bac resources.
- Public references such as AlloSchool where appropriate.
- Generated starter quizzes/exercises where acceptable.

Seeded content can be reorganized and edited later.

## VdoCipher

Real VdoCipher IDs may not be available immediately.

The backend should still model provider-backed video resources cleanly.

Use placeholders in seed data if needed:

- provider: `vdocipher`
- provider_video_id: placeholder/null
- processing/status fields where useful.

## Admin-editable content

Admin should eventually manage:

- Subjects.
- Topics.
- Sections.
- TopicItems.
- Videos.
- Quizzes.
- Questions.
- Downloadable resources.
- Summaries.
- Bac examples.
- Tabs/attachments.
- Ordering.
- Access policies.
- Publish/unpublish state.

V1 can prioritize the edit paths that are needed for launch.

## Programmatic content

Complex animated React courses and labs can be programmatic first.

Store them with stable registry keys and attach them through the database.

Examples:

- `wave_simulator`
- `periodicite_interactive_course`
- `continuity_graph_lab`

Admin does not need to visually edit the internals of every React component in v1.

## Quiz generation

Seed multiple quiz types, not only QCM.

Required starter types:

- Multiple choice.
- Multi-select.
- True/false.
- Fill-in-blank.
- Numeric answer.
- Matching.
- Ordering.
- Short answer.
- Interactive checkpoint.

Generated quizzes are acceptable as scaffolding, but the model must allow later replacement with sourced, reviewed content.

## Publishing workflow

Suggested status values:

- `draft`
- `published`
- `hidden`
- `archived`

Tabs and resources should also support visibility/publish state.
