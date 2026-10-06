/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { championRecord, QuarterImage } from '@/components/og/QuarterShareImage'
import type { SharedQuarter } from '@/lib/types'

const QUARTER: SharedQuarter = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  year: 2026,
  q: 3,
  seasonName: 'Summer',
  dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' },
  gamesPlayed: 12,
  podium: [
    { name: 'Jordan Hale', points: 24, won: 8, drew: 0 },
    { name: 'Sam Okafor', points: 21, won: 7, drew: 0 },
    { name: 'Kit Marsh', points: 19, won: 6, drew: 1 },
  ],
}

describe('QuarterImage', () => {
  it('crowns the champion with their record and the podium', () => {
    render(<QuarterImage quarter={QUARTER} />)
    expect(screen.getByText('The Boot Room')).toBeInTheDocument()
    expect(screen.getByText('07 Jul – 29 Sep · 12 games')).toBeInTheDocument()
    expect(screen.getByText('Q3 2026 · Summer champion')).toBeInTheDocument()
    expect(screen.getByText('Jordan Hale')).toBeInTheDocument()
    expect(screen.getByText('24 pts · 8 wins')).toBeInTheDocument()
    expect(screen.getByText('Sam Okafor · 21')).toBeInTheDocument()
    expect(screen.getByText('Kit Marsh · 19')).toBeInTheDocument()
  })

  it('leaves out the podium line for a one-player table', () => {
    render(<QuarterImage quarter={{ ...QUARTER, podium: QUARTER.podium.slice(0, 1) }} />)
    expect(screen.queryByText('Sam Okafor · 21')).not.toBeInTheDocument()
  })
})

describe('championRecord', () => {
  it('mentions draws only when there are some', () => {
    expect(championRecord({ name: 'x', points: 10, won: 3, drew: 1 })).toBe('10 pts · 3 wins · 1 draw')
    expect(championRecord({ name: 'x', points: 3, won: 1, drew: 0 })).toBe('3 pts · 1 win')
  })
})
