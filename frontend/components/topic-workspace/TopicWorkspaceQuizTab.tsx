'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getJson, postJson } from '@/lib/apiClient'
import {
  normalizeOptionKey,
  splitOrderingInput,
  toggleMultiAnswer,
  type TabContent,
} from '@/lib/topicWorkspaceViewModel'
import { EmptyTabPanel } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { readTopicWorkspaceDraft, writeTopicWorkspaceDraft } from '@/components/topic-workspace/topicWorkspaceDraftCache'

function quizDraftKey(tabId: number) {
  return `topic-quiz:${tabId}`
}

function QuizQuestion({
  question,
  value,
  onChange,
}: {
  question: any
  value: any
  onChange: (value: any) => void
}) {
  const type = question.type || 'multiple_choice'
  const options = question.options || ['true', 'false']
  const normalizeOption = (option: any) => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const optionValue = option.id ?? option.value ?? option.key ?? option.text ?? option.label
      return {
        key: String(optionValue),
        value: optionValue,
        label: String(option.text ?? option.label ?? optionValue),
      }
    }
    return {
      key: String(option),
      value: option,
      label: String(option),
    }
  }

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div className="grid gap-2">
        {options.map((rawOption: any) => {
          const option = normalizeOption(rawOption)
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={String(value) === String(option.value)}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
                String(value) === String(option.value) ? 'border-[#29aee4] bg-[#29aee4] text-white' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (type === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="grid gap-2">
        {(question.options || []).map((rawOption: any) => {
          const option = normalizeOption(rawOption)
          const isSelected = selected.includes(String(option.value))
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(toggleMultiAnswer(value, option.value))}
              aria-pressed={isSelected}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
                isSelected ? 'border-[#29aee4] bg-[#eaf8ff] text-[#1292cf]' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
              }`}
            >
              {isSelected ? 'Selected: ' : ''}{option.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (type === 'matching') {
    const pairs = question.pairs || Object.keys(question.answer || {}).map((left) => ({ left, right: question.answer[left] }))
    const answers = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return (
      <div className="grid gap-2">
        {pairs.map((pair: any) => (
          <label key={pair.left} className="grid gap-1 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-3">
            <span className="text-xs font-black text-[#71717b]">{pair.left}</span>
            <input
              aria-label={`Match for ${pair.left}`}
              className="figma-input w-full bg-white"
              value={answers[pair.left] || ''}
              onChange={(event) => onChange({ ...answers, [pair.left]: event.target.value })}
              placeholder="Match"
            />
          </label>
        ))}
      </div>
    )
  }

  if (type === 'ordering') {
    const orderingValue = Array.isArray(value) ? value.join(', ') : normalizeOptionKey(value)
    return (
      <div className="grid gap-2">
        {question.items && (
          <div className="flex flex-wrap gap-2">
            {question.items.map((item: string) => (
              <span key={item} className="rounded-full bg-[#f7f8fb] px-3 py-1 text-xs font-black text-[#71717b]">{item}</span>
            ))}
          </div>
        )}
        <input
          aria-label="Comma-separated order"
          className="figma-input w-full"
          value={orderingValue}
          onChange={(event) => onChange(splitOrderingInput(event.target.value))}
          placeholder="Comma-separated order"
        />
      </div>
    )
  }

  if (type === 'drag_and_drop') {
    const answers = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const items = question.items || Object.keys(question.answer || {}).map((id) => ({ id, label: id }))
    const zones = question.zones || Array.from(new Set(Object.values(question.answer || {})))
    return (
      <div className="grid gap-2">
        {items.map((item: any) => (
          <label key={item.id} className="grid gap-1 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-3">
            <span className="text-xs font-black text-[#71717b]">{item.label || item.id}</span>
            <select
              aria-label={`Zone for ${item.label || item.id}`}
              className="figma-input w-full bg-white"
              value={answers[item.id] || ''}
              onChange={(event) => onChange({ ...answers, [item.id]: event.target.value })}
            >
              <option value="">Choose zone</option>
              {zones.map((zone: any) => (
                <option key={String(zone)} value={String(zone)}>{String(zone)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    )
  }

  const placeholder = type === 'numeric_answer' ? 'Numeric answer' : type === 'fill_in_blank' ? 'Fill the blank' : type === 'interactive_checkpoint' ? 'Checkpoint answer' : 'Short answer'

  return (
    <input
      aria-label={placeholder}
      className="figma-input w-full"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={type === 'numeric_answer' ? 'decimal' : 'text'}
    />
  )
}

const QuizQuestionCard = memo(function QuizQuestionCard({
  question,
  questionId,
  index,
  value,
  onAnswerChange,
}: {
  question: any
  questionId: string
  index: number
  value: any
  onAnswerChange: (questionId: string | number, value: any) => void
}) {
  return (
    <div className="rounded-2xl border border-[#e4e4e7] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="m-0 text-sm font-black text-[#3f3f46]">{index + 1}. {question.prompt}</p>
        <span className="rounded-full bg-[#f7f8fb] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
          {String(question.type || 'multiple_choice').replace(/_/g, ' ')}
        </span>
      </div>
      <QuizQuestion
        question={question}
        value={value}
        onChange={(nextValue) => onAnswerChange(questionId, nextValue)}
      />
    </div>
  )
})

type QuizQuestionGrade = {
  id: string
  type: string
  correct: boolean
  answered: boolean
}

type QuizGrading = {
  questions: QuizQuestionGrade[]
}

type QuizAttemptSummary = {
  id: number
  attempt_number: number
  score: number
  passed: boolean
  correct: number
  total: number
  pass_score: number
  submitted_at?: string | null
  grading: QuizGrading
}

type QuizResult = {
  score: number
  passed: boolean
  correct: number
  total: number
  pass_score: number
  xp_earned: number
  grading: QuizGrading
  attempt?: QuizAttemptSummary | null
}

function quizQuestionId(question: any, index: number) {
  return String(question?.id || `q${index + 1}`)
}

function quizQuestionStatus(question: QuizQuestionGrade) {
  if (question.correct) return 'Correct'
  if (question.answered) return 'Incorrect'
  return 'No answer'
}

function quizQuestionStatusClasses(question: QuizQuestionGrade) {
  if (question.correct) return 'border-[#c7f0d8] bg-[#ecfdf3] text-[#166534]'
  if (question.answered) return 'border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]'
  return 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
}

function mergeQuizAttempts(current: QuizAttemptSummary[], nextAttempt?: QuizAttemptSummary | null) {
  if (!nextAttempt) return current
  return [nextAttempt, ...current.filter((attempt) => attempt.id !== nextAttempt.id)].slice(0, 5)
}

export function TopicWorkspaceQuizTab({ tab }: { tab: TabContent }) {
  const questions = useMemo(
    () => (Array.isArray(tab.config_json?.questions) ? tab.config_json.questions : []),
    [tab.config_json],
  )
  const draftKey = useMemo(() => quizDraftKey(Number(tab.id || 0)), [tab.id])
  const [answers, setAnswersState] = useState<Record<string, any>>(() => readTopicWorkspaceDraft(draftKey, {}))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recentAttempts, setRecentAttempts] = useState<QuizAttemptSummary[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [attemptsError, setAttemptsError] = useState('')
  const questionNumbers = useMemo(() => {
    const entries: Array<[string, number]> = questions.map((question: any, index: number) => [quizQuestionId(question, index), index + 1])
    return new Map<string, number>(entries)
  }, [questions])
  const setQuestionAnswer = useCallback((questionId: string | number, value: any) => {
    setAnswersState((prev) => {
      const next = { ...prev, [questionId]: value }
      writeTopicWorkspaceDraft(draftKey, next)
      return next
    })
  }, [draftKey])

  useEffect(() => {
    setAnswersState(readTopicWorkspaceDraft(draftKey, {}))
    setResult(null)
    setRecentAttempts([])
    setAttemptsError('')
    if (!tab.id) {
      setLoadingAttempts(false)
      return
    }

    let active = true
    setLoadingAttempts(true)
    getJson<QuizAttemptSummary[]>(`/courses/tabs/${tab.id}/quiz/attempts`)
      .then((data) => {
        if (!active) return
        setRecentAttempts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!active) return
        setAttemptsError('Could not load recent attempts.')
      })
      .finally(() => {
        if (active) setLoadingAttempts(false)
      })

    return () => {
      active = false
    }
  }, [draftKey, tab.id])

  if (questions.length === 0) {
    return (
      <EmptyTabPanel
        title="No quiz questions yet"
        message="This quiz tab is present, but it does not contain any questions."
      />
    )
  }

  async function submit() {
    if (!tab.id) return
    setSubmitting(true)
    try {
      const data = await postJson<QuizResult>(`/courses/tabs/${tab.id}/quiz/submit`, { answers })
      setResult(data)
      setRecentAttempts((prev) => mergeQuizAttempts(prev, data.attempt))
      setAttemptsError('')
      toast.success(`Quiz submitted: ${data.score}%`)
    } catch {
      toast.error('Quiz submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function retryQuiz() {
    setResult(null)
  }

  function resetQuiz() {
    writeTopicWorkspaceDraft(draftKey, {})
    setAnswersState({})
    setResult(null)
  }

  return (
    <div className="space-y-4">
      {result && (
        <section className="rounded-[16px] border border-[#dbeafe] bg-[#f0f9ff] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[14px] font-black text-[#0f172a]">{result.passed ? 'Quiz passed' : 'Quiz submitted'}</p>
              <p className="m-0 mt-1 text-[12px] font-semibold text-[#475569]">
                {result.correct}/{result.total} correct - pass mark {result.pass_score}% - +{result.xp_earned} XP
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[12px] font-black ${result.passed ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#ffedd5] text-[#c2410c]'}`}>
              Score {result.score}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.grading.questions.map((question, index) => {
              const questionNumber: number = questionNumbers.get(question.id) ?? index + 1
              return (
                <span
                  key={`result-${question.id}`}
                  className={`rounded-full border px-3 py-1 text-[11px] font-black ${quizQuestionStatusClasses(question)}`}
                >
                  Q{questionNumber} {quizQuestionStatus(question)}
                </span>
              )
            })}
          </div>
        </section>
      )}
      {questions.map((question: any, index: number) => (
        <QuizQuestionCard
          key={quizQuestionId(question, index)}
          question={question}
          questionId={quizQuestionId(question, index)}
          index={index}
          value={answers[quizQuestionId(question, index)]}
          onAnswerChange={setQuestionAnswer}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={submitting} className="figma-button disabled:opacity-50">
          {submitting ? 'Submitting...' : 'Submit quiz'}
        </button>
        {result && (
          <button
            type="button"
            onClick={retryQuiz}
            disabled={submitting}
            className="inline-flex h-10 items-center rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46] disabled:opacity-50"
          >
            Retry quiz
          </button>
        )}
        {(result || Object.keys(answers).length > 0) && (
          <button
            type="button"
            onClick={resetQuiz}
            disabled={submitting}
            className="inline-flex h-10 items-center rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46] disabled:opacity-50"
          >
            Reset answers
          </button>
        )}
        {result && (
          <span className="rounded-full bg-[#fff7df] px-4 py-2 text-xs font-black text-[#b76b00]">
            Score {result.score}% - {result.passed ? 'Passed' : 'Keep trying'}
          </span>
        )}
      </div>
      <section className="rounded-[16px] border border-[#e4e4e7] bg-[#fcfcfd] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[13px] font-black text-[#3f3f46]">Recent attempts</p>
            <p className="m-0 mt-1 text-[12px] font-semibold text-[#71717b]">Your last 5 submissions for this quiz tab.</p>
          </div>
          {loadingAttempts && <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Loading...</span>}
        </div>
        {attemptsError ? (
          <p className="m-0 mt-3 text-[12px] font-semibold text-[#b45309]">{attemptsError}</p>
        ) : recentAttempts.length === 0 ? (
          <p className="m-0 mt-3 text-[12px] font-semibold text-[#71717b]">No attempts yet. Your first submission will appear here.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {recentAttempts.map((attempt, attemptIndex) => (
              <div key={attempt.id} className="rounded-[14px] border border-[#e4e4e7] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-black text-[#3f3f46]">
                        Attempt {attempt.attempt_number}
                        {attemptIndex === 0 ? ' - Most recent' : ''}
                      </span>
                      {attempt.submitted_at && (
                        <span className="text-[11px] font-bold text-[#9f9fa9]">{new Date(attempt.submitted_at).toLocaleString()}</span>
                      )}
                    </div>
                    <p className="m-0 mt-1 text-[12px] font-semibold text-[#71717b]">
                      {attempt.correct}/{attempt.total} correct - pass mark {attempt.pass_score}%
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f4f4f5] px-3 py-1 text-[11px] font-black text-[#52525c]">
                      Score {attempt.score}%
                    </span>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black ${attempt.passed ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#ffedd5] text-[#c2410c]'}`}>
                      {attempt.passed ? 'Passed' : 'Not passed'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {attempt.grading.questions.map((question, index) => {
                    const questionNumber: number = questionNumbers.get(question.id) ?? index + 1
                    return (
                      <span
                        key={`${attempt.id}-${question.id}`}
                        className={`rounded-full border px-3 py-1 text-[11px] font-black ${quizQuestionStatusClasses(question)}`}
                      >
                        Q{questionNumber} {quizQuestionStatus(question)}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
