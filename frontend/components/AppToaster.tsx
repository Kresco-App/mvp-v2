'use client'

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'

type ToasterComponent = ComponentType<{
  position?: 'top-right'
  richColors?: boolean
  closeButton?: boolean
  toastOptions?: { duration?: number }
  expand?: boolean
  visibleToasts?: number
}>

export default function AppToaster() {
  const [Toaster, setToaster] = useState<ToasterComponent | null>(null)

  useEffect(() => {
    let alive = true

    const load = () => {
      void import('sonner').then((mod) => {
        if (alive) setToaster(() => mod.Toaster as ToasterComponent)
      })
    }

    const timeoutId = window.setTimeout(load, 500)
    return () => {
      alive = false
      window.clearTimeout(timeoutId)
    }
  }, [])

  if (!Toaster) return null

  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{ duration: 3000 }}
      expand={false}
      visibleToasts={3}
    />
  )
}
