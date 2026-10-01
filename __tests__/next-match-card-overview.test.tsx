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
  overview: { linkedPlayerName: 'Alice', location: 'Mabley Green', kickoffTime: '8pm' },
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

  it('leaves out ratings and the share button', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, team_a_rating: 1.234, team_b_rating: 1.111 }} canEdit />)
    expect(screen.queryByText('1.234')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('is read-only for viewers who cannot edit', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the team builder from Edit Lineups', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('renders the idle view with no seed and opens the builder from Build Teams', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.getByText('Lineups not set yet')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('opens the cancel confirmation from the idle view', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Game' }))
    expect(screen.getByText(/^Cancel Week \d+\?$/)).toBeInTheDocument()
  })

  it('shows a seeded cancelled week with the existing cancelled row', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, status: 'cancelled', teamA: [], teamB: [] }} canEdit />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})
