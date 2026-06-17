'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Clock3, CheckCircle2, XCircle, MessageSquare, Pencil, Layers, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { listProfessorChangeRequests, type ProfessorChangeSummary } from '@/lib/professor'
import { withdrawStudioChange } from '@/lib/studio'

const FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'partially_applied', label: 'Partiel' },
  { value: 'applied', label: 'Appliquées' },
  { value: 'rejected', label: 'Rejetées' },
]

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Clock3 }> = {
  pending: { label: 'En attente de validation', className: 'bg-[#fff7ed] text-[#f5900b]', Icon: Clock3 },
  partially_applied: { label: 'Partiellement appliquée', className: 'bg-[#fff7ed] text-[#f5900b]', Icon: Clock3 },
  applied: { label: 'Appliquée', className: 'bg-[#f0fdf4] text-[#16a34a]', Icon: CheckCircle2 },
  rejected: { label: 'Rejetée', className: 'bg-[#fef2f2] text-[#ef4444]', Icon: XCircle },
  failed: { label: 'Échec', className: 'bg-[#fef2f2] text-[#ef4444]', Icon: XCircle },
  target_deleted: { label: 'Cible supprimée', className: 'bg-[#f4f4f5] text-[#71717b]', Icon: XCircle },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: 'bg-[#f4f4f5] text-[#71717b]', Icon: Clock3 }
}

export default function ProfessorChangesPage() {
  const [requests, setRequests] = useState<ProfessorChangeSummary[]>([])
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    listProfessorChangeRequests(status)
      .then(setRequests)
      .catch(() => toast.error('Impossible de charger les demandes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    listProfessorChangeRequests(status)
      .then((items) => { if (alive) setRequests(items) })
      .catch(() => toast.error('Impossible de charger les demandes.'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [status])

  async function withdraw(id: number) {
    if (!window.confirm('Annuler définitivement cette demande ?')) return
    try {
      await withdrawStudioChange(id)
      toast.success('Demande annulée.')
      reload()
    } catch {
      toast.error('Échec de l’annulation.')
    }
  }

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#5b60f9] text-white">
            <ClipboardList size={20} />
          </div>
          <div className="mr-auto">
            <h1 className="m-0 text-[20px] font-black leading-tight text-[#3f3f46]">Mes demandes de modification</h1>
            <p className="m-0 text-[13px] font-semibold text-[#a1a1aa]">
              Vos modifications du studio restent en attente jusqu’à validation par un administrateur.
            </p>
          </div>
          <Link
            href="/professor/studio"
            className="inline-flex items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 py-2.5 text-[14px] font-black text-white no-underline transition hover:bg-[#4a4fe0]"
          >
            <Layers size={16} /> Ouvrir le studio
          </Link>
        </header>

        <div className="mb-5 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-[10px] px-3 py-1.5 text-[13px] font-black transition ${
                status === f.value ? 'bg-[#5b60f9] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#5b60f9]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-6 text-[14px] font-bold text-[#71717b]">Chargement…</div>
        ) : requests.length === 0 ? (
          <div className="grid place-items-center rounded-[16px] border-[2px] border-dashed border-[#e4e4e7] bg-white p-12 text-center">
            <ClipboardList size={32} className="text-[#d4d4d8]" />
            <h2 className="m-0 mt-3 text-[18px] font-black text-[#3f3f46]">Aucune demande</h2>
            <p className="m-0 mt-1 text-[14px] font-semibold text-[#a1a1aa]">Vos modifications soumises depuis le studio apparaîtront ici.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => {
              const meta = statusMeta(request.status)
              return (
                <article key={request.id} className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-black text-[#3f3f46]">Demande #{request.id}</span>
                    <span className="text-[13px] font-bold text-[#a1a1aa]">· {request.offering_title}</span>
                    <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${meta.className}`}>
                      <meta.Icon size={12} /> {meta.label}
                    </span>
                  </div>

                  {request.summary && (
                    <p className="mt-2 text-[14px] font-semibold text-[#52525c]">{request.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-black">
                    <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[#71717b]">{request.operation_count} opération(s)</span>
                    {request.pending_count > 0 && <span className="rounded-full bg-[#fff7ed] px-2.5 py-1 text-[#f5900b]">{request.pending_count} en attente</span>}
                    {request.applied_count > 0 && <span className="rounded-full bg-[#f0fdf4] px-2.5 py-1 text-[#16a34a]">{request.applied_count} appliquée(s)</span>}
                    {request.rejected_count > 0 && <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-[#ef4444]">{request.rejected_count} rejetée(s)</span>}
                    <span className="text-[#a1a1aa]">{formatDate(request.created_at)}</span>
                  </div>

                  {request.admin_note && (
                    <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-2.5">
                      <MessageSquare size={15} className="mt-0.5 shrink-0 text-[#5b60f9]" />
                      <p className="m-0 text-[13px] font-semibold text-[#52525c]"><span className="font-black text-[#3f3f46]">Note du staff : </span>{request.admin_note}</p>
                    </div>
                  )}

                  {request.status === 'pending' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/professor/studio?request=${request.id}`}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border-[2px] border-[#e4e4e7] px-3 py-1.5 text-[13px] font-black text-[#52525c] no-underline transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
                      >
                        <Pencil size={14} /> Modifier dans le studio
                      </Link>
                      <button
                        type="button"
                        onClick={() => withdraw(request.id)}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border-[2px] border-[#fecaca] px-3 py-1.5 text-[13px] font-black text-[#ef4444] transition hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Annuler
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>
    </ProfessorShell>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
