'use client'

/**
 * OndePropagation — Interactive wave propagation activity.
 *
 * Activity data shape:
 * {
 *   question: "Reliez chaque type d'onde à sa description",
 *   pairs: [
 *     { id: "transversale", left: "Onde transversale", right: "Le déplacement est perpendiculaire à la propagation" },
 *     { id: "longitudinale", left: "Onde longitudinale", right: "Le déplacement est parallèle à la propagation" },
 *     { id: "mecanique", left: "Onde mécanique", right: "Nécessite un milieu matériel pour se propager" },
 *     { id: "em", left: "Onde électromagnétique", right: "Se propage dans le vide" },
 *   ]
 * }
 */

import Matching from '../Matching'

interface Props {
  question?: string
  pairs?: { id: string; left: string; right: string }[]
  onComplete?: (correct: boolean) => void
}

const DEFAULT_PAIRS = [
  { id: 'transversale', left: 'Onde transversale', right: 'Le déplacement est ⊥ à la propagation' },
  { id: 'longitudinale', left: 'Onde longitudinale', right: 'Le déplacement est ∥ à la propagation' },
  { id: 'mecanique', left: 'Onde mécanique', right: 'Nécessite un milieu matériel' },
  { id: 'em', left: 'Onde électromagnétique', right: 'Se propage dans le vide (c = 3×10⁸ m/s)' },
]

export default function OndePropagation({ question, pairs, onComplete }: Props) {
  return (
    <Matching
      question={question ?? 'Associez chaque type d\'onde à sa caractéristique de propagation'}
      pairs={pairs ?? DEFAULT_PAIRS}
      onComplete={onComplete}
    />
  )
}
