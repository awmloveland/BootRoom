/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'

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

  it('swaps the badge once the deadline has passed', () => {
    render(<NextGameLineup {...LINEUP} awaitingResult />)
    expect(screen.getByText('Awaiting Result')).toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
  })
})

describe('NextGameIdle', () => {
  it('tells non-editors when to expect teams and offers no buttons', () => {
    render(<NextGameIdle week={16} canEdit={false} onBuildTeams={jest.fn()} onCancelGame={jest.fn()} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.getByText('Lineups not set yet')).toBeInTheDocument()
    expect(screen.getByText('Teams are usually posted the day before.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Build Teams and Cancel Game', () => {
    const onBuildTeams = jest.fn()
    const onCancelGame = jest.fn()
    render(<NextGameIdle week={16} canEdit onBuildTeams={onBuildTeams} onCancelGame={onCancelGame} />)
    expect(screen.getByText('Pick who is playing and we will balance the teams.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Game' }))
    expect(onBuildTeams).toHaveBeenCalledTimes(1)
    expect(onCancelGame).toHaveBeenCalledTimes(1)
  })
})
