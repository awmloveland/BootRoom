/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueHeaderSkeleton, LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

jest.mock('next/navigation', () => ({
  useSelectedLayoutSegment: () => 'honours',
}))

describe('LeagueTabSkeleton', () => {
  it('starts invisible and fades in after a delay, so fast loads never flash it', () => {
    const { container } = render(<LeagueTabSkeleton />)
    expect(container.firstChild).toHaveClass('starting:opacity-0', 'opacity-100', 'transition-opacity', 'delay-200')
  })

  it('announces itself as busy to assistive tech', () => {
    const { container } = render(<LeagueTabSkeleton />)
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
  })

  it('only covers the tab content, not the header or tab bar', () => {
    render(<LeagueTabSkeleton />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Results')).not.toBeInTheDocument()
  })
})

describe('LeagueHeaderSkeleton', () => {
  it('renders the real tab links for the league', () => {
    render(<LeagueHeaderSkeleton leagueSlug="the-boot-room" />)
    for (const [label, path] of [
      ['Overview', 'overview'],
      ['Results', 'results'],
      ['Players', 'players'],
      ['Seasons', 'honours'],
      ['Records', 'records'],
      ['Lineup Lab', 'lineup-lab'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/the-boot-room/${path}`)
    }
  })

  it('marks only the tab in the URL as current', () => {
    render(<LeagueHeaderSkeleton leagueSlug="the-boot-room" />)
    const current = screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Seasons')
  })
})
