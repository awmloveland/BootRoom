/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Player, ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

function player(name: string, points: number): Player {
  return {
    playerId: `roster|${name}`, name,
    played: 20, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: true, points,
    mentality: 'balanced', strength: 'average', recentForm: '',
  }
}

const ROSTER = Array.from({ length: 10 }, (_, i) => player(`Player ${i + 1}`, 20 + i * 2))

const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: [],
  onResultSaved: jest.fn(),
  allPlayers: ROSTER,
  canAutoPick: true,
  canEdit: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12))
})
afterEach(() => { jest.useRealTimers() })

function buildLineup() {
  render(<NextMatchCard {...BASE} variant="overview" initialScheduledWeek={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
  for (const p of ROSTER) fireEvent.click(screen.getByRole('button', { name: p.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Build Lineup' }))
}

/** Drags the player in row `from` onto the player in row `to` (rows 0-4 are Team A, 5-9 Team B). */
function drag(from: number, to: number) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[draggable]'))
  fireEvent.dragStart(rows[from])
  fireEvent.dragOver(rows[to])
  fireEvent.drop(rows[to])
}

/** Drags the first Team A player onto the first Team B player. */
function swapFirstPlayers() {
  drag(0, 5)
}

describe('win bar honesty', () => {
  it('shows only "Even on paper" for an untouched auto-picked lineup', () => {
    buildLineup()
    expect(screen.getByText('Even on paper')).toBeInTheDocument()
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument()
  })

  it('brings the bar back after a manual swap', () => {
    buildLineup()
    swapFirstPlayers()
    expect(screen.queryByText('Even on paper')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^\d+%$/)).toHaveLength(2)
  })

  it('stays "Even on paper" when players are only reordered within a team', () => {
    buildLineup()
    drag(2, 0)
    expect(screen.getByText('Even on paper')).toBeInTheDocument()
  })

  it('returns to "Even on paper" when a swap is undone', () => {
    buildLineup()
    drag(0, 5)
    drag(0, 5)
    expect(screen.getByText('Even on paper')).toBeInTheDocument()
  })
})

describe('lineup audit trail', () => {
  function mockRpc() {
    const rpc = jest.fn().mockResolvedValue({ data: 'week-id', error: null })
    ;(createClient as jest.Mock).mockReturnValue({ rpc })
    return rpc
  }

  it('saves what the picker did and the ratings it saw', async () => {
    const rpc = mockRpc()
    buildLineup()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Lineup' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const params = rpc.mock.calls[0][1]
    const meta = params.p_lineup_metadata
    expect(meta.auto_pick).toMatchObject({
      algorithm: 2, suggestion_index: 0, suggestion_count: 5, edited: false,
      built_at: new Date(2026, 3, 6, 12).toISOString(),
    })
    expect(meta.auto_pick.saved_diff).toBeCloseTo(Math.abs(params.p_team_a_rating - params.p_team_b_rating), 3)
    expect(meta.ratings).toHaveLength(10)
    expect(meta.ratings[0]).toEqual(expect.objectContaining({ kind: 'roster', played: 20, games_missed: 0, strength: 'average' }))
    expect(meta.ratings.filter((r: { team: string }) => r.team === 'A')).toHaveLength(5)
  })

  it('does not mark a lineup as edited when players were only reordered', async () => {
    const rpc = mockRpc()
    buildLineup()
    drag(2, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Lineup' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1].p_lineup_metadata.auto_pick.edited).toBe(false)
  })

  it('marks a hand-adjusted lineup as edited', async () => {
    const rpc = mockRpc()
    buildLineup()
    swapFirstPlayers()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Lineup' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1].p_lineup_metadata.auto_pick.edited).toBe(true)
  })
})

describe('Adjusted by hand tag', () => {
  const scheduled = (edited: boolean | null): ScheduledWeek => ({
    id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', format: '5-a-side',
    teamA: ROSTER.slice(0, 5).map((p) => p.name), teamB: ROSTER.slice(5).map((p) => p.name),
    status: 'scheduled',
    lineupMetadata: {
      guests: [], new_players: [],
      ...(edited === null ? {} : {
        autoPick: { algorithm: 2, suggestionIndex: 0, suggestionCount: 5, edited, bestDiff: 0.1, savedDiff: 2.4, builtAt: '2026-04-06T11:00:00.000Z' },
      }),
    },
  })

  it('shows on a saved lineup that was edited by hand', () => {
    render(<NextMatchCard {...BASE} publicMode initialScheduledWeek={scheduled(true)} />)
    expect(screen.getByText('Adjusted by hand')).toBeInTheDocument()
  })

  it.each([false, null])('does not show when edited is %s', (edited) => {
    render(<NextMatchCard {...BASE} publicMode initialScheduledWeek={scheduled(edited)} />)
    expect(screen.queryByText('Adjusted by hand')).not.toBeInTheDocument()
  })
})
