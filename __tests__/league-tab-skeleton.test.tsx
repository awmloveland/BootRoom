/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

describe('LeagueTabSkeleton', () => {
  it('renders all four tab labels', () => {
    render(<LeagueTabSkeleton tab="results" />)
    for (const label of ['Results', 'Players', 'Honours', 'Lineup Lab']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('marks only the requested tab as current', () => {
    render(<LeagueTabSkeleton tab="honours" />)
    const current = screen.getAllByRole('listitem').filter((el) => el.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Honours')
  })

  it('announces itself as busy to assistive tech', () => {
    render(<LeagueTabSkeleton tab="players" />)
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })
})
