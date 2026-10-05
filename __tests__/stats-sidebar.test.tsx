/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { StatsSidebar, InFormWidget, TeamABWidget } from '@/components/StatsSidebar'
import { QuarterTableRows, ChampionBox } from '@/components/QuarterTable'
import type { Player, Week } from '@/lib/types'

function makePlayer(name: string, overrides: Partial<Player> = {}): Player {
  return {
    playerId: `roster|${name}`,
    name,
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 6, timesTeamB: 4,
    winRate: 50, qualified: true, points: 17,
    mentality: 'balanced', strength: 'average',
    recentForm: 'WWDLW',
    ...overrides,
  }
}

const PLAYERS = ['Alice', 'Bob', 'Charlie', 'Dave'].map((n) => makePlayer(n))

// Q1 2026: Team A (Alice, Bob) won. Q2 2026: Team B (Charlie, Dave) won.
const WEEKS: Week[] = [
  { id: 'q1', season: '2026', week: 6, date: '12 Feb 2026', status: 'played', teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: 'teamA' },
  { id: 'q2', season: '2026', week: 18, date: '07 May 2026', status: 'played', teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: 'teamB' },
]

// Friday 15 May 2026: mid Q2.
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 4, 15, 12)) })
afterEach(() => { jest.useRealTimers() })

describe('StatsSidebar', () => {
  it('shows the current quarter table and highlights first place only', () => {
    const { container } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('Q2 26')).toBeInTheDocument()
    const highlighted = container.querySelectorAll('[class*="bg-[#38bdf8]/7"]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Charlie')
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('shows the goal difference column', () => {
    const weeks = WEEKS.map((w) => ({ ...w, goal_difference: 3 }))
    render(<StatsSidebar players={PLAYERS} weeks={weeks} leagueDayIndex={4} />)
    expect(screen.getByText('GD')).toBeInTheDocument()
    expect(screen.getAllByText('+3')).toHaveLength(2) // Charlie, Dave
    expect(screen.getAllByText('-3')).toHaveLength(2) // Alice, Bob
  })

  it('shows the points per game column', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('PPG')).toBeInTheDocument()
  })

  it('labels every column in the sidebar table', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('PPG').parentElement).toHaveTextContent(/^Q2 26PWDLGDPPGPts$/)
  })

  it('shows quarter progress', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText(/^1 of \d+ played$/)).toBeInTheDocument()
    expect(screen.getByText(/^\d+ games left$/)).toBeInTheDocument()
  })

  it('shows the previous quarter champion without points', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    const box = screen.getByText('Q1 26 Champion').parentElement
    expect(box).toHaveTextContent('Alice')
    expect(box).not.toHaveTextContent('pts')
  })

  it('shows most in form and head to head without the Overview extras', () => {
    const { container } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('Most In Form')).toBeInTheDocument()
    expect(screen.getByText("The Gaffer's Pick")).toBeInTheDocument()
    expect(screen.queryByText('Last 5 games')).not.toBeInTheDocument()
    expect(screen.getByText('Head to Head')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('You have played')
  })

  it('shows Your Stats only for a linked player', () => {
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.queryByText('Your Stats')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} linkedPlayerName="Alice" />)
    expect(screen.getByText('Your Stats')).toBeInTheDocument()
  })
})

describe('InFormWidget', () => {
  it('shows the Last 5 games tag when asked', () => {
    render(<InFormWidget players={PLAYERS} weeks={WEEKS} size="page" showWindowTag />)
    expect(screen.getByText('Last 5 games')).toBeInTheDocument()
  })
})

describe('TeamABWidget', () => {
  it('adds the linked player team counts', () => {
    const { container } = render(<TeamABWidget weeks={WEEKS} size="page" linkedPlayer={makePlayer('Alice')} />)
    expect(container).toHaveTextContent('You have played 6 for A · 4 for B')
  })

  it('omits the line with no linked player', () => {
    const { container } = render(<TeamABWidget weeks={WEEKS} size="page" linkedPlayer={null} />)
    expect(container).not.toHaveTextContent('You have played')
  })
})

describe('QuarterTableRows', () => {
  const rows = [
    { rank: 1, entry: { name: 'Alice', played: 3, won: 3, drew: 0, lost: 0, points: 9, goalDiff: 5 } },
    { rank: 2, entry: { name: 'Bob', played: 3, won: 2, drew: 0, lost: 1, points: 6, goalDiff: -2 } },
  ]

  it('tags the highlighted row with You at page size', () => {
    const { container } = render(<QuarterTableRows rows={rows} highlightName="Bob" size="page" />)
    const highlighted = container.querySelectorAll('[class*="bg-[#38bdf8]/10"]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Bob')
    expect(highlighted[0]).toHaveTextContent('You')
  })

  it('shows each row goal difference, signed', () => {
    render(<QuarterTableRows rows={rows} highlightName={null} />)
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('shows each row points per game', () => {
    render(<QuarterTableRows rows={rows} highlightName={null} />)
    expect(screen.getByText('3.00')).toBeInTheDocument()
    expect(screen.getByText('2.00')).toBeInTheDocument()
  })

  it('highlights nobody when no name is given', () => {
    const { container } = render(<QuarterTableRows rows={rows} highlightName={null} size="page" />)
    expect(container.querySelectorAll('[class*="bg-[#38bdf8]/10"]')).toHaveLength(0)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })
})

describe('ChampionBox', () => {
  it('shows points when given', () => {
    render(<ChampionBox label="Q1 2026 Champion" name="Sam" points={28} />)
    expect(screen.getByText('Q1 2026 Champion')).toBeInTheDocument()
    expect(screen.getByText('28 pts')).toBeInTheDocument()
  })
})
