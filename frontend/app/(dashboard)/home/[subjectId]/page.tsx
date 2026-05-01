'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, BookOpen, Play, CheckCircle2,
  FileText, Lock, ClipboardCheck, HelpCircle, Puzzle, Zap, Star,
} from 'lucide-react'
import api from '@/lib/axios'
import { buildSubjectProgressSummary, fetchSubjectPlan, type SubjectProgressSummary } from '@/lib/subjectProgress'
import { formatDuration } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'

interface Section {
  id: number
  title: string
  section_type: 'video' | 'quiz' | 'activity' | 'text'
  activity_type?: string
  order: number
  duration_seconds?: number
  is_free_preview?: boolean
  is_completed?: boolean
  is_locked?: boolean
}

interface Chapter {
  id: number
  title: string
  order: number
  lessons: any[]
  blocks: any[]
}

interface Subject {
  id: number
  title: string
  description: string
  thumbnail_url: string
  chapters: Chapter[]
}

const ZIGZAG = [90, 0, -90, 0]

function getNodeStyle(section: Section, isNext: boolean): React.CSSProperties {
  if (section.is_completed) return {
    background: 'linear-gradient(135deg,#16a34a,#22c55e)',
    border: '5px solid #bbf7d0',
    boxShadow: '0 6px 20px rgba(22,163,74,0.28)',
  }
  if (section.is_locked) return {
    background: '#f4f4f5',
    border: '5px solid #e4e4e7',
    boxShadow: 'none',
  }
  return {
    background: 'linear-gradient(135deg,#453dee,#6366f1)',
    border: isNext ? '5px solid rgba(99,102,241,0.35)' : '5px solid rgba(99,102,241,0.2)',
    boxShadow: isNext ? '0 8px 28px rgba(69,61,238,0.45)' : '0 4px 16px rgba(69,61,238,0.28)',
  }
}

function NodeIcon({ section, isNext }: { section: Section; isNext: boolean }) {
  const sz = 26
  if (section.is_completed) return <CheckCircle2 size={sz} style={{ color: '#fff' }} />
  if (section.is_locked) return <Lock size={sz - 4} style={{ color: '#a1a1aa' }} />
  switch (section.section_type) {
    case 'video':    return <Play size={sz} style={{ color: '#fff', fill: '#fff' }} />
    case 'quiz':     return <HelpCircle size={sz} style={{ color: '#fff' }} />
    case 'activity': return <Puzzle size={sz} style={{ color: '#fff' }} />
    case 'text':     return <FileText size={sz} style={{ color: '#fff' }} />
    default:         return <Star size={sz} style={{ color: '#fff' }} />
  }
}

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterSections, setChapterSections] = useState<Record<number, Section[]>>({})
  const [progressSummary, setProgressSummary] = useState<SubjectProgressSummary | null>(null)

  const isPro = user?.is_pro

  useEffect(() => {
    async function load() {
      try {
        const [subjectRes, subjectPlan] = await Promise.all([
          api.get(`/courses/subjects/${subjectId}`),
          fetchSubjectPlan(subjectId).catch(() => null),
        ])
        setSubject(subjectRes.data)

        const completedSectionIds = new Set(subjectPlan?.completed_section_ids ?? [])
        const totalLessonCount = subjectRes.data.chapters.reduce(
          (c: number, ch: Chapter) => c + (ch.lessons?.length ?? 0), 0
        )

        const sectionsMap: Record<number, Section[]> = {}
        await Promise.all(
          subjectRes.data.chapters.map(async (chapter: Chapter) => {
            try {
              const res = await api.get(`/courses/chapters/${chapter.id}/sections`)
              sectionsMap[chapter.id] = res.data.map((s: Section) => ({
                ...s,
                is_completed: completedSectionIds.has(s.id),
              }))
            } catch {
              sectionsMap[chapter.id] = []
            }
          })
        )
        setChapterSections(sectionsMap)

        if (subjectPlan) {
          setProgressSummary(buildSubjectProgressSummary(subjectPlan, totalLessonCount))
        }
      } catch {
        toast.error('Erreur de chargement de la matière.')
        router.push('/home')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router, subjectId])

  function handleSectionClick(section: Section) {
    if (section.is_locked) {
      const isProGated = !isPro && !section.is_free_preview
      if (isProGated) {
        toast.info('🔒 Passez Pro pour accéder à ce contenu.', {
          action: { label: 'Voir les offres', onClick: () => window.location.href = '/pricing' }
        })
      } else {
        toast.info('Terminez les sections précédentes pour débloquer celle-ci.')
      }
      return
    }
    window.location.href = `/watch/${section.id}`
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--surface-hover)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!subject) return null

  const allSections = Object.values(chapterSections).flat()
  const totalSections = allSections.length
  const completedCount = allSections.filter(s => s.is_completed).length
  const percentage = progressSummary?.percentage ?? (totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0)
  const nextSection = allSections.find(s => !s.is_completed && !s.is_locked)

  return (
    <div className="kresco-shell" style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
          <ArrowLeft size={13} />
          Accueil
        </Link>
        <span style={{ color: 'var(--border)', fontSize: 12 }}>/</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>{subject.title}</span>
      </div>

      {/* Hero card */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#edf1ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={26} style={{ color: '#453dee' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>{subject.title}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.6 }}>{subject.description}</p>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{completedCount} / {totalSections} sections complétées</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{percentage}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-input)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${percentage}%`, background: 'linear-gradient(90deg,#453dee,#6366f1)', transition: 'width 600ms ease' }} />
              </div>
            </div>
          </div>
        </div>

        {nextSection && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href={`/watch/${nextSection.id}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--primary)', color: '#fff',
              padding: '11px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(69,61,238,0.35)', transition: 'transform 150ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'none' }}
            >
              <Play size={15} style={{ fill: 'currentColor' }} />
              {completedCount === 0 ? 'Commencer le cours' : 'Continuer'}
            </Link>
            <Link href={`/exam/${subjectId}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              padding: '11px 16px', borderRadius: 12, border: '1px solid var(--border)',
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)' }}
            >
              <ClipboardCheck size={15} />
              Examen blanc
            </Link>
          </div>
        )}
      </div>

      {/* Duolingo-style learning path */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 80px' }}>
        {subject.chapters.map((chapter, chapterIdx) => {
          const sections = chapterSections[chapter.id] || []
          const nextInChapterIdx = sections.findIndex(s => !s.is_completed && !s.is_locked)

          return (
            <div key={chapter.id} style={{ width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

              {/* Separator dots between chapters */}
              {chapterIdx > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, marginBottom: 28, marginTop: 8 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)' }} />
                  ))}
                </div>
              )}

              {/* Chapter header box */}
              <div style={{
                border: '2px solid #453dee', borderRadius: 20, padding: '14px 36px',
                fontWeight: 800, fontSize: 15, color: '#453dee', textAlign: 'center',
                background: 'var(--surface-card)', marginBottom: 36, maxWidth: 380, width: '100%',
                boxShadow: '0 2px 16px rgba(69,61,238,0.1)',
              }}>
                {chapter.title}
              </div>

              {/* Section nodes */}
              {sections.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>Aucune section disponible.</p>
              ) : (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {sections.map((section, si) => {
                    const offset = ZIGZAG[si % 4]
                    const isNext = si === nextInChapterIdx
                    const nodeStyle = getNodeStyle(section, isNext)
                    const isProGated = section.is_locked && !isPro && !section.is_free_preview

                    return (
                      <div key={section.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

                        {/* Connecting dots */}
                        {si > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 4 }}>
                            {[0, 1, 2].map(i => (
                              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }} />
                            ))}
                          </div>
                        )}

                        {/* Node + label */}
                        <div style={{ transform: `translateX(${offset}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>

                          {/* Circle node */}
                          <div
                            onClick={() => handleSectionClick(section)}
                            style={{
                              width: 80, height: 80, borderRadius: '50%',
                              cursor: section.is_locked ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'transform 180ms ease, box-shadow 180ms ease',
                              opacity: section.is_locked && !section.is_free_preview ? 0.7 : 1,
                              ...nodeStyle,
                            }}
                            onMouseEnter={e => { if (!section.is_locked) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.08)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
                          >
                            <NodeIcon section={section} isNext={isNext} />
                          </div>

                          {/* Title */}
                          <div style={{ marginTop: 10, textAlign: 'center', maxWidth: 140, minWidth: 80 }}>
                            <p style={{
                              fontSize: 12, fontWeight: 700, lineHeight: 1.35, margin: '0 0 4px',
                              color: section.is_locked ? 'var(--text-tertiary)' : section.is_completed ? '#16a34a' : 'var(--text-primary)',
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                              {section.title}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {section.duration_seconds && section.duration_seconds > 0 && (
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{formatDuration(section.duration_seconds)}</span>
                              )}
                              {isProGated && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 99, border: '1px solid #fcd34d' }}>Pro</span>
                              )}
                              {section.is_free_preview && !section.is_completed && !section.is_locked && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#453dee', background: '#edf1ff', padding: '1px 6px', borderRadius: 99 }}>Gratuit</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Mid-point exam prompt every 2 chapters */}
              {chapterIdx % 2 === 1 && chapterIdx !== subject.chapters.length - 1 && (
                <Link href={`/exam/${subjectId}?chapter=${chapter.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 360,
                  padding: '14px 20px', borderRadius: 16, margin: '12px 0',
                  border: '1px dashed var(--border)', textDecoration: 'none',
                  background: 'var(--surface-card)', transition: 'all 150ms',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--primary-soft)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-card)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Zap size={18} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1px' }}>Examen blanc d&apos;étape</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Testez vos connaissances sur ces chapitres</p>
                  </div>
                </Link>
              )}
            </div>
          )
        })}

        {/* Final exam CTA */}
        <div style={{ width: '100%', maxWidth: 500, marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 28 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)' }} />)}
          </div>
          <Link href={`/exam/${subjectId}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '18px 24px', borderRadius: 20, textDecoration: 'none',
            background: 'linear-gradient(135deg,#453dee,#6366f1)',
            boxShadow: '0 8px 28px rgba(69,61,238,0.35)',
            color: '#fff', fontWeight: 800, fontSize: 16,
            transition: 'transform 150ms',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'none' }}
          >
            <ClipboardCheck size={22} />
            Passer l&apos;examen blanc final
          </Link>
        </div>
      </div>
    </div>
  )
}
