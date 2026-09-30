/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { WeekList } from '@/components/WeekList'
import { PublicMatchList } from '@/components/PublicMatchList'
import type { Week, WeekStatus } from '@/lib/types'
import type { QuarterSummary } from '@/lib/sidebar-stats'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week }: { week: Week }) => <div data-testid={`week-${week.week}`} />,
}))
jest.mock('@/components/QuarterCelebration', () => ({
  QuarterCelebration: ({ quarter }: { quarter: QuarterSummary }) => (
    <div data-testid="celebration">{`Q${quarter.q} ${quarter.year}`}</div>
  ),
}))

function makeWeek(weekNum: number, date: string, status: WeekStatus): Week {
  return { id: `w${weekNum}`, season: '2026', week: weekNum, date, status, teamA: [], teamB: [], winner: null }
}

// Newest first, as the lists receive them: Week 40 is the first Q4 game, 39 and 38 are Q3.
const weeks: Week[] = [
  makeWeek(40, '05 Oct 2026', 'scheduled'),
  makeWeek(39, '28 Sep 2026', 'played'),
  makeWeek(38, '21 Sep 2026', 'played'),
]

const quarter = { q: 3, year: 2026, champion: 'Jaff', status: 'completed' } as QuarterSummary
const celebration = { quarter, leagueName: 'Craft Football', leagueSlug: 'craft-football' }

function order(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')!)
}

describe('quarter celebration placement in the results list', () => {
  it('WeekList renders the card between the next match and the first result of the quarter', () => {
    const { container } = render(<WeekList weeks={weeks} celebration={celebration} />)
    expect(order(container)).toEqual(['week-40', 'celebration', 'week-39', 'week-38'])
    expect(screen.getByTestId('celebration')).toHaveTextContent('Q3 2026')
  })

  it('PublicMatchList renders the card in the same position', () => {
    const { container } = render(<PublicMatchList weeks={weeks} celebration={celebration} />)
    expect(order(container)).toEqual(['week-40', 'celebration', 'week-39', 'week-38'])
  })

  it('renders no card when there is nothing to celebrate', () => {
    const { container } = render(<PublicMatchList weeks={weeks} celebration={null} />)
    expect(order(container)).toEqual(['week-40', 'week-39', 'week-38'])
  })

  it('renders no card when none of the listed weeks fall in the celebrated quarter', () => {
    const q2 = { ...quarter, q: 2 } as QuarterSummary
    const { container } = render(<PublicMatchList weeks={weeks} celebration={{ ...celebration, quarter: q2 }} />)
    expect(order(container)).toEqual(['week-40', 'week-39', 'week-38'])
  })
})
