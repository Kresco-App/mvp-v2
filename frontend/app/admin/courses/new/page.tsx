'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, BookOpen, FileText, Video, Puzzle } from 'lucide-react'
import api from '@/lib/axios'
import AuthGuard from '@/components/AuthGuard'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectForm {
  title: string
  description: string
  niveau: string
  filiere: string
}

interface ChapterForm {
  title: string
  order: number
}

const NIVEAUX = ['1bac', '2bac']
const FILIERES = [
  'SVT', 'PC', 'SVTPC', 'SM', 'SMA', 'SMB',
  'SEG', 'Lettres', 'SH', 'Arts', 'Musique',
  'Sport', 'Technique', 'Professionnel',
]

const STEPS = [
  { id: 1, label: 'Matière', icon: BookOpen },
  { id: 2, label: 'Chapitres', icon: FileText },
  { id: 3, label: 'Confirmation', icon: Check },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewCoursePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [subject, setSubject] = useState<SubjectForm>({
    title: '', description: '', niveau: '2bac', filiere: 'PC'
  })
  const [chapters, setChapters] = useState<ChapterForm[]>([
    { title: '', order: 1 }
  ])
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!subject.title.trim()) { toast.error('Le titre de la matière est requis'); return }
    setCreating(true)
    try {
      // Create subject
      const subjRes = await api.post('/courses/subjects', {
        title: subject.title,
        description: subject.description,
        niveau: subject.niveau,
        filiere: subject.filiere,
      })
      const subjId = subjRes.data.id

      // Create chapters
      const validChapters = chapters.filter(c => c.title.trim())
      for (const ch of validChapters) {
        await api.post('/courses/chapters', {
          subject_id: subjId,
          title: ch.title,
          order: ch.order,
        })
      }

      toast.success('Cours créé avec succès !')
      router.push(`/admin/courses/${subjId}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950">
        {/* Top bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : router.push('/admin')}
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white font-semibold">Nouveau cours</h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 py-8 px-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
                step === s.id
                  ? 'bg-indigo-600 text-white'
                  : step > s.id
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-slate-800 text-slate-500'
              }`}>
                {step > s.id ? <Check size={13} /> : <s.icon size={13} />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 ${step > s.id ? 'bg-green-600/30' : 'bg-slate-800'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto px-6 pb-12">
          {/* Step 1: Subject info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-white font-bold text-lg">Informations sur la matière</h2>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Titre de la matière *</label>
                <input
                  value={subject.title}
                  onChange={e => setSubject(s => ({ ...s, title: e.target.value }))}
                  placeholder="ex: Physique-Chimie 2Bac"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Description</label>
                <textarea
                  value={subject.description}
                  onChange={e => setSubject(s => ({ ...s, description: e.target.value }))}
                  placeholder="Description du cours (optionnel)"
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Niveau</label>
                  <select
                    value={subject.niveau}
                    onChange={e => setSubject(s => ({ ...s, niveau: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Filière</label>
                  <select
                    value={subject.filiere}
                    onChange={e => setSubject(s => ({ ...s, filiere: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {FILIERES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={() => { if (!subject.title.trim()) { toast.error('Titre requis'); return }; setStep(2) }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                Suivant <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Step 2: Chapters */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-white font-bold text-lg">Chapitres</h2>
              <p className="text-slate-400 text-sm">Ajoutez les chapitres du cours. Vous pourrez ajouter des sections ensuite.</p>

              <div className="space-y-3">
                {chapters.map((ch, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm font-mono w-6 text-center">{i + 1}</span>
                    <input
                      value={ch.title}
                      onChange={e => {
                        const next = [...chapters]
                        next[i] = { ...next[i], title: e.target.value }
                        setChapters(next)
                      }}
                      placeholder={`Chapitre ${i + 1}`}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600"
                    />
                    {chapters.length > 1 && (
                      <button
                        onClick={() => setChapters(prev => prev.filter((_, j) => j !== i).map((c, j) => ({ ...c, order: j + 1 })))}
                        className="text-slate-400 hover:text-red-400 transition"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setChapters(prev => [...prev, { title: '', order: prev.length + 1 }])}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition"
              >
                + Ajouter un chapitre
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl transition"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  Suivant <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-white font-bold text-lg">Confirmation</h2>

              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Matière</p>
                  <p className="text-white font-semibold">{subject.title}</p>
                  <p className="text-slate-400 text-sm mt-0.5">{subject.niveau} · {subject.filiere}</p>
                </div>
                {subject.description && (
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Description</p>
                    <p className="text-slate-300 text-sm">{subject.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Chapitres ({chapters.filter(c => c.title.trim()).length})</p>
                  <ol className="space-y-1">
                    {chapters.filter(c => c.title.trim()).map((ch, i) => (
                      <li key={i} className="text-slate-300 text-sm flex items-center gap-2">
                        <span className="text-slate-400 text-xs font-mono">{i + 1}.</span>
                        {ch.title}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl transition"
                >
                  Retour
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {creating ? 'Création…' : <><Check size={15} /> Créer le cours</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
