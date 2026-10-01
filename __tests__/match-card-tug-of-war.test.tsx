/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import type { Week } from '@/lib/types'

// The modals pull in the Supabase client; the card never opens them in these tests.
jest.mock('@/components/ResultModal', () => ({ ResultModal: () => null }))
jest.mock('@/components/EditWeekModal', () => ({ EditWeekModal: () => null }))

const WEEK: Week = {
  id: 'w15',
  season: '2026',
  week: 15,
  date: '01 Apr 2026',
  status: 'played',
  format: '5-a-side',
  teamA: ['Jamie Ellis', 'Alex Miller', 'Rav Singh', 'Ellie Knight', 'Sam Okafor'],
  teamB: ['Jordan Taylor', 'Ben Carter', 'Ollie Wright', 'Priya Nair', 'Dan +1'],
  winner: 'teamA',
  goal_difference: 2,
  team_a_rating: 4.012,
  team_b_rating: 3.988,
}

const SHARE_PROPS = { leagueName: 'The Boot Room', leagueSlug: 'boot-room', weeks: [WEEK], isMostRecent: true }

function renderCard(props: Partial<React.ComponentProps<typeof MatchCard>> = {}) {
  return render(<MatchCard week={WEEK} isOpen onToggle={() => {}} {...props} />)
}

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('div') as HTMLElement
}

describe('MatchCard played week, tug of war', () => {
  it('shows the winning team and margin in the header chip', () => {
    renderCard({ isOpen: false })
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText(/Team A Won/)).not.toBeInTheDocument()
  })

  it('omits the margin from the chip when it was not recorded', () => {
    render(<MatchCard week={{ ...WEEK, goal_difference: null }} isOpen={false} onToggle={() => {}} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows a No result chip and no bar for a played week missing its winner', () => {
    renderCard({ week: { ...WEEK, winner: null, goal_difference: null } })
    expect(screen.getByText('No result')).toBeInTheDocument()
    expect(screen.queryByText(/won/)).not.toBeInTheDocument()
    expect(row('Jamie Ellis')).not.toHaveClass('opacity-60')
    expect(row('Jordan Taylor')).not.toHaveClass('opacity-60')
  })

  it('reads Drawn on a draw and dims neither side', () => {
    renderCard({ week: { ...WEEK, winner: 'draw', goal_difference: 0 } })
    expect(screen.getByText('Drawn')).toBeInTheDocument()
    expect(screen.getByText('Honours even')).toBeInTheDocument()
    expect(row('Jamie Ellis')).not.toHaveClass('opacity-60')
    expect(row('Jordan Taylor')).not.toHaveClass('opacity-60')
  })

  it('dims the losing side only', () => {
    renderCard()
    expect(row('Jamie Ellis')).not.toHaveClass('opacity-60')
    expect(row('Jordan Taylor')).toHaveClass('opacity-60')
  })

  it('replaces the margin pill with the bar caption', () => {
    renderCard()
    expect(screen.getByText('Team A won by 2 goals')).toBeInTheDocument()
    expect(screen.queryByText(/Margin/)).not.toBeInTheDocument()
  })

  it('keeps empty cells so uneven teams stay aligned', () => {
    const { container } = renderCard({ week: { ...WEEK, teamB: WEEK.teamB.slice(0, 3) } })
    const grid = container.querySelector('.grid') as HTMLElement
    // 3 header cells plus 5 rows of 3 cells
    expect(grid.children).toHaveLength(18)
  })

  it('gives guests and members a full width Share on the most recent week', () => {
    renderCard(SHARE_PROPS)
    const share = screen.getByRole('button', { name: 'Share' })
    expect(share).toHaveClass('flex-1', 'h-9')
    expect(share.parentElement).toHaveClass('flex', 'w-full')
    expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument()
  })

  it('hides Share on older weeks', () => {
    renderCard({ ...SHARE_PROPS, isMostRecent: false })
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('tags the linked viewer and personalises the caption when they won', () => {
    renderCard({ linkedPlayerName: 'Alex Miller' })
    expect(within(row('Alex Miller')).getByText('You')).toBeInTheDocument()
    expect(screen.getByText('You won by 2 goals')).toBeInTheDocument()
  })

  it('keeps the neutral caption when the linked viewer lost', () => {
    renderCard({ linkedPlayerName: 'Ben Carter' })
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Team A won by 2 goals')).toBeInTheDocument()
  })

  it('gives admins Edit result and Share side by side, and + Add on guest rows', () => {
    const onNameGuest = jest.fn()
    renderCard({ ...SHARE_PROPS, isAdmin: true, onNameGuest })
    const edit = screen.getByRole('button', { name: 'Edit result' })
    expect(edit).toHaveClass('h-9')
    expect(edit.parentElement).toHaveClass('grid', 'grid-cols-2')

    fireEvent.click(screen.getByRole('button', { name: 'Add player: Dan +1' }))
    expect(onNameGuest).toHaveBeenCalledWith(WEEK, 'Dan +1')
  })

  it('shows no + Add for non-admins', () => {
    renderCard({ onNameGuest: jest.fn() })
    expect(screen.queryByRole('button', { name: /Add player/ })).not.toBeInTheDocument()
  })
})
