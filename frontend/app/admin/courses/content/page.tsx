'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  FileCode2,
  Heading2,
  ImageIcon,
  LayoutGrid,
  ListChecks,
  PanelTop,
  Pilcrow,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Sigma,
  Table2,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  CourseContentRenderer,
  courseDocumentFromConfig,
  isAllowedCourseComponentKey,
  normalizeCourseComponentKey,
  type CourseContentBlock,
  type CourseDocument,
} from '@/components/topic-workspace/CourseContentRenderer'
import { getJson } from '@/lib/apiClient'

type TopicWorkspace = {
  id: number
  slug?: string
  title: string
  subject_title: string
  sections: TopicSection[]
  active_item: TopicItem | null
}

type TopicSection = {
  id: number
  title: string
  items: TopicItem[]
}

type TopicItem = {
  id: number
  title: string
  description: string
  item_type: string
  tabs: TopicTab[]
}

type TopicTab = {
  id: number
  label: string
  tab_type: string
  content: string
  config_json: unknown
}

type ParsedEditorDocument = {
  document: CourseDocument | null
  error: string
  warnings: string[]
}

type CourseBlockTemplate = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  block: Record<string, unknown>
}

type CourseBlockTemplateGroup = {
  label: string
  templates: CourseBlockTemplate[]
}

const editorIndent = 2

const blockTemplateGroups: CourseBlockTemplateGroup[] = [
  {
    label: 'Text',
    templates: [
      {
        id: 'heading-section',
        label: 'Section heading',
        description: 'H2/H3/H4 structure.',
        icon: Heading2,
        block: { type: 'heading', level: 3, text: 'Nouveau point de cours' },
      },
      {
        id: 'paragraph-explanation',
        label: 'Paragraph',
        description: 'Inline LaTeX with $...$.',
        icon: Pilcrow,
        block: { type: 'paragraph', text: 'Ajoutez une explication courte avec une formule comme $N(t)$.' },
      },
      {
        id: 'definition-card',
        label: 'Definition',
        description: 'Purple framed definition.',
        icon: BookOpen,
        block: { type: 'definition', tone: 'purple', title: 'Definition', body: 'Enoncez ici la definition essentielle.' },
      },
      {
        id: 'property-card',
        label: 'Property',
        description: 'Blue property block.',
        icon: PanelTop,
        block: { type: 'property', tone: 'blue', title: 'Propriete', body: 'Formulez la propriete et ses conditions.' },
      },
      {
        id: 'quote-accent',
        label: 'Quote',
        description: 'Highlighted idea or source.',
        icon: Quote,
        block: { type: 'quote', variant: 'accent', body: 'Idee cle a retenir, avec $x$ si besoin.', cite: 'A retenir' },
      },
    ],
  },
  {
    label: 'Math',
    templates: [
      {
        id: 'formula-boxed',
        label: 'Boxed formula',
        description: 'Single KaTeX equation.',
        icon: Sigma,
        block: { type: 'formula', display: 'boxed', latex: 'N(t)=N_0 e^{-\\lambda t}', caption: 'Formule principale' },
      },
      {
        id: 'equation-set',
        label: 'Equation set',
        description: 'Several related formulas.',
        icon: Sigma,
        block: {
          type: 'equation_set',
          title: 'Relations utiles',
          equations: [
            { label: 'Loi', latex: 'N(t)=N_0 e^{-\\lambda t}', caption: 'Evolution au cours du temps' },
            { label: 'Demi-vie', latex: 't_{1/2}=\\frac{\\ln 2}{\\lambda}', caption: 'Relation avec la constante radioactive' },
          ],
        },
      },
      {
        id: 'key-value-grid',
        label: 'Key values',
        description: 'Constants, units, results.',
        icon: LayoutGrid,
        block: {
          type: 'key_value_grid',
          columns: 3,
          items: [
            { label: 'Constante', value: '$\\lambda$', caption: 'Probabilite de desintegration par unite de temps', tone: 'purple' },
            { label: 'Unite', value: '$s^{-1}$', caption: 'Si le temps est exprime en secondes', tone: 'blue' },
            { label: 'Demi-vie', value: '$t_{1/2}$', caption: 'Temps pour diviser N par 2', tone: 'green' },
          ],
        },
      },
    ],
  },
  {
    label: 'Structure',
    templates: [
      {
        id: 'check-list',
        label: 'Checklist',
        description: 'Compact requirements list.',
        icon: ListChecks,
        block: {
          type: 'list',
          style: 'check',
          title: 'A verifier',
          items: [
            { text: 'Identifier les grandeurs connues.' },
            { text: 'Choisir la relation adaptee.' },
            { text: 'Verifier les unites.' },
          ],
        },
      },
      {
        id: 'numbered-method',
        label: 'Method steps',
        description: 'Ordered procedure.',
        icon: ListChecks,
        block: {
          type: 'steps',
          steps: [
            { title: 'Analyser', body: 'Reperez la situation et les donnees.' },
            { title: 'Modeliser', body: 'Ecrivez la relation mathematique.' },
            { title: 'Conclure', body: 'Interpretez le resultat avec les unites.' },
          ],
        },
      },
      {
        id: 'timeline-process',
        label: 'Timeline',
        description: 'Sequence over time.',
        icon: Clock3,
        block: {
          type: 'timeline',
          title: 'Evolution du phenomene',
          items: [
            { marker: '1', title: 'Etat initial', body: 'On connait $N_0$ au temps $t=0$.' },
            { marker: '2', title: 'Evolution', body: 'Le nombre de noyaux diminue progressivement.' },
            { marker: '3', title: 'Observation', body: 'La courbe obtenue est exponentielle decroissante.' },
          ],
        },
      },
      {
        id: 'comparison-columns',
        label: 'Comparison',
        description: 'Two or more columns.',
        icon: Columns2,
        block: {
          type: 'comparison',
          columns: [
            { title: 'Grandeur', body: 'Ce que l on mesure.', tone: 'blue' },
            { title: 'Interpretation', body: 'Ce que cela signifie.', tone: 'green' },
          ],
        },
      },
      {
        id: 'data-table',
        label: 'Table',
        description: 'Rows and columns.',
        icon: Table2,
        block: {
          type: 'table',
          title: 'Tableau de valeurs',
          columns: ['Temps $t$', 'Noyaux $N(t)$', 'Observation'],
          rows: [
            ['0', '$N_0$', 'Etat initial'],
            ['$t_{1/2}$', '$N_0/2$', 'Moins de noyaux restants'],
          ],
        },
      },
    ],
  },
  {
    label: 'Media',
    templates: [
      {
        id: 'image-diagram',
        label: 'Image',
        description: 'Diagram placeholder.',
        icon: ImageIcon,
        block: { type: 'image', asset_key: 'diagram-key', alt: 'Description du schema', caption: 'Legende du schema' },
      },
      {
        id: 'visual-component',
        label: 'Course visual',
        description: 'Allowlisted animated component.',
        icon: FileCode2,
        block: { type: 'component', key: 'decay_law_graph', display: 'inline', title: 'Visualisation', description: 'Graphique passif du cours', props: {} },
      },
      {
        id: 'info-cards',
        label: 'Card grid',
        description: 'Two or three compact points.',
        icon: LayoutGrid,
        block: {
          type: 'cards',
          layout: 'three_column',
          items: [
            { title: 'Cause', body: 'Ce qui declenche le phenomene.', tone: 'blue' },
            { title: 'Effet', body: 'Ce que l on observe.', tone: 'green' },
            { title: 'Limite', body: 'Condition ou piege courant.', tone: 'amber' },
          ],
        },
      },
      {
        id: 'code-example',
        label: 'Code',
        description: 'Algorithm or pseudo-code.',
        icon: Code2,
        block: { type: 'code', language: 'pseudo', filename: 'methode.txt', code: 'donnees <- lire_enonce()\\nrelation <- choisir_formule(donnees)\\nresultat <- calculer(relation)', caption: 'Pseudo-code de resolution' },
      },
    ],
  },
]

export default function AdminCourseContentEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const topicId = Number(searchParams.get('topicId') ?? 0)
  const itemId = Number(searchParams.get('itemId') ?? 0)
  const subjectId = searchParams.get('subjectId')

  const [workspace, setWorkspace] = useState<TopicWorkspace | null>(null)
  const [activeItem, setActiveItem] = useState<TopicItem | null>(null)
  const [sourceJson, setSourceJson] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const localDraftKey = topicId && itemId ? `kresco.course-content-draft.${topicId}.${itemId}` : ''

  const loadWorkspace = useCallback(async () => {
    if (!topicId || !itemId) {
      setLoadError('Missing topicId or itemId in the URL.')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError('')
    try {
      const data = await getJson<TopicWorkspace>(`/courses/topics/${topicId}/workspace?item_id=${itemId}`)
      const item = findTopicItem(data, itemId) ?? data.active_item
      if (!item) {
        setLoadError('Topic item not found in the workspace response.')
        return
      }

      setWorkspace(data)
      setActiveItem(item)

      const localDraft = localDraftKey ? window.localStorage.getItem(localDraftKey) : null
      const courseTab = item.tabs.find((tab) => isCourseTab(tab))
      const courseDocument = courseDocumentFromConfig(courseTab?.config_json)
      const nextDocument = courseDocument ?? buildStarterCourseDocument(data, item)
      setSourceJson(localDraft || JSON.stringify(nextDocument, null, editorIndent))
    } catch {
      setLoadError('Could not load this topic item.')
      toast.error('Could not load Course editor data.')
    } finally {
      setLoading(false)
    }
  }, [itemId, localDraftKey, topicId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const parsed = useMemo(() => parseCourseDocumentJson(sourceJson), [sourceJson])
  const canPreview = Boolean(parsed.document && !parsed.error)
  const backHref = subjectId ? `/admin/courses/${subjectId}` : '/admin/courses'

  function saveLocalDraft() {
    if (!localDraftKey) return
    window.localStorage.setItem(localDraftKey, sourceJson)
    toast.success('Course draft saved locally.')
  }

  async function copyJson() {
    await navigator.clipboard.writeText(sourceJson)
    toast.success('Course JSON copied.')
  }

  function downloadJson() {
    const filename = `${documentFileBase(workspace, activeItem)}.course.json`
    const blob = new Blob([sourceJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function resetFromWorkspace() {
    if (!workspace || !activeItem) return
    const courseTab = activeItem.tabs.find((tab) => isCourseTab(tab))
    const courseDocument = courseDocumentFromConfig(courseTab?.config_json)
    const nextDocument = courseDocument ?? buildStarterCourseDocument(workspace, activeItem)
    setSourceJson(JSON.stringify(nextDocument, null, editorIndent))
    toast.success('Editor reset from workspace data.')
  }

  function useStarterTemplate() {
    if (!workspace || !activeItem) return
    setSourceJson(JSON.stringify(buildStarterCourseDocument(workspace, activeItem), null, editorIndent))
  }

  function insertBlockTemplate(template: CourseBlockTemplate) {
    if (!parsed.document || parsed.error) {
      toast.error('Fix the Course JSON before inserting a block.')
      return
    }

    const block = buildTemplateBlock(template, parsed.document.blocks)
    const nextDocument: CourseDocument = {
      ...parsed.document,
      schema_version: parsed.document.schema_version ?? 1,
      blocks: [...parsed.document.blocks, block],
    }
    setSourceJson(JSON.stringify(nextDocument, null, editorIndent))
    toast.success(`${template.label} block inserted.`)
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-4">
        <button type="button" onClick={() => router.push(backHref)} className="text-slate-400 transition hover:text-white" aria-label="Back to course admin">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold text-slate-500">{workspace?.subject_title ?? 'Course content'}</p>
          <h1 className="m-0 truncate text-sm font-semibold text-white">{activeItem?.title ?? 'Course document editor'}</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={backHref} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800">
            Course list
          </Link>
          <button type="button" onClick={resetFromWorkspace} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800">
            <RefreshCw size={13} />
            Reset
          </button>
          <button type="button" onClick={saveLocalDraft} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">
            <Save size={13} />
            Save local draft
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-6 py-6 lg:grid-cols-[minmax(360px,520px)_1fr]">
        <section className="min-w-0">
          <BlockSelectorPanel canInsert={Boolean(parsed.document && !parsed.error && !loadError)} onInsert={insertBlockTemplate} />

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-sm font-semibold text-white">Course JSON</h2>
              <p className="m-0 mt-1 text-xs text-slate-500">Local draft editor for generated Course documents.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={useStarterTemplate} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800">
                Template
              </button>
              <button type="button" onClick={() => { void copyJson() }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800">
                <Copy size={12} />
                Copy
              </button>
              <button type="button" onClick={downloadJson} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800">
                <Download size={12} />
                Download
              </button>
            </div>
          </div>

          {loadError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-semibold text-red-100">{loadError}</div>
          ) : (
            <textarea
              aria-label="Course document JSON"
              spellCheck={false}
              value={sourceJson}
              onChange={(event) => setSourceJson(event.target.value)}
              className="h-[calc(100vh-260px)] min-h-[420px] w-full resize-y rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
            />
          )}

          <ValidationPanel parsed={parsed} />
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-white">
                <Eye size={15} className="text-indigo-300" />
                Live preview
              </h2>
              <p className="m-0 mt-1 text-xs text-slate-500">This uses the same renderer as the student Course tab.</p>
            </div>
            <StatusBadge parsed={parsed} />
          </div>

          <div className="h-[calc(100vh-185px)] min-h-[520px] overflow-auto rounded-2xl border border-slate-800 bg-white p-6 text-slate-950">
            {canPreview && parsed.document ? (
              <CourseContentRenderer document={parsed.document} />
            ) : (
              <div className="grid min-h-[320px] place-items-center text-center">
                <div>
                  <FileCode2 size={32} className="mx-auto mb-3 text-slate-300" />
                  <p className="m-0 text-sm font-black text-slate-700">Preview unavailable</p>
                  <p className="m-0 mt-2 text-xs font-semibold text-slate-500">Fix the JSON or validation issue to render the Course document.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function BlockSelectorPanel({
  canInsert,
  onInsert,
}: {
  canInsert: boolean
  onInsert: (template: CourseBlockTemplate) => void
}) {
  return (
    <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-semibold text-white">Block selector</h2>
          <p className="m-0 mt-1 text-xs text-slate-500">{blockTemplateGroups.reduce((total, group) => total + group.templates.length, 0)} variants</p>
        </div>
        <Plus size={16} className="text-indigo-400" />
      </div>
      <div className="grid gap-4">
        {blockTemplateGroups.map((group) => (
          <div key={group.label}>
            <p className="m-0 mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.templates.map((template) => {
                const Icon = template.icon
                return (
                  <button
                    aria-label={`Insert ${template.label} block`}
                    className="group flex min-h-[58px] items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-left transition hover:border-indigo-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canInsert}
                    key={template.id}
                    type="button"
                    onClick={() => onInsert(template)}
                  >
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-indigo-600/10 text-indigo-400 transition group-hover:bg-indigo-600 group-hover:text-white">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-white">{template.label}</span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">{template.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ValidationPanel({ parsed }: { parsed: ParsedEditorDocument }) {
  if (parsed.error) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
        <TriangleAlert size={15} className="mt-0.5 flex-shrink-0" />
        <span>{parsed.error}</span>
      </div>
    )
  }

  if (parsed.warnings.length > 0) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        {parsed.warnings.map((warning) => <p className="m-0" key={warning}>{warning}</p>)}
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
      <CheckCircle2 size={15} />
      Course document is valid for local preview.
    </div>
  )
}

function StatusBadge({ parsed }: { parsed: ParsedEditorDocument }) {
  if (parsed.error) {
    return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Invalid</span>
  }
  if (parsed.warnings.length > 0) {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Valid with warnings</span>
  }
  return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Valid</span>
}

function parseCourseDocumentJson(source: string): ParsedEditorDocument {
  try {
    const parsed = JSON.parse(source) as unknown
    const document = courseDocumentFromConfig(parsed)
    if (!document) {
      return { document: null, error: 'JSON must contain a Course document with a blocks array.', warnings: [] }
    }

    const blockIds = new Set<string>()
    const warnings: string[] = []
    if (document.schema_version !== 1) warnings.push('schema_version should be 1 for the current Course document schema.')
    if (document.blocks.length === 0) warnings.push('This Course document has no blocks yet.')

    for (const block of document.blocks) {
      if (!block.id || typeof block.id !== 'string') {
        return { document: null, error: `Every block needs a stable string id. Check block type "${block.type}".`, warnings: [] }
      }
      if (blockIds.has(block.id)) {
        return { document: null, error: `Duplicate block id: ${block.id}`, warnings: [] }
      }
      blockIds.add(block.id)

      const error = validateBlock(block)
      if (error) return { document: null, error, warnings: [] }
    }

    return { document, error: '', warnings }
  } catch (error) {
    return {
      document: null,
      error: error instanceof Error ? error.message : 'Invalid JSON.',
      warnings: [],
    }
  }
}

function validateBlock(block: CourseContentBlock) {
  switch (block.type) {
    case 'heading':
      return block.text ? '' : `Heading block "${block.id}" needs text.`
    case 'paragraph':
      return block.text ? '' : `Paragraph block "${block.id}" needs text.`
    case 'definition':
    case 'property':
      return block.title && block.body ? '' : `${block.type} block "${block.id}" needs title and body.`
    case 'formula':
      return block.latex ? '' : `Formula block "${block.id}" needs latex.`
    case 'callout':
      return block.body ? '' : `Callout block "${block.id}" needs body.`
    case 'component':
      if (typeof block.key !== 'string' || !block.key.trim()) {
        return `Component block "${block.id}" needs a string key.`
      }
      return isAllowedCourseComponentKey(block.key)
        ? ''
        : `Component block "${block.id}" uses a non-course key: ${block.key}`
    case 'image':
      return block.alt && (block.src || block.asset_key) ? '' : `Image block "${block.id}" needs alt and src or asset_key.`
    case 'cards':
      return Array.isArray(block.items) && block.items.length > 0 ? '' : `Cards block "${block.id}" needs at least one item.`
    case 'comparison':
      return Array.isArray(block.columns) && block.columns.length >= 2 ? '' : `Comparison block "${block.id}" needs at least two columns.`
    case 'steps':
      return Array.isArray(block.steps) && block.steps.length > 0 ? '' : `Steps block "${block.id}" needs at least one step.`
    case 'divider':
      return ''
    case 'list':
      return Array.isArray(block.items) && block.items.length > 0 ? '' : `List block "${block.id}" needs at least one item.`
    case 'table':
      return Array.isArray(block.columns) && block.columns.length > 0 && Array.isArray(block.rows)
        ? ''
        : `Table block "${block.id}" needs columns and rows.`
    case 'timeline':
      return Array.isArray(block.items) && block.items.length > 0 ? '' : `Timeline block "${block.id}" needs at least one item.`
    case 'equation_set':
      return Array.isArray(block.equations) && block.equations.length > 0 && block.equations.every((equation) => typeof equation.latex === 'string' && equation.latex.trim())
        ? ''
        : `Equation set block "${block.id}" needs at least one equation with latex.`
    case 'quote':
      return block.body ? '' : `Quote block "${block.id}" needs body.`
    case 'key_value_grid':
      return Array.isArray(block.items) && block.items.length > 0 ? '' : `Key value grid block "${block.id}" needs at least one item.`
    case 'code':
      return block.code ? '' : `Code block "${block.id}" needs code.`
    default:
      return `Unsupported block type: ${(block as { type: string }).type}`
  }
}

function findTopicItem(workspace: TopicWorkspace, itemId: number) {
  for (const section of workspace.sections ?? []) {
    const item = section.items?.find((candidate) => candidate.id === itemId)
    if (item) return item
  }
  return null
}

function isCourseTab(tab: TopicTab) {
  const type = tab.tab_type.toLowerCase()
  const label = tab.label.toLowerCase()
  return type === 'course' || label.includes('course')
}

function buildStarterCourseDocument(workspace: TopicWorkspace, item: TopicItem): CourseDocument {
  const documentId = `${workspace.slug ?? `topic-${workspace.id}`}/${slugify(item.title)}`
  return {
    id: documentId,
    schema_version: 1,
    blocks: [
      {
        id: 'heading-intro',
        type: 'heading',
        level: 2,
        text: item.title,
      },
      {
        id: 'paragraph-context',
        type: 'paragraph',
        text: item.description || "Ajoutez ici l'explication principale du cours.",
      },
      {
        id: 'definition-main',
        type: 'definition',
        title: 'Definition',
        body: 'Remplacez ce bloc par une definition courte et precise.',
      },
      {
        id: 'formula-main',
        type: 'formula',
        latex: 'N(t)=N_0 e^{-\\lambda t}',
        display: 'boxed',
        caption: 'Exemple de formule LaTeX',
      },
      {
        id: 'callout-units',
        type: 'callout',
        variant: 'warning',
        title: 'Attention',
        body: 'Utilisez $...$ pour les formules inline comme $\\lambda$.',
      },
      {
        id: 'method-main',
        type: 'list',
        style: 'check',
        title: 'Methode rapide',
        items: [
          { id: 'method-main-1', text: 'Identifier les grandeurs utiles.' },
          { id: 'method-main-2', text: 'Ecrire la relation en LaTeX.' },
          { id: 'method-main-3', text: 'Conclure avec les unites.' },
        ],
      },
      {
        id: 'visual-main',
        type: 'component',
        key: 'decay_law_graph',
        display: 'inline',
        props: {},
      },
    ],
  }
}

function documentFileBase(workspace: TopicWorkspace | null, item: TopicItem | null) {
  return [
    workspace?.slug || (workspace ? `topic-${workspace.id}` : 'topic'),
    item ? slugify(item.title) : 'course-document',
  ].join('__')
}

function slugify(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'item'
}

function buildTemplateBlock(template: CourseBlockTemplate, existingBlocks: CourseContentBlock[]) {
  const block = cloneRecord(template.block)
  const blockId = uniqueBlockId(template.id, existingBlocks)
  block.id = blockId
  addNestedTemplateIds(block, blockId)
  return block as CourseContentBlock
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function uniqueBlockId(baseId: string, existingBlocks: CourseContentBlock[]) {
  const existingIds = new Set(existingBlocks.map((block) => block.id))
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) index += 1
  return `${baseId}-${index}`
}

function addNestedTemplateIds(block: Record<string, unknown>, blockId: string) {
  const nestedCollections = [
    ['items', 'item'],
    ['columns', 'column'],
    ['steps', 'step'],
    ['equations', 'equation'],
  ] as const

  for (const [key, label] of nestedCollections) {
    const collection = block[key]
    if (!Array.isArray(collection)) continue
    block[key] = collection.map((item, index) => (
      isRecord(item)
        ? { ...item, id: typeof item.id === 'string' ? item.id : `${blockId}-${label}-${index + 1}` }
        : item
    ))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export const __courseContentEditorTestUtils = {
  parseCourseDocumentJson,
  normalizeCourseComponentKey,
  buildTemplateBlock,
}
