/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import { autoPick } from '@/lib/autoPick'
import type { Player, ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/autoPick', () => ({ autoPick: jest.fn() }))

function player(name: string): Player {
  return {
    playerId: `roster|${name}`, name,
    played: 10, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: true, points: 15,
    mentality: 'balanced', strength: 'average', recentForm: '',
  }
}

const ROSTER = Array.from({ length: 10 }, (_, i) => player(`Player ${i + 1}`))

const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: [],
  onResultSaved: jest.fn(),
  variant: 'overview' as const,
  allPlayers: ROSTER,
  canAutoPick: true,
  canEdit: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12))
})
afterEach(() => { jest.useRealTimers() })

function buildWithAllPlayers() {
  render(<NextMatchCard {...BASE} initialScheduledWeek={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
  for (const p of ROSTER) fireEvent.click(screen.getByRole('button', { name: p.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Build Lineup' }))
}

describe('NextMatchCard team builder', () => {
  it('shows the uneven-teams warning and keeps Confirm Lineup enabled', () => {
    ;(autoPick as jest.Mock).mockReturnValue({
      suggestions: [{ teamA: ROSTER.slice(0, 6), teamB: ROSTER.slice(6), scoreA: 40, scoreB: 41, diff: 1 }],
      bestDiff: 1,
      warning: 'uneven-teams',
    })
    buildWithAllPlayers()
    expect(screen.getByText('Teams are uneven because too many guests are tied to one player.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Lineup' })).toBeEnabled()
  })

  it('shows no warning for even teams', () => {
    ;(autoPick as jest.Mock).mockReturnValue({
      suggestions: [{ teamA: ROSTER.slice(0, 5), teamB: ROSTER.slice(5), scoreA: 40, scoreB: 40, diff: 0 }],
      bestDiff: 0,
    })
    buildWithAllPlayers()
    expect(screen.queryByText(/Teams are uneven/)).not.toBeInTheDocument()
  })

  it('passes zero-game roster players to the picker as unknowns', () => {
    const rookie = { ...player('Rookie'), played: 0, points: 0, qualified: false }
    const roster = [...ROSTER.slice(0, 9), rookie]
    ;(autoPick as jest.Mock).mockReturnValue({ suggestions: [], bestDiff: 0 })
    render(<NextMatchCard {...BASE} allPlayers={roster} initialScheduledWeek={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    for (const p of roster) fireEvent.click(screen.getByRole('button', { name: p.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Build Lineup' }))
    const unknownIds = (autoPick as jest.Mock).mock.calls[0][2] as Set<string>
    expect([...unknownIds]).toEqual(['roster|Rookie'])
  })

  it('drops a saved new player who has since joined the roster when editing', () => {
    const scheduled: ScheduledWeek = {
      id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', format: '5-a-side',
      teamA: ROSTER.slice(0, 5).map((p) => p.name), teamB: ROSTER.slice(5).map((p) => p.name),
      status: 'scheduled',
      lineupMetadata: {
        guests: [],
        new_players: [{ type: 'new_player', name: 'player 10', mentality: 'balanced', strength: 'average' }],
      },
    }
    render(<NextMatchCard {...BASE} initialScheduledWeek={scheduled} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.queryByText('player 10')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Player 10' })).toBeInTheDocument()
  })
})
