'use client'

interface Props {
  lessonId: number
  currentTime: number
  onPause: () => void
  onResume: () => void
  onXPEarned?: (xp: number) => void
}

export default function VideoQuizOverlay({ lessonId, currentTime, onPause, onResume, onXPEarned }: Props) {
  void lessonId
  void currentTime
  void onPause
  void onResume
  void onXPEarned
  return null
}
