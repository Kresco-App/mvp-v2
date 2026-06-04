export const DEFAULT_SUBJECT_SHORTCUT_KEYS = ['math', 'physics', 'chemistry', 'philosophy', 'biology', 'english'] as const

const COURSE_SUBJECT_TITLES: Record<string, string> = {
  math: 'Mathematiques',
  physics: 'Physique-Chimie',
  chemistry: 'Chimie',
  philosophy: 'Philosophie',
  geography: 'Geographie',
  biology: 'SVT',
  english: 'Anglais',
}

const PROFILE_SUBJECT_TITLES: Record<string, string> = {
  ...COURSE_SUBJECT_TITLES,
  math: 'Mathematiques',
}

export function normalizeSubjectTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function subjectKey(title: string) {
  const normalized = normalizeSubjectTitle(title)
  if (!normalized) return 'subject'

  if (['math', 'maths', 'mathematics', 'mathematique', 'mathematiques'].includes(normalized)) return 'math'
  if (
    normalized.includes('physique chimie')
    || normalized.includes('physics chemistry')
    || normalized.includes('physique')
    || normalized.includes('physics')
    || normalized === 'phys'
  ) return 'physics'
  if (normalized.includes('chemistry') || normalized.includes('chimie') || normalized === 'chem') return 'chemistry'
  if (normalized.includes('philosophy') || normalized.includes('philosophie') || normalized.includes('philo')) return 'philosophy'
  if (normalized.includes('geography') || normalized.includes('geographie') || normalized === 'geo') return 'geography'
  if (
    normalized.includes('sciences de la vie')
    || normalized.includes('science de la vie')
    || normalized === 'svt'
    || normalized.includes('biology')
    || normalized.includes('biologie')
    || normalized === 'bio'
  ) return 'biology'
  if (normalized.includes('english') || normalized.includes('anglais')) return 'english'

  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'subject'
}

export function canonicalSubjectTitle(title: string) {
  const key = subjectKey(title)
  return COURSE_SUBJECT_TITLES[key] ?? title
}

export function canonicalProfileSubjectTitle(title: string) {
  const key = subjectKey(title)
  return PROFILE_SUBJECT_TITLES[key] ?? title
}

export function canonicalSubject(title: string) {
  const key = subjectKey(title)
  return {
    key,
    title: canonicalProfileSubjectTitle(title),
  }
}
