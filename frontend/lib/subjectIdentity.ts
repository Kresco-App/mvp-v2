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

const SUBJECT_IDENTITY_CACHE_MAX = 256
const normalizedSubjectTitleCache = new Map<string, string>()
const subjectKeyCache = new Map<string, string>()

export function normalizeSubjectTitle(title: string) {
  const cached = normalizedSubjectTitleCache.get(title)
  if (cached !== undefined) return cached

  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  rememberSubjectIdentityCacheValue(normalizedSubjectTitleCache, title, normalized)
  return normalized
}

export function subjectKey(title: string) {
  const cached = subjectKeyCache.get(title)
  if (cached !== undefined) return cached

  const normalized = normalizeSubjectTitle(title)
  if (!normalized) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'subject')

  if (['math', 'maths', 'mathematics', 'mathematique', 'mathematiques'].includes(normalized)) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'math')
  if (
    normalized.includes('physique chimie')
    || normalized.includes('physics chemistry')
    || normalized.includes('physique')
    || normalized.includes('physics')
    || normalized === 'phys'
  ) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'physics')
  if (normalized.includes('chemistry') || normalized.includes('chimie') || normalized === 'chem') return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'chemistry')
  if (normalized.includes('philosophy') || normalized.includes('philosophie') || normalized.includes('philo')) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'philosophy')
  if (normalized.includes('geography') || normalized.includes('geographie') || normalized === 'geo') return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'geography')
  if (
    normalized.includes('sciences de la vie')
    || normalized.includes('science de la vie')
    || normalized === 'svt'
    || normalized.includes('biology')
    || normalized.includes('biologie')
    || normalized === 'bio'
  ) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'biology')
  if (normalized.includes('english') || normalized.includes('anglais')) return rememberSubjectIdentityCacheValue(subjectKeyCache, title, 'english')

  return rememberSubjectIdentityCacheValue(
    subjectKeyCache,
    title,
    normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'subject',
  )
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
    title: PROFILE_SUBJECT_TITLES[key] ?? title,
  }
}

function rememberSubjectIdentityCacheValue(cache: Map<string, string>, title: string, value: string) {
  if (cache.size >= SUBJECT_IDENTITY_CACHE_MAX) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }

  cache.set(title, value)
  return value
}
