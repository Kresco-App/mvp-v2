'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, FilePenLine } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { listProfessorChangeRequests, type ChangeRequest } from '@/lib/professor'

export default function ProfessorChangesPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Change Requests - Kresco Professor'
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    listProfessorChangeRequests(status)
      .then((items) => {
        if (alive) setRequests(items)
      })
      .catch(() => toast.error('Could not load change requests.'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [status])

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-8">
          <p className="m-0 text-[13px] font-black uppercase tracking-[0.12em] text-[#71717b]">Admin-reviewed content edits</p>
          <h1 className="m-0 mt-2 text-[30px] font-black leading-[1.05] text-[#3f3f46]">Change Requests</h1>
          <p className="m-0 mt-2 text-[15px] font-bold text-[#71717b]">Professor edits stay pending until an admin approves them.</p>
        </header>
        <div className="mb-5 flex gap-2">
          {['pending', 'approved', 'rejected'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`h-10 rounded-[13px] px-4 text-[13px] font-black ${status === item ? 'bg-[#453dee] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#52525c]'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <section className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white">
          {loading ? (
            <div className="p-5 text-[14px] font-bold text-[#71717b]">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="grid place-items-center p-10 text-center">
              <ClipboardList size={34} className="text-[#71717b]" />
              <h2 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">No {status} requests</h2>
              <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">Suggested edits will appear here after they are submitted.</p>
            </div>
          ) : (
            requests.map((request) => (
              <article key={request.id} className="grid gap-3 border-b border-[#f4f4f5] p-5 last:border-b-0 md:grid-cols-[48px_1fr_auto] md:items-start">
                <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-[#f0f0ff] text-[#453dee]">
                  <FilePenLine size={21} />
                </span>
                <div className="min-w-0">
                  <h2 className="m-0 text-[17px] font-black capitalize text-[#3f3f46]">{request.target_type.replace('_', ' ')}</h2>
                  <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">Target #{request.target_id} - {formatDate(request.created_at)}</p>
                  <pre className="mt-3 max-h-36 overflow-auto rounded-[14px] bg-[#f7f7f9] p-3 text-[12px] font-bold leading-[1.45] text-[#52525c]">{JSON.stringify(request.proposed_patch_json, null, 2)}</pre>
                </div>
                <span className="rounded-[10px] bg-[#f0f0ff] px-3 py-1 text-[11px] font-black text-[#453dee]">{request.status}</span>
              </article>
            ))
          )}
        </section>
      </main>
    </ProfessorShell>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}
