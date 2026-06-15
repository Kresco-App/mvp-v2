# Topic Workspace Keeps Curated Practice While Banks Are Separate

The Topic Workspace keeps professor/content-team selected practice sections such as curated exercises, Bac examples, and devoir blanc because they guide the student through what to do for the current topic. The Exercise Workspace and Exam Bank remain separate broad browsing/filtering workspaces, so students can either follow the curated topic flow or explore the larger practice libraries.

Curated Topic Exercises are not references to broad Exercise Bank `Exercise` records. They are separate guided Topic Workspace content, selected and sequenced by the professor/content team for the current topic flow. This avoids mixing a curated lesson path with the larger searchable bank, even when the two content types look similar to students.

For v1, Curated Topic Exercises use the existing `TopicItem` sequence with a distinct item type such as `curated_exercise`, plus metadata such as required/recommended, professor-selected, video-correction availability, and practice kind. A separate `TopicPracticeItem` model can be introduced later only if the `TopicItem` model becomes too stretched.
