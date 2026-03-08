'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'kresco-theme'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const initialTheme: Theme = saved === 'light' || saved === 'dark' ? saved : 'dark'
    setTheme(initialTheme)
    applyTheme(initialTheme)
    setMounted(true)
  }, [])

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem(STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
  }

  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed bottom-5 right-5 z-[120] inline-flex h-11 items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 text-xs font-semibold text-slate-200 shadow-lg transition hover:border-kresco/50 hover:text-white"
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
