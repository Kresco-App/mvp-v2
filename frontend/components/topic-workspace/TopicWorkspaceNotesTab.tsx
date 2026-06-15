'use client'

import { Pencil, Trash2 } from 'lucide-react'
import type { TabContent, TopicItem, TopicWorkspaceNote } from '@/lib/topicWorkspaceViewModel'
import { useTopicNotes } from '@/hooks/useTopicNotes'
import { EmptyTabPanel } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'

function formatNoteTimestamp(note: TopicWorkspaceNote) {
  const value = note.updated_at || note.created_at
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleString()
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
  const {
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
  } = useTopicNotes({ tab, item, topicId, onNoteSaved })

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
            onClick={() => void saveNote()}
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
                        onClick={() => startEditingNote(savedNote)}
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
                        onClick={cancelEditingNote}
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
