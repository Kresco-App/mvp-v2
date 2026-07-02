'use client'

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { APP_TOASTER_REQUEST_EVENT } from '@/lib/lazyToast'

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
    let loadStarted = false

    const load = () => {
      if (loadStarted) return
      loadStarted = true
      void import('sonner').then((mod) => {
        if (alive) setToaster(() => mod.Toaster as ToasterComponent)
      })
    }

    window.addEventListener(APP_TOASTER_REQUEST_EVENT, load)
    load()

    return () => {
      alive = false
      window.removeEventListener(APP_TOASTER_REQUEST_EVENT, load)
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
