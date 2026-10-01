/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { OverviewYourStats } from '@/components/overview/OverviewYourStats'
import { OverviewSignInCard, OverviewLinkProfileCard } from '@/components/overview/OverviewPromptCards'
import type { QuarterStanding } from '@/lib/sidebar-stats'
import type { Player } from '@/lib/types'

// AuthDialog pulls in the Supabase client; a stub that exposes its props is enough here.
jest.mock('@/components/AuthDialog', () => ({
  AuthDialog: ({ open, redirect, signinOnly }: { open?: boolean; redirect?: string; signinOnly?: boolean }) => (
    <div data-testid="auth-dialog" data-open={String(open)} data-redirect={redirect} data-signin-only={String(signinOnly)} />
  ),
}))

const JAMIE: Player = {
  playerId: 'roster|Jamie Ellis',
  name: 'Jamie Ellis',
  played: 42, won: 28, drew: 4, lost: 10,
  timesTeamA: 24, timesTeamB: 18,
  winRate: 66.7, qualified: true, points: 88,
  mentality: 'goalkeeper', strength: 'average',
  recentForm: 'WWDLW',
}

const TOP: QuarterStanding = {
  rank: 3, position: 1, jointTop: true,
  entry: { name: 'Jamie Ellis', played: 1, won: 1, drew: 0, lost: 0, points: 3 },
}

describe('OverviewYourStats', () => {
  it('shows the name, record and tiles', () => {
    render(<OverviewYourStats player={JAMIE} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('Your stats')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
    expect(screen.getByText('Jamie Ellis')).toBeInTheDocument()
    expect(screen.getByText('GK · 28W · 4D · 10L')).toBeInTheDocument()
    expect(screen.getByText('67')).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Played')).toBeInTheDocument()
    expect(screen.getByText('2.1')).toBeInTheDocument()
    expect(screen.getByText('Pts / game')).toBeInTheDocument()
    expect(screen.getByText('Recent form')).toBeInTheDocument()
  })

  it('leaves the GK prefix off for outfield players', () => {
    render(<OverviewYourStats player={{ ...JAMIE, mentality: 'balanced' }} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('28W · 4D · 10L')).toBeInTheDocument()
  })

  it('shows the quarter position with its ordinal and the joint top note', () => {
    render(<OverviewYourStats player={JAMIE} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('st')).toBeInTheDocument()
    expect(screen.getByText('Q2 2026 · Joint top')).toBeInTheDocument()
  })

  it('leaves the joint top note off when the position is not shared', () => {
    render(<OverviewYourStats player={JAMIE} standing={{ ...TOP, position: 3, jointTop: false }} quarterLabel="Q2 2026" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('rd')).toBeInTheDocument()
    expect(screen.getByText('Q2 2026')).toBeInTheDocument()
  })

  it('omits the position block when the player has no games this quarter', () => {
    render(<OverviewYourStats player={JAMIE} standing={null} quarterLabel="Q2 2026" />)
    expect(screen.queryByText(/Q2 2026/)).not.toBeInTheDocument()
  })

  it('shows 0.0 points per game for a player with no games', () => {
    render(<OverviewYourStats player={{ ...JAMIE, played: 0, won: 0, drew: 0, lost: 0, points: 0, winRate: 0, recentForm: '-----' }} standing={null} quarterLabel="Q2 2026" />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })
})

describe('OverviewSignInCard', () => {
  it('opens the sign-in dialog and returns to Overview afterwards', () => {
    render(<OverviewSignInCard leagueSlug="the-boot-room" />)
    expect(screen.getByText('Sign in to see your stats')).toBeInTheDocument()
    expect(screen.getByText('Win rate, form and where you sit in the table.')).toBeInTheDocument()
    const dialog = screen.getByTestId('auth-dialog')
    expect(dialog).toHaveAttribute('data-open', 'false')
    expect(dialog).toHaveAttribute('data-redirect', '/the-boot-room/overview')
    expect(dialog).toHaveAttribute('data-signin-only', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByTestId('auth-dialog')).toHaveAttribute('data-open', 'true')
  })
})

describe('OverviewLinkProfileCard', () => {
  it('links to the account page where profiles are claimed', () => {
    render(<OverviewLinkProfileCard />)
    expect(screen.getByText('Have you played in this league before?')).toBeInTheDocument()
    expect(screen.getByText('Link your account to your player profile to see your stats and match history.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link profile' })).toHaveAttribute('href', '/settings')
  })
})
