/**
 * @jest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResultsSection } from '@/components/ResultsSection'
import { getResultsNextMatchSeed } from '@/lib/utils'
import type { Week } from '@/lib/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
jest.mock('@/lib/leagueApi', () => ({
  saveLineup: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  cancelLineup: jest.fn().mockResolvedValue(undefined),
  cancelWeek: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  recordResult: jest.fn().mockResolvedValue(undefined),
}))

// Friday 10 Apr 2026, 10:00. The game was yesterday (Thursday 09 Apr, 8pm):
// kicked off, but the two day awaiting window is still open.
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 10))
  window.history.replaceState(null, '', '/craft-football/results')
})
afterEach(() => { jest.useRealTimers() })

const awaitingWeek: Week = {
  id: 'w16',
  season: '2026',
  week: 16,
  date: '09 Apr 2026',
  status: 'scheduled',
  format: '5-a-side',
  teamA: ['Alice', 'Bea'],
  teamB: ['Cleo', 'Dee'],
  winner: null,
}

describe('ResultsSection with a game awaiting its result', () => {
  it('shows the game once, in the week list, when the page seeds the next match card with the Results rule', () => {
    const weeks = [awaitingWeek]
    render(
      <ResultsSection
        gameId="g1"
        leagueSlug="craft-football"
        weeks={weeks}
        goalkeepers={[]}
        initialScheduledWeek={getResultsNextMatchSeed(weeks, '20:00')}
        canAutoPick={true}
        allPlayers={[]}
        isAdmin
        kickoffTime="20:00"
      />
    )
    expect(screen.getAllByText(/Awaiting Result/)).toHaveLength(1)
    // The awaiting card starts collapsed; open it to reach its admin actions.
    fireEvent.click(screen.getByRole('button', { name: /Awaiting Result/ }))
    expect(screen.getAllByRole('button', { name: /Record Result/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Result Game/ })).not.toBeInTheDocument()
  })
})
