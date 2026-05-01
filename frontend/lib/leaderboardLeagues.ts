export const DIVISION_SIZE = 20
export const PROMOTION_COUNT = 6
export const DEMOTION_COUNT = 3

export type Zone = "promotion" | "safe" | "demotion"

const MAJOR_LEAGUES = [
  { key: "bronze", label: "Bronze", color: "#cc6a00" },
  { key: "silver", label: "Silver", color: "#9CA3AF" },
  { key: "gold", label: "Gold", color: "#f59e0b" },
  { key: "sapphire", label: "Sapphire", color: "#7284f7" },
  { key: "emerald", label: "Emerald", color: "#10b981" },
  { key: "ruby", label: "Ruby", color: "#ef4444" },
  { key: "amethyst", label: "Amethyst", color: "#a855f7" },
] as const

type MajorLeague = (typeof MAJOR_LEAGUES)[number]

export type LeagueKey =
  | "bronze-1" | "bronze-2" | "bronze-3" | "bronze-4"
  | "silver-1" | "silver-2" | "silver-3" | "silver-4"
  | "gold-1" | "gold-2" | "gold-3" | "gold-4"
  | "sapphire-1" | "sapphire-2" | "sapphire-3" | "sapphire-4"
  | "emerald-1" | "emerald-2" | "emerald-3" | "emerald-4"
  | "ruby-1" | "ruby-2" | "ruby-3" | "ruby-4"
  | "amethyst-1" | "amethyst-2" | "amethyst-3" | "amethyst-4"

export type LeagueInfo = {
  key: LeagueKey
  label: string
  majorKey: string
  majorLabel: string
  color: string
  emblemAsset: string
  frameAsset: string
  badgeAsset: string
}

function roman(value: number): "I" | "II" | "III" | "IV" {
  if (value === 1) return "I"
  if (value === 2) return "II"
  if (value === 3) return "III"
  return "IV"
}

export const LEAGUES: LeagueInfo[] = MAJOR_LEAGUES.flatMap((major: MajorLeague) =>
  [1, 2, 3, 4].map((division) => {
    const key = `${major.key}-${division}` as LeagueKey
    return {
      key,
      label: `${major.label} ${roman(division)}`,
      majorKey: major.key,
      majorLabel: major.label,
      color: major.color,
      emblemAsset: `/assets/leaderboard/leagues/${key}.png`,
      frameAsset: `/assets/leaderboard/frames/${key}.png`,
      badgeAsset: `/assets/leaderboard/badges/${key}.png`,
    }
  })
)

export function rankToDivisionIndex(globalRank: number): number {
  return Math.floor((Math.max(globalRank, 1) - 1) / DIVISION_SIZE)
}

export function rankToDivisionLocalRank(globalRank: number): number {
  return ((Math.max(globalRank, 1) - 1) % DIVISION_SIZE) + 1
}

export function divisionIndexToLeagueKey(divisionIndex: number): LeagueKey {
  const normalized = Math.max(divisionIndex, 0) % LEAGUES.length
  return LEAGUES[normalized].key
}

export function rankToLeagueKey(globalRank: number): LeagueKey {
  return divisionIndexToLeagueKey(rankToDivisionIndex(globalRank))
}

export function getLeagueInfoByKey(key: LeagueKey): LeagueInfo {
  const league = LEAGUES.find((item) => item.key === key)
  return league ?? LEAGUES[0]
}

export function getZone(localRank: number): Zone {
  if (localRank <= PROMOTION_COUNT) return "promotion"
  if (localRank > DIVISION_SIZE - DEMOTION_COUNT) return "demotion"
  return "safe"
}

export function getPromotionCutoff(): number {
  return PROMOTION_COUNT
}

export function getDemotionStartRank(): number {
  return DIVISION_SIZE - DEMOTION_COUNT + 1
}

export function getMajorLeagueStrip(currentKey: LeagueKey): LeagueInfo[] {
  const current = getLeagueInfoByKey(currentKey)
  const majorIndex = MAJOR_LEAGUES.findIndex((x) => x.key === current.majorKey)
  const candidates = [
    majorIndex - 3,
    majorIndex - 2,
    majorIndex - 1,
    majorIndex,
    majorIndex + 1,
    majorIndex + 2,
    majorIndex + 3,
  ]
  return candidates.map((idx) => {
    const clamped = Math.min(Math.max(idx, 0), MAJOR_LEAGUES.length - 1)
    const major = MAJOR_LEAGUES[clamped]
    const key = `${major.key}-4` as LeagueKey
    return getLeagueInfoByKey(key)
  })
}
