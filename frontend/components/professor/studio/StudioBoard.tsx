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
  BookOpen, ChevronRight, CirclePlus, Clock3, Layers, Loader2, PlusCircle, RotateCcw, Search, SendHorizonal, Trash2, X,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import { listProfessorOfferings, type CourseOffering } from '@/lib/professor'
import {
  emptyChapter, emptyLesson, emptyTab, getStudioChangeRequest, getStudioTree, submitStudioChanges,
  treeToWorking, updateStudioChanges, withdrawStudioChange,
  type ChangeOperation, type StudioOperation, type StudioTree, type WorkChapter, type WorkLesson, type WorkTab,
} from '@/lib/studio'
import { buildOperations } from '@/lib/studioDiff'
import { projectOperations } from '@/lib/studioProject'
import SortableShell from './SortableShell'
import Inspector, { type Selection } from './Inspector'
import OpsTray from './OpsTray'
import StudioReadinessSummary from './StudioReadinessSummary'
import {
  cloneChapter,
  cloneLesson,
  cloneTab,
  collectStudioReadiness,
  collectStudioSearchResults,
  parseStudioRouteId,
  parseStudioSelection,
  sameStudioSelection,
  selectionFromOperation,
  selectionFromRoute,
  serializeStudioSelection,
  summarizeStudioOperations,
  type StudioReadinessIssue,
  type StudioSearchResult,
  type StudioSelection,
} from './studioBoardModel'

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#f5900b]">
      <Clock3 size={10} /> En attente
    </span>
  )
}

function StudioReviewPill({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'create' | 'update' | 'danger' }) {
  const toneClass = tone === 'create'
    ? 'bg-[#f0fdf4] text-[#166534]'
    : tone === 'update'
      ? 'bg-[#f0f0ff] text-[#3730a3]'
      : tone === 'danger'
        ? 'bg-[#fef2f2] text-[#991b1b]'
        : 'bg-[#f4f4f5] text-[#52525c]'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${toneClass}`}>
      <span>{value}</span>
      {label}
    </span>
  )
}

const studioControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'
const studioFieldMotionClass = 'transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:border-[#5b60f9] focus:ring-4 focus:ring-[#5b60f9]/10 motion-reduce:transition-none'
const studioFieldGroupMotionClass = 'transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus-within:border-[#5b60f9] focus-within:ring-4 focus-within:ring-[#5b60f9]/10 motion-reduce:transition-none'
const studioTreeToggleMotionClass = 'grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[#a1a1aa] transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-[#f4f4f5] hover:text-[#52525c] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function StudioBoard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeRequestId = useMemo(() => parseStudioRouteId(new URLSearchParams(searchKey).get('request')), [searchKey])
  const routeOfferingId = useMemo(() => parseStudioRouteId(new URLSearchParams(searchKey).get('offering')), [searchKey])
  const routeStudioSearch = useMemo(() => new URLSearchParams(searchKey).get('q')?.trim() ?? '', [searchKey])
  const routeStudioSelection = useMemo(() => parseStudioSelection(new URLSearchParams(searchKey).get('selection')), [searchKey])
  const [offerings, setOfferings] = useState<CourseOffering[]>([])
  const [offeringId, setOfferingId] = useState<number | null>(routeOfferingId)
  const [original, setOriginal] = useState<StudioTree | null>(null)
  const [working, setWorking] = useState<WorkChapter[]>([])
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<StudioSelection>(routeStudioSelection)
  const [summary, setSummary] = useState('')
  const [studioSearch, setStudioSearch] = useState(routeStudioSearch)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  // When editing an existing pending request, hold its id + ops to project.
  const [editId, setEditId] = useState<number | null>(null)
  const [editOps, setEditOps] = useState<ChangeOperation[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Load offerings once; route synchronization below applies deep-link context.
  useEffect(() => {
    let alive = true
    async function init() {
      const items = await listProfessorOfferings().catch(() => {
        showToastError('Impossible de charger vos cours.')
        return [] as CourseOffering[]
      })
      if (!alive) return
      setOfferings(items)
    }
    void init()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (offerings.length === 0) return
    let alive = true

    async function syncStudioRoute() {
      if (routeRequestId != null) {
        try {
          const detail = await getStudioChangeRequest(routeRequestId)
          if (!alive) return
          if (detail.status === 'pending') {
            setEditId(detail.id)
            setEditOps(detail.operations)
            setSummary(detail.summary || '')
            setOfferingId(detail.course_offering_id)
            return
          }
          showToastError('Cette demande n’est plus modifiable ; ouverture du studio.')
        } catch {
          showToastError('Impossible de charger la demande.')
        }
      }

      setEditId(null)
      setEditOps(null)
      const routedOffering = routeOfferingId != null ? offerings.find((offering) => offering.id === routeOfferingId)?.id : null
      setOfferingId((current) => {
        const currentStillExists = current != null && offerings.some((offering) => offering.id === current)
        const nextOffering = routedOffering ?? (currentStillExists ? current : offerings[0].id)
        return current === nextOffering ? current : nextOffering
      })
    }

    void syncStudioRoute()
    return () => {
      alive = false
    }
  }, [offerings, routeOfferingId, routeRequestId])

  useEffect(() => {
    setStudioSearch((current) => (current === routeStudioSearch ? current : routeStudioSearch))
  }, [routeStudioSearch])

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
      .catch(() => showToastError('Impossible de charger le contenu du cours.'))
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
  const operationSummary = useMemo(() => summarizeStudioOperations(operations), [operations])
  const studioReadiness = useMemo(() => collectStudioReadiness(working), [working])
  const normalizedStudioSearch = studioSearch.trim().toLowerCase()
  const studioSearchResults = useMemo(
    () => collectStudioSearchResults(working, normalizedStudioSearch),
    [normalizedStudioSearch, working],
  )
  const hasStudioSearch = normalizedStudioSearch.length > 0
  const readinessStatus = studioReadiness.blockers.length > 0
    ? `${studioReadiness.blockers.length} blocker${studioReadiness.blockers.length === 1 ? '' : 's'}`
    : studioReadiness.warnings.length > 0
      ? `${studioReadiness.warnings.length} warning${studioReadiness.warnings.length === 1 ? '' : 's'}`
      : 'Ready'
  const readinessTone = studioReadiness.blockers.length > 0
    ? 'bg-[#fff7ed] text-[#9a3412]'
    : studioReadiness.warnings.length > 0
      ? 'bg-[#fffbeb] text-[#854d0e]'
      : 'bg-[#f0fdf4] text-[#166534]'

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
  const selectionLabel = selection ? (selection.type === 'chapter' ? 'Chapitre' : selection.type === 'lesson' ? 'Leçon' : 'Onglet') : 'Aucune sélection'

  useEffect(() => {
    if (loading) return
    if (!routeStudioSelection) {
      setSel((current) => (current == null ? current : null))
      return
    }

    const target = selectionFromRoute(routeStudioSelection, working)
    if (!target) return
    if (target.chapterKey) setExpandedChapters((current) => new Set(current).add(target.chapterKey!))
    if (target.lessonKey) setExpandedLessons((current) => new Set(current).add(target.lessonKey!))
    setSel((current) => (sameStudioSelection(current, target.selection) ? current : target.selection))
  }, [loading, routeStudioSelection, working])

  // ── Mutators ───────────────────────────────────────────────────────────────
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    return next
  }

  function replaceStudioUrlState(
    nextOfferingId: number | null,
    nextSearch: string,
    nextSelection: StudioSelection,
    nextRequestId: number | null = editId ?? routeRequestId,
  ) {
    const params = new URLSearchParams(searchKey)
    if (nextRequestId != null) {
      params.set('request', String(nextRequestId))
      params.delete('offering')
    } else {
      params.delete('request')
      if (nextOfferingId != null) params.set('offering', String(nextOfferingId))
      else params.delete('offering')
    }

    const normalizedSearch = nextSearch.trim()
    if (normalizedSearch) params.set('q', normalizedSearch)
    else params.delete('q')

    const selectionValue = serializeStudioSelection(nextSelection)
    if (selectionValue) params.set('selection', selectionValue)
    else params.delete('selection')

    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function selectOffering(nextOfferingId: number) {
    if (!Number.isFinite(nextOfferingId)) return
    setOfferingId(nextOfferingId)
    setEditId(null)
    setEditOps(null)
    setSummary('')
    setStudioSearch('')
    setSel(null)
    replaceStudioUrlState(nextOfferingId, '', null, null)
  }

  function selectStudioSelection(nextSelection: StudioSelection) {
    setSel(nextSelection)
    replaceStudioUrlState(offeringId, studioSearch, nextSelection)
  }

  function updateStudioSearch(value: string) {
    setStudioSearch(value)
    replaceStudioUrlState(offeringId, value, sel)
  }

  function clearStudioSearch() {
    setStudioSearch('')
    replaceStudioUrlState(offeringId, '', sel)
  }

  function addChapter() {
    const chapter = emptyChapter()
    setWorking((w) => [...w, chapter])
    setExpandedChapters((s) => new Set(s).add(chapter.key))
    selectStudioSelection({ type: 'chapter', key: chapter.key })
  }

  function addLesson(chapterKey: string) {
    const lesson = emptyLesson()
    setWorking((w) => w.map((c) => (c.key === chapterKey ? { ...c, lessons: [...c.lessons, lesson] } : c)))
    setExpandedChapters((s) => new Set(s).add(chapterKey))
    selectStudioSelection({ type: 'lesson', key: lesson.key })
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
    selectStudioSelection({ type: 'tab', key: tab.key })
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
    selectStudioSelection(null)
  }

  function duplicateSelected() {
    if (!sel) return
    if (sel.type === 'chapter') {
      const source = working.find((chapter) => chapter.key === sel.key)
      if (!source) return
      const copy = cloneChapter(source)
      setWorking((current) => {
        const index = current.findIndex((chapter) => chapter.key === sel.key)
        if (index < 0) return current
        const next = [...current]
        next.splice(index + 1, 0, copy)
        return next
      })
      setExpandedChapters((current) => new Set(current).add(copy.key))
      setExpandedLessons((current) => {
        const next = new Set(current)
        copy.lessons.forEach((lesson) => {
          if (lesson.tabs.length > 0) next.add(lesson.key)
        })
        return next
      })
      selectStudioSelection({ type: 'chapter', key: copy.key })
      return
    }

    if (sel.type === 'lesson') {
      for (const chapter of working) {
        const source = chapter.lessons.find((lesson) => lesson.key === sel.key)
        if (!source) continue
        const copy = cloneLesson(source)
        setWorking((current) => current.map((item) => {
          if (item.key !== chapter.key) return item
          const index = item.lessons.findIndex((lesson) => lesson.key === sel.key)
          if (index < 0) return item
          const lessons = [...item.lessons]
          lessons.splice(index + 1, 0, copy)
          return { ...item, lessons }
        }))
        setExpandedChapters((current) => new Set(current).add(chapter.key))
        setExpandedLessons((current) => copy.tabs.length > 0 ? new Set(current).add(copy.key) : current)
        selectStudioSelection({ type: 'lesson', key: copy.key })
        return
      }
    }

    for (const chapter of working) {
      for (const lesson of chapter.lessons) {
        const source = lesson.tabs.find((tab) => tab.key === sel.key)
        if (!source) continue
        const copy = cloneTab(source)
        setWorking((current) => current.map((item) => ({
          ...item,
          lessons: item.lessons.map((candidate) => {
            if (candidate.key !== lesson.key) return candidate
            const index = candidate.tabs.findIndex((tab) => tab.key === sel.key)
            if (index < 0) return candidate
            const tabs = [...candidate.tabs]
            tabs.splice(index + 1, 0, copy)
            return { ...candidate, tabs }
          }),
        })))
        setExpandedChapters((current) => new Set(current).add(chapter.key))
        setExpandedLessons((current) => new Set(current).add(lesson.key))
        selectStudioSelection({ type: 'tab', key: copy.key })
        return
      }
    }
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
    if (studioReadiness.blockers.length > 0) {
      showToastError(studioReadiness.blockers[0]?.detail ?? 'Resolve Studio blockers before submitting.')
      return
    }
    setSubmitting(true)
    try {
      const payload = { course_offering_id: offeringId, summary, operations }
      if (editId != null) {
        const updated = await updateStudioChanges(editId, payload)
        showToastSuccess('Demande mise à jour.')
        // Re-project the saved request so the studio keeps showing the proposed state.
        const tree = await getStudioTree(offeringId)
        setOriginal(tree)
        setEditOps(updated.operations)
        setWorking(projectOperations(tree, updated.operations))
      } else {
        await submitStudioChanges(payload)
        showToastSuccess('Modifications soumises pour révision.')
        const tree = await getStudioTree(offeringId)
        setOriginal(tree)
        setWorking(treeToWorking(tree))
        setSummary('')
      }
      selectStudioSelection(null)
    } catch {
      showToastError('Échec de la soumission. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  async function reloadLiveTree() {
    if (offeringId == null) return
    setLoading(true)
    try {
      const tree = await getStudioTree(offeringId)
      setOriginal(tree)
      setWorking(treeToWorking(tree))
      setSel(null)
      setExpandedChapters(new Set(tree.chapters.map((c) => String(c.id))))
      setExpandedLessons(new Set())
    } catch {
      showToastError('Impossible de recharger le contenu du cours.')
    } finally {
      setLoading(false)
    }
  }

  async function restoreStudioDraft() {
    if (offeringId == null || operations.length === 0 || loading || submitting) return
    const restoringEdit = editId != null && editOps != null
    if (!window.confirm(restoringEdit ? 'Restaurer la demande en attente ?' : 'Annuler les changements non soumis ?')) return
    setLoading(true)
    try {
      const tree = await getStudioTree(offeringId)
      setOriginal(tree)
      setWorking(restoringEdit ? projectOperations(tree, editOps) : treeToWorking(tree))
      selectStudioSelection(null)
      setExpandedChapters(new Set(tree.chapters.map((c) => String(c.id))))
      setExpandedLessons(new Set())
      setStudioSearch('')
      replaceStudioUrlState(offeringId, '', null)
      if (!restoringEdit) setSummary('')
      showToastSuccess(restoringEdit ? 'Demande restauree.' : 'Brouillon annule.')
    } catch {
      showToastError('Impossible de restaurer le brouillon.')
    } finally {
      setLoading(false)
    }
  }

  async function withdrawPendingRequest() {
    const requestId = editId ?? original?.pending_request_id
    if (requestId == null || withdrawing) return
    if (!window.confirm('Annuler définitivement cette demande de modification ?')) return
    setWithdrawing(true)
    try {
      await withdrawStudioChange(requestId)
      showToastSuccess('Demande annulée.')
      setEditId(null)
      setEditOps(null)
      setSummary('')
      setSel(null)
      replaceStudioUrlState(offeringId, studioSearch, null, null)
      await reloadLiveTree()
    } catch {
      showToastError('Échec de l’annulation.')
    } finally {
      setWithdrawing(false)
    }
  }

  function exitEdit() {
    setEditId(null)
    setEditOps(null)
    setSummary('')
    setSel(null)
    replaceStudioUrlState(offeringId, studioSearch, null, null)
  }

  function focusReadinessIssue(issue: StudioReadinessIssue) {
    if (!issue.target) {
      addChapter()
      return
    }
    if (issue.chapterKey) setExpandedChapters((current) => new Set(current).add(issue.chapterKey!))
    if (issue.lessonKey) setExpandedLessons((current) => new Set(current).add(issue.lessonKey!))
    selectStudioSelection(issue.target)
  }

  function focusOperation(operation: StudioOperation) {
    const target = selectionFromOperation(operation, working)
    if (!target) {
      showToastError('This operation targets an item that is no longer in the draft tree.')
      return
    }

    if (target.chapterKey) setExpandedChapters((current) => new Set(current).add(target.chapterKey!))
    if (target.lessonKey) setExpandedLessons((current) => new Set(current).add(target.lessonKey!))
    selectStudioSelection(target.selection)
  }

  function focusStudioSearchResult(result: StudioSearchResult) {
    if (result.chapterKey) setExpandedChapters((current) => new Set(current).add(result.chapterKey!))
    if (result.lessonKey) setExpandedLessons((current) => new Set(current).add(result.lessonKey!))
    selectStudioSelection(result.target)
  }

  function expandStudioTree() {
    setExpandedChapters(new Set(working.map((chapter) => chapter.key)))
    setExpandedLessons(new Set(working.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.key))))
  }

  function collapseStudioTree() {
    setExpandedChapters(new Set())
    setExpandedLessons(new Set())
  }

  const rowSelected = (type: string, key: string) => sel?.type === type && sel.key === key

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[var(--figma-shell-width)] flex-col px-4 sm:px-6 lg:h-[calc(100vh-4rem)] lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#5b60f9] text-white">
          <Layers size={20} />
        </div>
        <div className="mr-auto min-w-0">
          <h1 className="m-0 text-[20px] font-black text-[#3f3f46]">Studio du cours</h1>
          <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#71717b]">
            {working.length} chapitre{working.length === 1 ? '' : 's'} · {operations.length} modification{operations.length === 1 ? '' : 's'} · {selectionLabel}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${readinessTone}`}>{readinessStatus}</span>
        {editId == null && offerings.length > 1 && (
          <select
            value={offeringId ?? ''}
            onChange={(e) => selectOffering(Number(e.target.value))}
            className={`cursor-pointer rounded-[12px] border border-[#e4e4e7] bg-white px-3 py-2.5 text-[14px] font-bold text-[#3f3f46] outline-none ${studioFieldMotionClass}`}
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.title || o.subject_title}</option>
            ))}
          </select>
        )}
      </div>

      {editId != null ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#5b60f9] bg-[#f0f0ff] px-4 py-2.5 text-[13px] font-bold text-[#3a2fd3]">
          <Clock3 size={15} />
          <span>Vous modifiez la demande #{editId}. Soumettre remplacera son contenu en attente.</span>
          <button
            type="button"
            onClick={withdrawPendingRequest}
            disabled={withdrawing}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-[#fecaca] bg-white px-3 py-1 text-[12px] font-black text-[#ef4444] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${studioControlMotionClass}`}
          >
            {withdrawing ? <Loader2 size={13} className="inline animate-spin motion-reduce:animate-none" /> : <Trash2 size={13} className="inline" />} Annuler la demande
          </button>
          <button type="button" onClick={exitEdit} className={`ml-auto min-h-10 rounded-[9px] border border-[#c7c7ff] bg-white px-3 py-1 text-[12px] font-black text-[#3a2fd3] hover:bg-[#ececff] ${studioControlMotionClass}`}>
            Quitter l’édition
          </button>
        </div>
      ) : original?.has_pending_request ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#fcc94d] bg-[#fffbeb] px-4 py-2.5 text-[13px] font-bold text-[#92660b]">
          <Clock3 size={15} className="shrink-0" />
          <span>Une demande de modification est déjà en attente de validation pour ce cours.</span>
          {original.pending_request_id != null && (
            <button
              type="button"
              onClick={withdrawPendingRequest}
              disabled={withdrawing}
              className={`ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-[#fed7aa] bg-white px-3 py-1 text-[12px] font-black text-[#9a3412] hover:bg-[#fff7ed] disabled:cursor-not-allowed disabled:opacity-60 ${studioControlMotionClass}`}
            >
              {withdrawing ? <Loader2 size={13} className="inline animate-spin motion-reduce:animate-none" /> : <Trash2 size={13} className="inline" />} Annuler la demande
            </button>
          )}
        </div>
      ) : null}

      {/* Main split */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Canvas */}
        <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-[#fbfbfc] lg:min-h-0">
          <div className="border-b border-[#e4e4e7] bg-white px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[13px] font-black uppercase tracking-[0.04em] text-[#3f3f46]">Structure</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label="Developper toute la structure"
                  onClick={expandStudioTree}
                  disabled={working.length === 0}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-[#e4e4e7] bg-white px-2.5 py-1.5 text-[12px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#453dee] disabled:cursor-not-allowed disabled:opacity-45 ${studioControlMotionClass}`}
                >
                  <ChevronRight size={13} className="rotate-90" /> Tout ouvrir
                </button>
                <button
                  type="button"
                  aria-label="Replier toute la structure"
                  onClick={collapseStudioTree}
                  disabled={working.length === 0}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-[#e4e4e7] bg-white px-2.5 py-1.5 text-[12px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#453dee] disabled:cursor-not-allowed disabled:opacity-45 ${studioControlMotionClass}`}
                >
                  <ChevronRight size={13} /> Tout fermer
                </button>
                <button
                  type="button"
                  onClick={addChapter}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-[#5b60f9] px-3 py-1.5 text-[13px] font-black text-white hover:bg-[#4a4fe0] ${studioControlMotionClass}`}
                >
                  <PlusCircle size={15} /> Chapitre
                </button>
              </div>
            </div>
            <section className="mt-3 grid gap-2" aria-label="Studio structure search">
              <label className={`flex min-h-10 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 text-[#71717b] ${studioFieldGroupMotionClass}`}>
                <Search size={14} className="shrink-0 text-[#9f9fa9]" />
                <input
                  aria-label="Search studio structure"
                  value={studioSearch}
                  onChange={(event) => updateStudioSearch(event.target.value)}
                  className="h-9 min-w-0 flex-1 border-0 bg-transparent text-[13px] font-bold text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
                  placeholder="Rechercher chapitres, lecons, onglets"
                />
                {hasStudioSearch && (
                  <button
                    type="button"
                    aria-label="Clear studio structure search"
                    onClick={clearStudioSearch}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#9f9fa9] hover:bg-[#f4f4f5] hover:text-[#52525c] ${studioControlMotionClass}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              {hasStudioSearch && (
                <div className="flex flex-wrap items-center gap-2" aria-label="Studio structure search results">
                  <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#71717b]">
                    {studioSearchResults.length} resultat{studioSearchResults.length === 1 ? '' : 's'}
                  </span>
                  {studioSearchResults.length === 0 ? (
                    <span className="text-[12px] font-bold text-[#a1a1aa]">Aucun resultat dans la structure chargee.</span>
                  ) : (
                    studioSearchResults.slice(0, 6).map((result) => (
                      <button
                        key={result.key}
                        type="button"
                        onClick={() => focusStudioSearchResult(result)}
                        className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white px-2.5 py-1.5 text-left text-[12px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#453dee] ${studioControlMotionClass}`}
                      >
                        <span className="rounded-full bg-[#f0f0ff] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[#453dee]">{result.badge}</span>
                        <span className="min-w-0 truncate">{result.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </section>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="grid h-full place-items-center text-[#a1a1aa]">
                <Loader2 className="animate-spin motion-reduce:animate-none" />
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
                        className={`flex flex-col rounded-[14px] border-[2px] bg-white transition-[border-color] duration-150 ease-out ${
                          rowSelected('chapter', chapter.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                        }`}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2.5">
                          <button
                            type="button"
                            aria-expanded={expandedChapters.has(chapter.key)}
                            aria-label={`${expandedChapters.has(chapter.key) ? 'Replier' : 'Developper'} ${chapter.title}`}
                            onClick={() => setExpandedChapters((s) => toggle(s, chapter.key))}
                            className={studioTreeToggleMotionClass}
                          >
                            <ChevronRight
                              size={16}
                              className={`transition-[transform] duration-150 ease-out motion-reduce:transition-none ${expandedChapters.has(chapter.key) ? 'rotate-90' : ''}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => selectStudioSelection({ type: 'chapter', key: chapter.key })}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="truncate text-[15px] font-black text-[#3f3f46]">{chapter.title}</span>
                            {chapter.serverId != null && pendingChapterIds.has(chapter.serverId) && <PendingBadge />}
                            <span className="text-[12px] font-bold text-[#d4d4d8]">{chapter.lessons.length} leçon(s)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => addLesson(chapter.key)}
                            className={`inline-flex min-h-10 items-center gap-1 rounded-[9px] border-[2px] border-[#e4e4e7] px-2 py-1 text-[12px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#5b60f9] ${studioControlMotionClass}`}
                          >
                            <CirclePlus size={13} aria-hidden="true" /> Leçon
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
                                      className={`flex flex-col rounded-[12px] border-[2px] bg-[#fbfbfc] transition-[border-color] duration-150 ease-out ${
                                        rowSelected('lesson', lesson.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 px-2 py-2">
                                        <button
                                          type="button"
                                          aria-expanded={expandedLessons.has(lesson.key)}
                                          aria-label={`${expandedLessons.has(lesson.key) ? 'Replier' : 'Developper'} ${lesson.title}`}
                                          onClick={() => setExpandedLessons((s) => toggle(s, lesson.key))}
                                          className={studioTreeToggleMotionClass}
                                        >
                                          <ChevronRight
                                            size={14}
                                            className={`transition-[transform] duration-150 ease-out motion-reduce:transition-none ${expandedLessons.has(lesson.key) ? 'rotate-90' : ''}`}
                                          />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => selectStudioSelection({ type: 'lesson', key: lesson.key })}
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                        >
                                          <span className="truncate text-[13.5px] font-bold text-[#3f3f46]">{lesson.title}</span>
                                          {lesson.serverId != null && pendingLessonIds.has(lesson.serverId) && <PendingBadge />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => addTab(lesson.key)}
                                          className={`inline-flex min-h-10 items-center gap-1 rounded-[8px] border-[2px] border-[#e4e4e7] px-1.5 py-1 text-[11px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#5b60f9] ${studioControlMotionClass}`}
                                        >
                                          <CirclePlus size={12} aria-hidden="true" /> Onglet
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
                                                  className={`flex items-center gap-2 rounded-[10px] border-[2px] bg-white px-2 py-1.5 transition-[border-color] duration-150 ease-out ${
                                                    rowSelected('tab', tab.key) ? 'border-[#5b60f9]' : 'border-[#e4e4e7]'
                                                  }`}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => selectStudioSelection({ type: 'tab', key: tab.key })}
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

          <OpsTray operations={operations} onOperationSelect={focusOperation} />
        </div>

        {/* Inspector */}
        <div className="hidden min-h-0 overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white lg:block">
          <Inspector
            selection={selection}
            chapters={working}
            onChange={updateSelected}
            onRemove={removeSelected}
            onDuplicate={duplicateSelected}
            onMove={moveSelected}
          />
        </div>

        <div className="min-h-[460px] overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white lg:hidden">
          <Inspector
            selection={selection}
            chapters={working}
            onChange={updateSelected}
            onRemove={removeSelected}
            onDuplicate={duplicateSelected}
            onMove={moveSelected}
          />
        </div>
      </div>

      <section className="grid gap-3 border-t border-[#e4e4e7] bg-white py-3" aria-label="Studio submission bar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:w-[260px]">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.1em] text-[#71717b]">Draft</p>
            <p className="m-0 mt-1 truncate text-[13px] font-bold text-[#52525c]">{operations.length === 0 ? 'No draft changes' : `${operations.length} operation${operations.length === 1 ? '' : 's'} ready`}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StudioReviewPill label="create" value={operationSummary.create} tone="create" />
            <StudioReviewPill label="edit" value={operationSummary.update} tone="update" />
            <StudioReviewPill label="move" value={operationSummary.reorder} />
            <StudioReviewPill label="delete" value={operationSummary.delete} tone="danger" />
          </div>
          <StudioReadinessSummary readiness={studioReadiness} onIssueSelect={focusReadinessIssue} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={operations.length === 0 || loading || submitting}
            onClick={() => void restoreStudioDraft()}
            aria-label={editId != null ? 'Restaurer la demande en attente' : 'Annuler le brouillon Studio'}
            className={`inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-4 py-2.5 text-[13px] font-black text-[#52525c] hover:border-[#5b60f9] hover:text-[#453dee] disabled:cursor-not-allowed disabled:opacity-50 ${studioControlMotionClass}`}
          >
            <RotateCcw size={15} />
            {editId != null ? 'Restaurer la demande' : 'Annuler brouillon'}
          </button>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Résumé des modifications (optionnel)…"
            className={`min-w-0 flex-1 rounded-[12px] border border-[#e4e4e7] bg-white px-3 py-2.5 text-[14px] font-semibold text-[#3f3f46] outline-none ${studioFieldMotionClass}`}
          />
          <button
            type="button"
            disabled={operations.length === 0 || submitting || studioReadiness.blockers.length > 0}
            onClick={submit}
            className={`inline-flex min-h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-5 py-2.5 text-[14px] font-black text-white hover:bg-[#4a4fe0] disabled:cursor-not-allowed disabled:bg-[#d4d4d8] ${studioControlMotionClass}`}
          >
            {submitting ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <SendHorizonal size={16} />}
            {editId != null ? 'Mettre à jour la demande' : 'Soumettre pour révision'}
          </button>
        </div>
      </section>
    </div>
  )
}
