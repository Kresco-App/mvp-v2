'use client'

import { useCallback, useEffect, useState } from 'react'
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
  MessageSquare,
  Play,
  Puzzle,
  Save,
  Send,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import AuthGuard from '@/components/AuthGuard'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { triggerMascot } from '@/lib/mascotEvents'
import {
  buildWatchChapterSections,
  buildWatchCommentsParams,
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
  shouldLoadWatchPdfs,
  toWatchChapterInfo,
  type WatchChapter,
  type WatchChapterInfo,
  type WatchContext,
  type WatchSection,
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
  comments: MessageSquare,
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
  const { user } = useAuthStore()

  const [section, setSection] = useState<WatchSection | null>(null)
  const [allSections, setAllSections] = useState<WatchSection[]>([])
  const [chapterInfo, setChapterInfo] = useState<WatchChapterInfo | null>(null)
  const [chapters, setChapters] = useState<WatchChapter[]>([])
  const [chapterSections, setChapterSections] = useState<Record<number, WatchSection[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<WatchTab>('overview')
  const [isCompleted, setIsCompleted] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)
  const [pdfs, setPdfs] = useState<{ id: number; title: string; file_url: string; order: number }[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [completingSection, setCompletingSection] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(getWatchNotesKey(sectionId))
      if (saved) setNotes(saved)
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
    async function loadSection() {
      setLoading(true)
      try {
        const { data } = await api.get<WatchContext>(`/courses/sections/${getWatchSectionId(sectionId)}/watch-context`)
        const currentChapter = getCurrentWatchChapter(data)

        setSection(data.section)
        setChapterInfo(toWatchChapterInfo(data))
        setChapters(data.chapters)
        setAllSections(currentChapter.sections)
        setChapterSections(buildWatchChapterSections(data.chapters))
        setIsCompleted(data.section.is_completed ?? false)

        try {
          const accessRes = await api.get(`/progress/sections/${getWatchSectionId(sectionId)}/access`)
          if (!accessRes.data.can_access) {
            toast.error("Cette section est verrouillee. Completez la precedente d'abord.")
            router.push('/home')
            return
          }
        } catch {
          // Allow access if the compatibility endpoint fails.
        }

        if (shouldLoadWatchPdfs(data.section)) {
          try {
            const pdfsRes = await api.get(`/courses/lessons/${sectionId}/pdfs`)
            setPdfs(pdfsRes.data)
          } catch {
            setPdfs([])
          }
        } else {
          setPdfs([])
        }

        try {
          const commentsRes = await api.get('/interactions/comments', {
            params: buildWatchCommentsParams(sectionId),
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
  }, [router, sectionId])

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
  }) => {
    if (isCompleted || completingSection) return

    setCompletingSection(true)
    try {
      const { data } = await api.post('/progress/section-complete', buildWatchSectionCompletePayload(sectionId, opts))
      setIsCompleted(true)
      const xpEarned = data?.xp_earned ?? 0
      const feedback = getWatchCompletionFeedback(xpEarned)

      if (xpEarned > 0) {
        toast.success(`+${xpEarned} XP ! Section terminee !`, { icon: '⚡' })
        triggerMascot(feedback.mascotMood, feedback.mascotMessage)
      } else {
        toast.success(feedback.toastMessage)
        triggerMascot(feedback.mascotMood, feedback.mascotMessage)
      }
    } catch {
      toast.error("Impossible d'enregistrer la progression de cette section.")
    } finally {
      setCompletingSection(false)
    }
  }, [completingSection, isCompleted, sectionId])

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

  async function postComment() {
    if (!newComment.trim()) return

    setPostingComment(true)
    try {
      const { data } = await api.post('/interactions/comments', {
        body: newComment.trim(),
        content_type: 'section',
        object_id: getWatchSectionId(sectionId),
      })
      setComments((prev) => [...prev, data])
      setNewComment('')
      toast.success('Commentaire publie !')
    } catch {
      toast.error('Erreur lors de la publication.')
    } finally {
      setPostingComment(false)
    }
  }

  const sectionProgress = getWatchSectionProgressLabel(allSections, sectionId)

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

  const tabs = buildWatchTabs(section, comments.length).map((tab) => ({
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
              onComplete={(score, passed, correctCount, totalCount) => {
                if (passed) {
                  markSectionComplete({
                    score,
                    correct_answers: correctCount,
                    total_questions: totalCount,
                  })
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
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"
                  // oxlint-disable-next-line react-doctor/no-danger -- section HTML is sanitized immediately before rendering.
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(getWatchTextHtml(section)) }}
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

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-1"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center flex-shrink-0 mt-1">
                        <span className="text-indigo-300 text-xs font-bold">{user?.full_name?.[0]}</span>
                      </div>
                    )}

                    <div className="flex-1">
                      <textarea
                        aria-label="Commentaire"
                        value={newComment}
                        onChange={(event) => setNewComment(event.target.value)}
                        placeholder="Posez une question ou partagez vos reflexions..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                      <div className="flex justify-end mt-2">
                        <button type="button"
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
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        {comment.author.avatar_url ? (
                          <img
                            src={comment.author.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
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
