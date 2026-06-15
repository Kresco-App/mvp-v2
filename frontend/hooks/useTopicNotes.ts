'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { deleteJson, getJson, patchJson, postJson } from '@/lib/apiClient'
import { apiDataErrorMessage, apiErrorStatus } from '@/lib/apiData'
import type { TabContent, TopicItem, TopicWorkspaceNote } from '@/lib/topicWorkspaceViewModel'
import { resolvedTabContentId } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { readTopicWorkspaceDraft, writeTopicWorkspaceDraft } from '@/components/topic-workspace/topicWorkspaceDraftCache'

const NOTE_MUTATION_UNAVAILABLE_STATUSES = new Set([404, 405, 501])

export function useTopicNotes({
  tab,
  item,
  topicId,
  onNoteSaved,
}: {
  tab: TabContent
  item: TopicItem
  topicId: number
  onNoteSaved: () => void
}) {
  const [notes, setNotes] = useState<TopicWorkspaceNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [mutatingNoteId, setMutatingNoteId] = useState<number | null>(null)
  const [canEditNotes, setCanEditNotes] = useState(true)
  const [canDeleteNotes, setCanDeleteNotes] = useState(true)
  const tabContentId = useMemo(() => resolvedTabContentId(tab), [tab])
  const draftKey = useMemo(() => noteDraftKey(topicId, item.id, tabContentId), [item.id, tabContentId, topicId])
  const [note, setNoteState] = useState(() => readTopicWorkspaceDraft(draftKey, ''))

  useEffect(() => {
    setNoteState(readTopicWorkspaceDraft(draftKey, ''))
  }, [draftKey])

  const setNote = useCallback((nextValue: string) => {
    writeTopicWorkspaceDraft(draftKey, nextValue)
    setNoteState(nextValue)
  }, [draftKey])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    getJson<TopicWorkspaceNote[]>('/interactions/notes', {
      params: {
        topic_id: topicId,
        topic_item_id: item.id,
        limit: 100,
      },
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return
        setNotes(filterNotesForCurrentContext(Array.isArray(data) ? data : [], tabContentId))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setNotes([])
        toast.error(apiDataErrorMessage(error, 'Could not load notes.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [item.id, tabContentId, topicId])

  const saveNote = useCallback(async () => {
    if (!note.trim()) return
    setSaving(true)
    try {
      const savedNote = await postJson<TopicWorkspaceNote>('/interactions/notes', {
        topic_id: topicId,
        topic_item_id: item.id,
        ...(tabContentId ? { tab_content_id: tabContentId } : {}),
        body: note.trim(),
      })
      setNotes((prev) => [savedNote, ...prev.filter((entry) => entry.id !== savedNote.id)])
      setNote('')
      onNoteSaved()
      toast.success('Note saved.')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not save note.'))
    } finally {
      setSaving(false)
    }
  }, [item.id, note, onNoteSaved, setNote, tabContentId, topicId])

  const saveEditedNote = useCallback(async (noteId: number) => {
    if (!editingBody.trim()) return
    setMutatingNoteId(noteId)
    try {
      const updatedNote = await patchJson<TopicWorkspaceNote>(`/interactions/notes/${noteId}`, {
        body: editingBody.trim(),
      })
      setNotes((prev) => prev.map((entry) => (entry.id === noteId ? updatedNote : entry)))
      setEditingNoteId(null)
      setEditingBody('')
      onNoteSaved()
      toast.success('Note updated.')
    } catch (error) {
      if (isNoteMutationUnavailable(error)) {
        setCanEditNotes(false)
        setEditingNoteId(null)
        setEditingBody('')
        toast.info('Editing notes is not available on this backend yet.')
        return
      }
      toast.error(apiDataErrorMessage(error, 'Could not update note.'))
    } finally {
      setMutatingNoteId(null)
    }
  }, [editingBody, onNoteSaved])

  const deleteNote = useCallback(async (noteId: number) => {
    setMutatingNoteId(noteId)
    try {
      await deleteJson(`/interactions/notes/${noteId}`)
      setNotes((prev) => prev.filter((entry) => entry.id !== noteId))
      if (editingNoteId === noteId) {
        setEditingNoteId(null)
        setEditingBody('')
      }
      onNoteSaved()
      toast.success('Note deleted.')
    } catch (error) {
      if (isNoteMutationUnavailable(error)) {
        setCanDeleteNotes(false)
        toast.info('Deleting notes is not available on this backend yet.')
        return
      }
      toast.error(apiDataErrorMessage(error, 'Could not delete note.'))
    } finally {
      setMutatingNoteId(null)
    }
  }, [editingNoteId, onNoteSaved])

  const startEditingNote = useCallback((savedNote: TopicWorkspaceNote) => {
    setEditingNoteId(savedNote.id)
    setEditingBody(savedNote.body)
  }, [])

  const cancelEditingNote = useCallback(() => {
    setEditingNoteId(null)
    setEditingBody('')
  }, [])

  return {
    notes,
    loading,
    note,
    setNote,
    saving,
    editingNoteId,
    editingBody,
    setEditingBody,
    mutatingNoteId,
    canEditNotes,
    canDeleteNotes,
    saveNote,
    saveEditedNote,
    deleteNote,
    startEditingNote,
    cancelEditingNote,
  }
}

function noteMatchesCurrentContext(note: TopicWorkspaceNote, tabContentId: number | null) {
  if (tabContentId == null) return note.tab_content_id == null
  return note.tab_content_id == null || note.tab_content_id === tabContentId
}

function filterNotesForCurrentContext(notes: TopicWorkspaceNote[], tabContentId: number | null) {
  return notes.filter((note) => noteMatchesCurrentContext(note, tabContentId))
}

function isNoteMutationUnavailable(error: unknown) {
  const status = apiErrorStatus(error)
  return typeof status === 'number' && NOTE_MUTATION_UNAVAILABLE_STATUSES.has(status)
}

function noteDraftKey(topicId: number, itemId: number, tabContentId: number | null) {
  return `topic-note:${topicId}:${itemId}:${tabContentId ?? 'lesson'}`
}
