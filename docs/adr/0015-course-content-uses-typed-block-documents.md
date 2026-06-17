# Course Content Uses Typed Block Documents

Course content should be stored as typed block documents attached to a TopicItem, not as raw HTML, hard-coded React lesson pages, or a new student tab separate from Course.

SQL remains the owner of the structured learning path: subjects, topics, topic items, video/resource metadata, access, progress, XP, notes, and comments. Course documents are rich content for a topic item. They should be generated and reviewed locally in v1, and can move to Firestore as the document store when the Firebase migration is ready. A topic item can have zero or one Course document.

Each Course document has stable block IDs, `schema_version`, and an ordered `blocks` array. Blocks use controlled types such as paragraph, heading, definition, formula, callout, divider, cards, comparison, image, and component. Formula content uses LaTeX rendered by KaTeX. Component blocks reference allowlisted visual component keys and optional props; raw HTML, arbitrary CSS classes, and arbitrary React imports are not allowed.

This keeps generated content flexible enough for AI-assisted seeding while preserving validation, mobile-safe rendering, future professor/admin editing, and a clean distinction between Course explanations and Lab experiments.
