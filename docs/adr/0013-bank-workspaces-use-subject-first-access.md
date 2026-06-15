# Bank Workspaces Use Subject-First Access

The Exercise Workspace and Exam Bank should organize browsing around a top subject selector with visual icon/card buttons for the five configured Bac subjects. Subject selection comes before topic, year, filiere, difficulty, concept, status, and solution-availability filters.

Access is subject-based through the existing subject entitlement model in v1. Freemium/free-preview samples can be exposed deliberately, but the bank workspaces do not introduce separate paid gates for individual exercises, exam problems, exam parts, corrections, or videos in v1.

Locked bank content should remain visible in lists so students understand what exists, but protected statements, corrections, videos, and full part details must be redacted from API payloads when access is missing. Locked cards should route the student toward access instead of pretending the content does not exist.

When a student clicks a locked subject card, the workspace should open a locked subject preview instead of sending the student directly to checkout or payment. The preview explains why the subject is locked, how to unlock it, and what becomes available: topics, sample cards, exercises, exam problems, corrections, videos, and revision/progress features.

The locked subject preview can route its unlock CTA to the pricing/access page. The pricing page itself is outside this decision; the bank workspace only owns the preview, value explanation, and access handoff.
