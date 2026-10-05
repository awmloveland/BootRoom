/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import { MatchCard } from '@/components/MatchCard'
import type { ScheduledWeek, Week } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
jest.mock('@/components/ResultModal', () => ({ ResultModal: () => null }))
jest.mock('@/components/EditWeekModal', () => ({ EditWeekModal: () => null }))

const SCHEDULED: ScheduledWeek = {
  id: 'week-1', season: '2099', week: 13, date: '05 Jan 2099', format: '6-a-side',
  teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'], status: 'scheduled',
  team_a_rating: 1, team_b_rating: 1,
}

const AWAITING: Week = {
  id: 'week-2', season: '2026', week: 12, date: '01 Jan 2026', format: '6-a-side', status: 'scheduled',
  teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'], winner: null,
}

/** The face-off grid numbers each row and puts a "v" between the team headings. */
function expectFaceOff() {
  expect(screen.getByText('v')).toBeInTheDocument()
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('Marcus Reid').closest('div')).not.toHaveClass('opacity-60')
  expect(screen.getByText('Callum Shaw').closest('div')).not.toHaveClass('opacity-60')
}

describe('Unplayed line-ups match the played card', () => {
  it('lays the Results upcoming card out as a face-off with a YOU tag', () => {
    render(
      <NextMatchCard
        gameId="game-1" leagueSlug="the-boot-room" weeks={[]} onResultSaved={jest.fn()}
        publicMode canEdit={false} initialScheduledWeek={SCHEDULED} linkedPlayerName="Rav Singh"
      />
    )
    expectFaceOff()
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('lays the awaiting result card out as a face-off', () => {
    render(<MatchCard week={AWAITING} isOpen onToggle={() => {}} linkedPlayerName="Sofia Marsh" />)
    expectFaceOff()
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('lays the DNF card out as a face-off', () => {
    render(<MatchCard week={{ ...AWAITING, status: 'dnf' }} isOpen onToggle={() => {}} linkedPlayerName="Sofia Marsh" />)
    expectFaceOff()
    expect(screen.getByText('You')).toBeInTheDocument()
  })
})
