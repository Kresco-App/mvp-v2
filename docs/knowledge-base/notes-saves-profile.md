# Notes, Saves, and Profile Hub

## Notes

Notes should always be available as a tab.

Topic Workspace notes:

- Notes attached to the current TopicItem.
- Notes can deep-link back to the source item.
- Notes can later support timestamps for videos.

Study Tools -> Notes:

- Shows notes for the current topic.
- Groups notes by source item.
- Allows jumping back to the exact item.

Profile -> Notes:

- Shows all notes across all topics.
- Allows filtering/searching later.
- Deep-links back to the original Topic Workspace context.

## Future canvas notes

Canvas/infinite-board notes are possible later.

Potential approach:

- Excalidraw-style component.
- Lightweight drawing/canvas component.
- Saved canvas documents linked to TopicItem or Topic.

This is not a v1 blocker.

## Saves/bookmarks

Students need a way to save anything and return to it from a central hub.

Save targets:

- TopicItem.
- Resource.
- Quiz.
- Question.
- ExamProblem.
- TabContent.
- Future video timestamp.

Saved items should store references and deep links, not duplicate content.

## Profile hub

Profile is the natural home for:

- Saved items.
- All notes.
- Achievements.
- Lifetime XP.
- Settings.

Dashboard can show shortcuts to recent saved/notes, but Profile is the canonical hub.

## Deep-link requirement

Every saved item and note should be able to navigate back to the exact learning context:

```text
Subject -> Topic -> TopicItem -> Tab/resource/timestamp when applicable
```

If a content object cannot be deep-linked, it is not modeled cleanly enough.
