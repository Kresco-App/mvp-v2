'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, BookOpen, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { apiDataErrorMessage } from '@/lib/apiData'
import { postJson } from '@/lib/apiClient'

interface SubjectForm {
  title: string
  description: string
}

interface TopicForm {
  id: string
  title: string
  order: number
}

type CreatedSubject = {
  id: number
}

const STEPS = [
  { id: 1, label: 'Matiere', icon: BookOpen },
  { id: 2, label: 'Sujets', icon: FileText },
  { id: 3, label: 'Confirmation', icon: Check },
]

export default function NewCoursePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [subject, setSubject] = useState<SubjectForm>({ title: '', description: '' })
  const [topics, setTopics] = useState<TopicForm[]>([{ id: 'topic-1', title: '', order: 1 }])
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!subject.title.trim()) {
      toast.error('Le titre de la matiere est requis')
      return
    }
    setCreating(true)
    try {
      const createdSubject = await postJson<CreatedSubject>('/courses/subjects', {
        title: subject.title,
        description: subject.description,
      })
      const subjectId = createdSubject.id

      const validTopics = topics.filter((topic) => topic.title.trim())
      for (const topic of validTopics) {
        await postJson('/courses/topics', {
          subject_id: subjectId,
          title: topic.title,
          order: topic.order,
        })
      }

      toast.success('Cours cree avec succes !')
      router.push(`/admin/courses/${subjectId}`)
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Erreur lors de la creation'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-4">
        <button
          type="button"
          onClick={() => (step > 1 ? setStep((value) => value - 1) : router.push('/admin'))}
          className="text-slate-400 transition hover:text-white"
          aria-label={step > 1 ? "Retour a l'etape precedente" : "Retour a l'administration"}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-semibold text-white">Nouveau cours</h1>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-8 sm:flex-nowrap sm:gap-0 sm:px-6">
        {STEPS.map((currentStep, index) => {
          const StepIcon = currentStep.icon
          return (
            <div key={currentStep.id} className="flex items-center">
              <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 ${
                step === currentStep.id
                  ? 'bg-indigo-600 text-white'
                  : step > currentStep.id
                    ? 'bg-green-600/20 text-green-400'
                    : 'bg-slate-800 text-slate-500'
              }`} aria-current={step === currentStep.id ? 'step' : undefined}>
                {step > currentStep.id ? <Check size={13} /> : <StepIcon size={13} />}
                {currentStep.label}
              </div>
              {index < STEPS.length - 1 && (
                <div className={`mx-1 hidden h-px w-8 sm:block ${step > currentStep.id ? 'bg-green-600/30' : 'bg-slate-800'}`} />
              )}
            </div>
          )
        })}
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-12">
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-white">Informations sur la matiere</h2>

            <div>
              <label htmlFor="new-course-title" className="mb-2 block text-sm font-medium text-slate-300">Titre de la matiere *</label>
              <input
                id="new-course-title"
                aria-label="Titre de la matiere"
                value={subject.title}
                onChange={(event) => setSubject((value) => ({ ...value, title: event.target.value }))}
                placeholder="ex: Physique-Chimie"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="new-course-description" className="mb-2 block text-sm font-medium text-slate-300">Description</label>
              <textarea
                id="new-course-description"
                aria-label="Description"
                value={subject.description}
                onChange={(event) => setSubject((value) => ({ ...value, description: event.target.value }))}
                placeholder="Description du cours (optionnel)"
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!subject.title.trim()) {
                  toast.error('Titre requis')
                  return
                }
                setStep(2)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700"
            >
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-white">Sujets</h2>
            <p className="text-sm text-slate-400">Ajoutez les sujets du cours. Vous pourrez ajouter des items ensuite.</p>

            <div className="space-y-3">
              {topics.map((topic, index) => (
                <div key={topic.id} className="flex items-center gap-3">
                  <span className="w-6 text-center font-mono text-sm text-slate-400">{index + 1}</span>
                  <input
                    aria-label={`Titre du sujet ${index + 1}`}
                    value={topic.title}
                    onChange={(event) => {
                      const next = [...topics]
                      next[index] = { ...next[index], title: event.target.value }
                      setTopics(next)
                    }}
                    placeholder={`Sujet ${index + 1}`}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {topics.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTopics((previous) => previous.filter((_, topicIndex) => topicIndex !== index).map((item, topicIndex) => ({ ...item, order: topicIndex + 1 })))}
                      className="text-slate-400 transition hover:text-red-400"
                      aria-label={`Supprimer le sujet ${index + 1}`}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setTopics((previous) => [...previous, { id: `topic-${Date.now()}-${previous.length + 1}`, title: '', order: previous.length + 1 }])}
              className="flex items-center gap-1 text-sm font-medium text-indigo-400 transition hover:text-indigo-300"
            >
              + Ajouter un sujet
            </button>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-xl bg-slate-800 py-3 font-semibold text-slate-300 transition hover:bg-slate-700"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700"
              >
                Suivant <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-white">Confirmation</h2>

            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Matiere</p>
                <p className="font-semibold text-white">{subject.title}</p>
              </div>
              {subject.description && (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Description</p>
                  <p className="text-sm text-slate-300">{subject.description}</p>
                </div>
              )}
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Sujets ({topics.filter((topic) => topic.title.trim()).length})</p>
                <ol className="space-y-1">
                  {topics.filter((topic) => topic.title.trim()).map((topic, index) => (
                    <li key={topic.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="font-mono text-xs text-slate-400">{index + 1}.</span>
                      {topic.title}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded-xl bg-slate-800 py-3 font-semibold text-slate-300 transition hover:bg-slate-700"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? 'Creation...' : <><Check size={15} /> Creer le cours</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
