/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { useSelectedLayoutSegment } from 'next/navigation'
import { LeagueTabNav } from '@/components/LeagueTabNav'

jest.mock('next/navigation', () => ({
  useSelectedLayoutSegment: jest.fn(),
}))

const segment = useSelectedLayoutSegment as jest.Mock

describe('LeagueTabNav', () => {
  it('lists Overview first, hidden on large screens', () => {
    segment.mockReturnValue('results')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Results', 'Players', 'Seasons', 'Records', 'Lineup Lab'])
    expect(links[0]).toHaveAttribute('href', '/the-boot-room/overview')
    expect(links[0]).toHaveClass('lg:hidden')
    expect(links[1]).not.toHaveClass('lg:hidden')
  })

  it('contains its absolutely positioned tab markers so they cannot widen the page', () => {
    // ScrollTabIntoView renders an sr-only (position: absolute) span in every
    // tab. Unless the scrolling nav is their containing block, a marker in a
    // tab that sits off screen escapes the nav's overflow and adds horizontal
    // scroll to the whole page on phones.
    segment.mockReturnValue('overview')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    expect(screen.getByRole('navigation')).toHaveClass('relative', 'overflow-x-auto')
  })

  it('marks Overview as current on the overview segment', () => {
    segment.mockReturnValue('overview')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the Seasons tab on the /honours route', () => {
    segment.mockReturnValue('honours')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    const seasons = screen.getByRole('link', { name: 'Seasons' })
    expect(seasons).toHaveAttribute('href', '/the-boot-room/honours')
    expect(seasons).toHaveAttribute('aria-current', 'page')
  })

  it('links Records to its own route', () => {
    segment.mockReturnValue('records')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    const records = screen.getByRole('link', { name: 'Records' })
    expect(records).toHaveAttribute('href', '/the-boot-room/records')
    expect(records).toHaveAttribute('aria-current', 'page')
  })

  it('scrolls the tab row so the active tab is fully visible', () => {
    segment.mockReturnValue('records')
    const offsetLeft = jest.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(400)
    const offsetWidth = jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(90)
    const clientWidth = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390)
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    expect(screen.getByRole('navigation').scrollLeft).toBe(400 + 90 - 390 + 16)
    offsetLeft.mockRestore()
    offsetWidth.mockRestore()
    clientWidth.mockRestore()
  })
})
