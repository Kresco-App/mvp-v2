'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
  inline?: boolean
}

interface FormulaItem {
  label: string
  formula: string
  note?: string
  keywords?: string[]
}

interface FormulaCategory {
  title: string
  items: FormulaItem[]
}

interface Subject {
  id: string
  name: string
  shortName: string
  categories: FormulaCategory[]
}

const CHEAT_SHEETS: Subject[] = [
  {
    id: 'maths',
    name: 'Mathematiques',
    shortName: 'Maths',
    categories: [
      {
        title: 'Analyse',
        items: [
          { label: 'Nombre derive', formula: "f'(a) = lim[h->0] (f(a+h) - f(a)) / h", note: 'Pente de la tangente en a', keywords: ['derivee', 'tangente'] },
          { label: 'Tangente en a', formula: "y = f'(a)(x - a) + f(a)" },
          { label: 'Derivee de u^n', formula: "(u^n)' = n u' u^(n-1)" },
          { label: 'Derivee de e^u', formula: "(e^u)' = u'e^u" },
          { label: 'Derivee de ln u', formula: "(ln u)' = u' / u", note: 'u > 0' },
          { label: 'Produit', formula: "(uv)' = u'v + uv'" },
          { label: 'Quotient', formula: "(u/v)' = (u'v - uv') / v^2", note: 'v != 0' },
          { label: 'Integration par parties', formula: 'int u v\' dx = uv - int u\' v dx' },
        ],
      },
      {
        title: 'Suites',
        items: [
          { label: 'Suite arithmetique', formula: 'u_n = u_0 + nr', note: 'r : raison' },
          { label: 'Somme arithmetique', formula: 'S_n = (n + 1)(u_0 + u_n) / 2' },
          { label: 'Suite geometrique', formula: 'u_n = u_0 q^n', note: 'q : raison' },
          { label: 'Somme geometrique', formula: 'S_n = u_0(1 - q^(n+1)) / (1 - q)', note: 'q != 1' },
          { label: 'Limite geometrique', formula: '|q| < 1 => q^n -> 0' },
        ],
      },
      {
        title: 'Probabilites',
        items: [
          { label: 'Probabilite conditionnelle', formula: 'P_A(B) = P(A inter B) / P(A)', note: 'P(A) != 0' },
          { label: 'Formule des probabilites totales', formula: 'P(B) = sum P(A_i)P_Ai(B)' },
          { label: 'Independance', formula: 'P(A inter B) = P(A)P(B)' },
          { label: 'Loi binomiale', formula: 'P(X = k) = C(n,k) p^k (1-p)^(n-k)' },
          { label: 'Esperance binomiale', formula: 'E(X) = np ; V(X) = np(1-p)' },
        ],
      },
      {
        title: 'Geometrie et complexes',
        items: [
          { label: 'Distance AB', formula: 'AB = sqrt((xB - xA)^2 + (yB - yA)^2)' },
          { label: 'Produit scalaire', formula: 'u.v = ||u|| ||v|| cos(theta) = xx\' + yy\'' },
          { label: 'Module', formula: '|z| = sqrt(a^2 + b^2)', note: 'z = a + ib' },
          { label: 'Forme trigonometrique', formula: 'z = r(cos theta + i sin theta)' },
          { label: 'Formule de Moivre', formula: '[r(cos theta + i sin theta)]^n = r^n(cos ntheta + i sin ntheta)' },
        ],
      },
    ],
  },
  {
    id: 'physique',
    name: 'Physique',
    shortName: 'Physique',
    categories: [
      {
        title: 'Mecanique',
        items: [
          { label: 'Vitesse moyenne', formula: 'v = Delta x / Delta t' },
          { label: 'Acceleration', formula: 'a = Delta v / Delta t', note: 'm.s^-2' },
          { label: 'Mouvement uniformement varie', formula: 'x = x0 + v0t + (1/2)at^2' },
          { label: 'Relation sans temps', formula: 'v^2 = v0^2 + 2a(x - x0)' },
          { label: 'Deuxieme loi de Newton', formula: 'sum F_ext = ma' },
          { label: 'Poids', formula: 'P = mg', note: 'g ~= 9,81 m.s^-2' },
          { label: 'Travail force constante', formula: 'W_AB(F) = F.AB.cos(theta)' },
          { label: 'Energie cinetique', formula: 'Ec = (1/2)mv^2' },
          { label: 'Energie potentielle pesanteur', formula: 'Epp = mgz' },
          { label: 'Theoreme de l energie cinetique', formula: 'Delta Ec = sum W(F_ext)' },
        ],
      },
      {
        title: 'Electricite',
        items: [
          { label: 'Loi d Ohm', formula: 'U = RI' },
          { label: 'Puissance electrique', formula: 'P = UI = RI^2 = U^2/R' },
          { label: 'Energie electrique', formula: 'E = Pt = UIt' },
          { label: 'Condensateur', formula: 'q = Cu' },
          { label: 'Energie d un condensateur', formula: 'E = (1/2)Cu^2' },
          { label: 'Circuit RC charge', formula: 'uC(t) = E(1 - e^(-t/RC))', note: 'tau = RC' },
          { label: 'Circuit RC decharge', formula: 'uC(t) = U0 e^(-t/RC)' },
        ],
      },
      {
        title: 'Ondes et optique',
        items: [
          { label: 'Celerite', formula: 'v = lambda f = lambda / T' },
          { label: 'Frequence', formula: 'f = 1 / T' },
          { label: 'Indice optique', formula: 'n = c / v' },
          { label: 'Refraction', formula: 'n1 sin i1 = n2 sin i2' },
          { label: 'Lentille mince', formula: '1/f\' = 1/OA\' - 1/OA' },
          { label: 'Grandissement', formula: 'gamma = A\'B\' / AB = OA\' / OA' },
        ],
      },
      {
        title: 'Nucleaire',
        items: [
          { label: 'Defaut de masse', formula: 'Delta m = Zmp + (A-Z)mn - m(noyau)' },
          { label: 'Energie de liaison', formula: 'El = Delta m c^2' },
          { label: 'Decroissance radioactive', formula: 'N(t) = N0 e^(-lambda t)' },
          { label: 'Activite', formula: 'A = lambda N' },
          { label: 'Demi-vie', formula: 't1/2 = ln 2 / lambda' },
        ],
      },
    ],
  },
  {
    id: 'chimie',
    name: 'Chimie',
    shortName: 'Chimie',
    categories: [
      {
        title: 'Quantites et solutions',
        items: [
          { label: 'Quantite de matiere', formula: 'n = m / M' },
          { label: 'Volume molaire', formula: 'n = V / Vm', note: 'gaz' },
          { label: 'Concentration molaire', formula: 'C = n / V', note: 'V en L' },
          { label: 'Concentration massique', formula: 'Cm = m / V' },
          { label: 'Dilution', formula: 'C1V1 = C2V2' },
          { label: 'Avancement final', formula: 'n_i(final) = n_i(initial) + nu_i x_f' },
        ],
      },
      {
        title: 'Acide-base',
        items: [
          { label: 'pH', formula: 'pH = -log[H3O+]' },
          { label: 'Concentration en H3O+', formula: '[H3O+] = 10^(-pH)' },
          { label: 'Produit ionique de l eau', formula: 'Ke = [H3O+][HO-] = 10^-14', note: 'a 25 deg C' },
          { label: 'pKa', formula: 'pKa = -log Ka' },
          { label: 'Henderson-Hasselbalch', formula: 'pH = pKa + log([base] / [acide])' },
          { label: 'Equivalence titrage', formula: 'n(acide) / a = n(base) / b' },
        ],
      },
      {
        title: 'Cinetique et equilibres',
        items: [
          { label: 'Vitesse volumique', formula: 'v = (1/V) dx/dt' },
          { label: 'Temps de demi-reaction', formula: 'x(t1/2) = x_f / 2' },
          { label: 'Quotient reactionnel', formula: 'Qr = prod([produits]^nu) / prod([reactifs]^nu)' },
          { label: 'Constante d equilibre', formula: 'K = Qr,eq' },
          { label: 'Taux d avancement', formula: 'tau = x_f / x_max' },
        ],
      },
      {
        title: 'Oxydoreduction',
        items: [
          { label: 'Oxydant / reducteur', formula: 'Ox + ne- = Red' },
          { label: 'Quantite d electricite', formula: 'Q = It = n(e-)F' },
          { label: 'Faraday', formula: 'F ~= 9,65 x 10^4 C.mol^-1' },
          { label: 'Relation piles', formula: 'E = E(cathode) - E(anode)' },
        ],
      },
    ],
  },
  {
    id: 'svt',
    name: 'Sciences de la vie et de la Terre',
    shortName: 'SVT',
    categories: [
      {
        title: 'Genetique',
        items: [
          { label: 'Replication', formula: 'ADN -> 2 ADN identiques', note: 'Semi-conservative' },
          { label: 'Transcription', formula: 'ADN -> ARNm', note: 'Dans le noyau' },
          { label: 'Traduction', formula: 'ARNm -> proteine', note: 'Au ribosome' },
          { label: 'Codon', formula: '3 nucleotides -> 1 acide amine' },
          { label: 'Brassage interchromosomique', formula: '2^n combinaisons possibles', note: 'n paires de chromosomes' },
          { label: 'Test-cross', formula: 'Individu teste x homozygote recessif' },
        ],
      },
      {
        title: 'Immunologie',
        items: [
          { label: 'Reaction specifique', formula: 'Antigene + anticorps -> complexe immun' },
          { label: 'Selection clonale', formula: 'LB specifique -> plasmocytes + LB memoire' },
          { label: 'LT cytotoxiques', formula: 'LT8 -> LTc -> destruction cellules infectees' },
          { label: 'Vaccination', formula: 'Antigene attenue/inactif -> memoire immunitaire' },
        ],
      },
      {
        title: 'Neurophysiologie',
        items: [
          { label: 'Potentiel de repos', formula: 'Interieur negatif (~ -70 mV)' },
          { label: 'Potentiel d action', formula: 'Depolarisation -> repolarisation -> hyperpolarisation' },
          { label: 'Synapse chimique', formula: 'PA -> neurotransmetteur -> recepteur postsynaptique' },
          { label: 'Message nerveux', formula: 'Intensite codee par la frequence des PA' },
        ],
      },
      {
        title: 'Geologie',
        items: [
          { label: 'Vitesse d expansion', formula: 'v = distance / age' },
          { label: 'Datation relative', formula: 'Superposition, recoupement, inclusion, continuite' },
          { label: 'Subduction', formula: 'Lithosphere oceanique dense plonge sous une plaque' },
          { label: 'Anomalies magnetiques', formula: 'Bandes symetriques autour de la dorsale' },
        ],
      },
    ],
  },
]

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export default function RappelsCours({ onClose, inline = false }: Props) {
  const [selectedSubject, setSelectedSubject] = useState(CHEAT_SHEETS[0].id)
  const [search, setSearch] = useState('')

  const subject = CHEAT_SHEETS.find(s => s.id === selectedSubject) ?? CHEAT_SHEETS[0]
  const searchTerm = normalize(search.trim())

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return subject.categories

    return subject.categories
      .map(category => ({
        ...category,
        items: category.items.filter(item => {
          const haystack = normalize([
            subject.name,
            subject.shortName,
            category.title,
            item.label,
            item.formula,
            item.note,
            ...(item.keywords ?? []),
          ].filter(Boolean).join(' '))

          return haystack.includes(searchTerm)
        }),
      }))
      .filter(category => category.items.length > 0)
  }, [searchTerm, subject])

  const formulaCount = subject.categories.reduce((acc, category) => acc + category.items.length, 0)

  return (
    <div className={cn(
      'flex flex-col bg-white text-slate-950 border-l border-slate-200',
      inline ? 'h-full w-full' : 'fixed right-0 top-0 h-full w-96 max-w-[100vw] z-[150] shadow-xl'
    )}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={15} className="text-slate-700 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">Rappels de cours</p>
            <p className="text-[11px] text-slate-500 leading-tight">{formulaCount} formules Bac</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
          aria-label="Fermer les rappels"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 flex-shrink-0">
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
          {CHEAT_SHEETS.map(item => (
            <button
              key={item.id}
              onClick={() => { setSelectedSubject(item.id); setSearch('') }}
              className={cn(
                'flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition',
                selectedSubject === item.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950'
              )}
            >
              {item.shortName}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={`Rechercher dans ${subject.shortName}`}
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-950 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredCategories.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">Aucun resultat</p>
        ) : (
          <div className="space-y-4">
            {filteredCategories.map(category => (
              <section key={category.title}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.items.map(item => (
                    <div key={`${category.title}-${item.label}`} className="grid grid-cols-[minmax(84px,0.9fr)_minmax(130px,1.2fr)] gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <p className="text-[11px] font-medium leading-snug text-slate-700">{item.label}</p>
                      <div className="min-w-0">
                        <p className="break-words font-mono text-[12px] font-semibold leading-snug text-slate-950">{item.formula}</p>
                        {item.note && (
                          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{item.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
