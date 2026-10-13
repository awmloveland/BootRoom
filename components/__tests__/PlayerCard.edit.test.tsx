/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlayerCard } from '@/components/PlayerCard'
import type { Player } from '@/lib/types'

const player: Player = {
  playerId: 'roster|Sam',
  name: 'Sam',
  played: 10,
  won: 5,
  drew: 2,
  lost: 3,
  timesTeamA: 5,
  timesTeamB: 5,
  winRate: 50,
  qualified: true,
  points: 17,
  mentality: 'attacking',
  strength: null,
  recentForm: 'WWLDW',
}

describe('PlayerCard edit button', () => {
  it('shows Edit player on an open card when onEdit is given', () => {
    const onEdit = jest.fn()
    const onToggle = jest.fn()
    render(<PlayerCard player={player} isOpen onToggle={onToggle} sortBy="won" onEdit={onEdit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('has no Edit player button without onEdit', () => {
    render(<PlayerCard player={player} isOpen onToggle={() => {}} sortBy="won" />)
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })

  it('has no Edit player button while the card is closed', () => {
    render(<PlayerCard player={player} isOpen={false} onToggle={() => {}} sortBy="won" onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })
})
