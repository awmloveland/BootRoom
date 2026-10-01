/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicResultsSection } from '@/components/PublicResultsSection'
import type { ScheduledWeek, Week } from '@/lib/types'

jest.mock('@/components/PublicMatchEntrySection', () => ({
  PublicMatchEntrySection: () => <div data-testid="next-match" />,
}))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen }: { week: Week; isOpen: boolean }) => (
    <div data-testid={`week-${week.season}-${week.week}`} data-open={String(isOpen)} />
  ),
}))

function makeWeek(season: string, week: number, date: string): Week {
  return { id: `${season}-${week}`, season, week, date, status: 'played', teamA: [], teamB: [], winner: 'teamA' }
}

const weeks: Week[] = [
  makeWeek('2026', 2, '08 Jan 2026'),
  makeWeek('2025', 40, '02 Oct 2025'),
  makeWeek('2025', 39, '25 Sep 2025'),
]

const nextWeek = { id: 'n', season: '2026', week: 3, date: '15 Jan 2026', status: 'scheduled' } as ScheduledWeek

function renderSection(props: Partial<React.ComponentProps<typeof PublicResultsSection>> = {}) {
  return render(
    <PublicResultsSection
      gameId="g1"
      leagueSlug="craft-football"
      leagueName="Craft Football"
      weeks={weeks}
      nextWeek={nextWeek}
      canEditMatchEntry={false}
      showMatchHistory={true}
      celebration={null}
      initialYear="2026"
      {...props}
    />
  )
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]')).map((el) => el.getAttribute('data-testid')!)
}

beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

describe('PublicResultsSection', () => {
  it('shows the next match and current year by default', () => {
    const { container } = renderSection()
    expect(screen.getByTestId('next-match')).toBeVisible()
    expect(ids(container)).toEqual(['week-2026-2'])
  })

  it('selects the current year tab by default', () => {
    renderSection()
    expect(screen.getByRole('tab', { name: '2026' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switching to a past year hides the next match and opens that year’s latest result', () => {
    const { container } = renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(screen.getByTestId('next-match')).not.toBeVisible()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
    expect(window.location.search).toBe('?year=2025')
  })

  it('starts on a past year when initialYear says so', () => {
    const { container } = renderSection({ initialYear: '2025' })
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('next-match')).not.toBeVisible()
  })

  it('switching back to the current year shows the next match and clears the param', () => {
    renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(screen.getByTestId('next-match')).toBeVisible()
    expect(window.location.search).toBe('')
  })

  it('shows no next match when there is no upcoming week', () => {
    renderSection({ nextWeek: null })
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
  })

  it('shows neither tabs nor results when match history is hidden', () => {
    const { container } = renderSection({ showMatchHistory: false })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(ids(container)).toEqual([])
    expect(screen.getByTestId('next-match')).toBeVisible()
  })

  it('still shows the next match for a past ?year= when match history is hidden', () => {
    renderSection({ showMatchHistory: false, initialYear: '2025' })
    expect(screen.getByTestId('next-match')).toBeVisible()
  })
})
