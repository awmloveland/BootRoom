/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { OverviewTableCard } from '@/components/overview/OverviewTableCard'
import type { QuarterlyEntry, QuarterlyTableResult, QuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function entry(name: string, points: number, won: number): QuarterlyEntry {
  return { name, played: 3, won, drew: 0, lost: 3 - won, points }
}

const THREE = [entry('Alice', 9, 3), entry('Bob', 6, 2), entry('Charlie', 3, 1)]

function makeTable(overrides: Partial<QuarterlyTableResult> = {}): QuarterlyTableResult {
  return {
    quarterLabel: 'Q2 26',
    displayQ: 2,
    displayYear: 2026,
    entries: THREE,
    allEntries: THREE,
    lastChampion: 'Sam',
    lastChampionPoints: 28,
    lastQuarterLabel: 'Q1 26',
    lastQ: 1,
    lastYear: 2026,
    gamesLeft: 12,
    gamesTotal: 13,
    isHoldover: false,
    ...overrides,
  }
}

function result(overrides: Partial<Week> = {}): Week {
  return {
    id: 'w15', season: '2026', week: 15, date: '01 Apr 2026', status: 'played', format: '5-a-side',
    teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA', goal_difference: 2,
    ...overrides,
  }
}

const HIGHLIGHT = '[class*="bg-[#38bdf8]/10"]'

describe('OverviewTableCard: table', () => {
  it('titles the table with the quarter and four-digit year', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.getByText('League table · Q2 2026')).toBeInTheDocument()
  })

  it('highlights the viewer, not first place', () => {
    const standing: QuarterStanding = { rank: 2, position: 2, jointTop: false, entry: THREE[1] }
    const { container } = render(<OverviewTableCard table={makeTable()} standing={standing} lastResult={null} />)
    const highlighted = container.querySelectorAll(HIGHLIGHT)
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Bob')
    expect(highlighted[0]).toHaveTextContent('You')
  })

  it('highlights nobody without a standing', () => {
    const { container } = render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(container.querySelectorAll(HIGHLIGHT)).toHaveLength(0)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('appends the viewer row with its true rank when they are below the top 10', () => {
    const all = Array.from({ length: 12 }, (_, i) => entry(`P${i + 1}`, 0, 0))
    const table = makeTable({ entries: all.slice(0, 10), allEntries: all })
    const standing: QuarterStanding = { rank: 12, position: 12, jointTop: false, entry: all[11] }
    const { container } = render(<OverviewTableCard table={table} standing={standing} lastResult={null} />)
    const highlighted = container.querySelectorAll(HIGHLIGHT)
    expect(highlighted).toHaveLength(1)
    expect(within(highlighted[0] as HTMLElement).getByText('P12')).toBeInTheDocument()
    expect(within(highlighted[0] as HTMLElement).getByText('12')).toBeInTheDocument()
    expect(screen.getByText('P10')).toBeInTheDocument()
    expect(screen.queryByText('P11')).not.toBeInTheDocument()
  })

  it('shows progress and the previous champion with points', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.getByText('1 of 13 played')).toBeInTheDocument()
    expect(screen.getByText('12 games left')).toBeInTheDocument()
    expect(screen.getByText('Q1 2026 Champion')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('28 pts')).toBeInTheDocument()
  })

  it('hides the champion box when there is no previous quarter', () => {
    const table = makeTable({ lastChampion: null, lastChampionPoints: null, lastQuarterLabel: null, lastQ: null, lastYear: null })
    render(<OverviewTableCard table={table} standing={null} lastResult={null} />)
    expect(screen.queryByText(/Champion$/)).not.toBeInTheDocument()
  })

  it('shows the empty state for a quarter with no games', () => {
    render(<OverviewTableCard table={makeTable({ entries: [], allEntries: [], gamesLeft: 13 })} standing={null} lastResult={null} />)
    expect(screen.getByText('Quarter just started')).toBeInTheDocument()
    expect(screen.queryByText(/played$/)).not.toBeInTheDocument()
  })
})

describe('OverviewTableCard: last result strip', () => {
  it('is hidden with no result', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.queryByText(/^Last result/)).not.toBeInTheDocument()
  })

  it('shows a Team A win with the margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result()} />)
    expect(screen.getByText('Last result · Week 15')).toBeInTheDocument()
    expect(screen.getByText('Team A won')).toBeInTheDocument()
    expect(screen.getByText('01 Apr 2026 · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('shows a Team B win', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ winner: 'teamB' })} />)
    expect(screen.getByText('Team B won')).toBeInTheDocument()
  })

  it('says Goal for a one-goal margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ goal_difference: 1 })} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('Goal')).toBeInTheDocument()
  })

  it('hides the margin for a draw', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ winner: 'draw', goal_difference: 0 })} />)
    expect(screen.getByText('Drawn')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('hides the margin when none was recorded', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ goal_difference: null })} />)
    expect(screen.getByText('Team A won')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('shows a DNF without a margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ status: 'dnf', winner: null, goal_difference: null })} />)
    expect(screen.getByText('Did not finish')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('omits the format when the week has none', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ format: undefined })} />)
    expect(screen.getByText('01 Apr 2026')).toBeInTheDocument()
  })
})
