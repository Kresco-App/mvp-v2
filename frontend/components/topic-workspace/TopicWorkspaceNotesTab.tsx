'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteJson, getJson, patchJson, postJson } from '@/lib/apiClient'
import { apiDataErrorMessage, apiErrorStatus } from '@/lib/apiData'
import type { TabContent, TopicItem, TopicWorkspaceNote } from '@/lib/topicWorkspaceViewModel'
import { EmptyTabPanel, resolvedTabContentId } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { readTopicWorkspaceDraft, writeTopicWorkspaceDraft } from '@/components/topic-workspace/topicWorkspaceDraftCache'

const NOTE_MUTATION_UNAVAILABLE_STATUSES = new Set([404, 405, 501])

function noteMatchesCurrentContext(note: TopicWorkspaceNote, tabContentId: number | null) {
  if (tabContentId == null) return note.tab_content_id == null
  return note.tab_content_id == null || note.tab_content_id === tabContentId
}

function filterNotesForCurrentContext(notes: TopicWorkspaceNote[], tabContentId: number | null) {
  return notes.filter((note) => noteMatchesCurrentContext(note, tabContentId))
}

function formatNoteTimestamp(note: TopicWorkspaceNote) {
  const value = note.updated_at || note.created_at
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleString()
}

function isNoteMutationUnavailable(error: unknown) {
  const status = apiErrorStatus(error)
  return typeof status === 'number' && NOTE_MUTATION_UNAVAILABLE_STATUSES.has(status)
}

function noteDraftKey(topicId: number, itemId: number, tabContentId: number | null) {
  return `topic-note:${topicId}:${itemId}:${tabContentId ?? 'lesson'}`
}

export function TopicWorkspaceNotesTab({
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

  async function saveNote() {
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
  }

  async function saveEditedNote(noteId: number) {
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
  }

  async function deleteNote(noteId: number) {
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
  }

  return (
    <div className="grid max-w-[760px] gap-4">
      <div className="rounded-[14px] border border-[#e4e4e7] bg-white">
        <textarea
          aria-label="Topic note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-24 w-full resize-y rounded-t-[14px] border-0 bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
          placeholder="Write a short note for this item"
        />
        <div className="flex items-center justify-between border-t border-[#f4f4f5] px-3 py-2">
          <span className="text-[11px] font-bold text-[#9f9fa9]">Saved to your notes hub for this lesson context</span>
          <button
            type="button"
            onClick={saveNote}
            disabled={saving || !note.trim()}
            className="inline-flex h-8 items-center rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
          >
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="m-0 text-[13px] font-bold text-[#9f9fa9]">Loading notes...</p>
      ) : notes.length === 0 ? (
        <EmptyTabPanel title="No notes yet" message="Your saved notes for this lesson context will appear here." />
      ) : (
        <div className="grid gap-3">
          {notes.map((savedNote) => {
            const isEditing = editingNoteId === savedNote.id
            const isMutating = mutatingNoteId === savedNote.id
            return (
              <div key={savedNote.id} className="rounded-[14px] border border-[#e4e4e7] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
                      {savedNote.tab_content_id ? 'Tab note' : 'Lesson note'}
                    </p>
                    <p className="m-0 mt-1 text-[11px] font-bold text-[#9f9fa9]">{formatNoteTimestamp(savedNote)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEditNotes && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(savedNote.id)
                          setEditingBody(savedNote.body)
                        }}
                        disabled={isMutating}
                        className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:cursor-not-allowed disabled:text-[#a1a1aa]"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    )}
                    {canDeleteNotes && (
                      <button
                        type="button"
                        onClick={() => void deleteNote(savedNote.id)}
                        disabled={isMutating}
                        className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-[#fee2e2] bg-white px-3 text-[12px] font-black text-[#b91c1c] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:text-[#fca5a5]"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-3 grid gap-3">
                    <textarea
                      aria-label={`Edit note ${savedNote.id}`}
                      value={editingBody}
                      onChange={(event) => setEditingBody(event.target.value)}
                      className="min-h-24 w-full resize-y rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null)
                          setEditingBody('')
                        }}
                        disabled={isMutating}
                        className="inline-flex h-8 items-center rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:cursor-not-allowed disabled:text-[#a1a1aa]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEditedNote(savedNote.id)}
                        disabled={isMutating || !editingBody.trim()}
                        className="inline-flex h-8 items-center rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
                      >
                        {isMutating ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="m-0 mt-3 whitespace-pre-line text-[13px] font-semibold leading-6 text-[#52525c]">{savedNote.body}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
