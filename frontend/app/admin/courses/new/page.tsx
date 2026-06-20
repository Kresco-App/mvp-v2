'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, BookOpen, Check, FileText, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  AdminPageHeader,
  adminButtonClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
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

const card = adminPanelClass

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

  const validTopics = useMemo(() => topics.filter((topic) => topic.title.trim()), [topics])

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
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={BookOpen}
        eyebrow="Admin / Cours"
        title="Nouveau cours"
        description="Creez la matiere, ajoutez les premiers sujets, puis verifiez le recapitulatif avant envoi."
        action={(
          <>
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((value) => value - 1) : router.push('/admin'))}
            className={`${adminButtonClass} px-3`}
            aria-label={step > 1 ? "Retour a l'etape precedente" : "Retour a l'administration"}
          >
            <ArrowLeft size={16} />
            Retour
          </button>
        <span className="rounded-full bg-[#f0f0ff] px-3 py-1.5 text-[12px] font-black text-[#5b60f9]">
          Etape {step} / {STEPS.length}
        </span>
          </>
        )}
      />

      <section className={`${adminPanelClass} mb-5 overflow-hidden p-2`}>
        <div className="grid gap-2 sm:grid-cols-3">
          {STEPS.map((currentStep) => {
            const StepIcon = currentStep.icon
            const isActive = step === currentStep.id
            const isDone = step > currentStep.id
            return (
              <button
                key={currentStep.id}
                type="button"
                disabled={currentStep.id > step}
                onClick={() => setStep(currentStep.id)}
                className={`flex min-h-[48px] items-center gap-3 rounded-[12px] px-3 text-left transition disabled:cursor-not-allowed ${
                  isActive
                    ? 'bg-[#5b60f9] text-white'
                    : isDone
                      ? 'bg-[#f0fdf4] text-[#16a34a] hover:bg-[#dcfce7]'
                      : 'bg-[#fbfbfc] text-[#a1a1aa]'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${isActive ? 'bg-white/15' : 'bg-white'}`}>
                  {isDone ? <Check size={14} /> : <StepIcon size={14} />}
                </span>
                <span className="text-[13px] font-black">{currentStep.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className={`${card} mx-auto max-w-3xl p-5 sm:p-6`}>
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="m-0 text-[17px] font-black text-[#3f3f46]">Informations sur la matiere</h2>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Ce titre apparaitra dans les espaces admin et eleves.</p>
            </div>

            <div>
              <label htmlFor="new-course-title" className="mb-2 block text-[13px] font-black text-[#52525c]">Titre de la matiere *</label>
              <input
                id="new-course-title"
                aria-label="Titre de la matiere"
                value={subject.title}
                onChange={(event) => setSubject((value) => ({ ...value, title: event.target.value }))}
                placeholder="ex: Physique-Chimie"
                className="w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 py-3 text-[14px] font-semibold text-[#3f3f46] outline-none transition placeholder:text-[#d4d4d8] focus:border-[#5b60f9]"
              />
            </div>

            <div>
              <label htmlFor="new-course-description" className="mb-2 block text-[13px] font-black text-[#52525c]">Description</label>
              <textarea
                id="new-course-description"
                aria-label="Description"
                value={subject.description}
                onChange={(event) => setSubject((value) => ({ ...value, description: event.target.value }))}
                placeholder="Description du cours (optionnel)"
                rows={3}
                className="w-full resize-none rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 py-3 text-[14px] font-semibold text-[#3f3f46] outline-none transition placeholder:text-[#d4d4d8] focus:border-[#5b60f9]"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#5b60f9] text-[14px] font-black text-white transition hover:bg-[#4b50e8]"
            >
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="m-0 text-[17px] font-black text-[#3f3f46]">Sujets</h2>
                <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Ajoutez les sujets du cours. Vous pourrez ajouter des items ensuite.</p>
              </div>
              <span className="rounded-full bg-[#f4f4f5] px-3 py-1 text-[12px] font-black text-[#71717b]">{validTopics.length} pret(s)</span>
            </div>

            <div className="space-y-3">
              {topics.map((topic, index) => (
                <div key={topic.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#f4f4f5] text-[13px] font-black text-[#71717b]">{index + 1}</span>
                  <input
                    aria-label={`Titre du sujet ${index + 1}`}
                    value={topic.title}
                    onChange={(event) => {
                      const next = [...topics]
                      next[index] = { ...next[index], title: event.target.value }
                      setTopics(next)
                    }}
                    placeholder={`Sujet ${index + 1}`}
                    className="min-w-0 flex-1 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#3f3f46] outline-none transition placeholder:text-[#d4d4d8] focus:border-[#5b60f9]"
                  />
                  {topics.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTopics((previous) => previous.filter((_, topicIndex) => topicIndex !== index).map((item, topicIndex) => ({ ...item, order: topicIndex + 1 })))}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[#a1a1aa] transition hover:bg-[#fef2f2] hover:text-[#ef4444]"
                      aria-label={`Supprimer le sujet ${index + 1}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setTopics((previous) => [...previous, { id: `topic-${Date.now()}-${previous.length + 1}`, title: '', order: previous.length + 1 }])}
              className="inline-flex items-center gap-2 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2 text-[13px] font-black text-[#5b60f9] transition hover:border-[#5b60f9]"
            >
              <Plus size={14} /> Ajouter un sujet
            </button>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 flex-1 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white text-[14px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#5b60f9] text-[14px] font-black text-white transition hover:bg-[#4b50e8]"
              >
                Suivant <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="m-0 text-[17px] font-black text-[#3f3f46]">Confirmation</h2>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Verifiez les donnees avant de creer la matiere.</p>
            </div>

            <div className="space-y-4 rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] p-5">
              <div>
                <p className="m-0 mb-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Matiere</p>
                <p className="m-0 text-[15px] font-black text-[#3f3f46]">{subject.title}</p>
              </div>
              {subject.description && (
                <div>
                  <p className="m-0 mb-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Description</p>
                  <p className="m-0 text-[13px] font-semibold text-[#52525c]">{subject.description}</p>
                </div>
              )}
              <div>
                <p className="m-0 mb-2 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Sujets ({validTopics.length})</p>
                <ol className="m-0 space-y-1 pl-0">
                  {validTopics.map((topic, index) => (
                    <li key={topic.id} className="flex items-center gap-2 text-[13px] font-semibold text-[#52525c]">
                      <span className="font-mono text-[12px] text-[#a1a1aa]">{index + 1}.</span>
                      {topic.title}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-11 flex-1 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white text-[14px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#16a34a] text-[14px] font-black text-white transition hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <><Loader2 size={15} className="animate-spin" /> Creation...</> : <><Check size={15} /> Creer le cours</>}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
