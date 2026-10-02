/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { LineupLab } from '@/components/LineupLab'
import { resolvePlayersForAutoPick } from '@/components/NextMatchCard'
import { enrichPlayersForRating, ewptScore, wprScore } from '@/lib/utils'
import type { Player, Week } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

function player(name: string, played: number, points: number): Player {
  return {
    playerId: `roster|${name}`, name,
    played, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: played >= 5, points,
    mentality: 'balanced', strength: 'average', recentForm: '',
  }
}

const NAMES = ['Ava', 'Ben', 'Cal', 'Dan', 'Eli', 'Fin', 'Gus', 'Hal']
const ALL_PLAYERS = NAMES.map((n, i) => player(n, 20, 25 + i * 2))

// Ava last played five games ago, so she is rusty; everyone else played last week.
const WEEKS: Week[] = [
  { season: '2026', week: 1, date: '05 Jan 2026', status: 'played', teamA: ['Ava', 'Ben'], teamB: ['Cal', 'Dan'], winner: 'teamA' },
  ...[12, 19, 26].map((d, i): Week => ({
    season: '2026', week: i + 2, date: `${d} Jan 2026`, status: 'played',
    teamA: ['Ben', 'Cal'], teamB: ['Dan', 'Eli'], winner: 'draw',
  })),
  { season: '2026', week: 5, date: '02 Feb 2026', status: 'played', teamA: ['Ben', 'Cal'], teamB: ['Dan', 'Eli'], winner: 'draw' },
  { season: '2026', week: 6, date: '09 Feb 2026', status: 'played', teamA: NAMES.slice(1, 4), teamB: NAMES.slice(4), winner: 'teamB' },
]

function teamScore(label: 'Team A' | 'Team B'): string {
  return screen.getByText(label).nextElementSibling?.textContent ?? ''
}

describe('Lineup Lab and the match card rate players the same way', () => {
  it('applies rust in the Lab', () => {
    const enriched = enrichPlayersForRating(ALL_PLAYERS, WEEKS)
    const ava = enriched.find((p) => p.name === 'Ava')!
    expect(ava.gamesMissed).toBe(5)
    expect(wprScore(ava)).toBeLessThan(wprScore(ALL_PLAYERS[0]))
  })

  it('shows the same team scores as the match card would for the same players and weeks', () => {
    render(<LineupLab allPlayers={ALL_PLAYERS} weeks={WEEKS} />)
    // Chips alternate Team A, Team B in click order.
    for (const name of NAMES) fireEvent.click(screen.getByRole('button', { name }))

    const teamANames = NAMES.filter((_, i) => i % 2 === 0)
    const teamBNames = NAMES.filter((_, i) => i % 2 === 1)
    const cardPlayers = enrichPlayersForRating(ALL_PLAYERS, WEEKS)
    const cardTeamA = resolvePlayersForAutoPick(teamANames, cardPlayers, [], [])
    const cardTeamB = resolvePlayersForAutoPick(teamBNames, cardPlayers, [], [])

    expect(teamScore('Team A')).toBe(ewptScore(cardTeamA).toFixed(3))
    expect(teamScore('Team B')).toBe(ewptScore(cardTeamB).toFixed(3))
    // Sanity: rust is what makes the difference for Team A.
    expect(teamScore('Team A')).not.toBe(ewptScore(ALL_PLAYERS.filter((p) => teamANames.includes(p.name))).toFixed(3))
  })
})

describe('resolvePlayersForAutoPick', () => {
  it('rates a guest, a new player and an unrated zero-game roster player on the wprScore scale', () => {
    const roster = [...ALL_PLAYERS, player('Zed', 0, 0)]
    const resolved = resolvePlayersForAutoPick(
      ['Zed', 'Ava +1', 'Newbie'],
      roster,
      [{ type: 'guest', name: 'Ava +1', associatedPlayer: 'Ava', strength: 'average' }],
      [{ type: 'new_player', name: 'Newbie', mentality: 'balanced', strength: 'average' }],
    )
    const scores = resolved.map(wprScore)
    expect(scores[0]).toBeCloseTo(36.125, 3)
    expect(scores[1]).toBe(scores[0])
    expect(scores[2]).toBe(scores[0])
    expect(resolved.map((p) => p.playerId)).toEqual(['roster|Zed', 'guest|Ava +1', 'new|Newbie'])
  })
})
