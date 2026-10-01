/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import type { Player } from '@/lib/types'

function makePlayer(name: string, played: number, won: number): Player {
  return {
    playerId: `known|${name}`,
    name,
    played,
    won,
    drew: 0,
    lost: played - won,
    timesTeamA: 0,
    timesTeamB: 0,
    winRate: Math.round((won / played) * 1000) / 10,
    qualified: true,
    points: 0,
    mentality: 'balanced',
    strength: null,
    recentForm: 'WLWLW',
  }
}

// Won order: Cedar, Birch, Alder. Win rate order: Birch, Alder, Cedar.
const players = [
  makePlayer('Alder', 10, 5),
  makePlayer('Birch', 10, 8),
  makePlayer('Cedar', 30, 12),
]

// Radix sets data-state on the card root, trigger and content; keep only roots
function openCardName(container: HTMLElement) {
  const roots = Array.from(container.querySelectorAll('[data-state="open"]')).filter(
    (el) => !el.parentElement?.closest('[data-state]'),
  )
  expect(roots).toHaveLength(1)
  return roots[0].textContent
}

describe('PublicPlayerList', () => {
  it('lists sort options in order', () => {
    render(<PublicPlayerList players={players} />)
    const options = Array.from(
      screen.getByRole('group', { name: 'Sort by' }).querySelectorAll('[aria-pressed]'),
    ).map((el) => el.textContent)
    expect(options).toEqual(['Won', 'Last 5', 'Played', 'Win Rate', 'Name'])
  })

  it('sorts by games won, highest first, by default', () => {
    render(<PublicPlayerList players={players} />)
    expect(screen.getByRole('button', { name: 'Won' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Toggle sort direction' })).toHaveTextContent('High–Low')
    const names = screen.getAllByText(/^(Alder|Birch|Cedar)$/).map((el) => el.textContent)
    expect(names).toEqual(['Cedar', 'Birch', 'Alder'])
  })

  it('opens the first card by default', () => {
    const { container } = render(<PublicPlayerList players={players} />)
    expect(openCardName(container)).toContain('Cedar')
  })

  it('opens the new first card when the sort option changes', () => {
    const { container } = render(<PublicPlayerList players={players} />)
    fireEvent.click(screen.getByRole('button', { name: 'Win Rate' }))
    expect(openCardName(container)).toContain('Birch')
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(openCardName(container)).toContain('Alder')
  })

  it('opens the new first card when the sort direction flips', () => {
    const { container } = render(<PublicPlayerList players={players} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sort direction' }))
    expect(openCardName(container)).toContain('Alder')
  })
})
