/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

// Season 2026 weeks 1 to 39, all played on Mondays.
const SEASON_2026: Week[] = Array.from({ length: 39 }, (_, i) => {
  const d = new Date(2026, 0, 5 + i * 7)
  const dd = String(d.getDate()).padStart(2, '0')
  const mmm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  return {
    season: '2026', week: i + 1, date: `${dd} ${mmm} ${d.getFullYear()}`, status: 'played',
    teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA',
  }
})

function mockClient() {
  const orders: Array<[string, { ascending: boolean }]> = []
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    order: jest.fn((col: string, opts: { ascending: boolean }) => { orders.push([col, opts]); return query }),
    limit: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: null }),
  }
  const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null })
  ;(createClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query), rpc })
  return { orders, rpc }
}

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
  it('orders the pending-week query by season before week', async () => {
    const { orders } = mockClient()
    render(<NextMatchCard {...BASE} />)
    await screen.findByText('Week 1')
    expect(orders).toEqual([
      ['season', { ascending: false }],
      ['week', { ascending: false }],
    ])
  })

  it('shows a January game as week 1 of the new season', async () => {
    mockClient()
    render(<NextMatchCard {...BASE} />)
    expect(await screen.findByText('Week 1')).toBeInTheDocument()
    expect(screen.getByText('04 Jan 2027')).toBeInTheDocument()
  })

  it('cancels a January game under the new season key, not last season', async () => {
    const { rpc } = mockClient()
    render(<NextMatchCard {...BASE} />)
    await screen.findByText('Week 1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancellation' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('cancel_week', {
      p_game_id: 'game-1',
      p_season: '2027',
      p_week: 1,
      p_date: '04 Jan 2027',
    })
  })
})
