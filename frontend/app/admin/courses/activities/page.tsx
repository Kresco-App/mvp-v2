'use client'

import { useState } from 'react'
import { ArrowLeft, Copy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_in_blank'
  | 'matching'
  | 'ordering'
  | 'drag_and_drop'
  | 'simulator'

const ACTIVITY_TYPES: { id: ActivityType; label: string; desc: string }[] = [
  { id: 'multiple_choice', label: 'QCM', desc: 'Question à choix multiples' },
  { id: 'true_false', label: 'Vrai / Faux', desc: 'Affirmation vraie ou fausse' },
  { id: 'fill_in_blank', label: 'Compléter', desc: 'Remplir un blanc dans une phrase' },
  { id: 'matching', label: 'Association', desc: 'Relier deux colonnes' },
  { id: 'ordering', label: 'Ordre', desc: 'Remettre dans le bon ordre' },
  { id: 'drag_and_drop', label: 'Glisser-Déposer', desc: 'Placer dans des zones' },
  { id: 'simulator', label: 'Simulateur', desc: 'Simulateur interactif' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityBuilderPage() {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<ActivityType>('multiple_choice')
  const [output, setOutput] = useState<string | null>(null)

  // MCQ state
  const [mcqQuestion, setMcqQuestion] = useState('')
  const [mcqOptions, setMcqOptions] = useState([
    { text: '', is_correct: true },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ])

  // True/False state
  const [tfStatement, setTfStatement] = useState('')
  const [tfAnswer, setTfAnswer] = useState(true)
  const [tfExplanation, setTfExplanation] = useState('')

  // Fill in blank state
  const [fibSentence, setFibSentence] = useState('')
  const [fibAnswer, setFibAnswer] = useState('')
  const [fibHint, setFibHint] = useState('')

  // Matching state
  const [matchQuestion, setMatchQuestion] = useState('')
  const [matchPairs, setMatchPairs] = useState([
    { id: 'a', left: '', right: '' },
    { id: 'b', left: '', right: '' },
  ])

  // Ordering state
  const [orderQuestion, setOrderQuestion] = useState('')
  const [orderItems, setOrderItems] = useState([
    { id: '1', label: '' },
    { id: '2', label: '' },
    { id: '3', label: '' },
  ])

  // Drag & Drop state
  const [ddQuestion, setDdQuestion] = useState('')
  const [ddItems, setDdItems] = useState([
    { id: 'item1', label: '' },
    { id: 'item2', label: '' },
  ])
  const [ddZones, setDdZones] = useState([
    { id: 'zone1', label: '', correctItemId: 'item1' },
    { id: 'zone2', label: '', correctItemId: 'item2' },
  ])

  // Simulator state
  const [simType, setSimType] = useState<'wave' | 'prism' | 'diffraction'>('wave')
  const [simTitle, setSimTitle] = useState('')

  function buildActivityData(): any {
    switch (selectedType) {
      case 'multiple_choice':
        return { question: mcqQuestion, options: mcqOptions }
      case 'true_false':
        return { statement: tfStatement, correct: tfAnswer, explanation: tfExplanation || undefined }
      case 'fill_in_blank':
        return { sentence: fibSentence, answer: fibAnswer, hint: fibHint || undefined }
      case 'matching':
        return { question: matchQuestion, pairs: matchPairs }
      case 'ordering':
        return {
          question: orderQuestion,
          items: orderItems,
          correctOrder: orderItems.map(i => i.id),
        }
      case 'drag_and_drop':
        return { question: ddQuestion, items: ddItems, zones: ddZones }
      case 'simulator':
        return { simulator_type: simType, title: simTitle || undefined }
    }
  }

  function handleGenerate() {
    const data = buildActivityData()
    const json = JSON.stringify({
      section_type: 'activity',
      activity_type: selectedType,
      activity_data: data,
    }, null, 2)
    setOutput(json)
  }

  function handleCopy() {
    if (!output) return
    navigator.clipboard.writeText(output)
    toast.success('Copié dans le presse-papiers !')
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950">
        {/* Top bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-slate-400 hover:text-white transition">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white font-semibold">Créateur d&apos;activités</h1>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: builder */}
          <div className="space-y-6">
            {/* Type selector */}
            <div>
              <h2 className="text-white font-semibold mb-3">Type d&apos;activité</h2>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedType(t.id); setOutput(null) }}
                    className={cn(
                      'text-left px-4 py-3 rounded-xl border text-sm transition',
                      selectedType === t.id
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    )}
                  >
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Builder form */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <h3 className="text-white font-semibold">Configuration</h3>

              {selectedType === 'multiple_choice' && (
                <MCQBuilder
                  question={mcqQuestion}
                  options={mcqOptions}
                  onQuestionChange={setMcqQuestion}
                  onOptionsChange={setMcqOptions}
                />
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
                <FillBlankBuilder
                  sentence={fibSentence}
                  answer={fibAnswer}
                  hint={fibHint}
                  onSentenceChange={setFibSentence}
                  onAnswerChange={setFibAnswer}
                  onHintChange={setFibHint}
                />
              )}

              {selectedType === 'matching' && (
                <MatchingBuilder
                  question={matchQuestion}
                  pairs={matchPairs}
                  onQuestionChange={setMatchQuestion}
                  onPairsChange={setMatchPairs}
                />
              )}

              {selectedType === 'ordering' && (
                <OrderingBuilder
                  question={orderQuestion}
                  items={orderItems}
                  onQuestionChange={setOrderQuestion}
                  onItemsChange={setOrderItems}
                />
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
                <SimulatorBuilder
                  simType={simType}
                  title={simTitle}
                  onTypeChange={setSimType}
                  onTitleChange={setSimTitle}
                />
              )}

              <button
                onClick={handleGenerate}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition mt-2"
              >
                Générer le JSON
              </button>
            </div>
          </div>

          {/* Right: JSON output */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">JSON généré</h2>
              {output && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition"
                >
                  <Copy size={13} /> Copier
                </button>
              )}
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 min-h-[300px]">
              {output ? (
                <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap overflow-auto">{output}</pre>
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                  Configurez l&apos;activité et cliquez &quot;Générer&quot;
                </div>
              )}
            </div>

            {output && (
              <div className="bg-slate-800/60 rounded-xl p-4 text-xs text-slate-400 space-y-1">
                <p className="text-slate-300 font-semibold mb-2">Comment utiliser :</p>
                <p>1. Dans l&apos;admin Django, créez un <code className="text-indigo-300">ChapterSection</code></p>
                <p>2. <code className="text-indigo-300">section_type</code> = <code className="text-green-400">activity</code></p>
                <p>3. <code className="text-indigo-300">activity_type</code> = <code className="text-green-400">{selectedType}</code></p>
                <p>4. Collez le contenu de <code className="text-indigo-300">activity_data</code> dans le champ JSON</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}

// ─── Sub-builders ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-400 text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
    />
  )
}

function MCQBuilder({ question, options, onQuestionChange, onOptionsChange }: any) {
  return (
    <>
      <Field label="Question">
        <TextInput value={question} onChange={onQuestionChange} placeholder="Quelle est la formule de la célérité ?" />
      </Field>
      <Field label="Options (cochez la bonne réponse)">
        <div className="space-y-2">
          {options.map((opt: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                checked={opt.is_correct}
                onChange={() => onOptionsChange(options.map((o: any, j: number) => ({ ...o, is_correct: j === i })))}
                className="text-indigo-500"
              />
              <input
                value={opt.text}
                onChange={e => onOptionsChange(options.map((o: any, j: number) => j === i ? { ...o, text: e.target.value } : o))}
                placeholder={`Option ${i + 1}`}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
          ))}
        </div>
      </Field>
    </>
  )
}

function TrueFalseBuilder({ statement, answer, explanation, onStatementChange, onAnswerChange, onExplanationChange }: any) {
  return (
    <>
      <Field label="Affirmation">
        <TextInput value={statement} onChange={onStatementChange} placeholder="Une onde mécanique peut se propager dans le vide." />
      </Field>
      <Field label="Réponse correcte">
        <div className="flex gap-3">
          {[true, false].map(v => (
            <button
              key={String(v)}
              onClick={() => onAnswerChange(v)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-semibold transition',
                answer === v
                  ? v ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              )}
            >
              {v ? 'Vrai' : 'Faux'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Explication (optionnel)">
        <TextInput value={explanation} onChange={onExplanationChange} placeholder="Parce que…" />
      </Field>
    </>
  )
}

function FillBlankBuilder({ sentence, answer, hint, onSentenceChange, onAnswerChange, onHintChange }: any) {
  return (
    <>
      <Field label="Phrase (utilisez {{blank}} pour le trou)">
        <TextInput value={sentence} onChange={onSentenceChange} placeholder="La célérité est v = λ × {{blank}}" />
      </Field>
      <Field label="Réponse attendue">
        <TextInput value={answer} onChange={onAnswerChange} placeholder="f" />
      </Field>
      <Field label="Indice (optionnel)">
        <TextInput value={hint} onChange={onHintChange} placeholder="fréquence" />
      </Field>
    </>
  )
}

function MatchingBuilder({ question, pairs, onQuestionChange, onPairsChange }: any) {
  return (
    <>
      <Field label="Question">
        <TextInput value={question} onChange={onQuestionChange} placeholder="Associez chaque onde à sa caractéristique" />
      </Field>
      <Field label="Paires">
        <div className="space-y-2">
          {pairs.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={p.left}
                onChange={e => onPairsChange(pairs.map((x: any, j: number) => j === i ? { ...x, left: e.target.value } : x))}
                placeholder="Gauche"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
              <span className="text-slate-400">↔</span>
              <input
                value={p.right}
                onChange={e => onPairsChange(pairs.map((x: any, j: number) => j === i ? { ...x, right: e.target.value } : x))}
                placeholder="Droite"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
          ))}
          <button
            onClick={() => onPairsChange([...pairs, { id: String.fromCharCode(97 + pairs.length), left: '', right: '' }])}
            className="text-indigo-400 hover:text-indigo-300 text-xs transition"
          >
            + Ajouter une paire
          </button>
        </div>
      </Field>
    </>
  )
}

function OrderingBuilder({ question, items, onQuestionChange, onItemsChange }: any) {
  return (
    <>
      <Field label="Question">
        <TextInput value={question} onChange={onQuestionChange} placeholder="Remettez les étapes dans l'ordre" />
      </Field>
      <Field label="Éléments (dans le bon ordre)">
        <div className="space-y-2">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-mono w-4">{i + 1}</span>
              <input
                value={item.label}
                onChange={e => onItemsChange(items.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder={`Étape ${i + 1}`}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
          ))}
          <button
            onClick={() => onItemsChange([...items, { id: String(items.length + 1), label: '' }])}
            className="text-indigo-400 hover:text-indigo-300 text-xs transition"
          >
            + Ajouter un élément
          </button>
        </div>
      </Field>
    </>
  )
}

function DragDropBuilder({ question, items, zones, onQuestionChange, onItemsChange, onZonesChange }: any) {
  return (
    <>
      <Field label="Question">
        <TextInput value={question} onChange={onQuestionChange} placeholder="Glissez chaque élément dans la bonne zone" />
      </Field>
      <Field label="Éléments">
        <div className="space-y-1.5">
          {items.map((item: any, i: number) => (
            <input
              key={i}
              value={item.label}
              onChange={e => onItemsChange(items.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x))}
              placeholder={`Élément ${item.id}`}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
            />
          ))}
        </div>
      </Field>
      <Field label="Zones">
        <div className="space-y-1.5">
          {zones.map((zone: any, i: number) => (
            <div key={i} className="flex gap-2">
              <input
                value={zone.label}
                onChange={e => onZonesChange(zones.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder={`Zone ${zone.id}`}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
              <select
                value={zone.correctItemId}
                onChange={e => onZonesChange(zones.map((x: any, j: number) => j === i ? { ...x, correctItemId: e.target.value } : x))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {items.map((it: any) => <option key={it.id} value={it.id}>{it.id}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Field>
    </>
  )
}

function SimulatorBuilder({ simType, title, onTypeChange, onTitleChange }: any) {
  return (
    <>
      <Field label="Type de simulateur">
        <select
          value={simType}
          onChange={e => onTypeChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="wave">Onde transversale</option>
          <option value="prism">Prisme (dispersion)</option>
          <option value="diffraction">Diffraction (fente)</option>
        </select>
      </Field>
      <Field label="Titre (optionnel)">
        <TextInput value={title} onChange={onTitleChange} placeholder="Simulateur d'onde" />
      </Field>
    </>
  )
}
