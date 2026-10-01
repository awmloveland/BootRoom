/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PlayerRosterPanel } from '@/components/PlayerRosterPanel'
import type { PlayerAttribute } from '@/lib/types'

function makePlayer(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return {
    name,
    strength: null,
    mentality: 'balanced',
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
    ...overrides,
  } as PlayerAttribute
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function openDeleteConfirm(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Expand ${name}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))
}

describe('PlayerRosterPanel delete', () => {
  it('asks for confirmation before deleting', () => {
    render(<PlayerRosterPanel leagueId="league-1" initialPlayers={[makePlayer('Alex'), makePlayer('Sam')]} />)
    openDeleteConfirm('Alex')

    expect(screen.getByText('Delete Alex?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete Alex?')).not.toBeInTheDocument()
  })

  it('deletes the player and removes them from the list', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    render(<PlayerRosterPanel leagueId="league-1" initialPlayers={[makePlayer('Alex'), makePlayer('Sam')]} />)
    openDeleteConfirm('Alex')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Alex')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/league/league-1/players/Alex',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('1 Player')).toBeInTheDocument()
  })

  it('keeps the player and shows the error when the delete fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Player not found' }) })
    render(<PlayerRosterPanel leagueId="league-1" initialPlayers={[makePlayer('Alex')]} />)
    openDeleteConfirm('Alex')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Player not found')).toBeInTheDocument()
    expect(screen.getByText('Delete Alex?')).toBeInTheDocument()
  })

  it('warns that a linked member will be unlinked', () => {
    render(
      <PlayerRosterPanel
        leagueId="league-1"
        initialPlayers={[makePlayer('Alex', { linked_user_id: 'u1', linked_display_name: 'Alex M' })]}
      />
    )
    openDeleteConfirm('Alex')
    expect(screen.getByText(/Alex M will be unlinked/)).toBeInTheDocument()
  })
})
