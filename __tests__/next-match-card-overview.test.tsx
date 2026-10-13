/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const SCHEDULED: ScheduledWeek = {
  id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', format: '5-a-side',
  teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], status: 'scheduled',
}

const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: [],
  onResultSaved: jest.fn(),
  variant: 'overview' as const,
  kickoffTime: '8pm',
  overview: { linkedPlayerName: 'Alice', location: 'Mabley Green' },
}

// Monday 6 Apr 2026, midday: Thursday 9 Apr is upcoming.
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12))
})
afterEach(() => { jest.useRealTimers() })

describe('NextMatchCard, overview variant', () => {
  it('renders the seeded lineup on first paint without a client fetch', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Your team')).toBeInTheDocument()
    expect(screen.getByText('Mabley Green · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('leaves out ratings but keeps the share button', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, team_a_rating: 1.234, team_b_rating: 1.111 }} canEdit />)
    expect(screen.queryByText('1.234')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('only offers Share to viewers who cannot edit', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit={false} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Share'])
  })

  it('hides Share while a team is empty', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, teamB: [] }} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the team builder from Edit Lineups', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('renders the idle view with no seed and opens the builder from Build Teams', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('opens the cancel confirmation from the idle view', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(/^Cancel Week \d+\?$/)).toBeInTheDocument()
  })

  it('shows a seeded cancelled week with the existing cancelled row', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, status: 'cancelled', teamA: [], teamB: [] }} canEdit />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('shows the awaiting card once kick-off has passed', () => {
    // Thursday 9 Apr 2026, 20:30: after the 8pm kick-off.
    jest.setSystemTime(new Date(2026, 3, 9, 20, 30))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Kicked off 8pm')).toBeInTheDocument()
    expect(screen.getByText('Awaiting result')).toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('opens the result form from the awaiting card', () => {
    jest.setSystemTime(new Date(2026, 3, 9, 20, 30))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('still shows the lineup before kick-off on game day', () => {
    jest.setSystemTime(new Date(2026, 3, 9, 19, 59))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('shows the next date and kick-off on the idle row', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} leagueDayIndex={4} canEdit={false} />)
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
  })
})
