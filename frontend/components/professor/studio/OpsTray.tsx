'use client'

import { Plus, Pencil, FileText, ArrowUpDown, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { StudioOperation } from '@/lib/studio'
import { describeOperation } from '@/lib/studioDiff'

const OP_META: Record<string, { Icon: typeof Plus; className: string }> = {
  create: { Icon: Plus, className: 'bg-[#f0fdf4] text-[#16a34a]' },
  update_fields: { Icon: Pencil, className: 'bg-[#f0f0ff] text-[#5b60f9]' },
  update_content: { Icon: FileText, className: 'bg-[#f0f0ff] text-[#5b60f9]' },
  reorder: { Icon: ArrowUpDown, className: 'bg-[#fff7ed] text-[#f5900b]' },
  delete: { Icon: Trash2, className: 'bg-[#fef2f2] text-[#ef4444]' },
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
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${meta.className}`}
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
