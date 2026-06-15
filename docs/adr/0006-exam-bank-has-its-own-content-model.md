# Exam Bank Has Its Own Content Model

Exam Bank uses exam-specific models for problems, parts, capsules, and supporting content instead of reusing TopicItem, TabContent, Exercise, or QuestionSet as the primary structure. This keeps official exam/year/session/problem/part semantics clear while still allowing exam parts to share subjects, topics, concepts, filière, difficulty, resources, labs, XP, and progress metadata. Exam parts do not generate, source from, or directly link to Exercise Bank `Exercise` records in v1.
