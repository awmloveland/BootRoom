/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Player } from '@/lib/types'

const ROSTER = [
  'Marcus Reid', 'Callum Shaw', 'Rav Singh', 'Sofia Marsh', 'Sam Okafor', 'Jordan Taylor',
  'Dylan Carter', 'Nathan Wright', 'Priya Nair', 'Leon Brooks', 'Harry Patel',
]

function makePlayer(name: string): Player {
  return {
    playerId: `roster|${name}`,
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    mentality: 'balanced',
    strength: null,
    recentForm: '',
  }
}

function openBuilder() {
  render(
    <NextMatchCard
      gameId="game-1"
      leagueSlug="league"
      weeks={[]}
      onResultSaved={() => {}}
      variant="overview"
      initialScheduledWeek={null}
      allPlayers={ROSTER.map(makePlayer)}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
}

function select(names: string[]) {
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }))
}

describe('NextMatchCard uneven teams', () => {
  it('counts towards the minimum without an alarm', () => {
    openBuilder()
    select(ROSTER.slice(0, 7))
    expect(screen.getByText('7 selected · 3 more needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build Lineup' })).toBeDisabled()
  })

  it('lets an odd squad build an uneven line-up', () => {
    openBuilder()
    select(ROSTER)
    const status = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '6v5 · 11 players')
    const warning = status.querySelector('.text-\\[\\#fbbf24\\]')
    expect(warning).toHaveTextContent('6v5')
    expect(warning?.querySelector('svg')).toBeInTheDocument()

    const build = screen.getByRole('button', { name: 'Build Lineup' })
    expect(build).toBeEnabled()
    fireEvent.click(build)

    expect(screen.getByText(/Uneven teams · Team (A|B) is a player short, which the odds below allow for/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Lineup' })).toBeEnabled()
  })

  it('shows no uneven note for an even squad', () => {
    openBuilder()
    select(ROSTER.slice(0, 10))
    expect(screen.getByText('5-a-side · 10 players')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Build Lineup' }))
    expect(screen.queryByText(/Uneven teams/)).not.toBeInTheDocument()
  })
})
