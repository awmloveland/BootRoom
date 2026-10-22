/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import { cancelWeek } from '@/lib/leagueApi'
import type { ScheduledWeek, Week } from '@/lib/types'

jest.mock('@/lib/leagueApi', () => ({
  saveLineup: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  cancelLineup: jest.fn().mockResolvedValue(undefined),
  cancelWeek: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  recordResult: jest.fn().mockResolvedValue(undefined),
}))

// Season 2026 weeks 1 to 39, all played on Mondays from 05 Jan 2026.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SEASON_2026: Week[] = Array.from({ length: 39 }, (_, i) => {
  const d = new Date(2026, 0, 5 + i * 7)
  return {
    season: '2026', week: i + 1, date: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA',
  }
})

const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: SEASON_2026,
  onResultSaved: jest.fn(),
  leagueDayIndex: 1, // Monday
  canEdit: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  // Wednesday 30 Dec 2026: the next Monday is 04 Jan 2027.
  jest.useFakeTimers().setSystemTime(new Date(2026, 11, 30, 12))
})
afterEach(() => { jest.useRealTimers() })

describe('NextMatchCard season handling', () => {
  it('shows a January game as week 1 of the new season', () => {
    render(<NextMatchCard {...BASE} />)
    expect(screen.getByText('Week 1')).toBeInTheDocument()
    expect(screen.getByText('04 Jan 2027')).toBeInTheDocument()
  })

  it('cancels a January game under the new season key, not last season', async () => {
    render(<NextMatchCard {...BASE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancellation' }))
    await waitFor(() => expect(cancelWeek).toHaveBeenCalled())
    expect(cancelWeek).toHaveBeenCalledWith('game-1', { season: '2027', week: 1, date: '04 Jan 2027' })
  })

  it("cancels a saved January lineup under that week's own season", async () => {
    // The last played game is in 2026, so the old card sent ('2026', 1): the
    // key of the game played on 05 Jan 2026.
    const scheduled: ScheduledWeek = {
      id: 'w-jan', season: '2027', week: 1, date: '04 Jan 2027', format: '1-a-side',
      teamA: ['Alice'], teamB: ['Bob'], status: 'scheduled', team_a_rating: 40, team_b_rating: 40,
    }
    render(<NextMatchCard {...BASE} initialScheduledWeek={scheduled} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancellation' }))
    await waitFor(() => expect(cancelWeek).toHaveBeenCalled())
    expect(cancelWeek).toHaveBeenCalledWith('game-1', { season: '2027', week: 1, date: '04 Jan 2027' })
  })
})
