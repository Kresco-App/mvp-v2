# Admin and Seeding

## Principle

V1 should be seed-first with light admin editing.

Do not block implementation on a perfect CMS for every content type.

Seed most structured content, then allow editing/reordering/publishing where practical.

For the operational authoring checklist and required record set, see
`docs/knowledge-base/content-authoring.md`.

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

Seeded content should remain editable and reorderable through SQLAdmin.

## VdoCipher

Real VdoCipher IDs are required for provider-backed playback.

The backend should still model provider-backed video resources cleanly.

For local validation without provider media, use clearly marked local/demo records:

- provider: `vdocipher`
- provider_resource_id: empty or demo-only id.
- status: `draft` or `hidden` until the provider id is real.

## Admin-editable content

SQLAdmin manages:

- Subjects.
- Topics.
- Sections.
- TopicItems.
- Resources and provider-backed videos.
- Quizzes.
- Questions.
- Downloadable resources.
- Summaries.
- Bac examples.
- TabContent.
- Ordering.
- Access gates.
- Publish/unpublish state.

## Programmatic content

Complex animated React courses and labs can be programmatic first.

Store them with stable registry keys and attach them through the database.

Examples:

- `wave_simulator`
- `periodicite_interactive_course`
- `continuity_graph_lab`

SQLAdmin stores the renderer key and metadata; React owns the component internals.

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

Generated quizzes are acceptable only as clearly marked draft/demo content. Published launch quizzes should be reviewed.

## Publishing workflow

Suggested status values:

- `draft`
- `published`
- `hidden`
- `archived`

Tabs and resources should also support visibility/publish state.
