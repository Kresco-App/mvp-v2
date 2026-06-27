'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Copy, Search, X } from 'lucide-react'
import { Latex } from '@/components/animated/shared/Latex'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
  inline?: boolean
}

type Formula = {
  id: string
  label: string
  latex: string
  note?: string
  tags: string[]
}

type FormulaTopic = {
  id: string
  title: string
  items: Formula[]
}

type FormulaSubject = {
  id: string
  name: string
  shortName: string
  topics: FormulaTopic[]
}

const buttonMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const inputMotion = 'transition-[border-color,box-shadow,background-color] duration-150 ease-out motion-reduce:transition-none'
const rowMotion = 'transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none'

const FORMULAS: FormulaSubject[] = [
  {
    id: 'math',
    name: 'Mathematics',
    shortName: 'Math',
    topics: [
      {
        id: 'analysis',
        title: 'Analysis',
        items: [
          { id: 'derivative-definition', label: 'Derivative definition', latex: "f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}", note: 'Slope of the tangent at x = a.', tags: ['derivative', 'limit', 'tangent'] },
          { id: 'tangent-line', label: 'Tangent line', latex: "y=f'(a)(x-a)+f(a)", tags: ['derivative', 'line'] },
          { id: 'chain-power', label: 'Power chain rule', latex: "(u^n)'=n u' u^{n-1}", tags: ['derivative', 'chain rule'] },
          { id: 'quotient-rule', label: 'Quotient rule', latex: "\\left(\\frac{u}{v}\\right)'=\\frac{u'v-uv'}{v^2}", note: 'Requires v not equal to 0.', tags: ['derivative', 'quotient'] },
          { id: 'parts', label: 'Integration by parts', latex: "\\int u v'\\,dx=uv-\\int u'v\\,dx", tags: ['integral', 'parts'] },
        ],
      },
      {
        id: 'sequences',
        title: 'Sequences',
        items: [
          { id: 'arithmetic-term', label: 'Arithmetic sequence', latex: "u_n=u_0+nr", note: 'r is the common difference.', tags: ['sequence', 'arithmetic'] },
          { id: 'arithmetic-sum', label: 'Arithmetic sum', latex: "S_n=\\frac{(n+1)(u_0+u_n)}{2}", tags: ['sequence', 'sum'] },
          { id: 'geometric-term', label: 'Geometric sequence', latex: "u_n=u_0q^n", note: 'q is the common ratio.', tags: ['sequence', 'geometric'] },
          { id: 'geometric-sum', label: 'Geometric sum', latex: "S_n=u_0\\frac{1-q^{n+1}}{1-q}", note: 'Requires q not equal to 1.', tags: ['sequence', 'sum'] },
        ],
      },
      {
        id: 'probability',
        title: 'Probability',
        items: [
          { id: 'conditional', label: 'Conditional probability', latex: "P_A(B)=\\frac{P(A\\cap B)}{P(A)}", note: 'Requires P(A) not equal to 0.', tags: ['probability', 'conditional'] },
          { id: 'total-probability', label: 'Total probability', latex: "P(B)=\\sum_i P(A_i)P_{A_i}(B)", tags: ['probability', 'partition'] },
          { id: 'binomial', label: 'Binomial law', latex: "P(X=k)=\\binom{n}{k}p^k(1-p)^{n-k}", tags: ['probability', 'binomial'] },
          { id: 'binomial-moments', label: 'Binomial expectation and variance', latex: "E(X)=np\\quad ;\\quad V(X)=np(1-p)", tags: ['expectation', 'variance'] },
        ],
      },
      {
        id: 'geometry',
        title: 'Geometry and complex numbers',
        items: [
          { id: 'distance', label: 'Distance AB', latex: "AB=\\sqrt{(x_B-x_A)^2+(y_B-y_A)^2}", tags: ['geometry', 'distance'] },
          { id: 'dot-product', label: 'Dot product', latex: "\\vec u\\cdot\\vec v=\\lVert\\vec u\\rVert\\lVert\\vec v\\rVert\\cos\\theta=xx'+yy'", tags: ['geometry', 'vectors'] },
          { id: 'complex-modulus', label: 'Complex modulus', latex: "|z|=\\sqrt{a^2+b^2}", note: 'For z = a + ib.', tags: ['complex', 'modulus'] },
        ],
      },
    ],
  },
  {
    id: 'physics',
    name: 'Physics',
    shortName: 'Physics',
    topics: [
      {
        id: 'mechanics',
        title: 'Mechanics',
        items: [
          { id: 'average-velocity', label: 'Average velocity', latex: "v=\\frac{\\Delta x}{\\Delta t}", tags: ['mechanics', 'kinematics'] },
          { id: 'acceleration', label: 'Acceleration', latex: "a=\\frac{\\Delta v}{\\Delta t}", note: 'Unit: m.s^{-2}.', tags: ['mechanics', 'kinematics'] },
          { id: 'position', label: 'Uniformly accelerated position', latex: "x=x_0+v_0t+\\frac{1}{2}at^2", tags: ['mechanics', 'motion'] },
          { id: 'newton-second', label: "Newton's second law", latex: "\\sum \\vec F_{ext}=m\\vec a", tags: ['mechanics', 'forces'] },
          { id: 'kinetic-energy', label: 'Kinetic energy', latex: "E_c=\\frac{1}{2}mv^2", tags: ['mechanics', 'energy'] },
          { id: 'work-energy', label: 'Work-energy theorem', latex: "\\Delta E_c=\\sum W(\\vec F_{ext})", tags: ['work', 'energy'] },
        ],
      },
      {
        id: 'electricity',
        title: 'Electricity',
        items: [
          { id: 'ohm', label: "Ohm's law", latex: "U=RI", tags: ['electricity', 'circuit'] },
          { id: 'power', label: 'Electric power', latex: "P=UI=RI^2=\\frac{U^2}{R}", tags: ['electricity', 'power'] },
          { id: 'capacitor', label: 'Capacitor charge', latex: "q=Cu", tags: ['electricity', 'capacitor'] },
          { id: 'rc-charge', label: 'RC charging', latex: "u_C(t)=E\\left(1-e^{-\\frac{t}{RC}}\\right)", note: 'Time constant tau = RC.', tags: ['electricity', 'rc'] },
        ],
      },
      {
        id: 'waves-optics',
        title: 'Waves and optics',
        items: [
          { id: 'wave-speed', label: 'Wave speed', latex: "v=\\lambda f=\\frac{\\lambda}{T}", tags: ['waves', 'frequency'] },
          { id: 'frequency', label: 'Frequency', latex: "f=\\frac{1}{T}", tags: ['waves', 'period'] },
          { id: 'snell', label: 'Snell-Descartes law', latex: "n_1\\sin i_1=n_2\\sin i_2", tags: ['optics', 'refraction'] },
          { id: 'thin-lens', label: 'Thin lens', latex: "\\frac{1}{f'}=\\frac{1}{\\overline{OA'}}-\\frac{1}{\\overline{OA}}", tags: ['optics', 'lens'] },
        ],
      },
      {
        id: 'nuclear',
        title: 'Nuclear',
        items: [
          { id: 'binding-energy', label: 'Binding energy', latex: "E_l=\\Delta mc^2", tags: ['nuclear', 'energy'] },
          { id: 'radioactive-decay', label: 'Radioactive decay', latex: "N(t)=N_0e^{-\\lambda t}", tags: ['nuclear', 'decay'] },
          { id: 'half-life', label: 'Half-life', latex: "t_{1/2}=\\frac{\\ln2}{\\lambda}", tags: ['nuclear', 'decay'] },
        ],
      },
    ],
  },
  {
    id: 'svt',
    name: 'Life and Earth Sciences',
    shortName: 'SVT',
    topics: [
      {
        id: 'genetics',
        title: 'Genetics',
        items: [
          { id: 'dna-replication', label: 'DNA replication', latex: "\\text{ADN}\\to2\\,\\text{ADN identiques}", note: 'Semi-conservative replication.', tags: ['genetics', 'dna'] },
          { id: 'transcription', label: 'Transcription', latex: "\\text{ADN}\\to\\text{ARNm}", note: 'Occurs in the nucleus.', tags: ['genetics', 'rna'] },
          { id: 'translation', label: 'Translation', latex: "\\text{ARNm}\\to\\text{proteine}", note: 'Occurs at the ribosome.', tags: ['genetics', 'protein'] },
          { id: 'assortment', label: 'Independent assortment', latex: "2^n\\ \\text{combinaisons possibles}", note: 'n chromosome pairs.', tags: ['genetics', 'meiosis'] },
        ],
      },
      {
        id: 'immunology',
        title: 'Immunology',
        items: [
          { id: 'immune-complex', label: 'Immune complex', latex: "\\text{antigene}+\\text{anticorps}\\to\\text{complexe immun}", tags: ['immunology', 'antibody'] },
          { id: 'clonal-selection', label: 'Clonal selection', latex: "\\text{LB specifique}\\to\\text{plasmocytes}+\\text{LB memoire}", tags: ['immunology', 'lymphocyte'] },
          { id: 'vaccination', label: 'Vaccination principle', latex: "\\text{antigene attenue}\\to\\text{memoire immunitaire}", tags: ['immunology', 'vaccine'] },
        ],
      },
      {
        id: 'neuro-geology',
        title: 'Neurophysiology and geology',
        items: [
          { id: 'resting-potential', label: 'Resting potential', latex: "V_m\\approx-70\\,\\text{mV}", tags: ['neurophysiology', 'membrane'] },
          { id: 'nerve-frequency', label: 'Nerve message coding', latex: "\\text{intensite}\\propto\\text{frequence des PA}", tags: ['neurophysiology', 'action potential'] },
          { id: 'spreading-speed', label: 'Ocean-floor spreading speed', latex: "v=\\frac{\\text{distance}}{\\text{age}}", tags: ['geology', 'plate tectonics'] },
          { id: 'relative-dating', label: 'Relative dating principles', latex: "\\text{superposition, recoupement, inclusion, continuite}", tags: ['geology', 'dating'] },
        ],
      },
    ],
  },
]

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function FormulaLibrary({ onClose, inline = false }: Props) {
  const [selectedSubject, setSelectedSubject] = useState(FORMULAS[0].id)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const subject = FORMULAS.find((item) => item.id === selectedSubject) ?? FORMULAS[0]
  const searchTerm = normalize(search.trim())

  useEffect(() => {
    if (!copiedId) return
    const timeout = window.setTimeout(() => setCopiedId(null), 1400)
    return () => window.clearTimeout(timeout)
  }, [copiedId])

  const filteredTopics = useMemo(() => {
    if (!searchTerm) return subject.topics
    return subject.topics
      .map((topic) => ({
        ...topic,
        items: topic.items.filter((item) => normalize([subject.name, subject.shortName, topic.title, item.label, item.latex, item.note, ...item.tags].filter(Boolean).join(' ')).includes(searchTerm)),
      }))
      .filter((topic) => topic.items.length > 0)
  }, [searchTerm, subject])

  const formulaCount = subject.topics.reduce((acc, topic) => acc + topic.items.length, 0)
  const visibleCount = filteredTopics.reduce((acc, topic) => acc + topic.items.length, 0)

  async function copyFormula(formula: Formula) {
    try {
      await navigator.clipboard?.writeText(formula.latex)
      setCopiedId(formula.id)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div className={cn('flex flex-col bg-white text-slate-950', inline ? 'h-full w-full' : 'fixed right-0 top-0 z-[150] h-full w-96 max-w-[100vw] shadow-xl ring-1 ring-black/10')}>
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={16} className="flex-shrink-0 text-indigo-600" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">Formula library</p>
            <p className="text-[11px] font-semibold leading-tight text-slate-500">{searchTerm ? `${visibleCount}/${formulaCount}` : formulaCount} indexed formulas</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${buttonMotion}`} aria-label="Close formula library">
          <X size={16} />
        </button>
      </div>

      <div className="flex-shrink-0 border-b border-slate-200 px-3 py-2">
        <div className="scrollbar-none flex gap-1 overflow-x-auto pb-2">
          {FORMULAS.map((item) => {
            const active = selectedSubject === item.id
            return (
              <button key={item.id} type="button" onClick={() => { setSelectedSubject(item.id); setSearch('') }} className={cn('h-9 flex-shrink-0 rounded-xl px-3 text-xs font-bold', buttonMotion, active ? 'bg-slate-950 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950')} aria-pressed={active}>
                {item.shortName}
              </button>
            )
          })}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label={`Search ${subject.shortName} formulas`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${subject.shortName}: topic, tag, formula`} className={`h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100 ${inputMotion}`} />
          {search && (
            <button type="button" onClick={() => setSearch('')} className={`absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 ${buttonMotion}`} aria-label="Clear formula search" title="Clear formula search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {filteredTopics.length === 0 ? (
          <div className="grid min-h-56 place-items-center rounded-2xl bg-slate-50 p-6 text-center">
            <div>
              <p className="text-sm font-bold text-slate-700">No formula found</p>
              <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">Try a topic, a tag, or a symbol.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTopics.map((topic) => (
              <section key={topic.id}>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{topic.title}</h3>
                <div className="space-y-2">
                  {topic.items.map((formula) => (
                    <article key={formula.id} className={`rounded-2xl bg-slate-50 p-3 shadow-[var(--shadow-border)] hover:bg-white hover:shadow-[var(--shadow-border-hover)] ${rowMotion}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-pretty text-sm font-bold leading-5 text-slate-900">{formula.label}</h4>
                          {formula.note && <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">{formula.note}</p>}
                        </div>
                        <button type="button" onClick={() => void copyFormula(formula)} className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`} aria-label={`Copy ${formula.label}`} title={`Copy ${formula.label}`}>
                          {copiedId === formula.id ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                      </div>
                      <div className="mt-3 overflow-x-auto rounded-xl bg-white px-3 py-3 shadow-[var(--shadow-border)]">
                        <Latex formula={formula.latex} block className="block min-w-max text-[15px] text-slate-950" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {formula.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 shadow-[var(--shadow-border)]">{tag}</span>)}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
