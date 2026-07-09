/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import type { QuarterSummary } from '@/lib/sidebar-stats'

const quarter: QuarterSummary = {
  q: 2,
  year: 2026,
  quarterLabel: 'Q2 26',
  seasonName: 'Spring',
  status: 'completed',
  weekRange: { from: 1, to: 2 },
  dateRange: { from: '10 Apr 2026', to: '17 Apr 2026' },
  champion: 'Marcus',
  entries: [
    { name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16 },
    { name: 'Danny', played: 6, won: 3, drew: 0, lost: 3, points: 9 },
  ],
  awards: [
    { key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Marcus', stat: '16 pts' },
    { key: 'iron_man', nickname: 'Iron Man', icon: '⚽', player: 'Danny', stat: '6 games' },
  ],
  gamesPlayed: 6,
}

describe('QuarterCelebration', () => {
  it('shows the champion as the hero', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="card" />)
    expect(screen.getByText('Marcus')).toBeInTheDocument()
    expect(screen.getByText(/Spring Champion/i)).toBeInTheDocument()
  })

  it('renders the awards reel but excludes the champion award', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="card" />)
    expect(screen.getByText('Iron Man')).toBeInTheDocument()
    // "Champion" nickname must not appear in the reel (it's the hero, not a medal)
    expect(screen.queryByText('Champion')).not.toBeInTheDocument()
  })

  it('renders a share button', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="modal" />)
    expect(screen.getByRole('button', { name: /share the glory/i })).toBeInTheDocument()
  })
})
