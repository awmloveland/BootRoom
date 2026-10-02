/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { TeammatesChart } from '@/components/TeammatesChart'
import type { TeammateStat } from '@/lib/sidebar-stats'

/** `n` teammates, already sorted best to worst. */
function teammates(n: number): TeammateStat[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Player${i + 1} Surname`,
    played: 10,
    won: 10 - Math.min(i, 10),
    drew: 0,
    winRate: 100 - i * 5,
  }))
}

function barNames(): string[] {
  return screen.getAllByTestId('teammates-bar').map((el) => el.getAttribute('aria-label')!.split(':')[0])
}

describe('TeammatesChart', () => {
  it('shows everyone when there are 8 or fewer', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(8)} size="large" />)
    expect(screen.getAllByTestId('teammates-bar')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull()
  })

  it('shows only the best 8 past 8', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(11)} size="small" />)
    expect(barNames()).toEqual([
      'Player1 Surname', 'Player2 Surname', 'Player3 Surname', 'Player4 Surname',
      'Player5 Surname', 'Player6 Surname', 'Player7 Surname', 'Player8 Surname',
    ])
    expect(screen.getByRole('button', { name: 'See all (11)' })).toBeInTheDocument()
  })

  it('labels bars with first names and describes each in full', () => {
    render(<TeammatesChart playerName="Test Player" teammates={[{ name: 'Jamie Ellis', played: 6, won: 1, drew: 2, winRate: 17 }]} size="large" />)
    expect(screen.getByText('Jamie')).toBeInTheDocument()
    expect(screen.getByTestId('teammates-bar')).toHaveAttribute('aria-label', 'Jamie Ellis: 17% win rate, 1 win from 6 together')
    expect(screen.getByText('17')).toBeInTheDocument()
  })

  it('shows a tooltip on hover with the full record, and hides it on leave', () => {
    render(<TeammatesChart playerName="Test Player" teammates={[{ name: 'Jamie Ellis', played: 6, won: 1, drew: 2, winRate: 17 }]} size="large" />)
    expect(screen.queryByText('Jamie Ellis')).toBeNull()
    const bar = screen.getByTestId('teammates-bar')
    fireEvent.mouseEnter(bar)
    expect(screen.getByText('Jamie Ellis')).toBeInTheDocument()
    expect(screen.getByText(/1W · 2D · 3L/)).toBeInTheDocument()
    fireEvent.mouseLeave(bar.parentElement!.parentElement!)
    expect(screen.queryByText('Jamie Ellis')).toBeNull()
  })

  it('opens on tap and closes on a tap elsewhere or Escape', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(3)} size="small" />)
    fireEvent.click(screen.getAllByTestId('teammates-bar')[0])
    expect(screen.getByText('Best pairing')).toBeInTheDocument()
    expect(screen.getByText('Player1 Surname')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Player1 Surname')).toBeNull()

    fireEvent.click(screen.getAllByTestId('teammates-bar')[2])
    expect(screen.getByText('Weakest pairing')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Weakest pairing')).toBeNull()
  })

  it('opens on keyboard focus', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(3)} size="large" />)
    fireEvent.focus(screen.getAllByTestId('teammates-bar')[1])
    expect(screen.getByTestId('teammates-tooltip')).toHaveTextContent('Player2 Surname')
  })

  it('opens a modal listing every teammate from See all', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(14)} size="small" />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'See all (14)' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Win % with teammates')
    expect(dialog).toHaveTextContent('Test Player · 14 teammates · Min 5 together')

    const rows = screen.getAllByTestId('teammates-row')
    expect(rows).toHaveLength(14)
    expect(rows[0]).toHaveTextContent('Player1 Surname')
    expect(rows[8]).toHaveTextContent('Player9 Surname') // past the chart's 8
    expect(rows[13]).toHaveTextContent('Player14 Surname')
    expect(rows[13]).toHaveTextContent('0W · 0D · 10L · 10 together')
    expect(rows[13]).toHaveTextContent('35%')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('highlights the strongest and weakest only with two or more', () => {
    const { rerender } = render(<TeammatesChart playerName="Test Player" teammates={teammates(3)} size="large" />)
    expect(screen.getByText('Player1')).toHaveClass('text-[#7dd3fc]')
    expect(screen.getByText('Player2')).toHaveClass('text-[#8ba4c4]')
    expect(screen.getByText('Player3')).toHaveClass('text-[#e2686f]')

    rerender(<TeammatesChart playerName="Test Player" teammates={teammates(1)} size="large" />)
    expect(screen.getByText('Player1')).toHaveClass('text-[#8ba4c4]')
  })

  it('keeps the eighth bar neutral when the weakest is off the chart', () => {
    render(<TeammatesChart playerName="Test Player" teammates={teammates(11)} size="large" />)
    expect(screen.getByText('Player1')).toHaveClass('text-[#7dd3fc]')
    expect(screen.getByText('Player8')).toHaveClass('text-[#8ba4c4]')
  })
})
