'use client'

import { Plus, Pencil, FileText, ArrowUpDown, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { StudioOperation } from '@/lib/studio'
import { describeOperation } from '@/lib/studioDiff'

const OP_META: Record<string, { Icon: typeof Plus; color: string; bg: string }> = {
  create: { Icon: Plus, color: '#16a34a', bg: '#f0fdf4' },
  update_fields: { Icon: Pencil, color: '#5b60f9', bg: '#f0f0ff' },
  update_content: { Icon: FileText, color: '#5b60f9', bg: '#f0f0ff' },
  reorder: { Icon: ArrowUpDown, color: '#f5900b', bg: '#fff7ed' },
  delete: { Icon: Trash2, color: '#ef4444', bg: '#fef2f2' },
}

export default function OpsTray({ operations }: { operations: StudioOperation[] }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border-t-[2px] border-[#e4e4e7] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black uppercase tracking-[0.04em] text-[#3f3f46]">
            Modifications en attente
          </span>
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#5b60f9] px-2 text-[12px] font-black text-white">
            {operations.length}
          </span>
        </div>
        {open ? <ChevronDown size={18} className="text-[#a1a1aa]" /> : <ChevronUp size={18} className="text-[#a1a1aa]" />}
      </button>
      {open && (
        <div className="max-h-[180px] overflow-y-auto px-5 pb-4">
          {operations.length === 0 ? (
            <p className="py-3 text-[13px] font-semibold text-[#a1a1aa]">
              Aucune modification. Glissez, créez ou éditez pour commencer.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {operations.map((op, i) => {
                const meta = OP_META[op.op_type] ?? OP_META.update_fields
                const { Icon } = meta
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-[10px] border border-[#f4f4f5] px-3 py-2"
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="text-[13px] font-bold text-[#3f3f46]">{describeOperation(op)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
