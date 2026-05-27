import type { MascotMood } from '@/components/KrescoMascot'

export function triggerMascot(mood: MascotMood, message: string) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent('kresco-mascot', { detail: { mood, message } }))
}
