/**
 * @jest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResultsSection } from '@/components/ResultsSection'
import type { Week } from '@/lib/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

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
  it('shows the game once, in the week list, when the next match card starts idle', () => {
    render(
      <ResultsSection
        gameId="g1"
        leagueSlug="craft-football"
        weeks={[awaitingWeek]}
        goalkeepers={[]}
        initialScheduledWeek={null}
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
