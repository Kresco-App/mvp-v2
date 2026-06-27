export type AdminVideoFeedbackSummary = {
  videos_reviewed: number
  rated_comments: number
  average_rating: number
  positive_comments: number
  negative_comments: number
  watchlist_videos: number
}

export type AdminVideoFeedbackComment = {
  comment_id: number
  author_name: string
  body: string
  rating: number
  created_at: string | null
}

export type AdminVideoFeedbackItem = {
  topic_item_id: number
  title: string
  topic_title: string
  subject_title: string
  item_type: string
  duration_seconds: number
  resource_provider: string
  resource_url: string
  rating_count: number
  average_rating: number
  positive_count: number
  negative_count: number
  neutral_count: number
  latest_comment_at: string | null
  negative_comments: AdminVideoFeedbackComment[]
  positive_comments: AdminVideoFeedbackComment[]
}

export type AdminVideoFeedback = {
  generated_at: string
  summary: AdminVideoFeedbackSummary
  items: AdminVideoFeedbackItem[]
}

export type AdminVideoFeedbackSort =
  | 'needs_attention'
  | 'lowest_rating'
  | 'most_negative'
  | 'most_reviewed'
  | 'best_rating'

export const EMPTY_ADMIN_VIDEO_FEEDBACK: AdminVideoFeedback = {
  generated_at: '',
  summary: {
    videos_reviewed: 0,
    rated_comments: 0,
    average_rating: 0,
    positive_comments: 0,
    negative_comments: 0,
    watchlist_videos: 0,
  },
  items: [],
}

export function sortAdminVideoFeedbackItems(
  items: AdminVideoFeedbackItem[],
  sort: AdminVideoFeedbackSort,
) {
  return [...items].sort((left, right) => {
    if (sort === 'lowest_rating') {
      return left.average_rating - right.average_rating || right.negative_count - left.negative_count
    }
    if (sort === 'most_negative') {
      return right.negative_count - left.negative_count || left.average_rating - right.average_rating
    }
    if (sort === 'most_reviewed') {
      return right.rating_count - left.rating_count || right.negative_count - left.negative_count
    }
    if (sort === 'best_rating') {
      return right.average_rating - left.average_rating || right.positive_count - left.positive_count
    }

    return feedbackRiskScore(right) - feedbackRiskScore(left) || left.average_rating - right.average_rating
  })
}

export function feedbackRiskScore(item: AdminVideoFeedbackItem) {
  const lowRatingPenalty = Math.max(0, 5 - item.average_rating) * 8
  return item.negative_count * 12 + item.neutral_count * 3 + lowRatingPenalty + item.rating_count
}
