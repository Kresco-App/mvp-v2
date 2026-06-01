import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('topic quiz render isolation', () => {
  it('keeps quiz question rows memoized behind a stable answer dispatcher', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'topic-workspace', 'TopicWorkspaceQuizTab.tsx'), 'utf8')

    expect(source).toContain('import { memo, useCallback, useEffect, useMemo, useState }')
    expect(source).toContain('const QuizQuestionCard = memo(function QuizQuestionCard')
    expect(source).toContain('const questions = useMemo(')
    expect(source).toContain('const setQuestionAnswer = useCallback(')
    expect(source).toContain('onAnswerChange={setQuestionAnswer}')
    expect(source).not.toContain('onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}')
  })

  it('keeps leaf topic workspace panels out of the route shell', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'topics', '[topicId]', 'page.tsx'), 'utf8')

    expect(source).toContain('@/components/topic-workspace/TopicWorkspacePanels')
    expect(source).not.toMatch(/function\s+(QuizQuestion|QuizTab|CommentsTab|TabPanel|TopicWorkspaceToolbar|TopicSearchResults)\s*\(/)
    expect(source).not.toContain('const QuizQuestionCard = memo(function QuizQuestionCard')
  })
})
