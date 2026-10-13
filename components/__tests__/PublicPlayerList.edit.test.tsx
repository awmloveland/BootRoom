/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import type { Player, PlayerAttribute } from '@/lib/types'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

function makePlayer(name: string, won: number): Player {
  return {
    playerId: `roster|${name}`,
    name,
    played: 10,
    won,
    drew: 0,
    lost: 10 - won,
    timesTeamA: 5,
    timesTeamB: 5,
    winRate: won * 10,
    qualified: true,
    points: won * 3,
    mentality: 'balanced',
    strength: null,
    recentForm: 'WWLDW',
  }
}

// Sam has the most wins, so his card is open on first render
const players = [makePlayer('Sam', 6), makePlayer('Alex', 3)]

const roster: PlayerAttribute[] = [
  { name: 'Alex', strength: null, mentality: 'balanced', played: 10, linked_user_id: null, linked_display_name: null },
  { name: 'Sam', strength: null, mentality: 'balanced', played: 10, linked_user_id: null, linked_display_name: null },
]

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  mockRefresh.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function mockApi() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === '/api/league/league-1/players' && !init?.method
      ? { ok: true, json: async () => roster }
      : { ok: true, json: async () => ({}) },
  )
}

describe('PublicPlayerList editing', () => {
  it('shows no Edit player button to non-admins', () => {
    render(<PublicPlayerList leagueId="league-1" players={players} />)
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit player' })).not.toBeInTheDocument()
  })

  it('opens the modal for the open card and loads the roster once', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Sam')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Sam')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes the page and closes the modal after saving', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('refreshes the page after deleting', async () => {
    mockApi()
    render(<PublicPlayerList leagueId="league-1" isAdmin players={players} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit player' }))
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRefresh).toHaveBeenCalled()
  })
})
