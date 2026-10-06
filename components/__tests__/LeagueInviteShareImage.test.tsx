/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueImage } from '@/components/og/LeagueShareImage'
import { InviteImage } from '@/components/og/InviteShareImage'
import type { SharedLeague } from '@/lib/types'

const LEAGUE: SharedLeague = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  gamesPlayed: 142,
  playerCount: 38,
  nextGame: { date: '13 Oct 2026', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
}

describe('LeagueImage', () => {
  it('shows the league and its next game', () => {
    render(<LeagueImage league={LEAGUE} />)
    expect(screen.getAllByText('The Boot Room')).toHaveLength(2) // meta line and title
    expect(screen.getByText('142 games played')).toBeInTheDocument()
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Tue 13 Oct · 19:00')).toBeInTheDocument()
    expect(screen.getByText('Powerleague Shoreditch')).toBeInTheDocument()
  })

  it('shows a stat line when there is no next game', () => {
    render(<LeagueImage league={{ ...LEAGUE, nextGame: null }} />)
    expect(screen.queryByText('Next game')).not.toBeInTheDocument()
    expect(screen.getByText('142 games · 38 players')).toBeInTheDocument()
  })
})

describe('InviteImage', () => {
  it('invites without naming a role', () => {
    render(<InviteImage invite={{ leagueName: 'The Boot Room' }} />)
    expect(screen.getByText("You're invited to join")).toBeInTheDocument()
    expect(screen.getByText('The Boot Room')).toBeInTheDocument()
    expect(screen.getByText('Join the league')).toBeInTheDocument()
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()
  })
})
