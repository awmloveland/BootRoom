/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { StatsSidebar, InFormWidget, TeamABWidget, MarginsWidget } from '@/components/StatsSidebar'
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

function marginWeeks(results: (number | 'draw')[]): Week[] {
  return results.map((r, i) => ({
    id: `m${i}`, season: '2026', week: i + 1, date: '08 Jan 2026', status: 'played',
    teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'],
    winner: r === 'draw' ? 'draw' : 'teamA',
    goal_difference: r === 'draw' ? 0 : r,
  }))
}

// 10 wins (avg 3.2, biggest 9, most common 1) and a draw. Close games 4/11 = 36%.
const TEN_WINS = marginWeeks([1, 1, 1, 2, 2, 3, 3, 4, 6, 9, 'draw'])

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
    // Q1 needs five games to crown a champion
    const q1: Week[] = ['15 Jan 2026', '22 Jan 2026', '29 Jan 2026', '05 Feb 2026'].map((date, i) => (
      { ...WEEKS[0], id: `q1-${i}`, week: 2 + i, date }
    ))
    render(<StatsSidebar players={PLAYERS} weeks={[...q1, ...WEEKS]} leagueDayIndex={4} />)
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

  it('shows Winning Margins only when the flag allows it', () => {
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={TEN_WINS} leagueDayIndex={4} />)
    expect(screen.queryByText('Winning Margins')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={TEN_WINS} leagueDayIndex={4} canSeeMargins />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
  })

  it('passes admin status through to Winning Margins', () => {
    const nine = TEN_WINS.slice(1)
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={nine} leagueDayIndex={4} canSeeMargins />)
    expect(screen.queryByText('Winning Margins')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={nine} leagueDayIndex={4} canSeeMargins isAdmin />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
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

describe('MarginsWidget', () => {
  it('shows the average, biggest win, chart labels and close games', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS} />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
    expect(screen.getByText('3.2')).toBeInTheDocument()
    expect(screen.getByText('Avg goals per win')).toBeInTheDocument()
    expect(screen.getByText('+9')).toBeInTheDocument()
    expect(screen.getByText('Biggest')).toBeInTheDocument()
    const labelRow = container.querySelector('[role="img"] + [aria-hidden="true"]') as HTMLElement
    for (const label of ['D', '1', '2', '3', '4', '5', '6', '7+']) {
      expect(within(labelRow).getByText(label)).toBeInTheDocument()
    }
    expect(container).toHaveTextContent('Close games · 36% · 1 goal or a draw')
    expect(container).not.toHaveTextContent('Visible to non-admins')
  })

  it('highlights the most common margin and skips empty buckets', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS} />)
    expect(container.querySelector('[data-bucket="1"]')!.className).toContain('bg-[#38bdf8]')
    expect(container.querySelector('[data-bucket="2"]')!.className).toContain('bg-[#223a5c]')
    expect(container.querySelector('[data-bucket="D"]')!.className).toContain('bg-[#2c4a72]')
    expect(container.querySelector('[data-bucket="5"]')).toBeNull()
  })

  it('describes the chart for screen readers', () => {
    render(<MarginsWidget weeks={TEN_WINS} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Winning margins: Draws 1, 1 goal 3, 2 goals 2, 3 goals 2, 4 goals 1, 5 goals 0, 6 goals 1, 7+ goals 1',
    )
  })

  it('renders nothing for a non-admin below 10 wins', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS.slice(1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an admin no hint once the league has 10 wins', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS} isAdmin />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('Visible to non-admins')
  })

  it('shows an admin the card with a progress hint below 10 wins', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS.slice(1)} isAdmin />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
    expect(container).toHaveTextContent('Visible to non-admins after 10 wins · 9 so far')
  })

  it('shows an admin only the hint when nothing is counted yet', () => {
    const { container } = render(<MarginsWidget weeks={[]} isAdmin />)
    expect(container).toHaveTextContent('Visible to non-admins after 10 wins · 0 so far')
    expect(container).not.toHaveTextContent('Avg goals per win')
  })

  it('shows a dash and no biggest win when an admin has only draws', () => {
    render(<MarginsWidget weeks={marginWeeks(['draw', 'draw'])} isAdmin />)
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.queryByText('Biggest')).not.toBeInTheDocument()
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
