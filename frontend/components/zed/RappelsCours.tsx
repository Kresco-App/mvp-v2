'use client'

import { useState } from 'react'
import { X, BookOpen, ChevronDown, ChevronRight, Search, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
  inline?: boolean
}

interface FormulaItem {
  label: string
  formula: string
  note?: string
}

interface FormulaCategory {
  title: string
  items: FormulaItem[]
}

interface Subject {
  id: string
  name: string
  categories: FormulaCategory[]
  pdfs?: { title: string; url: string }[]
}

const CHEAT_SHEETS: Subject[] = [
  {
    id: 'ondes',
    name: 'Physique — Ondes',
    pdfs: [
      { title: 'Résumé complet des Ondes', url: '#' },
      { title: 'Fiche d\'exercices types', url: '#' },
    ],
    categories: [
      {
        title: 'Formules fondamentales',
        items: [
          { label: 'Célérité', formula: 'v = λ × f', note: 'v en m/s, λ en m, f en Hz' },
          { label: 'Période / fréquence', formula: 'T = 1 / f', note: 'T en secondes' },
          { label: 'Longueur d\'onde', formula: 'λ = v × T', note: 'distance parcourue en une période' },
          { label: 'Fréquence / période', formula: 'f = 1 / T' },
        ],
      },
      {
        title: 'Types d\'ondes',
        items: [
          { label: 'Onde transversale', formula: 'Déplacement ⊥ propagation', note: 'ex: onde lumineuse, corde' },
          { label: 'Onde longitudinale', formula: 'Déplacement ∥ propagation', note: 'ex: onde sonore' },
          { label: 'Onde mécanique', formula: 'Nécessite un milieu matériel', note: 'ne se propage pas dans le vide' },
          { label: 'Célérité lumière', formula: 'c = 3 × 10⁸ m/s', note: 'dans le vide' },
        ],
      },
      {
        title: 'Son',
        items: [
          { label: 'Niveau sonore', formula: 'L = 10 × log(I / I₀)', note: 'I₀ = 10⁻¹² W/m²' },
          { label: 'Effet Doppler', formula: 'f\' = f × (v ± v_obs) / (v ∓ v_src)' },
        ],
      },
    ],
  },
  {
    id: 'mecanique',
    name: 'Physique — Mécanique',
    categories: [
      {
        title: 'Cinématique',
        items: [
          { label: 'Vitesse moyenne', formula: 'v = Δx / Δt' },
          { label: 'Accélération', formula: 'a = Δv / Δt', note: 'en m/s²' },
          { label: 'MRUA position', formula: 'x = x₀ + v₀t + ½at²' },
          { label: 'MRUA vitesse', formula: 'v = v₀ + at' },
          { label: 'v² (sans t)', formula: 'v² = v₀² + 2a(x - x₀)' },
        ],
      },
      {
        title: '2ème loi de Newton',
        items: [
          { label: 'Principe fondamental', formula: 'ΣF = m × a', note: 'en newtons' },
          { label: 'Poids', formula: 'P = m × g', note: 'g ≈ 9.81 m/s² (Maroc)' },
          { label: 'Travail', formula: 'W = F × d × cos(θ)', note: 'en joules' },
          { label: 'Énergie cinétique', formula: 'Ec = ½ × m × v²' },
          { label: 'Énergie potentielle', formula: 'Ep = m × g × h' },
        ],
      },
      {
        title: 'Oscillations',
        items: [
          { label: 'Pendule simple T', formula: 'T = 2π√(L/g)' },
          { label: 'Ressort T', formula: 'T = 2π√(m/k)', note: 'k : constante de raideur (N/m)' },
          { label: 'Pulsation', formula: 'ω = 2π / T = 2πf', note: 'en rad/s' },
        ],
      },
    ],
  },
  {
    id: 'chimie',
    name: 'Chimie',
    categories: [
      {
        title: 'Solutions',
        items: [
          { label: 'Concentration molaire', formula: 'C = n / V', note: 'n en mol, V en L' },
          { label: 'Quantité de matière', formula: 'n = m / M', note: 'M masse molaire g/mol' },
          { label: 'Dilution', formula: 'C₁V₁ = C₂V₂' },
          { label: 'pH', formula: 'pH = -log[H₃O⁺]' },
          { label: 'pH + pOH', formula: 'pH + pOH = 14 (à 25°C)' },
        ],
      },
      {
        title: 'Cinétique',
        items: [
          { label: 'Taux d\'avancement', formula: 'τ = x / x_max', note: '0 ≤ τ ≤ 1' },
          { label: 'Constante Ke', formula: 'Ke = [prod]^stœch / [réact]^stœch' },
        ],
      },
    ],
  },
  {
    id: 'maths',
    name: 'Mathématiques',
    categories: [
      {
        title: 'Dérivées',
        items: [
          { label: 'Dérivée xⁿ', formula: '(xⁿ)\' = n·xⁿ⁻¹' },
          { label: 'Dérivée eˣ', formula: '(eˣ)\' = eˣ' },
          { label: 'Dérivée ln(x)', formula: '(ln x)\' = 1/x' },
          { label: 'Dérivée sin(x)', formula: '(sin x)\' = cos x' },
          { label: 'Dérivée cos(x)', formula: '(cos x)\' = -sin x' },
          { label: 'Produit', formula: '(uv)\' = u\'v + uv\'' },
          { label: 'Quotient', formula: '(u/v)\' = (u\'v - uv\') / v²' },
        ],
      },
      {
        title: 'Primitives',
        items: [
          { label: '∫ xⁿ dx', formula: 'xⁿ⁺¹ / (n+1) + C' },
          { label: '∫ eˣ dx', formula: 'eˣ + C' },
          { label: '∫ 1/x dx', formula: 'ln|x| + C' },
          { label: '∫ sin x dx', formula: '-cos x + C' },
          { label: '∫ cos x dx', formula: 'sin x + C' },
        ],
      },
      {
        title: 'Suites',
        items: [
          { label: 'Suite arithmétique', formula: 'u_n = u₀ + n·r', note: 'r = raison' },
          { label: 'Somme arith.', formula: 'S = n · (u₀ + u_{n-1}) / 2' },
          { label: 'Suite géométrique', formula: 'u_n = u₀ × qⁿ', note: 'q = raison' },
          { label: 'Somme géom.', formula: 'S = u₀ × (1 - qⁿ) / (1 - q)', note: 'q ≠ 1' },
        ],
      },
    ],
  },
  {
    id: 'svt',
    name: 'SVT',
    categories: [
      {
        title: 'Génétique',
        items: [
          { label: 'ADN → ARNm', formula: 'Transcription (noyau)' },
          { label: 'ARNm → protéine', formula: 'Traduction (ribosome)' },
          { label: 'Réplication', formula: 'ADN → 2 × ADN (semi-conservatrice)' },
        ],
      },
      {
        title: 'Bioénergétique',
        items: [
          { label: 'Respiration cellulaire', formula: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP' },
          { label: 'Photosynthèse', formula: '6CO₂ + 6H₂O + lumière → C₆H₁₂O₆ + 6O₂' },
          { label: 'Fermentation', formula: 'Glucose → Acide lactique + ATP (sans O₂)' },
        ],
      },
    ],
  },
]

export default function RappelsCours({ onClose, inline = false }: Props) {
  const [selectedSubject, setSelectedSubject] = useState(CHEAT_SHEETS[0].id)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Formules fondamentales']))
  const [search, setSearch] = useState('')

  const subject = CHEAT_SHEETS.find(s => s.id === selectedSubject) ?? CHEAT_SHEETS[0]
  const hasPdfs = (subject.pdfs?.length ?? 0) > 0
  const pdfSlots = hasPdfs
    ? subject.pdfs!
    : [
      { title: 'PDF de rappel 1', url: '' },
      { title: 'PDF de rappel 2', url: '' },
    ]

  function toggleCategory(title: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const filteredCategories = search
    ? subject.categories.map(cat => ({
      ...cat,
      items: cat.items.filter(
        item =>
          item.label.toLowerCase().includes(search.toLowerCase()) ||
          item.formula.toLowerCase().includes(search.toLowerCase())
      ),
    })).filter(cat => cat.items.length > 0)
    : subject.categories

  return (
    <div className={cn(
      'flex flex-col bg-slate-900 border-l border-slate-800',
      inline ? 'h-full w-full' : 'fixed right-0 top-0 h-full w-80 z-[150] shadow-2xl'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-indigo-400" />
          <span className="text-white font-semibold text-sm">Rappels de Cours</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
          <X size={16} />
        </button>
      </div>

      {/* Subject tabs */}
      <div className="flex overflow-x-auto gap-1 px-3 py-2 border-b border-slate-800 flex-shrink-0 scrollbar-none">
        {CHEAT_SHEETS.map(s => (
          <button
            key={s.id}
            onClick={() => { setSelectedSubject(s.id); setSearch('') }}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition',
              selectedSubject === s.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            {s.name.split(' — ')[1] ?? s.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une formule..."
            className="w-full bg-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {!search && (
          <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-xl overflow-hidden mb-3">
            <div className="px-4 py-2 border-b border-indigo-500/10 bg-indigo-500/5">
              <span className="text-indigo-300 text-[11px] font-semibold uppercase tracking-wider">Documents PDF</span>
            </div>
            <div className="divide-y divide-indigo-500/10">
              {pdfSlots.map((pdf, i) => (
                pdf.url ? (
                  <a key={i} href={pdf.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition group">
                    <FileText size={16} className="text-indigo-400 group-hover:text-indigo-300 transition" />
                    <span className="text-slate-200 text-xs font-medium group-hover:text-white transition">{pdf.title}</span>
                  </a>
                ) : (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 text-slate-500">
                    <FileText size={16} className="text-slate-600" />
                    <span className="text-xs font-medium italic">{pdf.title} — emplacement libre</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {filteredCategories.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-8">Aucun résultat</p>
        )}
        {filteredCategories.map(cat => (
          <div key={cat.title} className="bg-slate-800/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleCategory(cat.title)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800 transition"
            >
              <span className="text-slate-200 text-xs font-semibold">{cat.title}</span>
              {expandedCategories.has(cat.title) || search
                ? <ChevronDown size={13} className="text-slate-500" />
                : <ChevronRight size={13} className="text-slate-500" />}
            </button>
            {(expandedCategories.has(cat.title) || search) && (
              <div className="divide-y divide-slate-700/50">
                {cat.items.map((item, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <p className="text-slate-400 text-[11px] mb-0.5">{item.label}</p>
                    <p className="text-indigo-300 font-mono text-sm font-medium">{item.formula}</p>
                    {item.note && (
                      <p className="text-slate-400 text-[10px] mt-0.5 italic">{item.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
        <p className="text-slate-400 text-[10px] text-center">
          {subject.categories.reduce((acc, c) => acc + c.items.length, 0)} formules · {subject.name}
        </p>
      </div>
    </div>
  )
}
