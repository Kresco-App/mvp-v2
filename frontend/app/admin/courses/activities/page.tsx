'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Code2, Copy, Loader2, Plus, Settings2, Sparkles, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'

import {
  AdminPageHeader,
  adminButtonClass,
  adminMetricStripThreeClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
} from '@/components/admin/AdminDesign'
import { cn } from '@/lib/utils'

type ActivityType =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_in_blank'
  | 'matching'
  | 'ordering'
  | 'drag_and_drop'
  | 'simulator'

type ActivityTypeMeta = {
  id: ActivityType
  label: string
  desc: string
  outputLabel: string
}

type OptionRow = { id: string; text: string; is_correct: boolean }
type PairRow = { id: string; left: string; right: string }
type OrderRow = { id: string; label: string }
type DragItemRow = { id: string; label: string }
type DropZoneRow = { id: string; label: string; correctItemId: string }

type ValidationResult = {
  missing: string[]
  readyFields: number
  totalFields: number
}

const ACTIVITY_TYPES: ActivityTypeMeta[] = [
  { id: 'multiple_choice', label: 'QCM', desc: 'Question à choix multiples', outputLabel: 'multiple_choice' },
  { id: 'true_false', label: 'Vrai / Faux', desc: 'Affirmation vraie ou fausse', outputLabel: 'true_false' },
  { id: 'fill_in_blank', label: 'Compléter', desc: 'Phrase avec un blanc', outputLabel: 'fill_in_blank' },
  { id: 'matching', label: 'Association', desc: 'Relier deux colonnes', outputLabel: 'matching' },
  { id: 'ordering', label: 'Ordre', desc: 'Remettre dans le bon ordre', outputLabel: 'ordering' },
  { id: 'drag_and_drop', label: 'Glisser-déposer', desc: 'Placer dans des zones', outputLabel: 'drag_and_drop' },
  { id: 'simulator', label: 'Simulateur', desc: 'Configuration interactive', outputLabel: 'simulator' },
]

function clean(value: string) {
  return value.trim()
}

export default function ActivityBuilderPage() {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<ActivityType>('multiple_choice')
  const [output, setOutput] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)

  const [mcqQuestion, setMcqQuestion] = useState('')
  const [mcqOptions, setMcqOptions] = useState<OptionRow[]>([
    { id: 'option-1', text: '', is_correct: true },
    { id: 'option-2', text: '', is_correct: false },
    { id: 'option-3', text: '', is_correct: false },
    { id: 'option-4', text: '', is_correct: false },
  ])

  const [tfStatement, setTfStatement] = useState('')
  const [tfAnswer, setTfAnswer] = useState(true)
  const [tfExplanation, setTfExplanation] = useState('')

  const [fibSentence, setFibSentence] = useState('')
  const [fibAnswer, setFibAnswer] = useState('')
  const [fibHint, setFibHint] = useState('')

  const [matchQuestion, setMatchQuestion] = useState('')
  const [matchPairs, setMatchPairs] = useState<PairRow[]>([
    { id: 'a', left: '', right: '' },
    { id: 'b', left: '', right: '' },
  ])

  const [orderQuestion, setOrderQuestion] = useState('')
  const [orderItems, setOrderItems] = useState<OrderRow[]>([
    { id: '1', label: '' },
    { id: '2', label: '' },
    { id: '3', label: '' },
  ])

  const [ddQuestion, setDdQuestion] = useState('')
  const [ddItems, setDdItems] = useState<DragItemRow[]>([
    { id: 'item1', label: '' },
    { id: 'item2', label: '' },
  ])
  const [ddZones, setDdZones] = useState<DropZoneRow[]>([
    { id: 'zone1', label: '', correctItemId: 'item1' },
    { id: 'zone2', label: '', correctItemId: 'item2' },
  ])

  const [simType, setSimType] = useState<'wave' | 'prism' | 'diffraction'>('wave')
  const [simTitle, setSimTitle] = useState('')

  const selectedMeta = ACTIVITY_TYPES.find((type) => type.id === selectedType) ?? ACTIVITY_TYPES[0]
  const validation = useMemo(validateActivity, [
    ddItems,
    ddQuestion,
    ddZones,
    fibAnswer,
    fibSentence,
    matchPairs,
    matchQuestion,
    mcqOptions,
    mcqQuestion,
    orderItems,
    orderQuestion,
    selectedType,
    simTitle,
    tfStatement,
  ])
  const completion = validation.totalFields > 0 ? Math.round((validation.readyFields / validation.totalFields) * 100) : 0

  function validateActivity(): ValidationResult {
    switch (selectedType) {
      case 'multiple_choice': {
        const completeOptions = mcqOptions.filter((option) => clean(option.text))
        const missing = [
          !clean(mcqQuestion) && 'Question',
          completeOptions.length < 2 && 'Au moins 2 options',
          !completeOptions.some((option) => option.is_correct) && 'Bonne réponse',
        ].filter(Boolean) as string[]
        return { missing, readyFields: [mcqQuestion, ...mcqOptions.map((option) => option.text)].filter(clean).length, totalFields: 5 }
      }
      case 'true_false': {
        return { missing: clean(tfStatement) ? [] : ['Affirmation'], readyFields: clean(tfStatement) ? 1 : 0, totalFields: 1 }
      }
      case 'fill_in_blank': {
        const missing = [
          !clean(fibSentence) && 'Phrase',
          !fibSentence.includes('{{blank}}') && 'Marqueur {{blank}}',
          !clean(fibAnswer) && 'Réponse attendue',
        ].filter(Boolean) as string[]
        return { missing, readyFields: [fibSentence, fibAnswer].filter(clean).length, totalFields: 2 }
      }
      case 'matching': {
        const completePairs = matchPairs.filter((pair) => clean(pair.left) && clean(pair.right))
        const missing = [
          !clean(matchQuestion) && 'Question',
          completePairs.length < 2 && 'Au moins 2 paires complètes',
        ].filter(Boolean) as string[]
        return { missing, readyFields: (clean(matchQuestion) ? 1 : 0) + completePairs.length, totalFields: 1 + matchPairs.length }
      }
      case 'ordering': {
        const completeItems = orderItems.filter((item) => clean(item.label))
        const missing = [
          !clean(orderQuestion) && 'Question',
          completeItems.length < 2 && 'Au moins 2 étapes',
        ].filter(Boolean) as string[]
        return { missing, readyFields: (clean(orderQuestion) ? 1 : 0) + completeItems.length, totalFields: 1 + orderItems.length }
      }
      case 'drag_and_drop': {
        const completeItems = ddItems.filter((item) => clean(item.label))
        const completeZones = ddZones.filter((zone) => clean(zone.label) && zone.correctItemId)
        const missing = [
          !clean(ddQuestion) && 'Question',
          completeItems.length < 2 && 'Au moins 2 éléments',
          completeZones.length < 2 && 'Au moins 2 zones',
        ].filter(Boolean) as string[]
        return {
          missing,
          readyFields: (clean(ddQuestion) ? 1 : 0) + completeItems.length + completeZones.length,
          totalFields: 1 + ddItems.length + ddZones.length,
        }
      }
      case 'simulator':
        return { missing: [], readyFields: clean(simTitle) ? 2 : 1, totalFields: 2 }
    }
  }

  function buildActivityData() {
    switch (selectedType) {
      case 'multiple_choice':
        return {
          question: clean(mcqQuestion),
          options: mcqOptions.filter((option) => clean(option.text)).map(({ text, is_correct }) => ({ text: clean(text), is_correct })),
        }
      case 'true_false':
        return { statement: clean(tfStatement), correct: tfAnswer, explanation: clean(tfExplanation) || undefined }
      case 'fill_in_blank':
        return { sentence: clean(fibSentence), answer: clean(fibAnswer), hint: clean(fibHint) || undefined }
      case 'matching':
        return { question: clean(matchQuestion), pairs: matchPairs.filter((pair) => clean(pair.left) && clean(pair.right)) }
      case 'ordering':
        return {
          question: clean(orderQuestion),
          items: orderItems.filter((item) => clean(item.label)),
          correctOrder: orderItems.filter((item) => clean(item.label)).map((item) => item.id),
        }
      case 'drag_and_drop':
        return {
          question: clean(ddQuestion),
          items: ddItems.filter((item) => clean(item.label)),
          zones: ddZones.filter((zone) => clean(zone.label) && zone.correctItemId),
        }
      case 'simulator':
        return { simulator_type: simType, title: clean(simTitle) || undefined }
    }
  }

  function handleGenerate() {
    if (validation.missing.length > 0) {
      showToastError(`Champs à compléter: ${validation.missing.join(', ')}`)
      setOutput(null)
      return
    }
    const json = JSON.stringify({
      section_type: 'activity',
      activity_type: selectedType,
      activity_data: buildActivityData(),
    }, null, 2)
    setOutput(json)
    showToastSuccess('Activity JSON prêt.')
  }

  async function handleCopy() {
    if (!output || copying) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(output)
      showToastSuccess('JSON copié dans le presse-papiers.')
    } catch {
      showToastError('Impossible de copier le JSON.')
    } finally {
      setCopying(false)
    }
  }

  function resetOutputOnTypeChange(type: ActivityType) {
    setSelectedType(type)
    setOutput(null)
  }

  return (
    <div className={adminPageClass}>
      <AdminPageHeader
        icon={Sparkles}
        title="Créateur d’activités"
        action={(
          <>
          <button
            type="button"
            onClick={() => router.push('/admin/courses')}
            title="Retour aux cours"
            className={`${adminButtonClass} px-3`}
          >
            <ArrowLeft size={18} />
            Cours
          </button>
        <button
          type="button"
          onClick={handleGenerate}
          className={`${adminPrimaryButtonClass} h-11`}
        >
          <Code2 size={15} />
          Générer le JSON
        </button>
          </>
        )}
      />

      <div className={adminMetricStripThreeClass}>
        <StatusTile label="Type" value={selectedMeta.label} hint={selectedMeta.outputLabel} />
        <StatusTile label="Préparation" value={`${completion}%`} hint={`${validation.readyFields}/${validation.totalFields} champs utiles`} />
        <StatusTile label="Sortie" value={output ? 'Prête' : 'À générer'} hint={output ? 'copiable' : 'aucun JSON actif'} tone={output ? 'good' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)_420px]">
        <section className={adminPanelClass}>
          <div className="border-b border-[#f4f4f5] px-4 py-3">
            <p className="m-0 text-[14px] font-black text-[#3f3f46]">Type d’activité</p>
            <p className="m-0 text-[12px] font-semibold text-[#a1a1aa]">Le format de sortie reste compatible avec les sections `activity`.</p>
          </div>
          <div className="grid gap-2 p-3">
            {ACTIVITY_TYPES.map((type) => (
              <button
                type="button"
                key={type.id}
                onClick={() => resetOutputOnTypeChange(type.id)}
                className={cn(
                  'rounded-[14px] border-[2px] px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-out',
                  selectedType === type.id
                    ? 'border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)]'
                    : 'border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#c7c7cc]',
                )}
              >
                <span className="block text-[14px] font-black">{type.label}</span>
                <span className="mt-0.5 block text-[12.5px] font-semibold text-[#a1a1aa]">{type.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={adminPanelClass}>
          <div className="border-b border-[#f4f4f5] px-5 py-4">
            <div className="flex items-center gap-2">
              <Settings2 size={17} className="text-[color:var(--primary)]" />
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Configuration</h2>
            </div>
          </div>
          <div className="grid gap-4 px-5 py-4">
            {selectedType === 'multiple_choice' && (
              <MCQBuilder question={mcqQuestion} options={mcqOptions} onQuestionChange={setMcqQuestion} onOptionsChange={setMcqOptions} />
            )}
            {selectedType === 'true_false' && (
              <TrueFalseBuilder
                statement={tfStatement}
                answer={tfAnswer}
                explanation={tfExplanation}
                onStatementChange={setTfStatement}
                onAnswerChange={setTfAnswer}
                onExplanationChange={setTfExplanation}
              />
            )}
            {selectedType === 'fill_in_blank' && (
              <FillBlankBuilder sentence={fibSentence} answer={fibAnswer} hint={fibHint} onSentenceChange={setFibSentence} onAnswerChange={setFibAnswer} onHintChange={setFibHint} />
            )}
            {selectedType === 'matching' && (
              <MatchingBuilder question={matchQuestion} pairs={matchPairs} onQuestionChange={setMatchQuestion} onPairsChange={setMatchPairs} />
            )}
            {selectedType === 'ordering' && (
              <OrderingBuilder question={orderQuestion} items={orderItems} onQuestionChange={setOrderQuestion} onItemsChange={setOrderItems} />
            )}
            {selectedType === 'drag_and_drop' && (
              <DragDropBuilder
                question={ddQuestion}
                items={ddItems}
                zones={ddZones}
                onQuestionChange={setDdQuestion}
                onItemsChange={setDdItems}
                onZonesChange={setDdZones}
              />
            )}
            {selectedType === 'simulator' && (
              <SimulatorBuilder simType={simType} title={simTitle} onTypeChange={setSimType} onTitleChange={setSimTitle} />
            )}
          </div>
        </section>

        <section className={adminPanelClass}>
          <div className="border-b border-[#f4f4f5] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={17} className="text-[color:var(--primary)]" />
                  <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Contrôle et sortie</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!output || copying}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition-[border-color,color,opacity] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copying ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : <Copy size={14} />}
                Copier
              </button>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-4">
            <ValidationPanel missing={validation.missing} />
            <div className="min-h-[300px] rounded-[14px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc] p-4">
              {output ? (
                <pre className="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-5 text-[#3f3f46]">{output}</pre>
              ) : (
                <div className="grid min-h-[250px] place-items-center text-center">
                  <div>
                    <Code2 size={28} className="mx-auto text-[#d4d4d8]" />
                    <p className="m-0 mt-2 text-[14px] font-black text-[#52525c]">Aucun JSON généré</p>
                  </div>
                </div>
              )}
            </div>
            {output && (
              <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] px-4 py-3 text-[12.5px] font-semibold text-[#71717b]">
                activity JSON
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'good'
}) {
  return (
    <div className={adminMetricTileClass}>
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={cn('m-0 mt-1 text-[22px] font-black leading-none', tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]')}>{value}</p>
    </div>
  )
}

function ValidationPanel({ missing }: { missing: string[] }) {
  if (!missing.length) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border-[2px] border-[#bbf7d0] bg-[#f6fef9] px-4 py-3 text-[13px] font-black text-[#16a34a]">
        <CheckCircle2 size={16} />
        Prêt à générer
      </div>
    )
  }
  return (
    <div className="rounded-[14px] border-[2px] border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
      <p className="m-0 flex items-center gap-2 text-[13px] font-black text-[#c2410c]">
        <TriangleAlert size={16} />
        Champs requis
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {missing.map((item) => (
          <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#c2410c]">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (value: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <input
      aria-label={ariaLabel ?? placeholder ?? 'Text input'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-semibold text-[#3f3f46] outline-none transition-[border-color] duration-150 ease-out placeholder:text-[#d4d4d8] focus:border-[color:var(--primary)]"
    />
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[12px] font-black text-[color:var(--primary)] transition-[color] duration-150 ease-out hover:text-[color:var(--primary)]">
      <Plus size={13} />
      {children}
    </button>
  )
}

function MCQBuilder({
  question,
  options,
  onQuestionChange,
  onOptionsChange,
}: {
  question: string
  options: OptionRow[]
  onQuestionChange: (value: string) => void
  onOptionsChange: (value: OptionRow[]) => void
}) {
  return (
    <>
      <Field label="Question">
        <TextInput ariaLabel="MCQ question" value={question} onChange={onQuestionChange} placeholder="Quelle est la formule de la célérité ?" />
      </Field>
      <Field label="Options">
        <div className="grid gap-2">
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <input
                aria-label={`Bonne réponse option ${index + 1}`}
                type="radio"
                checked={option.is_correct}
                onChange={() => onOptionsChange(options.map((row, rowIndex) => ({ ...row, is_correct: rowIndex === index })))}
                className="h-4 w-4 accent-[color:var(--primary)]"
              />
              <TextInput
                ariaLabel={`Option ${index + 1}`}
                value={option.text}
                onChange={(value) => onOptionsChange(options.map((row, rowIndex) => (rowIndex === index ? { ...row, text: value } : row)))}
                placeholder={`Option ${index + 1}`}
              />
            </div>
          ))}
        </div>
      </Field>
    </>
  )
}

function TrueFalseBuilder({
  statement,
  answer,
  explanation,
  onStatementChange,
  onAnswerChange,
  onExplanationChange,
}: {
  statement: string
  answer: boolean
  explanation: string
  onStatementChange: (value: string) => void
  onAnswerChange: (value: boolean) => void
  onExplanationChange: (value: string) => void
}) {
  return (
    <>
      <Field label="Affirmation">
        <TextInput ariaLabel="True false statement" value={statement} onChange={onStatementChange} placeholder="Une onde mécanique peut se propager dans le vide." />
      </Field>
      <Field label="Réponse correcte">
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((value) => (
            <button
              type="button"
              key={String(value)}
              onClick={() => onAnswerChange(value)}
              className={cn(
                'h-10 rounded-[12px] border-[2px] text-[13px] font-black transition-[background-color,border-color,color] duration-150 ease-out',
                answer === value
                  ? value ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-[#ef4444] bg-[#ef4444] text-white'
                  : 'border-[#e4e4e7] text-[#52525c] hover:border-[#c7c7cc]',
              )}
            >
              {value ? 'Vrai' : 'Faux'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Explication optionnelle">
        <TextInput ariaLabel="True false explanation" value={explanation} onChange={onExplanationChange} placeholder="Parce que..." />
      </Field>
    </>
  )
}

function FillBlankBuilder({
  sentence,
  answer,
  hint,
  onSentenceChange,
  onAnswerChange,
  onHintChange,
}: {
  sentence: string
  answer: string
  hint: string
  onSentenceChange: (value: string) => void
  onAnswerChange: (value: string) => void
  onHintChange: (value: string) => void
}) {
  return (
    <>
      <Field label="Phrase">
        <TextInput ariaLabel="Fill blank sentence" value={sentence} onChange={onSentenceChange} placeholder="La célérité est v = λ × {{blank}}" />
      </Field>
      <Field label="Réponse attendue">
        <TextInput ariaLabel="Fill blank answer" value={answer} onChange={onAnswerChange} placeholder="f" />
      </Field>
      <Field label="Indice optionnel">
        <TextInput ariaLabel="Fill blank hint" value={hint} onChange={onHintChange} placeholder="fréquence" />
      </Field>
    </>
  )
}

function MatchingBuilder({
  question,
  pairs,
  onQuestionChange,
  onPairsChange,
}: {
  question: string
  pairs: PairRow[]
  onQuestionChange: (value: string) => void
  onPairsChange: (value: PairRow[]) => void
}) {
  return (
    <>
      <Field label="Question">
        <TextInput ariaLabel="Matching question" value={question} onChange={onQuestionChange} placeholder="Associez chaque onde à sa caractéristique" />
      </Field>
      <Field label="Paires">
        <div className="grid gap-2">
          {pairs.map((pair, index) => (
            <div key={pair.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <TextInput
                ariaLabel={`Gauche paire ${index + 1}`}
                value={pair.left}
                onChange={(value) => onPairsChange(pairs.map((row, rowIndex) => (rowIndex === index ? { ...row, left: value } : row)))}
                placeholder="Gauche"
              />
              <span className="text-[12px] font-black text-[#a1a1aa]">→</span>
              <TextInput
                ariaLabel={`Droite paire ${index + 1}`}
                value={pair.right}
                onChange={(value) => onPairsChange(pairs.map((row, rowIndex) => (rowIndex === index ? { ...row, right: value } : row)))}
                placeholder="Droite"
              />
            </div>
          ))}
          <AddButton onClick={() => onPairsChange([...pairs, { id: String.fromCharCode(97 + pairs.length), left: '', right: '' }])}>Ajouter une paire</AddButton>
        </div>
      </Field>
    </>
  )
}

function OrderingBuilder({
  question,
  items,
  onQuestionChange,
  onItemsChange,
}: {
  question: string
  items: OrderRow[]
  onQuestionChange: (value: string) => void
  onItemsChange: (value: OrderRow[]) => void
}) {
  return (
    <>
      <Field label="Question">
        <TextInput ariaLabel="Ordering question" value={question} onChange={onQuestionChange} placeholder="Remettez les étapes dans l'ordre" />
      </Field>
      <Field label="Éléments dans le bon ordre">
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-[12px] font-black text-[#a1a1aa]">{index + 1}</span>
              <TextInput
                ariaLabel={`Élément ${index + 1}`}
                value={item.label}
                onChange={(value) => onItemsChange(items.map((row, rowIndex) => (rowIndex === index ? { ...row, label: value } : row)))}
                placeholder={`Étape ${index + 1}`}
              />
            </div>
          ))}
          <AddButton onClick={() => onItemsChange([...items, { id: String(items.length + 1), label: '' }])}>Ajouter un élément</AddButton>
        </div>
      </Field>
    </>
  )
}

function DragDropBuilder({
  question,
  items,
  zones,
  onQuestionChange,
  onItemsChange,
  onZonesChange,
}: {
  question: string
  items: DragItemRow[]
  zones: DropZoneRow[]
  onQuestionChange: (value: string) => void
  onItemsChange: (value: DragItemRow[]) => void
  onZonesChange: (value: DropZoneRow[]) => void
}) {
  return (
    <>
      <Field label="Question">
        <TextInput ariaLabel="Drag drop question" value={question} onChange={onQuestionChange} placeholder="Glissez chaque élément dans la bonne zone" />
      </Field>
      <Field label="Éléments">
        <div className="grid gap-2">
          {items.map((item, index) => (
            <TextInput
              ariaLabel={`Élément ${item.id}`}
              key={item.id}
              value={item.label}
              onChange={(value) => onItemsChange(items.map((row, rowIndex) => (rowIndex === index ? { ...row, label: value } : row)))}
              placeholder={`Élément ${item.id}`}
            />
          ))}
        </div>
      </Field>
      <Field label="Zones">
        <div className="grid gap-2">
          {zones.map((zone, index) => (
            <div key={zone.id} className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
              <TextInput
                ariaLabel={`Zone ${index + 1}`}
                value={zone.label}
                onChange={(value) => onZonesChange(zones.map((row, rowIndex) => (rowIndex === index ? { ...row, label: value } : row)))}
                placeholder={`Zone ${zone.id}`}
              />
              <select
                aria-label={`Bonne réponse zone ${index + 1}`}
                value={zone.correctItemId}
                onChange={(event) => onZonesChange(zones.map((row, rowIndex) => (rowIndex === index ? { ...row, correctItemId: event.target.value } : row)))}
                className="h-10 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-2 text-[13px] font-semibold text-[#3f3f46] outline-none focus:border-[color:var(--primary)]"
              >
                {items.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Field>
    </>
  )
}

function SimulatorBuilder({
  simType,
  title,
  onTypeChange,
  onTitleChange,
}: {
  simType: 'wave' | 'prism' | 'diffraction'
  title: string
  onTypeChange: (value: 'wave' | 'prism' | 'diffraction') => void
  onTitleChange: (value: string) => void
}) {
  return (
    <>
      <Field label="Type de simulateur">
        <select
          aria-label="Simulator type"
          value={simType}
          onChange={(event) => onTypeChange(event.target.value as 'wave' | 'prism' | 'diffraction')}
          className="h-10 w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-semibold text-[#3f3f46] outline-none focus:border-[color:var(--primary)]"
        >
          <option value="wave">Onde transversale</option>
          <option value="prism">Prisme (dispersion)</option>
          <option value="diffraction">Diffraction (fente)</option>
        </select>
      </Field>
      <Field label="Titre optionnel">
        <TextInput ariaLabel="Simulator title" value={title} onChange={onTitleChange} placeholder="Simulateur d'onde" />
      </Field>
    </>
  )
}
