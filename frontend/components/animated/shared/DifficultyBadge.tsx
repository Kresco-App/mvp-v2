export type ExerciseState = 'idle' | 'correct' | 'incorrect';
export type Difficulty = 'Facile' | 'Moyen' | 'Difficile';

const colors: Record<Difficulty, string> = {
  Facile: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Moyen: 'bg-amber-100 text-amber-700 border-amber-200',
  Difficile: 'bg-rose-100 text-rose-700 border-rose-200',
};

export function DifficultyBadge({ level }: { level: Difficulty }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${colors[level]}`}>
      {level}
    </span>
  );
}
