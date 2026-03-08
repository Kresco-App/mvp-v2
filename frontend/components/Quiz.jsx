'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Trophy, RotateCcw } from 'lucide-react'
import api from '@/lib/axios'
import { cn } from '@/lib/utils'

export default function Quiz({ quiz, lessonId, onPass }) {
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function selectOption(questionId, optionId) {
    if (result) return
    setAnswers(prev => ({ ...prev, [questionId]: optionId }))
  }

  async function handleSubmit() {
    const unanswered = quiz.questions.filter(q => !answers[q.id])
    if (unanswered.length > 0) {
      toast.error(`Veuillez repondre aux ${unanswered.length} question(s) restante(s).`)
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post(`/quizzes/lessons/${lessonId}/quiz/submit`, { answers })
      setResult(data)
      if (data.passed) {
        toast.success(`Excellent ! Vous avez obtenu ${data.score}% — Quiz reussi !`)
        onPass?.()
      } else {
        toast.error(`Vous avez obtenu ${data.score}%. Il faut ${data.pass_score}% pour reussir.`)
      }
    } catch {
      toast.error('Erreur lors de la soumission du quiz.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetry() {
    setAnswers({})
    setResult(null)
  }

  const answeredCount = Object.keys(answers).length
  const totalQuestions = quiz.questions.length

  return (
    <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-white font-bold text-lg">{quiz.title}</h3>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalQuestions} questions · Score minimum : {quiz.pass_score}%
          </p>
        </div>
        {result && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold',
            result.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          )}>
            {result.passed ? <Trophy size={14} /> : <XCircle size={14} />}
            {result.score}%
          </div>
        )}
      </div>

      <div className="space-y-6">
        {quiz.questions.map((question, qIdx) => (
          <div key={question.id}>
            <p className="text-white font-medium mb-3 text-sm leading-relaxed">
              <span className="text-slate-500 mr-2">{qIdx + 1}.</span>
              {question.text}
            </p>
            <div className="space-y-2">
              {question.options.map(option => {
                const selected = answers[question.id] === option.id
                const submitted = !!result
                return (
                  <button
                    key={option.id}
                    onClick={() => selectOption(question.id, option.id)}
                    disabled={submitted}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-xl border text-sm transition-all',
                      selected && !submitted
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : !selected && !submitted
                        ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                        : selected
                        ? 'bg-slate-800 border-slate-600 text-slate-300'
                        : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                    )}
                  >
                    {option.text}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit / Result */}
      <div className="mt-8">
        {!result ? (
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-sm">
              {answeredCount}/{totalQuestions} repondu(s)
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount < totalQuestions}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Envoi en cours...' : 'Valider le quiz'}
            </button>
          </div>
        ) : (
          <div className={cn(
            'rounded-xl p-5 border',
            result.passed
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          )}>
            <div className="flex items-center gap-3 mb-2">
              {result.passed
                ? <CheckCircle2 size={20} className="text-green-400" />
                : <XCircle size={20} className="text-red-400" />
              }
              <span className={cn('font-bold', result.passed ? 'text-green-400' : 'text-red-400')}>
                {result.passed ? 'Quiz reussi !' : 'Quiz echoue'}
              </span>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Vous avez {result.correct} correct sur {result.total} — Score : {result.score}%.
              {!result.passed && ` Il faut ${result.pass_score}% pour reussir.`}
            </p>
            {!result.passed && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium transition-colors"
              >
                <RotateCcw size={14} />
                Reessayer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
