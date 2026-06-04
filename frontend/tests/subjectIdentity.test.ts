import { describe, expect, it } from 'vitest'

import {
  canonicalProfileSubjectTitle,
  canonicalSubject,
  canonicalSubjectTitle,
  normalizeSubjectTitle,
  subjectKey,
} from '@/lib/subjectIdentity'

describe('subject identity', () => {
  it('normalizes subject aliases from one shared catalog', () => {
    expect(normalizeSubjectTitle('Physique-Chimie')).toBe('physique chimie')
    expect(subjectKey('Mathematiques')).toBe('math')
    expect(subjectKey('Physique Chimie')).toBe('physics')
    expect(subjectKey('Chimie acide-base')).toBe('chemistry')
    expect(subjectKey('Chemistry')).toBe('chemistry')
    expect(subjectKey('SVT')).toBe('biology')
    expect(subjectKey('Philosophie')).toBe('philosophy')
    expect(subjectKey('Anglais')).toBe('english')
  })

  it('keeps course and profile title variants explicit', () => {
    expect(canonicalSubjectTitle('Mathematics')).toBe('Mathematiques')
    expect(canonicalProfileSubjectTitle('Mathematics')).toBe('Mathematiques')
    expect(canonicalSubject('Chimie')).toEqual({ key: 'chemistry', title: 'Chimie' })
  })

  it('falls back to stable slug keys for unknown subjects', () => {
    expect(subjectKey('Unknown Elective')).toBe('unknown-elective')
    expect(canonicalSubject('Unknown Elective')).toEqual({ key: 'unknown-elective', title: 'Unknown Elective' })
  })
})
