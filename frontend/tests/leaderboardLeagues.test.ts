import { describe, expect, it } from 'vitest'
import {
  DIVISION_SIZE,
  LEAGUES,
  getDemotionStartRank,
  getZone,
  rankToDivisionLocalRank,
  rankToLeagueKey,
} from '@/lib/leaderboardLeagues'

describe('leaderboard league mapping', () => {
  it('maps local division rank correctly at boundaries', () => {
    expect(rankToDivisionLocalRank(1)).toBe(1)
    expect(rankToDivisionLocalRank(20)).toBe(20)
    expect(rankToDivisionLocalRank(21)).toBe(1)
    expect(rankToDivisionLocalRank(40)).toBe(20)
  })

  it('maps rank to stable league keys across division boundaries', () => {
    expect(rankToLeagueKey(1)).toBe(LEAGUES[0].key)
    expect(rankToLeagueKey(20)).toBe(LEAGUES[0].key)
    expect(rankToLeagueKey(21)).toBe(LEAGUES[1].key)
    expect(rankToLeagueKey(40)).toBe(LEAGUES[1].key)
  })

  it('computes zones for promotion/safe/demotion thresholds', () => {
    expect(getZone(1)).toBe('promotion')
    expect(getZone(6)).toBe('promotion')
    expect(getZone(7)).toBe('safe')
    expect(getZone(17)).toBe('safe')
    expect(getZone(18)).toBe('demotion')
    expect(getZone(20)).toBe('demotion')
  })

  it('keeps demotion threshold consistent with division size', () => {
    expect(getDemotionStartRank()).toBe(DIVISION_SIZE - 3 + 1)
    expect(getDemotionStartRank()).toBe(18)
  })
})
