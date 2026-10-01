/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultsSection } from '@/components/ResultsSection'
import type { Week, WeekStatus } from '@/lib/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
jest.mock('@/components/NextMatchCard', () => ({
  NextMatchCard: () => <div data-testid="next-match" />,
}))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen }: { week: Week; isOpen: boolean }) => (
    <div data-testid={`week-${week.season}-${week.week}`} data-open={String(isOpen)} />
  ),
}))

function makeWeek(season: string, week: number, date: string, status: WeekStatus = 'played'): Week {
  return { id: `${season}-${week}`, season, week, date, status, teamA: [], teamB: [], winner: 'teamA' }
}

const weeks: Week[] = [
  makeWeek('2026', 2, '08 Jan 2026'),
  makeWeek('2026', 1, '01 Jan 2026'),
  makeWeek('2025', 40, '02 Oct 2025'),
  makeWeek('2025', 39, '25 Sep 2025'),
]

function renderSection(props: Partial<React.ComponentProps<typeof ResultsSection>> = {}) {
  return render(
    <ResultsSection
      gameId="g1"
      leagueSlug="craft-football"
      weeks={weeks}
      goalkeepers={[]}
      initialScheduledWeek={null}
      canAutoPick={true}
      allPlayers={[]}
      showMatchHistory={true}
      {...props}
    />
  )
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]')).map((el) => el.getAttribute('data-testid')!)
}

beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

describe('ResultsSection year tabs', () => {
  it('shows the tabs, the next match and the current year’s results by default', () => {
    const { container } = renderSection()
    expect(screen.getByRole('tab', { name: '2026' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('next-match')).toBeVisible()
    expect(ids(container)).toEqual(['week-2026-2', 'week-2026-1'])
  })

  it('opens the latest result of the current year by default', () => {
    const { container } = renderSection()
    expect(container.querySelector('[data-testid="week-2026-2"]')).toHaveAttribute('data-open', 'true')
  })

  it('switching to a past year hides the next match, filters the list and opens that year’s latest result', () => {
    const { container } = renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(screen.getByTestId('next-match')).not.toBeVisible()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
    expect(window.location.search).toBe('?year=2025')
  })

  it('switching back to the current year restores the next match and clears the param', () => {
    renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(screen.getByTestId('next-match')).toBeVisible()
    expect(window.location.search).toBe('')
  })

  it('re-opens the current year’s latest result when switching back to it', () => {
    const { container } = renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(container.querySelector('[data-testid="week-2026-2"]')).toHaveAttribute('data-open', 'true')
  })

  it('keeps the next match mounted across a year switch so its state survives', () => {
    renderSection()
    const before = screen.getByTestId('next-match')
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(screen.getByTestId('next-match')).toBe(before)
  })

  it('starts on a past year when the URL says so', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    const { container } = renderSection()
    expect(screen.getByTestId('next-match')).not.toBeVisible()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
  })

  it('hides the next match when match entry is off', () => {
    renderSection({ showMatchEntry: false })
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
  })

  it('shows the empty state for a read-only member on a league with no weeks', () => {
    renderSection({ weeks: [], showMatchEntry: false })
    expect(screen.getByText('No results yet.')).toBeInTheDocument()
  })

  it('renders no tabs for a single-season league', () => {
    renderSection({ weeks: weeks.filter((w) => w.season === '2026') })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('renders no tabs when match history is hidden', () => {
    renderSection({ showMatchHistory: false })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('still shows the next match for a past ?year= when match history is hidden', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    renderSection({ showMatchHistory: false })
    expect(screen.getByTestId('next-match')).toBeVisible()
  })
})

describe('ResultsSection week deep link', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn()
  })

  it('opens and scrolls to the linked week from the Records tab', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025#week-2025-39')
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
    const { container } = renderSection()
    expect(screen.getByRole('tab', { name: '2025' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-testid="week-2025-39"]')).toHaveAttribute('data-open', 'true')
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'false')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(document.getElementById('week-2025-39')).toContainElement(
      container.querySelector('[data-testid="week-2025-39"]') as HTMLElement
    )
  })

  it('switches year when the link has no year param', () => {
    window.history.replaceState(null, '', '/craft-football/results#week-2025-39')
    const { container } = renderSection()
    expect(screen.getByRole('tab', { name: '2025' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-testid="week-2025-39"]')).toHaveAttribute('data-open', 'true')
  })

  it('ignores a hash for a week that does not exist', () => {
    window.history.replaceState(null, '', '/craft-football/results#week-2024-1')
    const { container } = renderSection()
    expect(container.querySelector('[data-testid="week-2026-2"]')).toHaveAttribute('data-open', 'true')
  })
})
