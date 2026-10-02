/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { AddPlayerModal } from '@/components/AddPlayerModal'
import type { Player } from '@/lib/types'

function player(name: string): Player {
  return {
    playerId: `roster|${name}`, name,
    played: 10, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: true, points: 15,
    mentality: 'balanced', strength: 'average', recentForm: '',
  }
}

const ROSTER = [player('Alice'), player('Bob')]

function renderModal(onAdd = jest.fn()) {
  render(
    <AddPlayerModal
      players={ROSTER}
      allLeaguePlayers={ROSTER}
      existingGuests={[{ type: 'guest', name: 'Alice +1', associatedPlayer: 'Alice', strength: 'average' }]}
      existingNewPlayers={[{ type: 'new_player', name: 'Tom', mentality: 'balanced', strength: 'average' }]}
      onAdd={onAdd}
      onClose={jest.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /New player/ }))
  return onAdd
}

function submitName(name: string) {
  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
}

describe('AddPlayerModal name collisions', () => {
  it('blocks a second new player with the same name as one already in the lineup', () => {
    const onAdd = renderModal()
    submitName('tom')
    expect(screen.getByText('A player named "tom" is already in this lineup.')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('blocks a new player named like a guest already in the lineup', () => {
    const onAdd = renderModal()
    submitName('Alice +1')
    expect(screen.getByText('A player named "Alice +1" is already in this lineup.')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('still reports a roster collision as a league collision', () => {
    const onAdd = renderModal()
    submitName('bob')
    expect(screen.getByText('A player named "bob" already exists in this league.')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('accepts a fresh name', () => {
    const onAdd = renderModal()
    submitName('Zed')
    expect(onAdd).toHaveBeenCalledWith({ type: 'new_player', name: 'Zed', strength: 'average', mentality: 'balanced' })
  })
})
