'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Clock3,
  FileDiff,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import {
  getAdminChangeRequest,
  listAdminChangeRequests,
  reviewAdminChangeRequest,
  type AdminChangeRequestListItem,
  type ChangeOperation,
  type ChangeRequestDetail,
} from '@/lib/studio'
import {
  AdminPageHeader,
  AdminRefreshButton,
  AdminTableActionButton,
  adminMetricStripThreeClass,
  adminMetricTileClass,
  adminMotionSafeClass,
  adminPageClass,
  adminPanelClass,
  adminPanelHeaderClass,
  adminPrimaryButtonClass,
  adminSpinnerClass,
} from './AdminDesign'

const STATUS_TABS = [
  { value: 'pending', label: 'En attente' },
  { value: 'partially_applied', label: 'Partiel' },
  { value: 'applied', label: 'Appliqué' },
  { value: 'rejected', label: 'Rejeté' },
] as const

const ENTITY_LABELS: Record<string, string> = { chapter: 'Chapitre', lesson: 'Leçon', tab: 'Onglet' }
const OP_LABELS: Record<string, string> = {
  create: 'Créer',
  update_fields: 'Modifier',
  update_content: 'Contenu',
  delete: 'Supprimer',
  reorder: 'Réordonner',
}
const OP_COLORS: Record<string, string> = {
  create: 'bg-[#f0fdf4] text-[#16a34a]',
  update_fields: 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]',
  update_content: 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]',
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
const STATUS_LABELS: Record<string, string> = {
  applied: 'Appliqué',
  failed: 'Échec',
  partially_applied: 'Partiel',
  pending: 'En attente',
  rejected: 'Rejeté',
}

const CHANGE_REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status
}

function fmt(value: unknown): string {
  if (value === '' || value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

function formatDate(value?: string | null): string {
  if (!value) return 'Non revu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date inconnue'
  return CHANGE_REVIEW_DATE_FORMATTER.format(date)
}

function QueueMetric({
  label,
  value,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className={adminMetricTileClass}>
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className="m-0 mt-1 text-[22px] font-black leading-none text-[#3f3f46]">{value}</p>
    </div>
  )
}

function DetailMetric({
  label,
  value,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[10.5px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className="m-0 mt-1 text-[19px] font-black leading-none text-[#3f3f46]">{value}</p>
    </div>
  )
}

function InlineState({
  title,
  action,
}: {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="rounded-[14px] border-[2px] border-dashed border-[#e4e4e7] bg-white p-6 text-center">
      <ClipboardList size={24} className="mx-auto text-[#d4d4d8]" />
      <p className="m-0 mt-2 text-[14px] font-black text-[#52525c]">{title}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-[10px] border-[2px] border-[#e4e4e7] px-3 py-1.5 text-[12px] font-black text-[#52525c] transition-[border-color,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] ${adminMotionSafeClass}`}
        >
          <RefreshCcw size={13} aria-hidden="true" />
          {action.label}
        </button>
      )}
    </div>
  )
}

function OperationCard({
  op,
  decision,
  disabled,
  onDecide,
}: {
  op: ChangeOperation
  decision?: 'approve' | 'reject'
  disabled: boolean
  onDecide: (d: 'approve' | 'reject') => void
}) {
  const keys = Object.keys(op.payload_json || {}).filter((key) => key !== 'order' || op.op_type === 'reorder')
  const isPending = op.status === 'pending'

  return (
    <div className={`rounded-[12px] border-[2px] px-3.5 py-3 transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none ${
      isPending && decision === 'reject'
        ? 'border-[#fecaca] bg-[#fff7f7]'
        : isPending && decision === 'approve'
          ? 'border-[#bbf7d0] bg-[#f6fef9]'
          : 'border-[#e4e4e7] bg-white'
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${OP_COLORS[op.op_type] ?? OP_COLORS.update_fields}`}>
          {OP_LABELS[op.op_type] ?? op.op_type}
        </span>
        <span className="min-w-0 text-[13px] font-black text-[#3f3f46]">{ENTITY_LABELS[op.entity_type] ?? op.entity_type}</span>
        <span className="text-[12px] font-bold text-[#a1a1aa]">#{op.target_id ?? op.client_ref ?? op.id}</span>
        {!isPending && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_BADGE[op.status] ?? 'bg-[#f4f4f5] text-[#71717b]'}`}>
            {statusLabel(op.status)}
          </span>
        )}
      </div>

      {keys.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {keys.map((key) => (
            <div key={key} className="grid grid-cols-[6rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[12.5px]">
              <span className="truncate font-bold text-[#a1a1aa]">{key}</span>
              <span className="truncate font-semibold text-[#ef4444] line-through decoration-[#fca5a5]">{fmt(op.snapshot_json?.[key])}</span>
              <ArrowRight size={12} className="shrink-0 text-[#a1a1aa]" />
              <span className="truncate font-bold text-[#16a34a]">{fmt(op.payload_json?.[key])}</span>
            </div>
          ))}
        </div>
      )}
      {op.op_type === 'delete' && (
        <p className="m-0 mt-1.5 text-[12.5px] font-semibold text-[#ef4444]">
          Supprime « {fmt(op.snapshot_json?.title ?? op.snapshot_json?.label)} »
        </p>
      )}
      {op.error_detail && (
        <p className="m-0 mt-1.5 flex items-center gap-1 text-[12px] font-bold text-[#ef4444]">
          <AlertTriangle size={12} /> {op.error_detail}
        </p>
      )}

      {isPending && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <AdminTableActionButton
            onClick={() => onDecide('approve')}
            disabled={disabled}
            tone="success"
            className={`h-8 px-3 ${
              decision === 'approve'
                ? 'border-[#16a34a] bg-white text-[#059669] hover:bg-[#ecfdf5]'
                : ''
            }`}
          >
            <Check size={13} /> Approuver
          </AdminTableActionButton>
          <AdminTableActionButton
            onClick={() => onDecide('reject')}
            disabled={disabled}
            tone="danger"
            className={`h-8 px-3 ${
              decision === 'reject'
                ? 'border-[#ef4444] bg-white text-[#dc2626] hover:bg-[#fef2f2]'
                : ''
            }`}
          >
            <X size={13} /> Rejeter
          </AdminTableActionButton>
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
  const [listError, setListError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const [applying, setApplying] = useState(false)

  const refreshList = useCallback(async () => {
    setLoadingList(true)
    setListError('')
    try {
      const items = await listAdminChangeRequests(status)
      setList(items)
      setSelectedId((current) => {
        if (current != null && items.some((item) => item.id === current)) return current
        return items[0]?.id ?? null
      })
      if (items.length === 0) setDetail(null)
    } catch {
      setList([])
      setSelectedId(null)
      setDetail(null)
      setListError('Impossible de charger les demandes.')
      showToastError('Impossible de charger les demandes.')
    } finally {
      setLoadingList(false)
    }
  }, [status])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    let alive = true
    if (selectedId == null) {
      setDetail(null)
      setDetailError('')
      setDetailLoading(false)
      setDecisions({})
      setAdminNote('')
      return () => { alive = false }
    }

    setDetail(null)
    setDetailLoading(true)
    setDetailError('')
    getAdminChangeRequest(selectedId)
      .then((data) => {
        if (!alive) return
        setDetail(data)
        const init: Record<number, 'approve' | 'reject'> = {}
        data.operations.forEach((op) => {
          if (op.status === 'pending') init[op.id] = 'approve'
        })
        setDecisions(init)
        setAdminNote(data.admin_note || '')
      })
      .catch(() => {
        if (!alive) return
        setDetail(null)
        setDetailError('Impossible de charger le détail de cette demande.')
        showToastError('Impossible de charger le détail.')
      })
      .finally(() => {
        if (alive) setDetailLoading(false)
      })

    return () => { alive = false }
  }, [selectedId, detailRefreshKey])

  async function apply() {
    if (!detail || applying) return
    const pendingOps = detail.operations.filter((op) => op.status === 'pending')
    const payload = pendingOps.map((op) => ({ operation_id: op.id, decision: decisions[op.id] ?? 'approve' }))
    if (payload.length === 0) {
      showToastError('Aucune opération en attente.')
      return
    }
    setApplying(true)
    try {
      const updated = await reviewAdminChangeRequest(detail.id, payload, adminNote)
      setDetail(updated)
      showToastSuccess('Décisions appliquées.')
      await refreshList()
    } catch {
      showToastError('Échec de l’application des décisions.')
    } finally {
      setApplying(false)
    }
  }

  const queueStats = useMemo(() => {
    const operations = list.reduce((sum, item) => sum + item.operation_count, 0)
    const pending = list.reduce((sum, item) => sum + item.pending_count, 0)
    return { operations, pending }
  }, [list])

  const selectedStats = useMemo(() => {
    const operations = detail?.operations ?? []
    const pending = operations.filter((op) => op.status === 'pending').length
    const approve = operations.filter((op) => op.status === 'pending' && (decisions[op.id] ?? 'approve') === 'approve').length
    const destructive = operations.filter((op) => op.op_type === 'delete').length
    const failed = operations.filter((op) => op.status === 'failed').length
    return {
      approve,
      destructive,
      failed,
      pending,
      reject: Math.max(pending - approve, 0),
      total: operations.length,
    }
  }, [decisions, detail])

  const activeStatusLabel = statusLabel(status)

  return (
    <div className={adminPageClass}>
      <AdminPageHeader
        icon={ShieldCheck}
        title="Révision des modifications"
        action={<AdminRefreshButton loading={loadingList} onClick={() => void refreshList()} label="Actualiser" />}
      />

      <div className={adminMetricStripThreeClass}>
        <QueueMetric label="Demandes" value={loadingList ? '—' : list.length} hint={activeStatusLabel} />
        <QueueMetric label="Opérations" value={loadingList ? '—' : queueStats.operations} hint="dans le filtre actif" />
        <QueueMetric label="À traiter" value={loadingList ? '—' : queueStats.pending} hint="opérations en attente" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value)
              setSelectedId(null)
              setDetail(null)
            }}
            aria-pressed={status === tab.value}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] font-black transition-[background-color,border-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] ${adminMotionSafeClass} ${
              status === tab.value
                ? 'bg-[color:var(--primary)] text-white'
                : 'border-[2px] border-[#e4e4e7] text-[#52525c] hover:border-[color:var(--primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className={adminPanelClass}>
          <div className={adminPanelHeaderClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-black text-[#3f3f46]">File de révision</p>
              </div>
              <FileDiff size={17} className="text-[color:var(--primary)]" />
            </div>
          </div>
          <div className="flex max-h-[680px] flex-col gap-2 overflow-y-auto p-3">
            {loadingList ? (
              <div className="grid h-40 place-items-center text-[#a1a1aa]">
                <Loader2 className={adminSpinnerClass} />
              </div>
            ) : listError ? (
              <InlineState
                title="Demandes indisponibles"
                detail={listError}
                action={{ label: 'Réessayer', onClick: () => void refreshList() }}
              />
            ) : list.length === 0 ? (
              <InlineState title="Aucune demande" detail={`Aucune demande ${activeStatusLabel.toLowerCase()} pour le moment.`} />
            ) : (
              list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-[14px] border-[2px] bg-white px-4 py-3 text-left transition-[border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    selectedId === item.id ? 'border-[color:var(--primary)] shadow-[0_10px_28px_rgba(69,61,238,0.12)]' : 'border-[#e4e4e7] hover:border-[#c7c7cc]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-[14px] font-black text-[#3f3f46]">#{item.id} · {item.offering_title}</span>
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[color:var(--primary)] px-2 text-[11px] font-black text-white">
                      {item.pending_count || item.operation_count}
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 truncate text-[12.5px] font-semibold text-[#71717b]">{item.professor_name || item.professor_email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
                    <span>{item.operation_count} ops</span>
                    <span>·</span>
                    <span>{item.pending_count} en attente</span>
                    <span>·</span>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={adminPanelClass}>
          {detailLoading ? (
            <div className="grid h-full min-h-[360px] place-items-center text-[#a1a1aa]">
              <div className="flex items-center gap-2 text-[13px] font-black">
                <Loader2 size={18} className={adminSpinnerClass} />
                Chargement de la demande
              </div>
            </div>
          ) : detailError ? (
            <div className="grid h-full min-h-[360px] place-items-center p-5">
              <InlineState
                title="Détail indisponible"
                detail={detailError}
                action={{ label: 'Réessayer', onClick: () => setDetailRefreshKey((value) => value + 1) }}
              />
            </div>
          ) : !detail ? (
            <div className="grid h-full min-h-[360px] place-items-center p-5">
              <InlineState title="Sélectionnez une demande" detail="Choisissez une ligne de la file pour examiner les opérations." />
            </div>
          ) : (
            <div className="flex flex-col">
              <div className={`${adminPanelHeaderClass} lg:flex-col`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Demande #{detail.id}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_BADGE[detail.status] ?? 'bg-[#f4f4f5] text-[#71717b]'}`}>
                    {statusLabel(detail.status)}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#71717b]">
                  {detail.professor_name || detail.professor_email} · {detail.offering_title}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
                  <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {formatDate(detail.created_at)}</span>
                  {detail.reviewed_at && <span>Revu {formatDate(detail.reviewed_at)}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-[#f4f4f5] bg-[#fbfbfc] px-5 py-3 sm:grid-cols-4">
                <DetailMetric label="Total" value={selectedStats.total} hint="opérations" />
                <DetailMetric label="À traiter" value={selectedStats.pending} hint="opérations" />
                <DetailMetric label="Rejets" value={selectedStats.reject} hint="sélectionnés" />
                <DetailMetric label="Risque" value={selectedStats.destructive + selectedStats.failed} hint="delete/échec" />
              </div>

              <div className="flex flex-col gap-2 px-5 py-4">
                {detail.operations.length === 0 ? (
                  <InlineState title="Aucune opération" detail="Cette demande ne contient aucune opération à revoir." />
                ) : (
                  detail.operations.map((op) => (
                    <OperationCard
                      key={op.id}
                      op={op}
                      decision={decisions[op.id]}
                      disabled={applying}
                      onDecide={(decision) => setDecisions((prev) => ({ ...prev, [op.id]: decision }))}
                    />
                  ))
                )}
              </div>

              {selectedStats.pending > 0 && (
                <div className="flex flex-col gap-3 border-t border-[#f4f4f5] px-5 py-4 lg:flex-row lg:items-center">
                  <textarea
                    value={adminNote}
                    onChange={(event) => setAdminNote(event.target.value)}
                    placeholder="Note de revue (optionnelle)…"
                    rows={2}
                    className="min-h-[48px] min-w-0 flex-1 resize-none rounded-[12px] border-[2px] border-[#e4e4e7] px-3 py-2.5 text-[13px] font-semibold text-[#3f3f46] outline-none focus:border-[color:var(--primary)]"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="text-[12px] font-bold text-[#a1a1aa]">
                      {selectedStats.approve} approuver · {selectedStats.reject} rejeter
                    </span>
                    <button
                      type="button"
                      onClick={apply}
                      disabled={applying}
                      className={`${adminPrimaryButtonClass} h-11 px-5 text-[14px]`}
                    >
                      {applying ? <Loader2 size={16} className={adminSpinnerClass} /> : <Check size={16} aria-hidden="true" />}
                      Appliquer ({selectedStats.approve}/{selectedStats.pending})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
