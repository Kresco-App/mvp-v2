'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

export function SourceComponentFallback() {
  return (
    <div
      aria-label="Loading interactive component"
      className="min-h-[180px] motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[16px] border border-[#e4e4e7] bg-[#f8fafc] p-5"
    >
      <div className="h-4 w-40 rounded-full bg-[#e4e4e7]" />
      <div className="mt-5 grid gap-3">
        <div className="h-12 rounded-[12px] bg-white" />
        <div className="h-12 rounded-[12px] bg-white" />
        <div className="h-12 w-2/3 rounded-[12px] bg-white" />
      </div>
    </div>
  )
}

export function lazySourceComponent(
  loader: () => Promise<ComponentType<any>>,
): ComponentType<any> {
  return dynamic(loader, {
    loading: SourceComponentFallback,
    ssr: false,
  }) as ComponentType<any>
}
