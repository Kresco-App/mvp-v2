'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Copy, FlaskConical, Trash2, MoveRight, Wand2 } from 'lucide-react'
import type { WorkChapter, WorkLesson, WorkTab } from '@/lib/studio'
import { defaultConfigFor, findSimulator, type SimulatorParam } from '@/lib/simulatorCatalog'

const labelClass = 'mb-1.5 block text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]'
const inspectorControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const inputClass =
  'w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2 text-[14px] font-semibold text-[#3f3f46] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus:border-[#5b60f9] motion-reduce:transition-none'
const selectClass = inputClass + ' appearance-none cursor-pointer'
const SimulatorLibrary = dynamic(() => import('./SimulatorLibrary'), { ssr: false })

const TIER_OPTIONS = [
  { value: '', label: 'Gratuit / inclus' },
  { value: 'pro', label: 'Pro' },
  { value: 'vip', label: 'VIP' },
]
const ITEM_TYPE_OPTIONS = [
  { value: 'lesson_video', label: 'Vidéo de cours' },
  { value: 'checkpoint_quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Devoir' },
  { value: 'exam_extract', label: "Extrait d'examen" },
  { value: 'lesson', label: 'Leçon' },
]
const TAB_TYPE_OPTIONS = [
  { value: 'course', label: 'Cours' },
  { value: 'lab', label: 'Lab / Simulateur' },
  { value: 'resources', label: 'Ressources' },
  { value: 'notes', label: 'Notes' },
  { value: 'comments', label: 'Commentaires' },
]
// Lessons that typically carry a primary VdoCipher video.
const VIDEO_ITEM_TYPES = new Set(['lesson_video', 'lesson'])

export type Selection =
  | { type: 'chapter'; node: WorkChapter }
  | { type: 'lesson'; node: WorkLesson; chapterKey: string }
  | { type: 'tab'; node: WorkTab; lessonKey: string }
  | null

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-10 w-[52px] rounded-full border-[2px] ${inspectorControlMotionClass} ${
        value ? 'border-[#5b60f9] bg-[#5b60f9]' : 'border-[#e4e4e7] bg-[#f4f4f5]'
      }`}
    >
      <span
        className={`absolute left-[4px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[transform] duration-150 ease-out motion-reduce:transition-none ${
          value ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const TEXT_TAB_TYPES = new Set(['course', 'summary', 'text'])

function SimulatorParamField({
  param,
  value,
  onChange,
}: {
  param: SimulatorParam
  value: unknown
  onChange: (value: unknown) => void
}) {
  const fieldValue = value ?? param.default

  if (param.type === 'number') {
    return (
      <Field label={`${param.label}${param.unit ? ` (${param.unit})` : ''}`}>
        <input
          className={inputClass}
          min={param.min}
          max={param.max}
          step={param.step}
          type="number"
          value={Number(fieldValue)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </Field>
    )
  }

  if (param.type === 'select') {
    return (
      <Field label={param.label}>
        <select className={selectClass} value={String(fieldValue)} onChange={(e) => onChange(e.target.value)}>
          {param.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>
    )
  }

  return (
    <Field label={param.label}>
      <input className={inputClass} value={String(fieldValue)} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export default function Inspector({
  selection,
  chapters,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  selection: Selection
  chapters: WorkChapter[]
  onChange: (patch: Record<string, unknown>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (targetParentKey: string) => void
}) {
  const [libOpen, setLibOpen] = useState(false)

  if (!selection) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-[15px] font-black text-[#3f3f46]">Aucune sélection</p>
          <p className="mt-1 text-pretty text-[13px] font-semibold text-[#a1a1aa]">
            Sélectionnez un chapitre, une leçon ou un onglet pour le modifier.
          </p>
        </div>
      </div>
    )
  }

  const { type, node } = selection
  const typeLabel = type === 'chapter' ? 'Chapitre' : type === 'lesson' ? 'Leçon' : 'Onglet'
  const selectedSimulator = type === 'tab' && node.tab_type === 'lab' ? findSimulator(node.renderer_key) : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#f4f4f5] px-5 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.06em] text-[#5b60f9]">{typeLabel}</p>
          <p className="text-[15px] font-black text-[#3f3f46]">Propriétés</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className={`grid h-10 w-10 place-items-center rounded-[12px] border-[2px] border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#5b60f9] hover:text-[#5b60f9] ${inspectorControlMotionClass}`}
            title="Dupliquer"
            aria-label="Dupliquer la selection"
          >
            <Copy size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={`grid h-10 w-10 place-items-center rounded-[12px] border-[2px] border-[#fecaca] bg-white text-[#ef4444] hover:bg-red-50 ${inspectorControlMotionClass}`}
            title="Supprimer"
            aria-label="Supprimer la selection"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {type === 'tab' ? (
          <Field label="Libellé de l’onglet">
            <input className={inputClass} value={node.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
        ) : (
          <Field label="Titre">
            <input className={inputClass} value={(node as WorkChapter | WorkLesson).title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
        )}

        {type === 'tab' && (
          <Field label="Type d’onglet">
            <select className={selectClass} value={node.tab_type} onChange={(e) => onChange({ tab_type: e.target.value })}>
              {TAB_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}

        {type === 'lesson' && (
          <>
            <Field label="Type de leçon">
              <select className={selectClass} value={node.item_type} onChange={(e) => onChange({ item_type: e.target.value })}>
                {ITEM_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Durée (minutes)">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={Math.round((node.duration_seconds || 0) / 60)}
                onChange={(e) => onChange({ duration_seconds: Math.max(0, Number(e.target.value)) * 60 })}
                placeholder="0"
              />
            </Field>
            {VIDEO_ITEM_TYPES.has(node.item_type) && (
              <Field label="Vidéo VdoCipher (ID)">
                <input
                  className={inputClass}
                  value={node.video_id}
                  onChange={(e) => onChange({ video_id: e.target.value.trim() })}
                  placeholder="ex : a1b2c3d4e5f6…"
                />
                <p className="mt-1 text-[11px] font-semibold text-[#a1a1aa]">
                  Identifiant « Video ID » du tableau de bord VdoCipher. C’est la vidéo principale de la leçon.
                </p>
              </Field>
            )}
          </>
        )}

        {(type === 'chapter' || type === 'lesson') && (
          <>
            <Field label="Description">
              <textarea
                className={`${inputClass} min-h-[88px] resize-y leading-relaxed`}
                value={(node as WorkChapter | WorkLesson).description}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-[12px] border-[2px] border-[#e4e4e7] px-3 py-2.5">
              <span className="text-[13px] font-bold text-[#3f3f46]">Aperçu gratuit</span>
              <Toggle
                value={(node as WorkChapter | WorkLesson).is_free_preview}
                onChange={(v) => onChange({ is_free_preview: v })}
              />
            </div>
            <Field label="Palier requis">
              <select
                className={selectClass}
                value={(node as WorkChapter | WorkLesson).required_tier}
                onChange={(e) => onChange({ required_tier: e.target.value })}
              >
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {type === 'tab' && TEXT_TAB_TYPES.has(node.tab_type) && (
          <Field label="Contenu (texte)">
            <textarea
              className={`${inputClass} min-h-[160px] resize-y leading-relaxed`}
              value={node.content}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder="Texte du cours, résumé, énoncé…"
            />
          </Field>
        )}

        {type === 'tab' && node.tab_type === 'resources' && (
          <>
            <Field label="Description">
              <textarea
                className={`${inputClass} min-h-[80px] resize-y leading-relaxed`}
                value={node.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Description de la ressource…"
              />
            </Field>
            <Field label="URL de la ressource (PDF, document)">
              <input
                className={inputClass}
                value={node.resource_url}
                onChange={(e) => onChange({ resource_url: e.target.value })}
                placeholder="https://…"
              />
            </Field>
          </>
        )}

        {type === 'tab' && node.tab_type === 'lab' && (
          <>
            <Field label="Simulateur">
              <button
                type="button"
                onClick={() => setLibOpen(true)}
                className={`flex min-h-10 w-full items-center gap-2.5 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2.5 text-left hover:border-[#5b60f9] ${inspectorControlMotionClass}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#f0f0ff] text-[#5b60f9]">
                  <FlaskConical size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-black text-[#3f3f46]">
                    {findSimulator(node.renderer_key)?.title ?? 'Choisir un simulateur'}
                  </span>
                  <span className="block text-[11px] font-semibold text-[#a1a1aa]">
                    {node.renderer_key ? findSimulator(node.renderer_key)?.category ?? node.renderer_key : 'Aucun simulateur sélectionné'}
                  </span>
                </span>
                <Wand2 size={15} className="shrink-0 text-[#a1a1aa]" aria-hidden="true" />
              </button>
            </Field>

            {selectedSimulator && selectedSimulator.params.length > 0 && (
              <div className="grid gap-3 rounded-[12px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc] p-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.06em] text-[#5b60f9]">Parametres du simulateur</p>
                  <p className="mt-0.5 text-[12px] font-semibold leading-snug text-[#a1a1aa]">{selectedSimulator.description}</p>
                </div>
                {selectedSimulator.params.map((param) => (
                  <SimulatorParamField
                    key={param.key}
                    param={param}
                    value={node.config[param.key]}
                    onChange={(value) => onChange({ config: { ...node.config, [param.key]: value } })}
                  />
                ))}
              </div>
            )}

            <Field label="Consigne (optionnel)">
              <textarea
                className={`${inputClass} min-h-[70px] resize-y leading-relaxed`}
                value={node.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Instructions affichées au-dessus du simulateur…"
              />
            </Field>
          </>
        )}

        {type === 'tab' && node.tab_type === 'notes' && (
          <div className="rounded-[12px] border-[2px] border-dashed border-[#e4e4e7] px-3 py-4 text-[12.5px] font-semibold leading-relaxed text-[#a1a1aa]">
            L’onglet Notes est un espace personnel de l’élève. Aucun contenu à configurer ici.
          </div>
        )}

        {type === 'tab' && node.tab_type === 'comments' && (
          <div className="rounded-[12px] border-[2px] border-dashed border-[#e4e4e7] px-3 py-4 text-[12.5px] font-semibold leading-relaxed text-[#a1a1aa]">
            L’onglet Commentaires est un espace de discussion géré automatiquement. Aucun contenu à configurer ici.
          </div>
        )}

        {type === 'lesson' && (
          <Field label="Déplacer vers un autre chapitre">
            <div className="flex items-center gap-2">
              <MoveRight size={16} className="shrink-0 text-[#a1a1aa]" />
              <select
                className={selectClass}
                value={selection.chapterKey}
                onChange={(e) => onMove(e.target.value)}
              >
                {chapters.map((c) => (
                  <option key={c.key} value={c.key}>{c.title}</option>
                ))}
              </select>
            </div>
          </Field>
        )}

        {type === 'tab' && (
          <Field label="Déplacer vers une autre leçon">
            <div className="flex items-center gap-2">
              <MoveRight size={16} className="shrink-0 text-[#a1a1aa]" />
              <select className={selectClass} value={selection.lessonKey} onChange={(e) => onMove(e.target.value)}>
                {chapters.flatMap((c) =>
                  c.lessons.map((l) => (
                    <option key={l.key} value={l.key}>{c.title} · {l.title}</option>
                  )),
                )}
              </select>
            </div>
          </Field>
        )}
      </div>

      {type === 'tab' && libOpen && (
        <SimulatorLibrary
          open={libOpen}
          currentKey={node.renderer_key}
          onClose={() => setLibOpen(false)}
          onSelect={(key) => onChange({ renderer_key: key, tab_type: 'lab', config: defaultConfigFor(key) })}
        />
      )}
    </div>
  )
}
