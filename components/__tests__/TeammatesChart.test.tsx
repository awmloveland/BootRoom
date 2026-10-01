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
  it('shows everyone when there are 10 or fewer', () => {
    render(<TeammatesChart teammates={teammates(10)} size="large" />)
    expect(screen.getAllByTestId('teammates-bar')).toHaveLength(10)
    expect(screen.queryByTestId('teammates-divider')).toBeNull()
    expect(screen.queryByText('Best 5')).toBeNull()
    expect(screen.queryByText('Worst 5')).toBeNull()
  })

  it('shows the best 5 and worst 5 either side of a divider past 10', () => {
    render(<TeammatesChart teammates={teammates(11)} size="small" />)
    expect(barNames()).toEqual([
      'Player1 Surname', 'Player2 Surname', 'Player3 Surname', 'Player4 Surname', 'Player5 Surname',
      'Player7 Surname', 'Player8 Surname', 'Player9 Surname', 'Player10 Surname', 'Player11 Surname',
    ])
    expect(screen.getByTestId('teammates-divider')).toHaveAttribute('aria-label', '1 more teammate in the middle')
    expect(screen.getByText('Best 5')).toBeInTheDocument()
    expect(screen.getByText('Worst 5')).toBeInTheDocument()
  })

  it('pluralises the hidden count', () => {
    render(<TeammatesChart teammates={teammates(14)} size="large" />)
    expect(screen.getByTestId('teammates-divider')).toHaveAttribute('aria-label', '4 more teammates in the middle')
  })

  it('labels bars with first names and describes each in full', () => {
    render(<TeammatesChart teammates={[{ name: 'Jamie Ellis', played: 6, won: 1, drew: 2, winRate: 17 }]} size="large" />)
    expect(screen.getByText('Jamie')).toBeInTheDocument()
    expect(screen.getByTestId('teammates-bar')).toHaveAttribute('aria-label', 'Jamie Ellis: 17% win rate, 1 win from 6 together')
    expect(screen.getByText('17')).toBeInTheDocument()
  })

  it('shows a tooltip on hover with the full record, and hides it on leave', () => {
    render(<TeammatesChart teammates={[{ name: 'Jamie Ellis', played: 6, won: 1, drew: 2, winRate: 17 }]} size="large" />)
    expect(screen.queryByText('Jamie Ellis')).toBeNull()
    const bar = screen.getByTestId('teammates-bar')
    fireEvent.mouseEnter(bar)
    expect(screen.getByText('Jamie Ellis')).toBeInTheDocument()
    expect(screen.getByText(/1W · 2D · 3L/)).toBeInTheDocument()
    fireEvent.mouseLeave(bar.parentElement!.parentElement!)
    expect(screen.queryByText('Jamie Ellis')).toBeNull()
  })

  it('opens on tap and closes on a tap elsewhere or Escape', () => {
    render(<TeammatesChart teammates={teammates(3)} size="small" />)
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
    render(<TeammatesChart teammates={teammates(11)} size="large" />)
    fireEvent.focus(screen.getByTestId('teammates-divider'))
    expect(screen.getByText('1 more teammate in the middle')).toBeInTheDocument()
  })

  it('highlights the strongest and weakest only with two or more', () => {
    const { rerender } = render(<TeammatesChart teammates={teammates(3)} size="large" />)
    expect(screen.getByText('Player1')).toHaveClass('text-[#7dd3fc]')
    expect(screen.getByText('Player2')).toHaveClass('text-[#8ba4c4]')
    expect(screen.getByText('Player3')).toHaveClass('text-[#e2686f]')

    rerender(<TeammatesChart teammates={teammates(1)} size="large" />)
    expect(screen.getByText('Player1')).toHaveClass('text-[#8ba4c4]')
  })
})
