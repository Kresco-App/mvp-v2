'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, X, Loader2, ClipboardList, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAdminChangeRequest,
  listAdminChangeRequests,
  reviewAdminChangeRequest,
  type AdminChangeRequestListItem,
  type ChangeOperation,
  type ChangeRequestDetail,
} from '@/lib/studio'

const STATUS_TABS = [
  { value: 'pending', label: 'En attente' },
  { value: 'partially_applied', label: 'Partiel' },
  { value: 'applied', label: 'Appliqué' },
  { value: 'rejected', label: 'Rejeté' },
]

const ENTITY_LABELS: Record<string, string> = { chapter: 'Chapitre', lesson: 'Leçon', tab: 'Onglet' }
const OP_LABELS: Record<string, string> = {
  create: 'Créer', update_fields: 'Modifier', update_content: 'Contenu', delete: 'Supprimer', reorder: 'Réordonner',
}
const OP_COLORS: Record<string, string> = {
  create: 'bg-[#f0fdf4] text-[#16a34a]',
  update_fields: 'bg-[#f0f0ff] text-[#5b60f9]',
  update_content: 'bg-[#f0f0ff] text-[#5b60f9]',
  delete: 'bg-[#fef2f2] text-[#ef4444]',
  reorder: 'bg-[#fff7ed] text-[#f5900b]',
}
const STATUS_BADGE: Record<string, string> = {
  applied: 'bg-[#f0fdf4] text-[#16a34a]',
  rejected: 'bg-[#fef2f2] text-[#ef4444]',
  failed: 'bg-[#fef2f2] text-[#ef4444]',
  pending: 'bg-[#f4f4f5] text-[#71717b]',
  partially_applied: 'bg-[#fff7ed] text-[#f5900b]',
}

function fmt(value: unknown): string {
  if (value === '' || value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

function OperationCard({
  op,
  decision,
  onDecide,
}: {
  op: ChangeOperation
  decision?: 'approve' | 'reject'
  onDecide: (d: 'approve' | 'reject') => void
}) {
  const keys = Object.keys(op.payload_json || {}).filter((k) => k !== 'order' || op.op_type === 'reorder')
  const isPending = op.status === 'pending'

  return (
    <div className={`rounded-[12px] border-[2px] px-3.5 py-3 transition ${
      isPending && decision === 'reject' ? 'border-[#fecaca] bg-[#fff7f7]' :
      isPending && decision === 'approve' ? 'border-[#bbf7d0] bg-[#f6fef9]' : 'border-[#e4e4e7] bg-white'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${OP_COLORS[op.op_type] ?? OP_COLORS.update_fields}`}>
          {OP_LABELS[op.op_type] ?? op.op_type}
        </span>
        <span className="text-[13px] font-black text-[#3f3f46]">{ENTITY_LABELS[op.entity_type] ?? op.entity_type}</span>
        {!isPending && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_BADGE[op.status] ?? 'bg-[#f4f4f5] text-[#71717b]'}`}>
            {op.status}
          </span>
        )}
      </div>

      {/* Before -> after diff */}
      {keys.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {keys.map((key) => (
            <div key={key} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-24 shrink-0 font-bold text-[#a1a1aa]">{key}</span>
              <span className="truncate font-semibold text-[#ef4444] line-through decoration-[#fca5a5]">{fmt(op.snapshot_json?.[key])}</span>
              <ArrowRight size={12} className="shrink-0 text-[#a1a1aa]" />
              <span className="truncate font-bold text-[#16a34a]">{fmt(op.payload_json?.[key])}</span>
            </div>
          ))}
        </div>
      )}
      {op.op_type === 'delete' && (
        <p className="mt-1.5 text-[12.5px] font-semibold text-[#ef4444]">
          Supprime « {fmt(op.snapshot_json?.title ?? op.snapshot_json?.label)} »
        </p>
      )}
      {op.error_detail && (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] font-bold text-[#ef4444]">
          <AlertTriangle size={12} /> {op.error_detail}
        </p>
      )}

      {isPending && (
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => onDecide('approve')}
            className={`inline-flex items-center gap-1 rounded-[9px] border-[2px] px-2.5 py-1 text-[12px] font-black transition ${
              decision === 'approve' ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-[#e4e4e7] text-[#52525c] hover:border-[#16a34a]'
            }`}
          >
            <Check size={13} /> Approuver
          </button>
          <button
            type="button"
            onClick={() => onDecide('reject')}
            className={`inline-flex items-center gap-1 rounded-[9px] border-[2px] px-2.5 py-1 text-[12px] font-black transition ${
              decision === 'reject' ? 'border-[#ef4444] bg-[#ef4444] text-white' : 'border-[#e4e4e7] text-[#52525c] hover:border-[#ef4444]'
            }`}
          >
            <X size={13} /> Rejeter
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChangeReviewBoard() {
  const [status, setStatus] = useState('pending')
  const [list, setList] = useState<AdminChangeRequestListItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ChangeRequestDetail | null>(null)
  const [decisions, setDecisions] = useState<Record<number, 'approve' | 'reject'>>({})
  const [adminNote, setAdminNote] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [applying, setApplying] = useState(false)

  const refreshList = useCallback(() => {
    setLoadingList(true)
    listAdminChangeRequests(status)
      .then((items) => {
        setList(items)
        setSelectedId((current) => current ?? items[0]?.id ?? null)
      })
      .catch(() => toast.error('Impossible de charger les demandes.'))
      .finally(() => setLoadingList(false))
  }, [status])

  useEffect(() => { refreshList() }, [refreshList])

  useEffect(() => {
    if (selectedId == null) { setDetail(null); return }
    getAdminChangeRequest(selectedId)
      .then((d) => {
        setDetail(d)
        const init: Record<number, 'approve' | 'reject'> = {}
        d.operations.forEach((op) => { if (op.status === 'pending') init[op.id] = 'approve' })
        setDecisions(init)
        setAdminNote('')
      })
      .catch(() => toast.error('Impossible de charger le détail.'))
  }, [selectedId])

  async function apply() {
    if (!detail) return
    const pendingOps = detail.operations.filter((op) => op.status === 'pending')
    const payload = pendingOps.map((op) => ({ operation_id: op.id, decision: decisions[op.id] ?? 'approve' }))
    if (payload.length === 0) { toast.error('Aucune opération en attente.'); return }
    setApplying(true)
    try {
      const updated = await reviewAdminChangeRequest(detail.id, payload, adminNote)
      setDetail(updated)
      toast.success('Décisions appliquées.')
      refreshList()
    } catch {
      toast.error('Échec de l’application des décisions.')
    } finally {
      setApplying(false)
    }
  }

  const pendingCount = detail?.operations.filter((o) => o.status === 'pending').length ?? 0
  const approveCount = detail?.operations.filter((o) => o.status === 'pending' && (decisions[o.id] ?? 'approve') === 'approve').length ?? 0

  return (
    <div className="mx-auto w-full max-w-[var(--figma-shell-width)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#5b60f9] text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-[20px] font-black text-[#3f3f46]">Révision des modifications</h1>
          <p className="text-[13px] font-semibold text-[#a1a1aa]">Approuvez ou rejetez les opérations proposées par les professeurs.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setStatus(tab.value); setSelectedId(null) }}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] font-black transition ${
              status === tab.value ? 'bg-[#5b60f9] text-white' : 'border-[2px] border-[#e4e4e7] text-[#52525c] hover:border-[#5b60f9]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* List */}
        <div className="flex flex-col gap-2">
          {loadingList ? (
            <div className="grid h-40 place-items-center text-[#a1a1aa]"><Loader2 className="animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="rounded-[14px] border-[2px] border-dashed border-[#e4e4e7] p-6 text-center">
              <ClipboardList size={24} className="mx-auto text-[#d4d4d8]" />
              <p className="mt-2 text-[13px] font-bold text-[#a1a1aa]">Aucune demande.</p>
            </div>
          ) : (
            list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`rounded-[14px] border-[2px] bg-white px-4 py-3 text-left transition ${
                  selectedId === item.id ? 'border-[#5b60f9]' : 'border-[#e4e4e7] hover:border-[#c7c7cc]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-black text-[#3f3f46]">#{item.id} · {item.offering_title}</span>
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#5b60f9] px-2 text-[11px] font-black text-white">
                    {item.pending_count || item.operation_count}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] font-semibold text-[#71717b]">{item.professor_name || item.professor_email}</p>
                {item.summary && <p className="mt-1 line-clamp-2 text-[12.5px] font-medium text-[#a1a1aa]">{item.summary}</p>}
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white">
          {!detail ? (
            <div className="grid h-full min-h-[300px] place-items-center text-[#a1a1aa]">Sélectionnez une demande.</div>
          ) : (
            <div className="flex flex-col">
              <div className="border-b border-[#f4f4f5] px-5 py-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-black text-[#3f3f46]">Demande #{detail.id}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_BADGE[detail.status] ?? 'bg-[#f4f4f5] text-[#71717b]'}`}>
                    {detail.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] font-semibold text-[#71717b]">
                  {detail.professor_name || detail.professor_email} · {detail.offering_title}
                </p>
                {detail.summary && <p className="mt-1.5 text-[13px] font-medium text-[#52525c]">{detail.summary}</p>}
              </div>

              <div className="flex flex-col gap-2 px-5 py-4">
                {detail.operations.map((op) => (
                  <OperationCard
                    key={op.id}
                    op={op}
                    decision={decisions[op.id]}
                    onDecide={(d) => setDecisions((prev) => ({ ...prev, [op.id]: d }))}
                  />
                ))}
              </div>

              {pendingCount > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t border-[#f4f4f5] px-5 py-4">
                  <input
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Note (optionnelle)…"
                    className="min-w-0 flex-1 rounded-[12px] border-[2px] border-[#e4e4e7] px-3 py-2.5 text-[13px] font-semibold text-[#3f3f46] outline-none focus:border-[#5b60f9]"
                  />
                  <button
                    type="button"
                    onClick={apply}
                    disabled={applying}
                    className="inline-flex items-center gap-2 rounded-[12px] bg-[#5b60f9] px-5 py-2.5 text-[14px] font-black text-white transition hover:bg-[#4a4fe0] disabled:bg-[#d4d4d8]"
                  >
                    {applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Appliquer ({approveCount}/{pendingCount})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
