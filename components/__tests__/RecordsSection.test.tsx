/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { RecordsSection } from '@/components/RecordsSection'
import { computeRecords } from '@/lib/records'
import type { Week } from '@/lib/types'

function game(week: number, date: string, teamA: string[], teamB: string[]): Week {
  return { season: '2026', week, date, status: 'played', teamA, teamB, winner: 'teamA', goal_difference: 3 }
}

const weeks: Week[] = [
  game(1, '05 Jan 2026', ['Will', 'Roy'], ['Matt']),
  game(2, '12 Jan 2026', ['Will'], ['Matt', 'Roy']),
]
const data = computeRecords(weeks, new Date(2026, 9, 1))

function trigger(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement
}

describe('RecordsSection', () => {
  it('renders every group with its pill', () => {
    render(<RecordsSection data={data} leagueSlug="craft-football" />)
    for (const pill of ['Career', 'Streaks', 'Cabinet', 'Duos', 'Milestones', 'Matches']) {
      expect(screen.getByRole('tab', { name: pill })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: 'Career' })).toHaveAttribute('aria-selected', 'true')
    for (const title of ['Career records', 'Streaks', 'Trophy cabinet', 'Partnerships & rivalries', 'Milestones', 'Match records']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('opens Most appearances by default and keeps one record open at a time', () => {
    render(<RecordsSection data={data} leagueSlug="craft-football" />)
    expect(trigger('Most appearances')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger('Most wins'))
    expect(trigger('Most wins')).toHaveAttribute('aria-expanded', 'true')
    expect(trigger('Most appearances')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows records nobody qualifies for as static rows', () => {
    render(<RecordsSection data={data} leagueSlug="craft-football" />)
    expect(screen.getByText('Best win rate').closest('button')).toBeNull()
    expect(screen.getAllByText('Nobody yet').length).toBeGreaterThan(0)
  })

  it('links the biggest win to that week on Results', () => {
    render(<RecordsSection data={data} leagueSlug="craft-football" />)
    expect(screen.getByRole('link', { name: /match/i })).toHaveAttribute(
      'href',
      '/craft-football/results?year=2026#week-2026-1'
    )
  })

  it('shows an empty state before any game is played', () => {
    render(<RecordsSection data={computeRecords([], new Date(2026, 9, 1))} leagueSlug="craft-football" />)
    expect(screen.getByText('Records start once the first game is played.')).toBeInTheDocument()
  })
})
