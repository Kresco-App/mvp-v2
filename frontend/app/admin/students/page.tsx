'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  BadgePlus,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  AdminTable,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminTableCellClass,
  adminTableHeadCellClass,
  adminTableHeadClass,
  adminTableHeadRowClass,
  adminTableRowClass,
} from '@/components/admin/AdminDesign'
import { getJson, postJson } from '@/lib/apiClient'
import { formatNumber, numberValue, percent } from '@/lib/adminOverview'
import {
  EMPTY_STUDENT_PROGRESS,
  EMPTY_XP_AUDIT,
  buildXpAdjustmentIdempotencyKey,
  quizPassRate,
  studentProgressCoverage,
  type AdminStudentProgress,
  type AdminStudentProgressRow,
  type AdminXpAdjustment,
  type AdminXpAudit,
} from '@/lib/adminStudentProgress'

const card = adminPanelClass

export default function AdminStudentsPage() {
  const [data, setData] = useState<AdminStudentProgress>(EMPTY_STUDENT_PROGRESS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [requestedStudentId, setRequestedStudentId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [xpAudit, setXpAudit] = useState<AdminXpAudit>(EMPTY_XP_AUDIT)
  const [xpLoading, setXpLoading] = useState(false)
  const [xpError, setXpError] = useState('')
  const [xpNonce, setXpNonce] = useState(0)
  const [xpAmount, setXpAmount] = useState('50')
  const [xpReason, setXpReason] = useState('Admin XP adjustment')
  const [xpBusy, setXpBusy] = useState(false)
  const [xpMessage, setXpMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const incomingQuery = params.get('q')?.trim() ?? ''
    const incomingStudentId = params.get('student_id')?.trim() ?? ''
    if (incomingQuery) setQuery(incomingQuery)
    if (incomingStudentId) setRequestedStudentId(incomingStudentId)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminStudentProgress>('/admin/student-progress?limit=100')
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_STUDENT_PROGRESS)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_STUDENT_PROGRESS)
        setError('Could not load student progress.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  useEffect(() => {
    if (!data.students.length) {
      if (selectedUserId) setSelectedUserId('')
      return
    }
    if (!data.students.some((student) => String(student.user_id) === selectedUserId)) {
      const requestedStudent = requestedStudentId
        ? data.students.find((student) => String(student.user_id) === requestedStudentId)
        : null
      setSelectedUserId(String(requestedStudent?.user_id ?? data.students[0].user_id))
    }
  }, [data.students, requestedStudentId, selectedUserId])

  useEffect(() => {
    if (!selectedUserId) {
      setXpAudit(EMPTY_XP_AUDIT)
      setXpError('')
      setXpLoading(false)
      return
    }

    let alive = true
    setXpLoading(true)
    setXpError('')
    getJson<AdminXpAudit>(`/admin/xp-audit?user_id=${selectedUserId}&limit=8`)
      .then((response) => {
        if (!alive) return
        setXpAudit(response ?? EMPTY_XP_AUDIT)
      })
      .catch(() => {
        if (!alive) return
        setXpAudit(EMPTY_XP_AUDIT)
        setXpError('Could not load XP check for this student.')
      })
      .finally(() => {
        if (alive) setXpLoading(false)
      })
    return () => { alive = false }
  }, [selectedUserId, xpNonce])

  const filteredStudents = useMemo(() => data.students.filter((student) => {
    const text = `${student.full_name} ${student.email} ${student.niveau} ${student.filiere} ${student.tier}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }), [data.students, query])
  const selectedStudent = data.students.find((student) => String(student.user_id) === selectedUserId) ?? null
  const summary = data.summary
  const learningRisk = useMemo(() => buildLearningRisk(data.students), [data.students])
  const attentionStudents = useMemo(() => buildAttentionStudents(data.students), [data.students])

  async function submitXpAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStudent) return
    const amount = Number(xpAmount)
    const reason = xpReason.trim()
    if (!Number.isInteger(amount) || amount === 0) {
      setXpError('XP amount must be a non-zero whole number.')
      return
    }
    if (reason.length < 3) {
      setXpError('An adjustment reason is required.')
      return
    }

    setXpBusy(true)
    setXpError('')
    setXpMessage('')
    try {
      const adjustment = await postJson<AdminXpAdjustment>(
        '/admin/xp-adjustments',
        {
          user_id: selectedStudent.user_id,
          amount,
          reason,
          idempotency_key: buildXpAdjustmentIdempotencyKey(selectedStudent.user_id),
        },
      )
      setData((current) => applyXpAdjustment(current, adjustment))
      setXpMessage(`XP updated to ${formatNumber(adjustment.total_xp)}.`)
      setXpNonce((value) => value + 1)
    } catch {
      setXpError('Could not apply XP adjustment. Check xp:adjust access and the target total.')
    } finally {
      setXpBusy(false)
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Users}
        title="Student health"
        syncLabel={data.generated_at ? `Last sync: ${new Date(data.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} label="Refresh" onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <StatTile icon={Users} label="Students" value={formatNumber(summary.total_students)} loading={loading} />
        <StatTile icon={BookOpenCheck} label="Coverage" value={percent(studentProgressCoverage(summary))} loading={loading} />
        <StatTile icon={Trophy} label="XP total" value={formatNumber(summary.total_xp)} loading={loading} />
        <StatTile icon={Activity} label="Quiz pass" value={percent(quizPassRate(summary))} loading={loading} />
      </section>

      <section className={`${card} mb-5 overflow-hidden`}>
        <div className="grid xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="border-b border-[#f4f4f5] p-5 xl:border-b-0 xl:border-r">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Learning health</h2>
              <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-black text-[#f5900b] tabular-nums">
                {formatNumber(learningRisk.total)} to review
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <HealthSignal icon={Clock} label="No activity" value={learningRisk.noActivity} detail="No recent learning session." />
              <HealthSignal icon={BookOpenCheck} label="No progress" value={learningRisk.noProgress} detail="No progress rows yet." />
              <HealthSignal icon={Activity} label="No quiz" value={learningRisk.noQuizAttempts} detail="No quiz attempts." />
              <HealthSignal icon={Trophy} label="Zero XP" value={learningRisk.zeroXp} detail="No XP earned yet." />
            </div>
          </div>

          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Attention queue</h2>
              <span className="rounded-full bg-[#f4f4f5] px-3 py-1 text-[12px] font-black text-[#71717a] tabular-nums">
                {formatNumber(attentionStudents.length)} shown
              </span>
            </div>
            <AttentionStudentList students={attentionStudents} />
          </div>
        </div>

        <div className="grid border-t border-[#f4f4f5] md:grid-cols-3">
          <MiniMetric label="Watch minutes" value={formatNumber(summary.total_watch_minutes)} />
          <MiniMetric label="Quiz passed" value={formatNumber(summary.quiz_passed)} />
          <MiniMetric label="Inactive 7d" value={formatNumber(Math.max(summary.total_students - summary.active_students_7d, 0))} tone="warn" />
        </div>
      </section>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
              <BadgePlus size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">XP adjustments</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setXpNonce((value) => value + 1)}
            disabled={!selectedStudent || xpLoading}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-[11px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition-[border-color,color,opacity,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {xpLoading ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : <RotateCcw size={14} />}
            Refresh XP check
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={submitXpAdjustment} className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Student</span>
              <select
                value={selectedUserId}
                onChange={(event) => {
                  setSelectedUserId(event.target.value)
                  setXpMessage('')
                }}
                disabled={!data.students.length || loading}
                aria-label="Select student for XP adjustment"
                className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[background-color,border-color,color] duration-150 ease-out focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
              >
                {data.students.map((student) => (
                  <option key={student.user_id} value={String(student.user_id)}>
                    {student.full_name || student.email} - {formatNumber(student.total_xp)} XP
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Amount</span>
                <input
                  value={xpAmount}
                  onChange={(event) => setXpAmount(event.target.value)}
                  type="number"
                  step="1"
                  min="-10000"
                  max="10000"
                  aria-label="XP adjustment amount"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[border-color] duration-150 ease-out focus:border-[color:var(--primary)]"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Reason</span>
                <input
                  value={xpReason}
                  onChange={(event) => setXpReason(event.target.value)}
                  aria-label="XP adjustment reason"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[border-color] duration-150 ease-out placeholder:text-[#c0c0c7] focus:border-[color:var(--primary)]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!selectedStudent || xpBusy}
                className={adminPrimaryButtonClass}
              >
                {xpBusy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <BadgePlus size={15} />}
                Apply adjustment
              </button>
              {xpMessage && <span className="text-[12px] font-bold text-[#16a34a]">{xpMessage}</span>}
              {xpError && <span className="text-[12px] font-bold text-[#b45309]">{xpError}</span>}
            </div>
          </form>

          <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 truncate text-[14px] font-black text-[#3f3f46]">
                  {selectedStudent ? selectedStudent.full_name || selectedStudent.email : 'No student selected'}
                </h3>
                <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">
                  {selectedStudent ? `${formatNumber(selectedStudent.total_xp)} XP in progress table` : 'Select a student to inspect XP.'}
                </p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${xpAudit.has_total_mismatch ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
                {xpAudit.has_total_mismatch ? 'Mismatch' : 'Balanced'}
              </span>
            </div>

            {xpLoading ? (
              <div className="grid gap-2">
                {[1, 2, 3].map((item) => <div key={item} className="h-12 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[10px] bg-[#f4f4f5]" />)}
              </div>
            ) : (
              <>
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <AuditMetric label="Profile XP" value={formatNumber(xpAudit.stored_total_xp)} />
                  <AuditMetric label="Earned XP" value={formatNumber(xpAudit.transaction_sum_xp)} />
                  <AuditMetric label="Difference" value={formatNumber(xpAudit.delta_xp)} tone={xpAudit.has_total_mismatch ? 'warn' : 'default'} />
                  <AuditMetric label="Manual edits" value={formatNumber(xpAudit.adjustment_count)} />
                </div>
                <div className="grid gap-2">
                  {xpAudit.transactions.length ? xpAudit.transactions.slice(0, 4).map((transaction) => (
                    <div key={transaction.transaction_id} className="grid gap-2 rounded-[10px] border border-[#ececf0] bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[12px] font-black text-[#3f3f46]">{transaction.description || transaction.reason}</p>
                        <p className="m-0 mt-0.5 truncate text-[12px] font-semibold text-[#a1a1aa]">{transaction.reason}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className={`m-0 text-[13px] font-black ${transaction.amount < 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                          {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount)}
                        </p>
                        <p className="m-0 mt-0.5 text-[11px] font-bold text-[#a1a1aa]">{formatDate(transaction.created_at)}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="grid min-h-[96px] place-items-center rounded-[10px] border border-dashed border-[#e4e4e7] bg-white px-4 text-center">
                      <p className="m-0 text-[12px] font-bold text-[#a1a1aa]">No XP.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Students</h2>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search a student" label="Search students" className="md:w-[320px]" />
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : filteredStudents.length ? (
          <AdminTable minWidthClass="min-w-[920px]">
            <thead className={adminTableHeadClass}>
              <tr className={adminTableHeadRowClass}>
                  <th className={adminTableHeadCellClass}>Student</th>
                  <th className={adminTableHeadCellClass}>XP</th>
                  <th className={adminTableHeadCellClass}>Progress</th>
                  <th className={adminTableHeadCellClass}>Quiz</th>
                  <th className={adminTableHeadCellClass}>Time</th>
                  <th className={adminTableHeadCellClass}>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => <StudentRow key={student.user_id} student={student} />)}
              </tbody>
          </AdminTable>
        ) : (
          <div className="grid min-h-[260px] place-items-center p-8 text-center">
            <div>
              <UserRound size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">No students.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
    </div>
  )
}

function HealthSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: number
  detail: string
}) {
  const hasSignal = value > 0

  return (
    <div className={`min-h-[98px] rounded-[14px] px-4 py-3 transition-[background-color,box-shadow] duration-150 ease-out ${
      hasSignal
        ? 'bg-[#fff7ed] shadow-[inset_0_0_0_1px_rgba(245,144,11,0.18)]'
        : 'bg-[#f0fdf4] shadow-[inset_0_0_0_1px_rgba(22,163,74,0.14)]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white ${hasSignal ? 'text-[#f5900b]' : 'text-[#16a34a]'}`}>
          <Icon size={16} />
        </span>
        <span className={`text-[24px] font-black leading-none tabular-nums ${hasSignal ? 'text-[#f5900b]' : 'text-[#16a34a]'}`}>
          {formatNumber(value)}
        </span>
      </div>
      <p className="m-0 mt-3 text-[13px] font-black text-[#3f3f46]">{label}</p>
      <p className="m-0 mt-1 text-pretty text-[12px] font-semibold leading-5 text-[#71717a]">{hasSignal ? detail : 'Clear'}</p>
    </div>
  )
}

function AttentionStudentList({
  students,
}: {
  students: Array<{ student: AdminStudentProgressRow; signals: string[] }>
}) {
  if (!students.length) {
    return (
      <div className="grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[#e4e4e7] bg-[#fbfbfc] px-4 text-center">
        <div>
          <CheckCircle2 size={28} className="mx-auto mb-3 text-[#16a34a]" />
          <p className="m-0 text-[14px] font-black text-[#3f3f46]">No students need review.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {students.map(({ student, signals }) => (
        <div key={student.user_id} className="grid gap-3 rounded-[14px] bg-[#fbfbfc] px-3 py-3 shadow-[inset_0_0_0_1px_#ececf0] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="m-0 truncate text-[13px] font-black text-[#3f3f46]">{student.full_name || student.email}</p>
            <p className="m-0 mt-0.5 truncate text-[12px] font-semibold text-[#a1a1aa]">{student.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {signals.slice(0, 3).map((signal) => <SignalBadge key={signal} label={signal} />)}
              {signals.length > 3 && <SignalBadge label={`+${signals.length - 3}`} />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right md:w-[210px]">
            <AttentionMetric label="XP" value={formatNumber(student.total_xp)} />
            <AttentionMetric label="Quiz" value={student.quiz_attempts ? percent(Math.round((student.quiz_passed / student.quiz_attempts) * 100)) : '0%'} />
            <AttentionMetric label="Seen" value={student.last_activity_at ? formatDate(student.last_activity_at) : 'None'} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AttentionMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      <span className="mt-0.5 block truncate text-[12px] font-black text-[#3f3f46] tabular-nums">{value}</span>
    </span>
  )
}

function SignalBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-[#fff7ed] px-2 py-1 text-[11px] font-black text-[#f5900b]">{label}</span>
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="border-b border-[#f4f4f5] px-5 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[20px] font-black leading-none tabular-nums ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
    </div>
  )
}

function AuditMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[10px] bg-white px-3 py-2 shadow-[inset_0_0_0_1px_#ececf0]">
      <p className="m-0 text-[10px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[15px] font-black leading-none tabular-nums ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
    </div>
  )
}

function applyXpAdjustment(
  data: AdminStudentProgress,
  adjustment: AdminXpAdjustment,
): AdminStudentProgress {
  let totalDelta = 0
  const students = data.students.map((student) => {
    if (student.user_id !== adjustment.user_id) return student
    totalDelta = adjustment.total_xp - student.total_xp
    return {
      ...student,
      total_xp: adjustment.total_xp,
    }
  })
  return {
    ...data,
    students,
    summary: {
      ...data.summary,
      total_xp: data.summary.total_xp + totalDelta,
    },
  }
}

function StudentRow({ student }: { student: AdminStudentProgressRow }) {
  const passRate = student.quiz_attempts ? Math.round((student.quiz_passed / student.quiz_attempts) * 100) : 0
  const needsAttention = student.progress_records === 0 || !student.last_activity_at

  return (
    <tr className={adminTableRowClass}>
      <td className={adminTableCellClass}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[13px] font-black text-[color:var(--primary)]">
            {student.full_name?.[0]?.toUpperCase() || <UserRound size={16} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black text-[#3f3f46]">{student.full_name || student.email}</span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">
              {student.niveau || 'Level -'} / {student.filiere || 'Track -'} / {student.tier}
            </span>
          </span>
        </div>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.total_xp)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.streak_days)} streak</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.completed_items)} completed</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.in_progress_items)} in progress</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{percent(passRate)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.quiz_attempts)} attempts</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.watched_minutes)} min</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">Avg score {formatNumber(numberValue(student.average_quiz_score))}</p>
      </td>
      <td className={adminTableCellClass}>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${needsAttention ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
          {needsAttention ? <ArrowDownRight size={12} /> : <Activity size={12} />}
          {student.last_activity_at ? new Date(student.last_activity_at).toLocaleDateString('fr-FR') : 'Follow up'}
        </span>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-48 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-32 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5] sm:block" />
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('fr-FR')
}

function buildLearningRisk(students: AdminStudentProgressRow[]) {
  let noActivity = 0
  let noProgress = 0
  let noQuizAttempts = 0
  let zeroXp = 0
  let lowQuizPass = 0

  for (const student of students) {
    if (!student.last_activity_at) noActivity += 1
    if (student.progress_records === 0) noProgress += 1
    if (student.quiz_attempts === 0) noQuizAttempts += 1
    if (student.total_xp === 0) zeroXp += 1
    if (student.quiz_attempts > 0) {
      const passRate = Math.round((student.quiz_passed / student.quiz_attempts) * 100)
      if (passRate < 60) lowQuizPass += 1
    }
  }

  return {
    noActivity,
    noProgress,
    noQuizAttempts,
    zeroXp,
    lowQuizPass,
    total: noActivity + noProgress + noQuizAttempts + zeroXp + lowQuizPass,
  }
}

function buildAttentionStudents(students: AdminStudentProgressRow[]) {
  return students
    .map((student) => ({ student, signals: buildStudentLearningSignals(student) }))
    .filter((item) => item.signals.length > 0)
    .sort((left, right) => {
      if (right.signals.length !== left.signals.length) return right.signals.length - left.signals.length
      return right.student.total_xp - left.student.total_xp
    })
    .slice(0, 5)
}

function buildStudentLearningSignals(student: AdminStudentProgressRow) {
  const signals: string[] = []
  if (!student.last_activity_at) signals.push('No activity')
  if (student.progress_records === 0) signals.push('No progress')
  if (student.quiz_attempts === 0) signals.push('No quiz')
  if (student.total_xp === 0) signals.push('Zero XP')
  if (student.quiz_attempts > 0) {
    const passRate = Math.round((student.quiz_passed / student.quiz_attempts) * 100)
    if (passRate < 60) signals.push('Low quiz pass')
  }
  return signals
}
