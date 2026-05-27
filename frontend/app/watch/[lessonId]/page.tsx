'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  FlaskConical,
  HelpCircle,
  Play,
  Puzzle,
  RotateCcw,
  Save,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import api from '@/lib/axios'
import { apiDataErrorMessage } from '@/lib/apiData'
import { cn } from '@/lib/utils'
import AuthGuard from '@/components/AuthGuard'
import RouteErrorState from '@/components/RouteErrorState'
import SafeRichText from '@/components/SafeRichText'
import { triggerMascot } from '@/lib/mascotEvents'
import { useWatchData } from '@/lib/watchData'
import {
  buildWatchChapterSections,
  buildWatchSectionCompletePayload,
  buildWatchTabs,
  getCurrentWatchChapter,
  getNextWatchDestination,
  getWatchCompletionFeedback,
  getWatchDocumentTitle,
  getWatchNotesKey,
  getWatchSectionId,
  getWatchSectionProgressLabel,
  getWatchTextHtml,
  normalizeWatchTab,
  toWatchChapterInfo,
  type WatchTab,
} from '@/lib/watchViewModel'

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), {
  loading: () => <WatchPaneLoading label="Chargement de la video..." />,
  ssr: false,
})

const VideoQuizOverlay = dynamic(() => import('@/components/VideoQuizOverlay'), {
  loading: () => null,
  ssr: false,
})

const SectionQuiz = dynamic(() => import('@/components/SectionQuiz'), {
  loading: () => <WatchPaneLoading label="Chargement du quiz..." />,
  ssr: false,
})

const InteractiveActivityRenderer = dynamic(() => import('@/components/activities/InteractiveActivityRenderer'), {
  loading: () => <WatchPaneLoading label="Chargement de l'activite..." />,
  ssr: false,
})

const ChapterSidebar = dynamic(() => import('@/components/ChapterSidebar'), {
  loading: () => <WatchPaneLoading label="Chargement du chapitre..." />,
  ssr: false,
})

const watchTabIcons: Record<WatchTab, LucideIcon> = {
  overview: BookOpen,
  lab: FlaskConical,
  notes: StickyNote,
  support: FileText,
}

function WatchPaneLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 text-sm font-semibold text-slate-400">
      {label}
    </div>
  )
}

export default function WatchPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const sectionId = lessonId
  const router = useRouter()

  const {
    context,
    contextError,
    loading,
    isValidating,
    access,
    pdfs,
    mutateContext,
  } = useWatchData(sectionId)
  const section = context?.section ?? null
  const chapterInfo = useMemo(() => (context ? toWatchChapterInfo(context) : null), [context])
  const chapters = useMemo(() => context?.chapters ?? [], [context])
  const currentChapter = useMemo(() => (context ? getCurrentWatchChapter(context) : null), [context])
  const allSections = currentChapter?.sections ?? []
  const chapterSections = useMemo(() => buildWatchChapterSections(chapters), [chapters])
  const loadError = contextError ? apiDataErrorMessage(contextError, 'Erreur de chargement.') : ''
  const lastWatchErrorToastRef = useRef('')
  const lastAccessDeniedRef = useRef('')
  const [activeTab, setActiveTab] = useState<WatchTab>('overview')
  const [isCompleted, setIsCompleted] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [completingSection, setCompletingSection] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(getWatchNotesKey(sectionId))
      setNotes(saved ?? '')
      setNotesSaved(true)
    }
  }, [sectionId])

  function saveNotes() {
    localStorage.setItem(getWatchNotesKey(sectionId), notes)
    setNotesSaved(true)
    toast.success('Notes sauvegardees !')
  }

  function clearNotes() {
    if (!confirm('Supprimer toutes les notes de cette section ?')) return
    localStorage.removeItem(getWatchNotesKey(sectionId))
    setNotes('')
    setNotesSaved(true)
  }

  useEffect(() => {
    if (!section) return
    setIsCompleted(section.is_completed ?? false)
  }, [section])

  useEffect(() => {
    if (!contextError) {
      lastWatchErrorToastRef.current = ''
      return
    }
    if (loadError === lastWatchErrorToastRef.current) return
    lastWatchErrorToastRef.current = loadError
    toast.error(loadError)
  }, [contextError, loadError])

  useEffect(() => {
    if (access?.can_access !== false) return
    if (lastAccessDeniedRef.current === sectionId) return
    lastAccessDeniedRef.current = sectionId
    toast.error("Cette section est verrouillee. Completez la precedente d'abord.")
    router.push('/home')
  }, [access?.can_access, router, sectionId])

  const retryWatchData = useCallback(async () => {
    try {
      await mutateContext()
    } catch {
      // SWR owns the latest error state; the effect above owns user-visible reporting.
    }
  }, [mutateContext])

  useEffect(() => {
    if (section) {
      document.title = getWatchDocumentTitle(section)
    }
  }, [section])

  useEffect(() => {
    if (!section) return
    const nextTab = normalizeWatchTab(activeTab, section)
    if (nextTab !== activeTab) setActiveTab(nextTab)
  }, [activeTab, section])

  const markSectionComplete = useCallback(async (opts?: {
    score?: number
    correct_answers?: number
    total_questions?: number
    answers?: Record<string, number>
  }) => {
    if (isCompleted || completingSection) return null

    setCompletingSection(true)
    try {
      const { data } = await api.post('/progress/section-complete', buildWatchSectionCompletePayload(sectionId, opts))
      if (data.passed !== false) {
        setIsCompleted(true)
        void mutateContext()
      }
      const xpEarned = data?.xp_earned ?? 0
      const feedback = getWatchCompletionFeedback(xpEarned)

      if (xpEarned > 0) {
        toast.success(`+${xpEarned} XP ! Section terminee !`, { icon: '⚡' })
        triggerMascot(feedback.mascotMood, feedback.mascotMessage)
      } else if (data.passed !== false) {
        toast.success(feedback.toastMessage)
        triggerMascot(feedback.mascotMood, feedback.mascotMessage)
      }
      return data
    } catch {
      toast.error("Impossible d'enregistrer la progression de cette section.")
      return null
    } finally {
      setCompletingSection(false)
    }
  }, [completingSection, isCompleted, mutateContext, sectionId])

  const handleVideoComplete = useCallback(() => {
    void markSectionComplete()
  }, [markSectionComplete])

  function navigateToNextSection() {
    const destination = getNextWatchDestination(section, allSections, chapterInfo)
    if (!destination) return

    router.push(destination.href)
    if (destination.kind === 'subject') {
      toast.success('Chapitre termine !')
    }
  }

  const sectionProgress = getWatchSectionProgressLabel(allSections, sectionId)

  if (loading && !section) {
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

  if (!section || !chapterInfo) {
    return (
      <AuthGuard>
        <RouteErrorState
          eyebrow="Section unavailable"
          title="This lesson could not be loaded."
          message={loadError || 'The watch context was empty or incomplete. Retry the request or go back home.'}
          fullScreen
          homeHref="/home"
          homeLabel="Back home"
          onRetry={() => void retryWatchData()}
        />
      </AuthGuard>
    )
  }

  const tabs = buildWatchTabs(section).map((tab) => ({
    ...tab,
    icon: watchTabIcons[tab.id],
  }))

  function renderSectionContent() {
    if (!section) return null
    switch (section.section_type) {
      case 'video':
        return (
          <div className="relative">
            <VideoPlayer
              lessonId={getWatchSectionId(sectionId)}
              durationSeconds={section.duration_seconds || 0}
              onComplete={handleVideoComplete}
              onProgress={(time: number) => setCurrentTime(time)}
            />
            <VideoQuizOverlay
              lessonId={getWatchSectionId(sectionId)}
              currentTime={currentTime}
              onPause={() => undefined}
              onResume={() => undefined}
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
              onComplete={async (answers) => {
                const data = await markSectionComplete({ answers })
                if (!data) return { score: 0, passed: false, correctCount: 0, totalCount: 0 }
                return {
                  score: data.score ?? 0,
                  passed: data.passed ?? false,
                  correctCount: data.correct_answers ?? 0,
                  totalCount: data.total_questions ?? 0,
                }
              }}
            />
          </div>
        )

      case 'activity':
        return (
          <div className="p-6">
            <InteractiveActivityRenderer
              activityType={section.activity_type}
              activityData={section.activity_data}
              showSimulatorCompleteButton
              onComplete={(correct) => {
                if (!correct) return
                markSectionComplete({ score: 100, correct_answers: 1, total_questions: 1 })
                triggerMascot('love', 'Activite reussie !')
              }}
            />
          </div>
        )

      case 'text':
        return (
          <div className="p-6">
            <div className="max-w-2xl mx-auto">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed">
                  <SafeRichText html={getWatchTextHtml(section)} fallbackText="Aucun contenu disponible." />
                </div>
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

  function getTopBarIcon() {
    if (!section) return null
    switch (section.section_type) {
      case 'video':
        return <Play size={14} className="text-indigo-400" />
      case 'quiz':
        return <HelpCircle size={14} className="text-amber-400" />
      case 'activity':
        return <Puzzle size={14} className="text-purple-400" />
      case 'text':
        return <FileText size={14} className="text-sky-400" />
      default:
        return null
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <Link
            href={`/home/${chapterInfo.subject_id}`}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            <span>{chapterInfo.subject_title}</span>
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <Link href={`/home/${chapterInfo.subject_id}`} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            {chapterInfo.title}
          </Link>
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

        {loadError && (
          <section role="alert" className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-950/40 px-5 py-4">
            <div>
              <p className="m-0 text-sm font-bold text-amber-100">Lesson data could not be refreshed.</p>
              <p className="m-0 mt-1 text-xs font-semibold text-amber-200/80">Cached watch data stays visible while you retry.</p>
            </div>
            <button
              type="button"
              onClick={() => void retryWatchData()}
              disabled={isValidating}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-bold text-slate-950 disabled:opacity-60"
            >
              <RotateCcw size={15} />
              {isValidating ? 'Retrying...' : 'Retry lesson data'}
            </button>
          </section>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="bg-slate-950">{renderSectionContent()}</div>

            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-white text-xl font-bold">{section.title}</h1>
              </div>
              <p className="text-slate-400 text-sm mb-4">{chapterInfo.title}</p>

              <div className="flex items-center gap-3 mb-6">
                {!isCompleted && section.section_type === 'text' && (
                  <button type="button"
                    onClick={() => markSectionComplete()}
                    disabled={completingSection}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    <CheckCircle2 size={15} />
                    {completingSection ? 'En cours...' : 'Marquer comme terminee'}
                  </button>
                )}
                {isCompleted && (
                  <button type="button"
                    onClick={navigateToNextSection}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    Section suivante
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>

              <div className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button type="button"
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
                  <InteractiveActivityRenderer
                    activityType={section.activity_type}
                    activityData={section.activity_data}
                    onComplete={(correct) => {
                      if (correct) {
                        toast.success('Activite reussie !')
                      }
                    }}
                  />
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300 text-sm">Vos notes personnelles pour cette section :</p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={saveNotes}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        <Save size={12} />
                        Sauvegarder
                      </button>
                      {notes && (
                        <button type="button"
                          onClick={clearNotes}
                          className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs px-2 py-1.5 rounded-lg transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    aria-label="Notes personnelles"
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value)
                      setNotesSaved(false)
                    }}
                    placeholder="Ecrivez vos notes ici... (sauvegardees localement)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none min-h-[200px]"
                  />
                  {!notesSaved && <p className="text-xs text-amber-400">Notes non sauvegardees</p>}
                </div>
              )}

              {activeTab === 'support' && (
                <div className="space-y-4">
                  <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-3">Support du cours</h3>
                    {pdfs.length > 0 ? (
                      <div className="space-y-3">
                        {pdfs.map((pdf) => (
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

            </div>
          </div>

          <div className="w-80 flex-shrink-0 border-l border-slate-800 overflow-hidden hidden lg:block">
            <ChapterSidebar
              chapters={chapters}
              currentSectionId={getWatchSectionId(sectionId)}
              chapterInfo={chapterInfo}
              chapterSections={chapterSections}
            />
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
