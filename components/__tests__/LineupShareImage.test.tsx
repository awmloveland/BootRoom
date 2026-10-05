/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { GenericShareImage, LineupImage, OG_SIZE } from '@/components/og/LineupShareImage'
import type { SharedLineup } from '@/lib/types'

const LINEUP: SharedLineup = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  teamA: ['Marcus Reid', 'Rav Singh'],
  teamB: ['Callum Shaw', 'Sofia Marsh'],
  location: 'Powerleague Shoreditch',
  kickoffTime: '19:00',
}

describe('LineupImage', () => {
  it('shows the league, week, date, kick-off and both teams', () => {
    render(<LineupImage lineup={LINEUP} />)
    expect(screen.getByText('The Boot Room · Week 13')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct · 19:00')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
    for (const name of [...LINEUP.teamA, ...LINEUP.teamB]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
  })

  it('leaves out the kick-off when not set', () => {
    render(<LineupImage lineup={{ ...LINEUP, kickoffTime: null }} />)
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
  })

  it('sizes names with lineupImageFontSize', () => {
    render(<LineupImage lineup={LINEUP} />)
    expect(screen.getByText('Marcus Reid').parentElement).toHaveStyle({ fontSize: '40px' })
  })
})

describe('GenericShareImage', () => {
  it('shows the wordmark and tagline and no league data', () => {
    const { container } = render(<GenericShareImage />)
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
    expect(screen.getByText('Results, stats and fair teams for your weekly game.')).toBeInTheDocument()
    expect(container.textContent).not.toContain('Week')
  })
})

it('is 1200 × 630', () => {
  expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
})
