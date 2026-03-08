'use client'

import { useEffect, useState, useRef } from 'react'
import api from '@/lib/axios'
import { CheckCircle2, XCircle, Zap } from 'lucide-react'

interface Trigger {
  id: number
  timestamp_seconds: number
  quiz_id: number
  is_blocking: boolean
}

interface Question {
  id: number
  text: string
  options: { id: number; text: string }[]
}

interface Quiz {
  id: number
  title: string
  questions: Question[]
}

interface Props {
  lessonId: number
  currentTime: number     // seconds — parent passes current video time
  onPause: () => void     // call to pause video
  onResume: () => void    // call to resume video
  onXPEarned?: (xp: number) => void
}

export default function VideoQuizOverlay({ lessonId, currentTime, onPause, onResume, onXPEarned }: Props) {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [activeTrigger, setActiveTrigger] = useState<Trigger | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<{ score: number; passed: boolean; xp_earned: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const firedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    api.get(`/progress/lessons/${lessonId}/quiz-triggers`)
      .then(r => setTriggers(r.data))
      .catch(() => {})
  }, [lessonId])

  // Check if we should fire a trigger at current time
  useEffect(() => {
    if (activeTrigger) return
    for (const trigger of triggers) {
      if (
        !firedRef.current.has(trigger.id) &&
        currentTime >= trigger.timestamp_seconds &&
        currentTime < trigger.timestamp_seconds + 5
      ) {
        firedRef.current.add(trigger.id)
        setActiveTrigger(trigger)
        if (trigger.is_blocking) onPause()
        setLoading(true)
        api.get(`/quizzes/${trigger.quiz_id}`)
          .then(r => { setQuiz(r.data); setLoading(false) })
          .catch(() => setLoading(false))
        break
      }
    }
  }, [currentTime, triggers, activeTrigger])

  function selectAnswer(questionId: number, optionId: number) {
    setAnswers(a => ({ ...a, [questionId]: optionId }))
  }

  async function handleSubmit() {
    if (!quiz || !activeTrigger) return
    try {
      const res = await api.post('/progress/quiz-result', null, {
        params: {
          quiz_id: quiz.id,
          score: Math.round((Object.keys(answers).length / quiz.questions.length) * 100),
          passed: Object.keys(answers).length === quiz.questions.length,
        }
      })
      setResult(res.data)
      if (res.data.xp_earned > 0) onXPEarned?.(res.data.xp_earned)
    } catch {
      setResult({ score: 0, passed: false, xp_earned: 0 })
    }
  }

  function handleDismiss() {
    setActiveTrigger(null)
    setQuiz(null)
    setAnswers({})
    setResult(null)
    setCurrentQ(0)
    onResume()
  }

  if (!activeTrigger) return null

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl">
      <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-kresco border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && quiz && !result && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-kresco/10 rounded-lg flex items-center justify-center">
                <Zap size={14} className="text-kresco" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Verification rapide</p>
                <p className="font-bold text-white text-sm">{quiz.title}</p>
              </div>
            </div>

            {quiz.questions[currentQ] && (
              <>
                <p className="text-xs text-slate-400 mb-1">Q{currentQ + 1}/{quiz.questions.length}</p>
                <p className="font-semibold text-slate-200 mb-4 text-sm leading-relaxed">
                  {quiz.questions[currentQ].text}
                </p>

                <div className="space-y-2 mb-5">
                  {quiz.questions[currentQ].options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => selectAnswer(quiz.questions[currentQ].id, opt.id)}
                      className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition ${
                        answers[quiz.questions[currentQ].id] === opt.id
                          ? 'border-kresco bg-kresco/5 text-kresco font-semibold'
                          : 'border-slate-700 hover:border-kresco/30 text-slate-300'
                      }`}
                    >
                      {opt.text}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {currentQ < quiz.questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQ(i => i + 1)}
                      disabled={!answers[quiz.questions[currentQ].id]}
                      className="flex-1 bg-kresco text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-kresco/90 transition"
                    >
                      Suivant
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!answers[quiz.questions[currentQ].id]}
                      className="flex-1 bg-kresco text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-kresco/90 transition"
                    >
                      Valider
                    </button>
                  )}
                  {!activeTrigger.is_blocking && (
                    <button onClick={handleDismiss} className="text-slate-400 text-sm px-3 hover:text-slate-400">
                      Passer
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {result && (
          <div className="text-center py-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${result.passed ? 'bg-green-100' : 'bg-red-100'}`}>
              {result.passed ? <CheckCircle2 size={24} className="text-green-600" /> : <XCircle size={24} className="text-red-500" />}
            </div>
            <p className="font-bold text-xl text-white mb-1">{result.score}%</p>
            <p className={`text-sm font-medium mb-3 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
              {result.passed ? 'Bravo !' : 'Continuez a regarder et reessayez !'}
            </p>
            {result.xp_earned > 0 && (
              <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                <Zap size={12} className="fill-amber-500" />
                +{result.xp_earned} XP gagnes !
              </div>
            )}
            <button
              onClick={handleDismiss}
              className="w-full bg-kresco text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-kresco/90 transition"
            >
              Continuer a regarder
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
