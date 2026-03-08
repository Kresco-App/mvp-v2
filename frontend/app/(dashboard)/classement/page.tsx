import AuthGuard from '@/components/AuthGuard'
import { LeaderboardPage } from '@/components/Leaderboard'

export default function LeaderboardRoute() {
  return (
    <AuthGuard>
      <LeaderboardPage />
    </AuthGuard>
  )
}
