'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, CheckCircle2, MessageSquare,
  BookOpen, ChevronRight, Send, StickyNote,
  FileText, Save, Trash2, Play, HelpCircle,
  Puzzle, ArrowRight, Lock, FlaskConical
} from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import VideoPlayer from '@/components/VideoPlayer'
import ChapterSidebar from '@/components/ChapterSidebar'
import AuthGuard from '@/components/AuthGuard'
import VideoQuizOverlay from '@/components/VideoQuizOverlay'
import SectionQuiz from '@/components/SectionQuiz'
import { triggerMascot } from '@/components/KrescoMascot'

// Activity components
import TrueFalse from '@/components/activities/TrueFalse'
import Matching from '@/components/activities/Matching'
import OndeCaracteristiques from '@/components/activities/ondes/OndeCaracteristiques'
import OndePropagation from '@/components/activities/ondes/OndePropagation'
import OndeTrueFalse from '@/components/activities/ondes/OndeTrueFalse'
import FillInBlank from '@/components/activities/FillInBlank'
import Ordering from '@/components/activities/Ordering'
import DragAndDrop from '@/components/activities/DragAndDrop'
import dynamic from 'next/dynamic'
const WaveSimulator = dynamic(() => import('@/components/simulators/WaveSimulator'), { ssr: false })
const PrismSimulator = dynamic(() => import('@/components/simulators/PrismSimulator'), { ssr: false })
const DiffractionSimulator = dynamic(() => import('@/components/simulators/DiffractionSimulator'), { ssr: false })

interface SectionData {
  id: number
  title: string
  section_type: 'video' | 'quiz' | 'activity' | 'text'
  activity_type?: string
  order: number
  duration_seconds?: number
  is_free_preview?: boolean
  is_completed?: boolean
  is_locked?: boolean
  video_url?: string
  text_content?: string
  quiz_data?: { questions: { text: string; options: { text: string; is_correct: boolean }[] }[] }
  pass_score?: number
  activity_data?: any
  chapter_id: number
}

interface ChapterInfo {
  id: number
  title: string
  subject_id: number
  subject_title: string
}

type Tab = 'overview' | 'quiz' | 'comments' | 'notes' | 'support' | 'lab'

const NOTES_KEY = (sectionId: string) => `kresco_notes_${sectionId}`

export default function WatchPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const sectionId = lessonId // Treat lessonId param as section ID
  const router = useRouter()
  const { user } = useAuthStore()

  const [section, setSection] = useState<SectionData | null>(null)
  const [allSections, setAllSections] = useState<SectionData[]>([])
  const [chapterInfo, setChapterInfo] = useState<ChapterInfo | null>(null)
  const [chapters, setChapters] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isCompleted, setIsCompleted] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)
  const [pdfs, setPdfs] = useState<{ id: number; title: string; file_url: string; order: number }[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [videoPaused, setVideoPaused] = useState(false)
  const [completingSection, setCompletingSection] = useState(false)

  // Load saved notes from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(NOTES_KEY(sectionId))
      if (saved) setNotes(saved)
    }
  }, [sectionId])

  function saveNotes() {
    localStorage.setItem(NOTES_KEY(sectionId), notes)
    setNotesSaved(true)
    toast.success('Notes sauvegardees !')
  }

  function clearNotes() {
    if (!confirm('Supprimer toutes les notes de cette section ?')) return
    localStorage.removeItem(NOTES_KEY(sectionId))
    setNotes('')
    setNotesSaved(true)
  }

  useEffect(() => {
    async function loadSection() {
      setLoading(true)
      try {
        // First, find which chapter/subject this section belongs to
        const subjectsRes = await api.get('/courses/subjects')
        let foundSection: SectionData | null = null
        let foundChapterInfo: ChapterInfo | null = null
        let foundChapters: any[] = []
        let foundAllSections: SectionData[] = []

        for (const subj of subjectsRes.data) {
          const subjDetail = await api.get(`/courses/subjects/${subj.id}`)

          for (const chapter of subjDetail.data.chapters) {
            try {
              const sectionsRes = await api.get(`/courses/chapters/${chapter.id}/sections`)
              const sections: SectionData[] = sectionsRes.data

              const match = sections.find((s: SectionData) => s.id === parseInt(sectionId))
              if (match) {
                foundSection = { ...match, chapter_id: chapter.id }
                foundChapterInfo = {
                  id: chapter.id,
                  title: chapter.title,
                  subject_id: subj.id,
                  subject_title: subj.title,
                }
                foundChapters = subjDetail.data.chapters
                foundAllSections = sections
                break
              }
            } catch {
              // Chapter may not have sections endpoint
            }
          }
          if (foundSection) break
        }

        if (!foundSection || !foundChapterInfo) {
          toast.error('Section introuvable.')
          router.push('/home')
          return
        }

        setSection(foundSection)
        setChapterInfo(foundChapterInfo)
        setChapters(foundChapters)
        setAllSections(foundAllSections)
        setIsCompleted(foundSection.is_completed ?? false)

        // Check section access (gating)
        try {
          const accessRes = await api.get(`/progress/sections/${parseInt(sectionId)}/access`)
          if (!accessRes.data.can_access) {
            toast.error('Cette section est verrouillée. Complétez la section précédente d\'abord.')
            router.push(`/home/${foundChapterInfo.subject_id}`)
            return
          }
        } catch {
          // If access check fails, allow access (backwards compat)
        }

        // Load PDFs for video sections
        if (foundSection.section_type === 'video') {
          try {
            const pdfsRes = await api.get(`/courses/lessons/${sectionId}/pdfs`)
            setPdfs(pdfsRes.data)
          } catch { setPdfs([]) }
        }

        // Load comments
        try {
          const commentsRes = await api.get('/interactions/comments', {
            params: { content_type: 'section', object_id: sectionId }
          })
          setComments(commentsRes.data)
        } catch {
          setComments([])
        }
      } catch {
        toast.error('Erreur de chargement.')
        router.push('/home')
      } finally {
        setLoading(false)
      }
    }
    loadSection()
  }, [sectionId])

  useEffect(() => {
    if (section) document.title = `${section.title} — Kresco`
  }, [section])

  const handleVideoComplete = useCallback(() => {
    markSectionComplete()
  }, [sectionId])

  async function markSectionComplete(opts?: { score?: number; correct_answers?: number; total_questions?: number }) {
    if (isCompleted || completingSection) return
    setCompletingSection(true)
    try {
      const { data } = await api.post('/progress/section-complete', {
        section_id: parseInt(sectionId),
        score: opts?.score ?? 0,
        correct_answers: opts?.correct_answers ?? 0,
        total_questions: opts?.total_questions ?? 0,
      })
      setIsCompleted(true)
      const xpEarned = data?.xp_earned ?? 0
      if (xpEarned > 0) {
        toast.success(`+${xpEarned} XP ! Section terminée !`, { icon: '⚡' })
        triggerMascot('love', `+${xpEarned} XP !`)
      } else {
        toast.success('Section terminée ! Excellent travail.')
        triggerMascot('happy', 'Bravo ! Section terminée !')
      }
    } catch {
      toast.error('Impossible de valider la section. Réessayez.')
    } finally {
      setCompletingSection(false)
    }
  }

  function navigateToNextSection() {
    if (!section || allSections.length === 0) return
    const currentIdx = allSections.findIndex(s => s.id === section.id)
    if (currentIdx < allSections.length - 1) {
      const next = allSections[currentIdx + 1]
      router.push(`/watch/${next.id}`)
    } else {
      // Last section in chapter — go back to subject
      if (chapterInfo) {
        router.push(`/home/${chapterInfo.subject_id}`)
        toast.success('Chapitre termine !')
      }
    }
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    try {
      const { data } = await api.post('/interactions/comments', {
        body: newComment.trim(),
        content_type: 'section',
        object_id: parseInt(sectionId),
      })
      setComments(prev => [...prev, data])
      setNewComment('')
      toast.success('Commentaire publie !')
    } catch {
      toast.error('Erreur lors de la publication.')
    } finally {
      setPostingComment(false)
    }
  }

  // Section progress indicator
  const currentSectionIndex = allSections.findIndex(s => s.id === parseInt(sectionId))
  const sectionProgress = allSections.length > 0 ? `Section ${currentSectionIndex + 1}/${allSections.length}` : ''

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Chargement de la section...</span>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!section || !chapterInfo) return null

  // Determine which tabs to show based on section type
  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Apercu', icon: BookOpen },
    { id: 'lab', label: 'Lab', icon: FlaskConical },
    { id: 'notes', label: 'Mes notes', icon: StickyNote },
    ...(section.section_type === 'video' ? [{ id: 'support' as Tab, label: 'Support du cours', icon: FileText }] : []),
    { id: 'comments', label: `Discussion (${comments.length})`, icon: MessageSquare },
  ]

  function renderSectionContent() {
    if (!section) return null

    switch (section.section_type) {
      case 'video':
        return (
          <div className="relative">
            <VideoPlayer
              lessonId={parseInt(sectionId)}
              durationSeconds={section.duration_seconds || 0}
              onComplete={handleVideoComplete}
              onProgress={(time: number) => setCurrentTime(time)}
            />
            <VideoQuizOverlay
              lessonId={parseInt(sectionId)}
              currentTime={currentTime}
              onPause={() => setVideoPaused(true)}
              onResume={() => setVideoPaused(false)}
              onXPEarned={(xp) => triggerMascot('love', `+${xp} XP !`)}
            />
          </div>
        )

      case 'quiz':
        if (!section.quiz_data) {
          return (
            <div className="flex items-center justify-center py-16">
              <p className="text-slate-400">Aucune donnee de quiz disponible.</p>
            </div>
          )
        }
        return (
          <div className="p-6">
            <SectionQuiz
              data={section.quiz_data}
              passScore={section.pass_score ?? 70}
              onComplete={(score, passed, correctCount, totalCount) => {
                if (passed) {
                  markSectionComplete({ score, correct_answers: correctCount, total_questions: totalCount })
                }
              }}
            />
          </div>
        )

      case 'activity':
        return (
          <div className="p-6">
            {renderActivity()}
          </div>
        )

      case 'text':
        return (
          <div className="p-6">
            <div className="max-w-2xl mx-auto">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: section.text_content || '<p>Aucun contenu disponible.</p>' }}
                />
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="flex items-center justify-center py-16">
            <p className="text-slate-400">Type de section non supporte.</p>
          </div>
        )
    }
  }

  function renderActivity() {
    if (!section?.activity_data || !section?.activity_type) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-slate-400">Aucune activite disponible.</p>
        </div>
      )
    }

    const data = section.activity_data
    const handleActivityComplete = (correct: boolean) => {
      if (correct) {
        markSectionComplete()
        triggerMascot('love', 'Activite reussie !')
      }
    }

    switch (section.activity_type) {
      case 'true_false':
        return (
          <div className="max-w-lg mx-auto">
            <TrueFalse
              statement={data.statement}
              isTrue={data.correct}
              explanation={data.explanation}
              onComplete={handleActivityComplete}
            />
          </div>
        )
      case 'matching':
        return (
          <div className="max-w-lg mx-auto">
            <Matching
              question={data.question || 'Associez les elements correspondants'}
              pairs={data.pairs}
              onComplete={handleActivityComplete}
            />
          </div>
        )
      case 'fill_in_blank':
        return (
          <div className="max-w-lg mx-auto">
            <FillInBlank
              sentence={data.sentence}
              answer={data.answer}
              hint={data.hint}
              onComplete={handleActivityComplete}
            />
          </div>
        )
      case 'ordering':
        return (
          <div className="max-w-lg mx-auto">
            <Ordering
              question={data.question || 'Remettez les elements dans le bon ordre'}
              items={data.items}
              correctOrder={data.correctOrder}
              onComplete={handleActivityComplete}
            />
          </div>
        )
      case 'drag_and_drop':
        return (
          <div className="max-w-lg mx-auto">
            <DragAndDrop
              question={data.question || 'Glissez les elements dans les zones correspondantes'}
              items={data.items}
              zones={data.zones}
              onComplete={handleActivityComplete}
            />
          </div>
        )
      case 'simulator': {
        const simType = data.simulator_type
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h3 className="text-white font-bold text-lg mb-4">{data.title || 'Simulateur interactif'}</h3>
              {simType === 'wave' && <WaveSimulator />}
              {simType === 'prism' && <PrismSimulator />}
              {simType === 'diffraction' && <DiffractionSimulator />}
              {!['wave', 'prism', 'diffraction'].includes(simType) && (
                <p className="text-slate-400">Simulateur inconnu : {simType}</p>
              )}
              <button
                onClick={() => handleActivityComplete(true)}
                className="mt-6 inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <CheckCircle2 size={15} />
                Marquer comme terminee
              </button>
            </div>
          </div>
        )
      }
      default:
        return (
          <div className="flex items-center justify-center py-16">
            <p className="text-slate-400">Type d&apos;activite non supporte : {section.activity_type}</p>
          </div>
        )
    }
  }

  function renderLabContent() {
    if (!section?.activity_type) {
      return (
        <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-2xl">
          <p className="text-slate-400 text-sm">Aucune activité associée à cette leçon.</p>
        </div>
      )
    }

    const data = section.activity_data || {}

    switch (section.activity_type) {
      case 'wave_simulator':
        return <SimulatorCard type="wave" label="Onde transversale" desc="Visualisez une onde se propageant" />
      case 'prism_simulator':
        return <SimulatorCard type="prism" label="Prisme" desc="Dispersion de la lumière" />
      case 'diffraction_simulator':
        return <SimulatorCard type="diffraction" label="Diffraction" desc="Fente simple — figure de diffraction" />
      case 'OndeCaracteristiques':
        return (
          <OndeCaracteristiques
            questions={data.questions}
            onComplete={(correct) => { if (correct) toast.success('Activité réussie !') }}
          />
        )
      case 'OndePropagation':
        return (
          <OndePropagation
            question={data.question}
            pairs={data.pairs}
            onComplete={(correct) => { if (correct) toast.success('Activité réussie !') }}
          />
        )
      case 'OndeTrueFalse':
        return (
          <OndeTrueFalse
            statements={data.statements}
            onComplete={(correct) => { if (correct) toast.success('Activité réussie !') }}
          />
        )
      default:
        return (
          <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-2xl">
            <p className="text-slate-400 text-sm">Type d&apos;activité non supporté : {section.activity_type}</p>
          </div>
        )
    }
  }

  // Section type icon for top bar
  function getTopBarIcon() {
    switch (section?.section_type) {
      case 'video': return <Play size={14} className="text-indigo-400" />
      case 'quiz': return <HelpCircle size={14} className="text-amber-400" />
      case 'activity': return <Puzzle size={14} className="text-purple-400" />
      case 'text': return <FileText size={14} className="text-sky-400" />
      default: return null
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Top bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <Link
            href={`/home/${chapterInfo.subject_id}`}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            <span>{chapterInfo.subject_title}</span>
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-slate-500 text-sm">{chapterInfo.title}</span>
          <ChevronRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-2">
            {getTopBarIcon()}
            <span className="text-slate-300 text-sm truncate">{section.title}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-slate-500 text-xs font-medium">{sectionProgress}</span>
            {isCompleted && (
              <span className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                <CheckCircle2 size={14} />
                Terminee
              </span>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: content */}
          <div className="flex-1 overflow-y-auto">
            {/* Section content area */}
            <div className="bg-slate-950">
              {renderSectionContent()}
            </div>

            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-white text-xl font-bold">{section.title}</h1>
              </div>
              <p className="text-slate-400 text-sm mb-4">{chapterInfo.title}</p>

              {/* Complete / Next section button */}
              <div className="flex items-center gap-3 mb-6">
                {!isCompleted && section.section_type !== 'video' && section.section_type !== 'quiz' && (
                  <button
                    onClick={() => markSectionComplete()}
                    disabled={completingSection}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    <CheckCircle2 size={15} />
                    {completingSection ? 'En cours...' : 'Marquer comme terminee'}
                  </button>
                )}
                {isCompleted && (
                  <button
                    onClick={navigateToNextSection}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    Section suivante
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                      activeTab === id
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 'overview' && (
                <div className="text-slate-300 leading-relaxed">
                  <p className="text-slate-400">
                    Cette section fait partie de <span className="text-white font-medium">{chapterInfo.title}</span> dans le cours{' '}
                    <span className="text-indigo-400 font-medium">{chapterInfo.subject_title}</span>.
                  </p>
                </div>
              )}

              {activeTab === 'lab' && (
                <div className="space-y-6">
                  {renderLabContent()}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300 text-sm">Vos notes personnelles pour cette section :</p>
                    <div className="flex gap-2">
                      <button
                        onClick={saveNotes}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        <Save size={12} />
                        Sauvegarder
                      </button>
                      {notes && (
                        <button
                          onClick={clearNotes}
                          className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs px-2 py-1.5 rounded-lg transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
                    placeholder="Ecrivez vos notes ici... (sauvegardees localement)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none min-h-[200px]"
                  />
                  {!notesSaved && (
                    <p className="text-xs text-amber-400">Notes non sauvegardees</p>
                  )}
                </div>
              )}

              {activeTab === 'support' && (
                <div className="space-y-4">
                  <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-3">Support du cours</h3>
                    {pdfs.length > 0 ? (
                      <div className="space-y-3">
                        {pdfs.map(pdf => (
                          <div key={pdf.id} className="flex items-center gap-3 bg-slate-800 rounded-xl p-4">
                            <FileText size={24} className="text-indigo-400 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-white text-sm font-medium">{pdf.title}</p>
                              <p className="text-slate-500 text-xs">PDF</p>
                            </div>
                            <a
                              href={pdf.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            >
                              Telecharger
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">Aucun support disponible pour cette section.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-1" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center flex-shrink-0 mt-1">
                        <span className="text-indigo-300 text-xs font-bold">{user?.full_name?.[0]}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        placeholder="Posez une question ou partagez vos reflexions..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={postComment}
                          disabled={postingComment || !newComment.trim()}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          <Send size={14} />
                          Publier
                        </button>
                      </div>
                    </div>
                  </div>

                  {comments.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare size={28} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">Pas encore de discussion. Lancez la conversation !</p>
                    </div>
                  ) : (
                    comments.map(comment => (
                      <div key={comment.id} className="flex gap-3">
                        {comment.author.avatar_url ? (
                          <img src={comment.author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-slate-400 text-xs font-bold">{comment.author.full_name?.[0]}</span>
                          </div>
                        )}
                        <div className="flex-1 bg-slate-900 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-white text-sm font-semibold">{comment.author.full_name}</span>
                            <span className="text-slate-400 text-xs">
                              {new Date(comment.created_at).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          <p className="text-slate-300 text-sm leading-relaxed">{comment.body}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: curriculum sidebar */}
          <div className="w-80 flex-shrink-0 border-l border-slate-800 overflow-hidden hidden lg:block">
            <ChapterSidebar
              chapters={chapters}
              currentSectionId={parseInt(sectionId)}
              chapterInfo={chapterInfo}
            />
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}

// ─── SimulatorCard ────────────────────────────────────────────────────────────
function SimulatorCard({ type, label, desc }: { type: string; label: string; desc: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="p-5">
        <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-3">
          <FlaskConical size={18} className="text-indigo-400" />
        </div>
        <p className="text-white font-semibold text-sm mb-1">{label}</p>
        <p className="text-slate-500 text-xs mb-4">{desc}</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
        >
          {open ? 'Fermer' : 'Ouvrir le simulateur'}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-800 p-4">
          {type === 'wave' && <WaveSimulator />}
          {type === 'prism' && <PrismSimulator />}
          {type === 'diffraction' && <DiffractionSimulator />}
        </div>
      )}
    </div>
  )
}
