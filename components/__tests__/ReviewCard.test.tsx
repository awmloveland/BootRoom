/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewCard } from '@/components/ReviewCard'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim, ReviewItem } from '@/lib/types'

function request(overrides: Partial<PendingJoinRequest> = {}): ReviewItem {
  return {
    kind: 'join',
    request: {
      id: 'r1',
      user_id: 'u1',
      email: 'john@example.com',
      display_name: 'John Easton',
      message: "Dave's mate from work",
      status: 'pending',
      created_at: new Date().toISOString(),
      player_name: null,
      played_before: false,
      ...overrides,
    },
  }
}

function claim(overrides: Partial<PlayerClaim> = {}): ReviewItem {
  return {
    kind: 'claim',
    claim: {
      id: 'c1',
      game_id: 'g1',
      user_id: 'u9',
      player_name: 'Sam O',
      admin_override_name: null,
      status: 'pending',
      reviewed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      display_name: 'Sam Okafor',
      email: 'sam@example.com',
      ...overrides,
    },
  }
}

function player(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return { name, strength: 'average', mentality: 'balanced', played: 0, linked_user_id: null, linked_display_name: null, ...overrides }
}

const roster = [
  player('Sam O', { played: 23 }),
  player('Sammy', { played: 4 }),
  player('John E'),
  player('Dave S', { played: 40, linked_user_id: 'other', linked_display_name: 'Dave Smith' }),
]

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

function renderCard(item: ReviewItem, extra: Partial<React.ComponentProps<typeof ReviewCard>> = {}) {
  const onDone = jest.fn()
  const onRosterStale = jest.fn()
  render(<ReviewCard leagueId="g1" item={item} roster={roster} onDone={onDone} onRosterStale={onRosterStale} {...extra} />)
  return { onDone, onRosterStale }
}

function lastBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string)
}

describe('ReviewCard', () => {
  it('opens on their pick with the game count', () => {
    renderCard(request({ player_name: 'Sam O', played_before: true }))
    expect(screen.getByText('Sam O')).toBeInTheDocument()
    expect(screen.getByText('· 23 games')).toBeInTheDocument()
    expect(screen.getByText('Their pick')).toBeInTheDocument()
  })

  it('opens on a new player named after their profile when new', () => {
    renderCard(request())
    expect(screen.getByLabelText('New player name')).toHaveValue('John Easton')
    expect(screen.getByText(/They said they're new/)).toBeInTheDocument()
  })

  it('opens on the squad list when they could not find their name', () => {
    renderCard(request({ played_before: true }))
    expect(screen.getByText("They've played before but couldn't find their name.")).toBeInTheDocument()
    expect(screen.getByLabelText('Search the squad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('Change opens the squad list and picking a row selects them', () => {
    renderCard(request({ player_name: 'Sam O', played_before: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.change(screen.getByLabelText('Search the squad'), { target: { value: 'sam' } })
    expect(screen.queryByRole('button', { name: /John E/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sammy/ }))
    expect(screen.getByText('· 4 games')).toBeInTheDocument()
    expect(screen.queryByText('Their pick')).not.toBeInTheDocument()
  })

  it('disables squad players linked to someone else', () => {
    renderCard(request({ played_before: true }))
    expect(screen.getByRole('button', { name: /Dave S/ })).toBeDisabled()
    expect(screen.getByText('Linked to Dave Smith')).toBeInTheDocument()
  })

  it('switches between new player and the squad list', () => {
    renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Already in the squad? Pick them' }))
    expect(screen.getByLabelText('Search the squad')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not in the list? Add as a new player' }))
    expect(screen.getByLabelText('New player name')).toHaveValue('John Easton')
  })

  it('warns about a name clash and offers to link instead', () => {
    renderCard(request())
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'john e' } })
    expect(screen.getByText("There's already a John E in the squad.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Link to John E instead' }))
    expect(screen.getByText('John E')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('warns when their pick is linked to someone else', () => {
    renderCard(request({ player_name: 'Dave S', played_before: true }))
    expect(screen.getByText('Dave S is already linked to Dave Smith.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('approves a new player for a join request', async () => {
    const { onDone } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/join-requests/r1/approve')
    expect(lastBody()).toEqual({ player_name: 'John Easton', create_player: true })
  })

  it('approves an existing player for a member claim', async () => {
    const { onDone } = renderCard(claim())
    expect(screen.getByText('Wants to link to a player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/player-claims/c1/approve')
    expect(lastBody()).toEqual({ player_name: 'Sam O', create_player: false })
  })

  it('declines a join request', async () => {
    const { onDone } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/join-requests/r1/review')
    expect(lastBody()).toEqual({ action: 'declined' })
  })

  it('rejects a member claim on decline', async () => {
    renderCard(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/player-claims/c1/review')
    expect(lastBody()).toEqual({ action: 'rejected' })
  })

  it('shows the server message on a 409 and asks for a fresh roster', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "There's already a John Easton in the squad." }) })
    const { onDone, onRosterStale } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText("There's already a John Easton in the squad.")).toBeInTheDocument()
    expect(onRosterStale).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})
