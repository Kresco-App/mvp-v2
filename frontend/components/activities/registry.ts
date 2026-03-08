/**
 * ACTIVITY REGISTRY
 * =================
 * Maps activity_type strings (stored in ChapterSection.activity_type)
 * to their React component.
 *
 * HOW TO ADD A NEW ACTIVITY
 * --------------------------
 * 1. Create your component in the appropriate subfolder:
 *    - Generic:  components/activities/MyActivity.tsx
 *    - Subject:  components/activities/ondes/MyActivity.tsx
 *
 * 2. Your component must accept:
 *    - Any data props your activity needs (spread from activity_data)
 *    - onComplete?: (correct: boolean) => void
 *
 * 3. Add an entry here:
 *    'my_activity_type': () => import('./MyActivity').then(m => m.default),
 *
 * 4. In Django admin, create a ChapterSection with:
 *    - section_type: 'activity'
 *    - activity_type: 'my_activity_type'
 *    - activity_data: { /* your data props *\/ }
 *
 * CURRENT REGISTRY
 * ----------------
 */

// Generic activities (reusable across subjects)
export const GENERIC_ACTIVITIES = [
  'drag_and_drop',
  'matching',
  'fill_in_blank',
  'ordering',
  'true_false',
  'multiple_choice',
  'simulator',
] as const

// Subject-specific activities
export const SUBJECT_ACTIVITIES = {
  // Ondes (Physics - Wave mechanics)
  onde_propagation:        'ondes/OndePropagation',
  onde_caracteristiques:   'ondes/OndeCaracteristiques',
  onde_true_false:         'ondes/OndeTrueFalse',
} as const

// Combined registry for dynamic import
export type ActivityType =
  | (typeof GENERIC_ACTIVITIES)[number]
  | keyof typeof SUBJECT_ACTIVITIES

export async function loadActivity(activityType: string): Promise<React.ComponentType<any> | null> {
  // Generic activities (already imported statically in watch page)
  if ((GENERIC_ACTIVITIES as readonly string[]).includes(activityType)) {
    return null // handled by static switch in watch/[lessonId]/page.tsx
  }

  // Subject-specific dynamic imports
  const path = SUBJECT_ACTIVITIES[activityType as keyof typeof SUBJECT_ACTIVITIES]
  if (path) {
    try {
      const mod = await import(`./${path}`)
      return mod.default
    } catch (e) {
      console.error(`Failed to load activity: ${activityType}`, e)
      return null
    }
  }

  return null
}

/**
 * ACTIVITY DATA SCHEMAS
 * =====================
 * Reference for what activity_data should contain per type:
 *
 * drag_and_drop:
 *   { question, items: [{id, label}], zones: [{id, label, correctItemId}] }
 *
 * matching:
 *   { question, pairs: [{id, left, right}] }
 *
 * fill_in_blank:
 *   { sentence: "text {{blank}} text", answer, hint? }
 *
 * ordering:
 *   { question, items: [{id, label}], correctOrder: [id, id, ...] }
 *
 * true_false:
 *   { statement, correct: true|false, explanation? }
 *
 * simulator:
 *   { simulator_type: "wave"|"prism"|"diffraction", title? }
 *
 * onde_propagation:
 *   { question?, pairs?: [{id, left, right}] }
 *
 * onde_caracteristiques:
 *   { questions?: [{sentence, answer, hint?, explanation?}] }
 *
 * onde_true_false:
 *   { statements?: [{statement, isTrue, explanation?}] }
 */
