import os

new_bugs = """
- [ ] **[CRITICAL]** `backend/app/routers/professor.py` - Architectural Monolith. File is over 2,100 lines long, tightly coupling routing, database queries, access control, and realtime messaging without a dedicated service layer.
- [ ] **[CRITICAL]** `frontend/app/(dashboard)/topics/[topicId]/page.tsx` - Architectural Monolith. File is over 1,000 lines long, containing multiple inline components and entangled state hooks leading to cascading re-renders.
- [ ] **[HIGH]** `frontend/app/(dashboard)/topics/[topicId]/page.tsx` - Missing Memoization: `QuizTab` maps over questions directly. Modifying any answer forces a full re-render of all questions in the quiz, causing severe input lag.
- [ ] **[MEDIUM]** `backend/app/routers/professor.py` - Missing Business Logic Abstraction: Relies heavily on magic strings (e.g. status == "live") instead of Enums for critical states, making the codebase fragile to typos.
"""

with open('AGENT_BUG_DUMP.md', 'a', encoding='utf-8') as f:
    f.write(new_bugs)
