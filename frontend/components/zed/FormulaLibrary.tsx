'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, ChevronDown, Copy, Search, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Latex } from '@/components/animated/shared/Latex'
import { useCourseTopicsData, type CourseTopicCard } from '@/lib/courseDiscoveryData'
import { subjectKey } from '@/lib/subjectIdentity'
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
  kind?: 'formula' | 'theorem' | 'condition'
  tags: string[]
}

type FormulaTopic = {
  id: string
  title: string
  courseKeywords?: string[]
  items: Formula[]
}

type FormulaSubject = {
  id: string
  name: string
  shortName: string
  courseSubjectKey: string
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
    courseSubjectKey: 'math',
    topics: [
      {
        id: 'analysis',
        title: 'Analysis',
        courseKeywords: ['analyse', 'fonctions', 'fonction', 'derivee', 'derivation', 'limite', 'tangente', 'primitive', 'integrale'],
        items: [
          { id: 'derivative-definition', label: 'Derivative definition', latex: "f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}", note: 'Slope of the tangent at x = a.', tags: ['derivative', 'limit', 'tangent'] },
          { id: 'tangent-line', label: 'Tangent line', latex: "y=f'(a)(x-a)+f(a)", tags: ['derivative', 'line'] },
          { id: 'chain-power', label: 'Power chain rule', latex: "(u^n)'=n u' u^{n-1}", tags: ['derivative', 'chain rule'] },
          { id: 'quotient-rule', label: 'Quotient rule', latex: "\\left(\\frac{u}{v}\\right)'=\\frac{u'v-uv'}{v^2}", note: 'Requires v not equal to 0.', tags: ['derivative', 'quotient'] },
          { id: 'parts', label: 'Integration by parts', latex: "\\int u v'\\,dx=uv-\\int u'v\\,dx", tags: ['integral', 'parts'] },
          { id: 'ivt', label: 'Intermediate value theorem', latex: "f\\in C([a,b]),\\ k\\in[f(a),f(b)]\\Rightarrow\\exists c\\in[a,b],\\ f(c)=k", kind: 'theorem', tags: ['continuity', 'theorem', 'existence'] },
          { id: 'rolle', label: "Rolle's theorem", latex: "f\\in C([a,b]),\\ f\\in D(]a,b[),\\ f(a)=f(b)\\Rightarrow\\exists c,\\ f'(c)=0", kind: 'theorem', tags: ['derivative', 'theorem'] },
          { id: 'mvt', label: 'Mean value theorem', latex: "\\exists c\\in]a,b[,\\ f'(c)=\\frac{f(b)-f(a)}{b-a}", kind: 'theorem', tags: ['derivative', 'theorem'] },
          { id: 'derivable-continuous', label: 'Derivability condition', latex: "f\\ \\text{derivable en } a\\Rightarrow f\\ \\text{continue en } a", kind: 'condition', tags: ['derivative', 'continuity', 'condition'] },
        ],
      },
      {
        id: 'exponential-log',
        title: 'Exponential and logarithmic functions',
        courseKeywords: ['fonction exponentielle', 'fonctions exponentielles', 'exponentielle', 'logarithme', 'ln'],
        items: [
          { id: 'exp-derivative', label: 'Exponential derivative', latex: "(e^u)'=u'e^u", tags: ['exponential', 'derivative'] },
          { id: 'ln-derivative', label: 'Logarithm derivative', latex: "(\\ln u)'=\\frac{u'}{u}", note: 'Requires u > 0.', kind: 'condition', tags: ['logarithm', 'derivative', 'condition'] },
          { id: 'exp-rules', label: 'Exponential rules', latex: "e^{a+b}=e^ae^b\\quad ;\\quad e^{-a}=\\frac{1}{e^a}", tags: ['exponential', 'rules'] },
          { id: 'ln-rules', label: 'Logarithm rules', latex: "\\ln(ab)=\\ln a+\\ln b\\quad(a>0,b>0)", kind: 'condition', tags: ['logarithm', 'rules'] },
          { id: 'exp-positive', label: 'Exponential positivity', latex: "\\forall x\\in\\mathbb R,\\ e^x>0", kind: 'condition', tags: ['exponential', 'condition'] },
        ],
      },
      {
        id: 'sequences',
        title: 'Sequences',
        courseKeywords: ['suites', 'suite numerique', 'arithmetique', 'geometrique', 'recurrence'],
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
        courseKeywords: ['probabilite', 'probabilites', 'conditionnelle', 'loi binomiale', 'denombrement'],
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
        courseKeywords: ['geometrie', 'nombres complexes', 'complexes', 'vecteurs', 'produit scalaire'],
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
    courseSubjectKey: 'physics',
    topics: [
      {
        id: 'mechanics',
        title: 'Mechanics',
        courseKeywords: ['mecanique', 'cinematique', 'dynamique', 'forces', 'mouvement', 'energie'],
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
        id: 'fluid-mechanics',
        title: 'Fluid mechanics',
        courseKeywords: ['mecanique des fluides', 'fluides', 'bernoulli', 'debit', 'pression', 'hydrostatique'],
        items: [
          { id: 'continuity-flow', label: 'Continuity equation', latex: "Q=Sv=\\text{constante}", kind: 'condition', tags: ['fluids', 'flow', 'continuity'] },
          { id: 'bernoulli', label: 'Bernoulli theorem', latex: "P+\\rho gz+\\frac{1}{2}\\rho v^2=\\text{constante}", note: 'Steady, incompressible, non-viscous flow.', kind: 'theorem', tags: ['fluids', 'bernoulli', 'pressure'] },
          { id: 'hydrostatic', label: 'Hydrostatic pressure', latex: "P_B-P_A=\\rho g(z_A-z_B)", tags: ['fluids', 'pressure'] },
          { id: 'torricelli', label: 'Torricelli relation', latex: "v=\\sqrt{2gh}", note: 'Ideal outflow from a reservoir.', tags: ['fluids', 'velocity'] },
          { id: 'jet-height', label: 'Vertical jet height', latex: "h=\\frac{v^2}{2g}", tags: ['fluids', 'jet', 'energy'] },
        ],
      },
      {
        id: 'electricity',
        title: 'Electricity',
        courseKeywords: ['electricite', 'circuit', 'dipole', 'condensateur', 'rc', 'puissance electrique'],
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
        courseKeywords: ['ondes', 'optique', 'lumiere', 'lentille', 'refraction', 'periodique'],
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
        courseKeywords: ['nucleaire', 'radioactivite', 'decroissance radioactive', 'demi-vie'],
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
    courseSubjectKey: 'biology',
    topics: [
      {
        id: 'genetics',
        title: 'Genetics',
        courseKeywords: ['genetique', 'adn', 'arn', 'meiose', 'brassage', 'protein'],
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
        courseKeywords: ['immunologie', 'immunite', 'anticorps', 'lymphocyte', 'vaccination'],
        items: [
          { id: 'immune-complex', label: 'Immune complex', latex: "\\text{antigene}+\\text{anticorps}\\to\\text{complexe immun}", tags: ['immunology', 'antibody'] },
          { id: 'clonal-selection', label: 'Clonal selection', latex: "\\text{LB specifique}\\to\\text{plasmocytes}+\\text{LB memoire}", tags: ['immunology', 'lymphocyte'] },
          { id: 'vaccination', label: 'Vaccination principle', latex: "\\text{antigene attenue}\\to\\text{memoire immunitaire}", tags: ['immunology', 'vaccine'] },
        ],
      },
      {
        id: 'neuro-geology',
        title: 'Neurophysiology and geology',
        courseKeywords: ['neurophysiologie', 'message nerveux', 'potentiel', 'geologie', 'tectonique', 'datation'],
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
const normalizeSearchText = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const metadataStopWords = new Set(['a', 'an', 'and', 'at', 'by', 'definition', 'law', 'line', 'of', 'rule', 'the', 'to', 'with', 'x', 'y'])
const isDefinedTopicId = (value: string | undefined): value is string => Boolean(value)

export default function FormulaLibrary({ onClose, inline = false }: Props) {
  const [selectedSubject, setSelectedSubject] = useState(FORMULAS[0].id)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(() => new Set([FORMULAS[0].topics[0]?.id].filter(isDefinedTopicId)))
  const listScrollRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion() ?? false
  const { topics: courseTopics } = useCourseTopicsData()
  const subject = FORMULAS.find((item) => item.id === selectedSubject) ?? FORMULAS[0]
  const searchTerm = normalizeSearchText(search.trim())

  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0
  }, [selectedSubject])

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
        items: topic.items.filter((item) => normalizeSearchText([subject.name, subject.shortName, topic.title, item.label, item.latex, item.note, ...item.tags].filter(Boolean).join(' ')).includes(searchTerm)),
      }))
      .filter((topic) => topic.items.length > 0)
  }, [searchTerm, subject])
  const filteredTopicIds = filteredTopics.map((topic) => topic.id).join('|')

  const relatedCourseTopicById = useMemo(() => {
    const byId = new Map<string, CourseTopicCard>()
    subject.topics.forEach((topic) => {
      const related = findRelatedCourseTopic(subject, topic, courseTopics)
      if (related) byId.set(topic.id, related)
    })
    return byId
  }, [courseTopics, subject])

  useEffect(() => {
    if (!searchTerm) return
    setOpenTopicIds(new Set(filteredTopics.map((topic) => topic.id)))
  }, [filteredTopicIds, filteredTopics, searchTerm])

  function selectSubject(subjectId: string) {
    const nextSubject = FORMULAS.find((item) => item.id === subjectId) ?? FORMULAS[0]
    setSelectedSubject(nextSubject.id)
    setSearch('')
    setOpenTopicIds(new Set([nextSubject.topics[0]?.id].filter(isDefinedTopicId)))
  }

  function toggleTopic(topicId: string) {
    setOpenTopicIds((current) => {
      const next = new Set(current)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

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
      {!inline && (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-bold leading-tight">Formulas</p>
          <button type="button" onClick={onClose} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${buttonMotion}`} aria-label="Close formulas">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-shrink-0 border-b border-slate-200 px-3 py-3">
        <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
          {FORMULAS.map((item) => {
            const active = selectedSubject === item.id
            return (
              <button key={item.id} type="button" onClick={() => selectSubject(item.id)} className={cn('relative h-10 overflow-hidden rounded-lg px-3 text-xs font-bold', buttonMotion, active ? 'text-slate-950' : 'text-slate-500 hover:bg-white/70 hover:text-slate-950')} aria-pressed={active}>
                {active && (
                  <motion.span
                    layoutId="zed-formula-subject-pill"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative z-10">{item.shortName}</span>
              </button>
            )
          })}
        </div>

        <div className="relative mt-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label={`Search ${subject.shortName} formulas`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${subject.shortName}: topic or formula`} className={`h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100 ${inputMotion}`} />
          {search && (
            <button type="button" onClick={() => setSearch('')} className={`absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 ${buttonMotion}`} aria-label="Clear formula search" title="Clear formula search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <AnimatePresence initial={false} mode="wait">
          {filteredTopics.length === 0 ? (
            <motion.div
              key={`empty-${selectedSubject}`}
              className="grid min-h-56 place-items-center rounded-2xl bg-slate-50 p-6 text-center"
              initial={reduceMotion ? false : { opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div>
                <p className="text-sm font-bold text-slate-700">No formula found</p>
                <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">Try a topic, formula, or symbol.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`topics-${selectedSubject}`}
              className="space-y-2"
              initial={reduceMotion ? false : { opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {filteredTopics.map((topic) => {
                const relatedTopic = relatedCourseTopicById.get(topic.id)
                const open = openTopicIds.has(topic.id)
                return (
                  <FormulaTopicSection
                    key={topic.id}
                    copiedId={copiedId}
                    onCopy={copyFormula}
                    onToggle={() => toggleTopic(topic.id)}
                    open={open}
                    reduceMotion={reduceMotion}
                    relatedTopic={relatedTopic}
                    topic={topic}
                  />
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function FormulaTopicSection({
  copiedId,
  onCopy,
  onToggle,
  open,
  reduceMotion,
  relatedTopic,
  topic,
}: {
  copiedId: string | null
  onCopy: (formula: Formula) => Promise<void>
  onToggle: () => void
  open: boolean
  reduceMotion: boolean
  relatedTopic?: CourseTopicCard
  topic: FormulaTopic
}) {
  const panelId = `zed-formula-topic-${topic.id}`

  return (
    <section data-course-topic-id={relatedTopic?.id} data-open={open} className="rounded-2xl bg-slate-50 shadow-[var(--shadow-border)]">
      <div className="flex min-h-11 items-center gap-2 px-2">
        <button
          type="button"
          onClick={onToggle}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left ${buttonMotion} hover:bg-white`}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <ChevronDown size={15} className={cn('shrink-0 text-slate-500 transition-[transform] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', open && 'rotate-180')} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-slate-900">{topic.title}</span>
            <span className="block truncate text-[11px] font-semibold text-slate-500">
              {topic.items.length} item{topic.items.length === 1 ? '' : 's'}{relatedTopic ? ` - ${relatedTopic.title}` : ''}
            </span>
          </span>
        </button>
        {relatedTopic && (
          <Link href={`/topics/${relatedTopic.id}`} className={`inline-flex h-8 max-w-[6.5rem] shrink-0 items-center gap-1 rounded-lg bg-indigo-50 px-2 text-[11px] font-bold text-indigo-700 no-underline hover:bg-indigo-100 ${buttonMotion}`} aria-label={`Open course topic ${relatedTopic.title}`} title={relatedTopic.title}>
            <span className="truncate">Topic</span>
            <ArrowUpRight size={12} className="shrink-0" />
          </Link>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className="overflow-hidden"
            initial={reduceMotion ? false : { height: 0, opacity: 0, filter: 'blur(2px)' }}
            animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, filter: 'blur(2px)' }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="space-y-1.5 px-2 pb-2">
              {topic.items.map((formula, index) => (
                <motion.article
                  key={formula.id}
                  data-formula-metadata={formula.tags.join(', ')}
                  className={`rounded-xl bg-white px-2.5 py-2 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)] ${rowMotion}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.16, delay: Math.min(index * 0.025, 0.1), ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h4 className="min-w-0 truncate text-[13px] font-black leading-5 text-slate-900">{formula.label}</h4>
                        {formula.kind && (
                          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-normal text-slate-500">
                            {formula.kind}
                          </span>
                        )}
                      </div>
                      {formula.note && <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-500">{formula.note}</p>}
                    </div>
                    <button type="button" onClick={() => void onCopy(formula)} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`} aria-label={`Copy ${formula.label}`} title={`Copy ${formula.label}`}>
                      <AnimatedCopyIcon copied={copiedId === formula.id} reduceMotion={reduceMotion} />
                    </button>
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-lg bg-slate-50 px-2 py-2">
                    <Latex formula={formula.latex} block className="block min-w-max text-[14px] text-slate-950" />
                  </div>
                </motion.article>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function AnimatedCopyIcon({ copied, reduceMotion }: { copied: boolean; reduceMotion: boolean }) {
  return (
    <span className="grid h-4 w-4 place-items-center">
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={copied ? 'check' : 'copy'}
          className="col-start-1 row-start-1 grid h-4 w-4 place-items-center"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function findRelatedCourseTopic(subject: FormulaSubject, formulaTopic: FormulaTopic, courseTopics: CourseTopicCard[]) {
  let bestTopic: CourseTopicCard | null = null
  let bestScore = 0

  courseTopics.forEach((courseTopic) => {
    if (subjectKey(courseTopic.subject_title) !== subject.courseSubjectKey) return

    const score = scoreCourseTopicMatch(formulaTopic, courseTopic)
    if (score > bestScore) {
      bestScore = score
      bestTopic = courseTopic
    }
  })

  return bestScore >= 4 ? bestTopic : null
}

function scoreCourseTopicMatch(formulaTopic: FormulaTopic, courseTopic: CourseTopicCard) {
  const courseTitle = normalizeSearchText(courseTopic.title)
  const courseConcepts = normalizeSearchText(courseTopic.concepts.join(' '))
  const courseText = normalizeSearchText([courseTopic.title, courseTopic.description, ...courseTopic.concepts].join(' '))
  const formulaTopicTitle = normalizeSearchText(formulaTopic.title)
  const terms = formulaTopicSearchTerms(formulaTopic)
  let score = 0

  if (courseTitle === formulaTopicTitle) score += 20
  if (courseTitle.includes(formulaTopicTitle) || formulaTopicTitle.includes(courseTitle)) score += 10

  terms.forEach((term) => {
    const phraseWeight = term.includes(' ') ? 2 : 1
    if (courseTitle.includes(term)) {
      score += 3 * phraseWeight
    } else if (courseConcepts.includes(term)) {
      score += 2 * phraseWeight
    } else if (courseText.includes(term)) {
      score += phraseWeight
    }
  })

  return score
}

function formulaTopicSearchTerms(topic: FormulaTopic) {
  const terms = new Set<string>()
  const rawTerms = [
    topic.title,
    ...(topic.courseKeywords ?? []),
    ...topic.items.flatMap((item) => [item.label, ...item.tags]),
  ]

  rawTerms.forEach((rawTerm) => {
    const phrase = normalizeSearchText(rawTerm)
    if (!phrase || metadataStopWords.has(phrase)) return
    terms.add(phrase)

    phrase.split(' ').forEach((term) => {
      if (term.length < 3 || metadataStopWords.has(term)) return
      terms.add(term)
    })
  })

  return Array.from(terms)
}
