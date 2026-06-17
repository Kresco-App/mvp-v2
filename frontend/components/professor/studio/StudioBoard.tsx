'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  BookOpen, ChevronRight, CirclePlus, Clock3, Layers, Loader2, PlusCircle, SendHorizonal, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { listProfessorOfferings, type CourseOffering } from '@/lib/professor'
import {
  emptyChapter, emptyLesson, emptyTab, getStudioChangeRequest, getStudioTree, submitStudioChanges,
  treeToWorking, updateStudioChanges,
  type ChangeOperation, type StudioTree, type WorkChapter, type WorkLesson, type WorkTab,
} from '@/lib/studio'
import { buildOperations } from '@/lib/studioDiff'
import { projectOperations } from '@/lib/studioProject'
import SortableShell from './SortableShell'
import Inspector, { type Selection } from './Inspector'
import OpsTray from './OpsTray'

type Sel = { type: 'chapter' | 'lesson' | 'tab'; key: string } | null

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#f5900b]">
      <Clock3 size={10} /> En attente
    </span>
  )
}

export default function StudioBoard() {
  const [offerings, setOfferings] = useState<CourseOffering[]>([])
  const [offeringId, setOfferingId] = useState<number | null>(null)
  const [original, setOriginal] = useState<StudioTree | null>(null)
  const [working, setWorking] = useState<WorkChapter[]>([])
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Sel>(null)
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  // When editing an existing pending request, hold its id + ops to project.
  const [editId, setEditId] = useState<number | null>(null)
  const [editOps, setEditOps] = useState<ChangeOperation[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Load offerings once. Honour ?offering=<id> or ?request=<id> deep-links.
  useEffect(() => {
    let alive = true
    async function init() {
      const items = await listProfessorOfferings().catch(() => {
        toast.error('Impossible de charger vos cours.')
        return [] as CourseOffering[]
      })
      if (!alive) return
      setOfferings(items)
      if (items.length === 0) return

      const params = new URLSearchParams(window.location.search)
      const requestId = Number(params.get('request'))
      if (requestId) {
        try {
          const detail = await getStudioChangeRequest(requestId)
          if (!alive) return
          if (detail.status === 'pending') {
            setEditId(detail.id)
            setEditOps(detail.operations)
            setSummary(detail.summary || '')
            setOfferingId(detail.course_offering_id)
            return
          }
          toast.error('Cette demande n’est plus modifiable ; ouverture du studio.')
        } catch {
          toast.error('Impossible de charger la demande.')
        }
      }
      const requested = Number(params.get('offering'))
      const preselect = items.find((o) => o.id === requested)?.id
      setOfferingId((current) => current ?? preselect ?? items[0].id)
    }
    void init()
    return () => { alive = false }
  }, [])

  // Load the tree whenever the offering changes. In edit mode, project the
  // request's pending operations onto the live tree so editing resumes where
  // the professor left off.
  useEffect(() => {
    if (offeringId == null) return
    let alive = true
    setLoading(true)
    getStudioTree(offeringId)
      .then((tree) => {
        if (!alive) return
        setOriginal(tree)
        const editing = editId != null && editOps != null
        setWorking(editing ? projectOperations(tree, editOps!) : treeToWorking(tree))
        setSel(null)
        setExpandedChapters(new Set(tree.chapters.map((c) => String(c.id))))
        setExpandedLessons(new Set())
      })
      .catch(() => toast.error('Impossible de charger le contenu du cours.'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [offeringId, editId, editOps])

  const operations = useMemo(
    () => (original ? buildOperations(original, working) : []),
    [original, working],
  )

  const pendingChapterIds = useMemo(() => new Set(original?.pending_chapter_ids ?? []), [original])
  const pendingLessonIds = useMemo(() => new Set(original?.pending_lesson_ids ?? []), [original])
  const pendingTabIds = useMemo(() => new Set(original?.pending_tab_ids ?? []), [original])

  // Resolve the live node for the current selection.
  const selection: Selection = useMemo(() => {
    if (!sel) return null
    if (sel.type === 'chapter') {
      const node = working.find((c) => c.key === sel.key)
      return node ? { type: 'chapter', node } : null
    }
    if (sel.type === 'lesson') {
      for (const c of working) {
        const node = c.lessons.find((l) => l.key === sel.key)
        if (node) return { type: 'lesson', node, chapterKey: c.key }
      }
      return null
    }
    for (const c of working) {
      for (const l of c.lessons) {
        const node = l.tabs.find((t) => t.key === sel.key)
        if (node) return { type: 'tab', node, lessonKey: l.key }
      }
    }
    return null
  }, [sel, working])

  // ── Mutators ───────────────────────────────────────────────────────────────
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  function addChapter() {
    const chapter = emptyChapter()
    setWorking((w) => [...w, chapter])
    setExpandedChapters((s) => new Set(s).add(chapter.key))
    setSel({ type: 'chapter', key: chapter.key })
  }

  function addLesson(chapterKey: string) {
    const lesson = emptyLesson()
    setWorking((w) => w.map((c) => (c.key === chapterKey ? { ...c, lessons: [...c.lessons, lesson] } : c)))
    setExpandedChapters((s) => new Set(s).add(chapterKey))
    setSel({ type: 'lesson', key: lesson.key })
  }

  function addTab(lessonKey: string) {
    const tab = emptyTab()
    setWorking((w) =>
      w.map((c) => ({
        ...c,
        lessons: c.lessons.map((l) => (l.key === lessonKey ? { ...l, tabs: [...l.tabs, tab] } : l)),
      })),
    )
    setExpandedLessons((s) => new Set(s).add(lessonKey))
    setSel({ type: 'tab', key: tab.key })
  }

  function updateSelected(patch: Record<string, unknown>) {
    if (!sel) return
    setWorking((w) =>
      w.map((c) => {
        if (sel.type === 'chapter' && c.key === sel.key) return { ...c, ...patch }
        return {
          ...c,
          lessons: c.lessons.map((l) => {
            if (sel.type === 'lesson' && l.key === sel.key) return { ...l, ...patch }
            return {
              ...l,
              tabs: l.tabs.map((t) => (sel.type === 'tab' && t.key === sel.key ? { ...t, ...patch } : t)),
            }
          }),
        }
      }),
    )
  }

  function removeSelected() {
    if (!sel) return
    setWorking((w) => {
      if (sel.type === 'chapter') return w.filter((c) => c.key !== sel.key)
      return w.map((c) => ({
        ...c,
        lessons:
          sel.type === 'lesson'
            ? c.lessons.filter((l) => l.key !== sel.key)
            : c.lessons.map((l) => ({ ...l, tabs: l.tabs.filter((t) => t.key !== sel.key) })),
      }))
    })
    setSel(null)
  }

  function moveSelected(targetParentKey: string) {
    if (!sel) return
    if (sel.type === 'lesson') {
      setWorking((w) => {
        let moved: WorkLesson | null = null
        const stripped = w.map((c) => {
          const found = c.lessons.find((l) => l.key === sel.key)
          if (found) moved = found
          return { ...c, lessons: c.lessons.filter((l) => l.key !== sel.key) }
        })
        if (!moved) return w
        return stripped.map((c) => (c.key === targetParentKey ? { ...c, lessons: [...c.lessons, moved!] } : c))
      })
      setExpandedChapters((s) => new Set(s).add(targetParentKey))
    } else if (sel.type === 'tab') {
      setWorking((w) => {
        let moved: WorkTab | null = null
        const stripped = w.map((c) => ({
          ...c,
          lessons: c.lessons.map((l) => {
            const found = l.tabs.find((t) => t.key === sel.key)
            if (found) moved = found
            return { ...l, tabs: l.tabs.filter((t) => t.key !== sel.key) }
          }),
        }))
        if (!moved) return w
        return stripped.map((c) => ({
          ...c,
          lessons: c.lessons.map((l) => (l.key === targetParentKey ? { ...l, tabs: [...l.tabs, moved!] } : l)),
        }))
      })
      setExpandedLessons((s) => new Set(s).add(targetParentKey))
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const splitId = (raw: string): [string, string] => {
      const i = raw.indexOf(':')
      return [raw.slice(0, i), raw.slice(i + 1)]
    }
    const [aType, aKey] = splitId(String(active.id))
    const [oType, oKey] = splitId(String(over.id))
    if (aType !== oType) return

    if (aType === 'chapter') {
      setWorking((w) => {
        const from = w.findIndex((c) => c.key === aKey)
        const to = w.findIndex((c) => c.key === oKey)
        return from < 0 || to < 0 ? w : arrayMove(w, from, to)
      })
    } else if (aType === 'lesson') {
      setWorking((w) => {
        const srcChapter = w.find((c) => c.lessons.some((l) => l.key === aKey))
        const dstChapter = w.find((c) => c.lessons.some((l) => l.key === oKey))
        if (!srcChapter || !dstChapter) return w
        if (srcChapter === dstChapter) {
          return w.map((c) => {
            if (c !== srcChapter) return c
            const from = c.lessons.findIndex((l) => l.key === aKey)
            const to = c.lessons.findIndex((l) => l.key === oKey)
            return { ...c, lessons: arrayMove(c.lessons, from, to) }
          })
        }
        // Cross-chapter move: remove from source, insert at the over position.
        const moved = srcChapter.lessons.find((l) => l.key === aKey)!
        return w.map((c) => {
          if (c === srcChapter) return { ...c, lessons: c.lessons.filter((l) => l.key !== aKey) }
          if (c === dstChapter) {
            const idx = c.lessons.findIndex((l) => l.key === oKey)
            const next = [...c.lessons]
            next.splice(idx < 0 ? next.length : idx, 0, moved)
            return { ...c, lessons: next }
          }
          return c
        })
      })
    } else if (aType === 'tab') {
      setWorking((w) => {
        const allLessons = w.flatMap((c) => c.lessons)
        const srcLesson = allLessons.find((l) => l.tabs.some((t) => t.key === aKey))
        const dstLesson = allLessons.find((l) => l.tabs.some((t) => t.key === oKey))
        if (!srcLesson || !dstLesson) return w
        const moved = srcLesson.tabs.find((t) => t.key === aKey)!
        return w.map((c) => ({
          ...c,
          lessons: c.lessons.map((l) => {
            if (srcLesson === dstLesson && l === srcLesson) {
              const from = l.tabs.findIndex((t) => t.key === aKey)
              const to = l.tabs.findIndex((t) => t.key === oKey)
              return { ...l, tabs: arrayMove(l.tabs, from, to) }
            }
            if (l === srcLesson) return { ...l, tabs: l.tabs.filter((t) => t.key !== aKey) }
            if (l === dstLesson) {
              const idx = l.tabs.findIndex((t) => t.key === oKey)
              const next = [...l.tabs]
              next.splice(idx < 0 ? next.length : idx, 0, moved)
              return { ...l, tabs: next }
            }
            return l
          }),
        }))
      })
    }
  }

  async function submit() {
    if (offeringId == null || operations.length === 0) return
    setSubmitting(true)
    try {
      const payload = { course_offering_id: offeringId, summary, operations }
      if (editId != null) {
        const updated = await updateStudioChanges(editId, payload)
        toast.success('Demande mise à jour.')
        // Re-project the saved request so the studio keeps showing the proposed state.
        const tree = await getStudioTree(offeringId)
        setOriginal(tree)
        setEditOps(updated.operations)
        setWorking(projectOperations(tree, updated.operations))
      } else {
        await submitStudioChanges(payload)
        toast.success('Modifications soumises pour révision.')
        const tree = await getStudioTree(offeringId)
        setOriginal(tree)
        setWorking(treeToWorking(tree))
        setSummary('')
      }
      setSel(null)
    } catch {
      toast.error('Échec de la soumission. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  function exitEdit() {
    window.location.href = '/professor/studio'
  }

  const rowSelected = (type: string, key: string) => sel?.type === type && sel.key === key

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-[var(--figma-shell-width)] flex-col px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 py-5">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#5b60f9] text-white">
          <Layers size={20} />
        </div>
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-black text-[#3f3f46]">Studio du cours</h1>
            <Sparkles size={16} className="text-[#5b60f9]" />
          </div>
          <p className="text-[13px] font-semibold text-[#a1a1aa]">
            Organisez chapitres, leçons et onglets. Les changements sont soumis à validation.
          </p>
        </div>
        {editId == null && offerings.length > 1 && (
          <select
            value={offeringId ?? ''}
            onChange={(e) => setOfferingId(Number(e.target.value))}
            className="cursor-pointer rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2.5 text-[14px] font-bold text-[#3f3f46] outline-none focus:border-[#5b60f9]"
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.title || o.subject_title}</option>
            ))}
          </select>
        )}
      </div>

      {editId != null ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border-[2px] border-[#5b60f9] bg-[#f0f0ff] px-4 py-3 text-[13px] font-bold text-[#3a2fd3]">
          <Clock3 size={15} />
          <span>Vous modifiez la demande #{editId}. Soumettre remplacera son contenu en attente.</span>
          <button type="button" onClick={exitEdit} className="ml-auto rounded-[9px] border-[2px] border-[#c7c7ff] bg-white px-3 py-1 text-[12px] font-black text-[#3a2fd3] transition hover:bg-[#ececff]">
            Quitter l’édition
          </button>
        </div>
      ) : original?.has_pending_request ? (
        <div className="mb-3 rounded-[12px] border-[2px] border-[#fcc94d] bg-[#fffbeb] px-4 py-3 text-[13px] font-bold text-[#92660b]">
          Une demande de modification est déjà en attente de validation pour ce cours.
        </div>
      ) : null}

      {/* Main split */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Canvas */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc]">
          <div className="flex items-center justify-between border-b-[2px] border-[#e4e4e7] bg-white px-5 py-3">
            <span className="text-[13px] font-black uppercase tracking-[0.04em] text-[#3f3f46]">Structure</span>
            <button
              type="button"
              onClick={addChapter}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#5b60f9] px-3 py-1.5 text-[13px] font-black text-white transition hover:bg-[#4a4fe0]"
            >
              <PlusCircle size={15} /> Chapitre
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="grid h-full place-items-center text-[#a1a1aa]">
                <Loader2 className="animate-spin" />
              </div>
            ) : working.length === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <BookOpen size={28} className="mx-auto text-[#d4d4d8]" />
                  <p className="mt-2 text-[14px] font-black text-[#3f3f46]">Aucun chapitre</p>
                  <p className="text-[13px] font-semibold text-[#a1a1aa]">Ajoutez votre premier chapitre.</p>
                </div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={working.map((c) => `chapter:${c.key}`)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2.5">
                    {working.map((chapter) => (
                      <SortableShell
                        key={chapter.key}
                        id={`chapter:${chapter.key}`}
                        className={`flex flex-col rounded-[14px] border-[2px] bg-white transition ${
                          rowSelected('chapter', chapter.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                        }`}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => setExpandedChapters((s) => toggle(s, chapter.key))}
                            className="grid h-7 w-7 place-items-center rounded-[8px] text-[#a1a1aa] hover:bg-[#f4f4f5]"
                          >
                            <ChevronRight
                              size={16}
                              className={`transition-transform ${expandedChapters.has(chapter.key) ? 'rotate-90' : ''}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSel({ type: 'chapter', key: chapter.key })}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="truncate text-[15px] font-black text-[#3f3f46]">{chapter.title}</span>
                            {chapter.serverId != null && pendingChapterIds.has(chapter.serverId) && <PendingBadge />}
                            <span className="text-[12px] font-bold text-[#d4d4d8]">{chapter.lessons.length} leçon(s)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => addLesson(chapter.key)}
                            className="inline-flex items-center gap-1 rounded-[9px] border-[2px] border-[#e4e4e7] px-2 py-1 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
                          >
                            <CirclePlus size={13} /> Leçon
                          </button>
                        </div>

                        {expandedChapters.has(chapter.key) && (
                          <div className="border-t border-[#f4f4f5] px-2.5 pb-2.5 pl-9 pt-2">
                            {chapter.lessons.length === 0 ? (
                              <p className="py-2 text-[12px] font-semibold text-[#d4d4d8]">Aucune leçon.</p>
                            ) : (
                              <SortableContext
                                items={chapter.lessons.map((l) => `lesson:${l.key}`)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="flex flex-col gap-2">
                                  {chapter.lessons.map((lesson) => (
                                    <SortableShell
                                      key={lesson.key}
                                      id={`lesson:${lesson.key}`}
                                      className={`flex flex-col rounded-[12px] border-[2px] bg-[#fbfbfc] transition ${
                                        rowSelected('lesson', lesson.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 px-2 py-2">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedLessons((s) => toggle(s, lesson.key))}
                                          className="grid h-6 w-6 place-items-center rounded-[7px] text-[#a1a1aa] hover:bg-[#f4f4f5]"
                                        >
                                          <ChevronRight
                                            size={14}
                                            className={`transition-transform ${expandedLessons.has(lesson.key) ? 'rotate-90' : ''}`}
                                          />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSel({ type: 'lesson', key: lesson.key })}
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                        >
                                          <span className="truncate text-[13.5px] font-bold text-[#3f3f46]">{lesson.title}</span>
                                          {lesson.serverId != null && pendingLessonIds.has(lesson.serverId) && <PendingBadge />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => addTab(lesson.key)}
                                          className="inline-flex items-center gap-1 rounded-[8px] border-[2px] border-[#e4e4e7] px-1.5 py-1 text-[11px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
                                        >
                                          <CirclePlus size={12} /> Onglet
                                        </button>
                                      </div>

                                      {expandedLessons.has(lesson.key) && lesson.tabs.length > 0 && (
                                        <div className="border-t border-[#f4f4f5] px-2 pb-2 pl-8 pt-1.5">
                                          <SortableContext
                                            items={lesson.tabs.map((t) => `tab:${t.key}`)}
                                            strategy={verticalListSortingStrategy}
                                          >
                                            <div className="flex flex-col gap-1.5">
                                              {lesson.tabs.map((tab) => (
                                                <SortableShell
                                                  key={tab.key}
                                                  id={`tab:${tab.key}`}
                                                  className={`flex items-center gap-2 rounded-[10px] border-[2px] bg-white px-2 py-1.5 transition ${
                                                    rowSelected('tab', tab.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                                                  }`}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => setSel({ type: 'tab', key: tab.key })}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                  >
                                                    <span className="truncate text-[12.5px] font-bold text-[#52525c]">{tab.label}</span>
                                                    <span className="rounded-full bg-[#f4f4f5] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#a1a1aa]">
                                                      {tab.tab_type}
                                                    </span>
                                                    {tab.serverId != null && pendingTabIds.has(tab.serverId) && <PendingBadge />}
                                                  </button>
                                                </SortableShell>
                                              ))}
                                            </div>
                                          </SortableContext>
                                        </div>
                                      )}
                                    </SortableShell>
                                  ))}
                                </div>
                              </SortableContext>
                            )}
                          </div>
                        )}
                      </SortableShell>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <OpsTray operations={operations} />
        </div>

        {/* Inspector */}
        <div className="hidden min-h-0 overflow-hidden rounded-[16px] border-[2px] border-[#e4e4e7] bg-white lg:block">
          <Inspector
            selection={selection}
            chapters={working}
            onChange={updateSelected}
            onRemove={removeSelected}
            onMove={moveSelected}
          />
        </div>
      </div>

      {/* Submit bar */}
      <div className="flex flex-wrap items-center gap-3 py-4">
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Résumé des modifications (optionnel)…"
          className="min-w-0 flex-1 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2.5 text-[14px] font-semibold text-[#3f3f46] outline-none focus:border-[#5b60f9]"
        />
        <button
          type="button"
          disabled={operations.length === 0 || submitting}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-[12px] bg-[#5b60f9] px-5 py-2.5 text-[14px] font-black text-white transition hover:bg-[#4a4fe0] disabled:cursor-not-allowed disabled:bg-[#d4d4d8]"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}
          {editId != null ? 'Mettre à jour la demande' : 'Soumettre pour révision'}
        </button>
      </div>
    </div>
  )
}
