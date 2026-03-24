import { buildLeagueInfoFacts, isLeagueDetailsFilled } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

describe('buildLeagueInfoFacts', () => {
  it('returns empty array when all fields are null', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('includes location when present', () => {
    const details: LeagueDetails = { location: 'Hackney Marshes', day: null, kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual(['📍 Hackney Marshes'])
  })

  it('formats day and kickoff_time together when both present', () => {
    const details: LeagueDetails = { location: null, day: 'Thursday', kickoff_time: '6:30pm', bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual(['🕖 Thursdays · 6:30pm'])
  })

  it('omits day+time chip when only day is present', () => {
    const details: LeagueDetails = { location: null, day: 'Thursday', kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('omits day+time chip when only kickoff_time is present', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: '6:30pm', bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('includes player count when present', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null, player_count: 14 }
    expect(buildLeagueInfoFacts(details)).toEqual(['👥 14 players'])
  })

  it('returns all three facts when all present', () => {
    const details: LeagueDetails = {
      location: 'Hackney Marshes',
      day: 'Thursday',
      kickoff_time: '6:30pm',
      bio: 'A great league.',
      player_count: 14,
    }
    expect(buildLeagueInfoFacts(details)).toEqual([
      '📍 Hackney Marshes',
      '🕖 Thursdays · 6:30pm',
      '👥 14 players',
    ])
  })
})

describe('isLeagueDetailsFilled', () => {
  it('returns false when details is null', () => {
    expect(isLeagueDetailsFilled(null)).toBe(false)
  })

  it('returns false when all fields are null', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null }
    expect(isLeagueDetailsFilled(details)).toBe(false)
  })

  it('returns true when location is set', () => {
    const details: LeagueDetails = { location: 'Hackney', day: null, kickoff_time: null, bio: null }
    expect(isLeagueDetailsFilled(details)).toBe(true)
  })

  it('returns true when only bio is set', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: 'A great league.' }
    expect(isLeagueDetailsFilled(details)).toBe(true)
  })

  it('returns false when all fields are empty strings', () => {
    const details: LeagueDetails = { location: '', day: '', kickoff_time: '', bio: '' }
    expect(isLeagueDetailsFilled(details)).toBe(false)
  })
})
