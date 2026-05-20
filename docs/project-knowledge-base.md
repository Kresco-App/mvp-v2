# Kresco Project Knowledge Base

This file is the entry point for agents and developers. Do not put the full project spec here. Use this as a fast index into the focused knowledge-base files.

## Permanent design source of truth

Primary Figma file:

https://www.figma.com/design/f9ZR9sGl9lZwWxtXbbvvei/Kresco--Copy-?node-id=1-4&t=2qjCPNqxAHh7pZxh-1

Design file key:

`f9ZR9sGl9lZwWxtXbbvvei`

## Fast reading order

1. `docs/knowledge-base/design-source-of-truth.md`
2. `docs/knowledge-base/product-model.md`
3. `docs/knowledge-base/content-authoring.md`
4. `docs/knowledge-base/topic-workspace.md`
5. `docs/knowledge-base/architecture-infra.md`
6. `docs/knowledge-base/current-implementation-status.md`

Read the remaining files only when working on the related area.

## Knowledge-base files

| File | Purpose |
| --- | --- |
| `docs/knowledge-base/design-source-of-truth.md` | Figma link, visual rules, implementation constraints, known screens. |
| `docs/knowledge-base/product-model.md` | Core product semantics: Bac-first, subjects, topics, items, tabs, resources, tags. |
| `docs/knowledge-base/content-authoring.md` | How to add or modify student-facing knowledge-base content through SQLAdmin or seed scripts. |
| `docs/knowledge-base/topic-workspace.md` | Main learning UX: video-first workspace, path rail, final revision, tabs, search, resume. |
| `docs/knowledge-base/progress-xp-leaderboard.md` | Progress, XP, event logging, anti-farming, leaderboard model. |
| `docs/knowledge-base/exam-bank.md` | Bac exam bank, topic-relevant exam problems, written/video solutions. |
| `docs/knowledge-base/access-billing.md` | Subject access, global tiers, feature gates, free previews. |
| `docs/knowledge-base/notes-saves-profile.md` | Notes, saved items, profile hub, deep links. |
| `docs/knowledge-base/admin-seeding.md` | Seed-first content operations, admin editing, quizzes, and provider-backed video records. |
| `docs/knowledge-base/architecture-infra.md` | Current runtime boundaries, active files, and verification commands. |
| `docs/knowledge-base/local-validation-only.md` | Current operational mode: skip production deployment and validate locally only. |
| `docs/knowledge-base/repo-cleanup-log.md` | Traceability log for repository cleanup decisions and verification. |
| `docs/knowledge-base/current-implementation-status.md` | Current implementation status and compatibility surfaces. |

## Current product decision in one paragraph

Kresco v1 is a Bac-focused video-first learning and exam-prep platform. The core UX is a Topic Workspace: the student enters a topic, resumes the last active learning item, uses a dominant primary viewer that can show video, quiz, interactive content, or exam content, and sees configurable tabs below it for course text, labs, quizzes, summaries, resources, and notes. The backend should model this flexibly with subjects, topics, sections, topic items, resources, tab content, concept tags, progress events, and access policies.

## Current architecture decision in one paragraph

The existing FastAPI backend on AWS Lambda, deployed with Zappa behind API Gateway and backed by RDS PostgreSQL, remains the core control layer. It should handle auth, content metadata, progress, quizzes, payments, access policies, token generation, and webhooks. It should not directly host livestream video delivery, large realtime chat fanout, or long-running AI/media jobs. Those should use specialized providers and async workers.

## Detailed reference

`docs/content-semantics.md` contains the current content semantics contract. It should stay aligned with the split knowledge-base files.
