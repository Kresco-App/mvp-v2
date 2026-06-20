'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  BadgePlus,
  BookOpenCheck,
  Loader2,
  RotateCcw,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { getJson, postJson } from '@/lib/apiClient'
import { formatNumber, numberValue, percent, recordEntries } from '@/lib/adminOverview'
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

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  low_quiz_pass: 'Low quiz pass',
  no_activity: 'No activity',
  no_progress: 'No progress',
  no_quiz_attempts: 'No quiz attempts',
  not_started: 'Not started',
  opened: 'Opened',
  started: 'Started',
  zero_xp: 'Zero XP',
}

export default function AdminStudentsPage() {
  const [data, setData] = useState<AdminStudentProgress>(EMPTY_STUDENT_PROGRESS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [xpAudit, setXpAudit] = useState<AdminXpAudit>(EMPTY_XP_AUDIT)
  const [xpLoading, setXpLoading] = useState(false)
  const [xpError, setXpError] = useState('')
  const [xpNonce, setXpNonce] = useState(0)
  const [xpAmount, setXpAmount] = useState('50')
  const [xpReason, setXpReason] = useState('Admin XP correction')
  const [xpBusy, setXpBusy] = useState(false)
  const [xpMessage, setXpMessage] = useState('')

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
        setError('Impossible de charger la progression des élèves.')
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
      setSelectedUserId(String(data.students[0].user_id))
    }
  }, [data.students, selectedUserId])

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
        setXpError('Could not load XP audit for this student.')
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
      setXpError('A correction reason is required.')
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
      setXpError('Could not apply XP correction. Check xp:adjust access and the target total.')
    } finally {
      setXpBusy(false)
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Users}
        eyebrow="Admin / Students"
        title="Progression élèves"
        description="Track activity, XP, quiz outcomes and work time by student."
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
        <StatTile icon={Users} label="Élèves" value={formatNumber(summary.total_students)} hint={`${formatNumber(summary.active_students_7d)} actifs 7j`} loading={loading} />
        <StatTile icon={BookOpenCheck} label="Couverture" value={percent(studentProgressCoverage(summary))} hint={`${formatNumber(summary.students_with_progress)} avec progression`} loading={loading} />
        <StatTile icon={Trophy} label="XP total" value={formatNumber(summary.total_xp)} hint={`${formatNumber(summary.completed_topic_items)} items complétés`} loading={loading} />
        <StatTile icon={Activity} label="Quiz pass" value={percent(quizPassRate(summary))} hint={`${formatNumber(summary.quiz_attempts)} tentatives`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Progression globale</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Répartition des statuts de progression.</p>
          <BarList data={recordEntries(data.progress_by_status, 6)} emptyLabel="Aucun statut de progression." />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Volume de travail</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Signal de temps, quiz et complétion.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Watch min" value={formatNumber(summary.total_watch_minutes)} />
            <MiniMetric label="Quiz passés" value={formatNumber(summary.quiz_passed)} />
            <MiniMetric label="À relancer" value={formatNumber(Math.max(summary.total_students - summary.active_students_7d, 0))} tone="warn" />
          </div>
        </section>
      </div>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Eleves a risque</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
              Signaux derives des lignes eleves pour prioriser les relances et corrections.
            </p>
          </div>
          <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-black text-[#f5900b]">
            {formatNumber(learningRisk.total)} signal(s)
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Sans activite" value={formatNumber(learningRisk.noActivity)} tone={learningRisk.noActivity ? 'warn' : 'default'} />
            <MiniMetric label="Sans progression" value={formatNumber(learningRisk.noProgress)} tone={learningRisk.noProgress ? 'warn' : 'default'} />
            <MiniMetric label="Sans quiz" value={formatNumber(learningRisk.noQuizAttempts)} tone={learningRisk.noQuizAttempts ? 'warn' : 'default'} />
            <MiniMetric label="XP zero" value={formatNumber(learningRisk.zeroXp)} tone={learningRisk.zeroXp ? 'warn' : 'default'} />
          </div>
          <BarList
            data={recordEntries({
              no_activity: learningRisk.noActivity,
              no_progress: learningRisk.noProgress,
              no_quiz_attempts: learningRisk.noQuizAttempts,
              zero_xp: learningRisk.zeroXp,
              low_quiz_pass: learningRisk.lowQuizPass,
            }, 6)}
            emptyLabel="Aucun signal de risque."
          />
        </div>
      </section>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[#5b60f9]">
              <BadgePlus size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">XP correction</h2>
              <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
                Adjust student XP with an audited reason and review the latest XP transactions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setXpNonce((value) => value + 1)}
            disabled={!selectedStudent || xpLoading}
            className="inline-flex h-9 w-fit items-center gap-2 rounded-[11px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {xpLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Refresh audit
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
                aria-label="Select student for XP correction"
                className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition focus:border-[#5b60f9] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
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
                  aria-label="XP correction amount"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition focus:border-[#5b60f9]"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Reason</span>
                <input
                  value={xpReason}
                  onChange={(event) => setXpReason(event.target.value)}
                  aria-label="XP correction reason"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition placeholder:text-[#c0c0c7] focus:border-[#5b60f9]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!selectedStudent || xpBusy}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-[13px] font-black text-white transition hover:bg-[#484cf0] disabled:cursor-not-allowed disabled:bg-[#c0c0c7]"
              >
                {xpBusy ? <Loader2 size={15} className="animate-spin" /> : <BadgePlus size={15} />}
                Apply correction
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
                {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-[10px] bg-[#f4f4f5]" />)}
              </div>
            ) : (
              <>
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <AuditMetric label="Stored" value={formatNumber(xpAudit.stored_total_xp)} />
                  <AuditMetric label="Tx sum" value={formatNumber(xpAudit.transaction_sum_xp)} />
                  <AuditMetric label="Delta" value={formatNumber(xpAudit.delta_xp)} tone={xpAudit.has_total_mismatch ? 'warn' : 'default'} />
                  <AuditMetric label="Adjust." value={formatNumber(xpAudit.adjustment_count)} />
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
                      <p className="m-0 text-[12px] font-bold text-[#a1a1aa]">No XP transactions loaded.</p>
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
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Élèves</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{formatNumber(filteredStudents.length)} ligne(s) affichée(s)</p>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search a student" label="Rechercher un élève" className="md:w-[320px]" />
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : filteredStudents.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead className="bg-[#fbfbfc]">
                <tr className="text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
                  <th className="px-5 py-3">Élève</th>
                  <th className="px-4 py-3">XP</th>
                  <th className="px-4 py-3">Progression</th>
                  <th className="px-4 py-3">Quiz</th>
                  <th className="px-4 py-3">Temps</th>
                  <th className="px-4 py-3">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => <StudentRow key={student.user_id} student={student} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center p-8 text-center">
            <div>
              <UserRound size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">Aucun élève trouvé.</p>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Essayez un autre filtre ou actualisez les données.</p>
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
  hint,
  loading,
}: {
  icon: typeof Users
  label: string
  value: ReactNode
  hint: string
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-3">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[20px] font-black leading-none ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
    </div>
  )
}

function AuditMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[10px] border border-[#ececf0] bg-white px-3 py-2">
      <p className="m-0 text-[10px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[15px] font-black leading-none ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
    </div>
  )
}

function BarList({ data, emptyLabel }: { data: Array<{ key: string; value: number }>; emptyLabel: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  if (!data.length) {
    return <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-5 text-center text-[13px] font-semibold text-[#a1a1aa]">{emptyLabel}</p>
  }
  return (
    <div className="grid gap-3">
      {data.map((item) => {
        const width = Math.max(5, Math.round((item.value / max) * 100))
        return (
          <div key={item.key}>
            <div className="mb-1 flex justify-between gap-3 text-[12.5px] font-bold">
              <span className="text-[#52525c]">{STATUS_LABELS[item.key] ?? item.key}</span>
              <span className="text-[#a1a1aa]">{formatNumber(item.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
              <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
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
    <tr className="border-t border-[#f4f4f5] text-[13px]">
      <td className="px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[13px] font-black text-[#5b60f9]">
            {student.full_name?.[0]?.toUpperCase() || <UserRound size={16} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black text-[#3f3f46]">{student.full_name || student.email}</span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">
              {student.niveau || 'Niveau -'} · {student.filiere || 'Filière -'} · {student.tier}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.total_xp)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.streak_days)} streak</p>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.completed_items)} complétés</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.in_progress_items)} en cours</p>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{percent(passRate)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(student.quiz_attempts)} tentatives</p>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(student.watched_minutes)} min</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">Score moy. {formatNumber(numberValue(student.average_quiz_score))}</p>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${needsAttention ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
          {needsAttention ? <ArrowDownRight size={12} /> : <Activity size={12} />}
          {student.last_activity_at ? new Date(student.last_activity_at).toLocaleDateString('fr-FR') : 'À relancer'}
        </span>
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 animate-pulse rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-48 animate-pulse rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 animate-pulse rounded-full bg-[#f4f4f5] sm:block" />
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
