import { Calculator, Atom, Dna, BookOpen, Globe, Brain, BookMarked, BarChart3, Monitor, Landmark } from 'lucide-react'

export const SUBJECT_ICONS: Record<string, { icon: any; color: string; bg: string; emoji: string }> = {
  'Mathematiques': { icon: Calculator, color: 'text-indigo-600', bg: 'bg-indigo-50', emoji: '📐' },
  'Physique': { icon: Atom, color: 'text-emerald-600', bg: 'bg-emerald-50', emoji: '⚗️' },
  'Sciences de la Vie': { icon: Dna, color: 'text-orange-600', bg: 'bg-orange-50', emoji: '🧬' },
  'Francaise': { icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50', emoji: '📖' },
  'Histoire': { icon: Globe, color: 'text-teal-600', bg: 'bg-teal-50', emoji: '🌍' },
  'Philosophie': { icon: Brain, color: 'text-amber-600', bg: 'bg-amber-50', emoji: '🤔' },
  'Arabe': { icon: BookMarked, color: 'text-rose-600', bg: 'bg-rose-50', emoji: '📜' },
  'Economiques': { icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50', emoji: '📊' },
  'Informatique': { icon: Monitor, color: 'text-violet-600', bg: 'bg-violet-50', emoji: '💻' },
  'Islamique': { icon: Landmark, color: 'text-green-600', bg: 'bg-green-50', emoji: '🕌' },
}

export function findSubjectIcon(title: string) {
  const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const entry = Object.entries(SUBJECT_ICONS).find(([key]) =>
    normalized.includes(key.toLowerCase())
  )
  return entry?.[1] ?? { icon: BookOpen, color: 'text-slate-500', bg: 'bg-slate-50', emoji: '📚' }
}
