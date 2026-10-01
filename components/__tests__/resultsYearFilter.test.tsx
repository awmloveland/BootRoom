/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render } from '@testing-library/react'
import { WeekList } from '@/components/WeekList'
import { PublicMatchList } from '@/components/PublicMatchList'
import type { Week, WeekStatus } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen, isMostRecent, weeks }: { week: Week; isOpen: boolean; isMostRecent?: boolean; weeks?: Week[] }) => (
    <div
      data-testid={`week-${week.season}-${week.week}`}
      data-open={String(isOpen)}
      data-most-recent={String(!!isMostRecent)}
      data-context-weeks={String(weeks?.length ?? 0)}
    />
  ),
}))

function makeWeek(season: string, week: number, date: string, status: WeekStatus = 'played'): Week {
  return { id: `${season}-${week}`, season, week, date, status, teamA: [], teamB: [], winner: 'teamA' }
}

// Newest first, as the lists receive them. Week 31 exists in both years, but each
// year's latest result has a different number so the open-card checks can tell them apart.
const weeks: Week[] = [
  makeWeek('2026', 32, '08 Oct 2026', 'scheduled'),
  makeWeek('2026', 31, '01 Oct 2026'),
  makeWeek('2026', 30, '24 Sep 2026'),
  makeWeek('2025', 41, '09 Oct 2025'),
  makeWeek('2025', 31, '02 Oct 2025'),
  makeWeek('2025', 30, '25 Sep 2025'),
]

function cards(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]'))
}
function ids(container: HTMLElement): string[] {
  return cards(container).map((el) => el.getAttribute('data-testid')!)
}
function attr(container: HTMLElement, id: string, name: string) {
  return container.querySelector(`[data-testid="${id}"]`)!.getAttribute(name)
}

describe.each([
  ['WeekList', (props: { weeks: Week[]; season?: string }) => <WeekList {...props} leagueName="L" leagueSlug="l" />],
  ['PublicMatchList', (props: { weeks: Week[]; season?: string }) => <PublicMatchList {...props} leagueName="L" leagueSlug="l" />],
])('%s with a season', (_name, renderList) => {
  it('renders only that season’s weeks', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(ids(container)).toEqual(['week-2025-41', 'week-2025-31', 'week-2025-30'])
  })

  it('renders no year divider', () => {
    // Month dividers legitimately read "Sep 2025", so look for a label that is only the year.
    const yearLabels = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('span')).filter((el) => el.textContent === '2025')

    const all = render(renderList({ weeks }))
    expect(yearLabels(all.container)).toHaveLength(1) // control: the divider shows when unfiltered
    all.unmount()

    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(yearLabels(container)).toHaveLength(0)
  })

  it('opens the selected season’s latest result', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(attr(container, 'week-2025-41', 'data-open')).toBe('true')
    expect(attr(container, 'week-2025-31', 'data-open')).toBe('false')
  })

  it('keeps the most-recent (share) treatment on the league-wide latest result only', () => {
    const past = render(renderList({ weeks, season: '2025' }))
    expect(attr(past.container, 'week-2025-41', 'data-most-recent')).toBe('false')
    expect(attr(past.container, 'week-2025-31', 'data-most-recent')).toBe('false')
    past.unmount()

    const current = render(renderList({ weeks, season: '2026' }))
    expect(attr(current.container, 'week-2026-31', 'data-most-recent')).toBe('true')
  })

  it('passes the full week history to each card', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(attr(container, 'week-2025-31', 'data-context-weeks')).toBe(String(weeks.length))
  })

  it('renders every week when no season is given', () => {
    const { container } = render(renderList({ weeks }))
    expect(cards(container)).toHaveLength(weeks.length)
  })

  it('does not mark a same-numbered week from another year as most recent', () => {
    const { container } = render(renderList({ weeks }))
    expect(attr(container, 'week-2026-31', 'data-most-recent')).toBe('true')
    expect(attr(container, 'week-2025-31', 'data-most-recent')).toBe('false')
  })
})
