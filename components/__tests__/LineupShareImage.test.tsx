/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LineupImage } from '@/components/og/LineupShareImage'
import { GenericShareImage, OG_SIZE } from '@/components/og/frame'
import { lineupImageFontSize } from '@/lib/utils'
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

  it('shrinks names for a full squad', () => {
    const base = [
      'Marcus Reid', 'Callum Shaw', 'Rav Singh', 'Sofia Marsh', 'Sam Okafor', 'Jordan Taylor',
      'Dylan Carter', 'Nathan Wright', 'Priya Nair', 'Leon Brooks', 'Harry Patel', 'Marcus Reid +1',
    ]
    const names = [...base, ...base.slice(0, 6).map((n) => `${n} +2`)]
    const teamA = names.slice(0, 9)
    const teamB = names.slice(9, 18)
    const longest = Math.max(...names.map((n) => n.length))
    const expected = lineupImageFontSize(9, longest)
    expect(expected).toBeLessThan(40)

    render(<LineupImage lineup={{ ...LINEUP, teamA, teamB }} />)
    expect(screen.getAllByText('Marcus Reid')[0].parentElement).toHaveStyle({ fontSize: `${expected}px` })
  })
})

describe('Satori constraints', () => {
  function multiChildElementsWithoutFlex(root: Element): string[] {
    const bad: string[] = []
    const walk = (el: Element) => {
      if (el.tagName.toLowerCase() === 'svg') return
      if (el.children.length > 1 && (el as HTMLElement).style.display !== 'flex') {
        bad.push(`${el.tagName.toLowerCase()}: ${el.textContent?.slice(0, 40)}`)
      }
      Array.from(el.children).forEach(walk)
    }
    walk(root)
    return bad
  }

  it('gives every multi-child element in LineupImage display: flex', () => {
    const { container } = render(<LineupImage lineup={LINEUP} />)
    expect(multiChildElementsWithoutFlex(container.firstElementChild!)).toEqual([])
  })

  it('gives every multi-child element in GenericShareImage display: flex', () => {
    const { container } = render(<GenericShareImage />)
    expect(multiChildElementsWithoutFlex(container.firstElementChild!)).toEqual([])
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
