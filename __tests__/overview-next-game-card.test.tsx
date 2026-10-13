/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { NextGameAwaiting, NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'

const LINEUP = {
  week: 16,
  date: '09 Apr 2026',
  format: '5-a-side',
  teamA: ['Alice', 'Bob'],
  teamB: ['Charlie', 'Dave'],
  location: 'Mabley Green',
  kickoffTime: '8pm',
  canEdit: false,
  onEditLineups: jest.fn(),
  onResultGame: jest.fn(),
}

describe('NextGameLineup', () => {
  it('shows the header, both teams and the fixture footer', () => {
    render(<NextGameLineup {...LINEUP} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dave']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Mabley Green · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
  })

  it('marks the viewer and their team when they are on Team A', () => {
    render(<NextGameLineup {...LINEUP} linkedPlayerName="Alice" />)
    const tag = screen.getByText('Your team')
    expect(tag).toHaveClass('bg-[#38bdf8]')
    expect(tag.parentElement).toHaveTextContent('Team A')
    expect(screen.getByText('You').parentElement).toHaveTextContent('Alice')
  })

  it('uses the violet tag when the viewer is on Team B', () => {
    render(<NextGameLineup {...LINEUP} linkedPlayerName="Dave" />)
    const tag = screen.getByText('Your team')
    expect(tag).toHaveClass('bg-[#a78bfa]')
    expect(tag.parentElement).toHaveTextContent('Team B')
    expect(screen.getByText('You').parentElement).toHaveTextContent('Dave')
  })

  it('shows no markers for guests or a viewer who is not playing', () => {
    const { rerender } = render(<NextGameLineup {...LINEUP} />)
    expect(screen.queryByText('Your team')).not.toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    rerender(<NextGameLineup {...LINEUP} linkedPlayerName="Zed" />)
    expect(screen.queryByText('Your team')).not.toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('leaves missing footer parts out', () => {
    render(<NextGameLineup {...LINEUP} location={null} format={null} kickoffTime={null} />)
    expect(screen.getByText('Thu 09 Apr')).toBeInTheDocument()
    expect(screen.queryByText(/Mabley Green/)).not.toBeInTheDocument()
    expect(screen.queryByText(/5-a-side/)).not.toBeInTheDocument()
  })

  it('shows the action buttons only to those who can edit', () => {
    const onEditLineups = jest.fn()
    const onResultGame = jest.fn()
    const { rerender } = render(<NextGameLineup {...LINEUP} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<NextGameLineup {...LINEUP} canEdit onEditLineups={onEditLineups} onResultGame={onResultGame} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(onEditLineups).toHaveBeenCalledTimes(1)
    expect(onResultGame).toHaveBeenCalledTimes(1)
  })

  it('offers Share to everyone, alongside the editor buttons', () => {
    const onShare = jest.fn()
    const { rerender } = render(<NextGameLineup {...LINEUP} onShare={onShare} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(onShare).toHaveBeenCalledTimes(1)

    rerender(<NextGameLineup {...LINEUP} canEdit onShare={onShare} copied />)
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Lineups' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Result Game' })).toBeInTheDocument()
  })

  it('always shows the upcoming badge', () => {
    render(<NextGameLineup {...LINEUP} />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.queryByText(/awaiting result/i)).not.toBeInTheDocument()
  })
})

const IDLE = {
  week: 16,
  date: '09 Apr 2026',
  kickoffTime: '18:30',
  onBuildTeams: jest.fn(),
  onCancelGame: jest.fn(),
}

describe('NextGameIdle', () => {
  it('is one row with the week, date and kick-off', () => {
    render(<NextGameIdle {...IDLE} canEdit={false} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 18:30')).toBeInTheDocument()
    expect(screen.queryByText('Lineups not set yet')).not.toBeInTheDocument()
  })

  it('shows non-editors a No lineup badge and no buttons', () => {
    render(<NextGameIdle {...IDLE} canEdit={false} />)
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Cancel and Build Teams instead of the badge', () => {
    const onBuildTeams = jest.fn()
    const onCancelGame = jest.fn()
    render(<NextGameIdle {...IDLE} canEdit onBuildTeams={onBuildTeams} onCancelGame={onCancelGame} />)
    expect(screen.queryByText('No lineup')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Build Teams'])
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onBuildTeams).toHaveBeenCalledTimes(1)
    expect(onCancelGame).toHaveBeenCalledTimes(1)
  })

  it('leaves out missing parts of the meta line', () => {
    const { rerender } = render(<NextGameIdle {...IDLE} kickoffTime={null} canEdit={false} />)
    expect(screen.getByText('Thu 09 Apr')).toBeInTheDocument()
    rerender(<NextGameIdle {...IDLE} date="" kickoffTime="18:30" canEdit={false} />)
    expect(screen.getByText('18:30')).toBeInTheDocument()
    rerender(<NextGameIdle {...IDLE} date="" kickoffTime={null} canEdit={false} />)
    expect(screen.queryByTestId('next-game-meta')).not.toBeInTheDocument()
  })
})

const AWAITING = {
  week: 16,
  teamA: ['Alice', 'Bob'],
  teamB: ['Charlie', 'Dave'],
  kickoffTime: '18:30',
  onEditLineups: jest.fn(),
  onResultGame: jest.fn(),
}

describe('NextGameAwaiting', () => {
  it('shows the kick-off, the badge and both teams on one line each', () => {
    render(<NextGameAwaiting {...AWAITING} canEdit={false} />)
    expect(screen.getByText('Kicked off 18:30')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Awaiting result')).toBeInTheDocument()
    expect(screen.getByText('Alice, Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie, Dave')).toBeInTheDocument()
  })

  it('says Game day when the league has no kick-off time', () => {
    render(<NextGameAwaiting {...AWAITING} kickoffTime={null} canEdit={false} />)
    expect(screen.getByText('Game day')).toBeInTheDocument()
  })

  it('offers no buttons to non-editors', () => {
    render(<NextGameAwaiting {...AWAITING} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Edit Lineups and Result Game', () => {
    const onEditLineups = jest.fn()
    const onResultGame = jest.fn()
    render(<NextGameAwaiting {...AWAITING} canEdit onEditLineups={onEditLineups} onResultGame={onResultGame} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit Lineups', 'Result Game'])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(onEditLineups).toHaveBeenCalledTimes(1)
    expect(onResultGame).toHaveBeenCalledTimes(1)
  })
})
