/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PendingReviewList } from '@/components/PendingReviewList'
import type { PendingJoinRequest, PlayerClaim } from '@/lib/types'

const now = new Date().toISOString()

const requests: PendingJoinRequest[] = [
  { id: 'r1', user_id: 'u1', email: 'john@example.com', display_name: 'John Easton', message: null, status: 'pending', created_at: now, player_name: null, played_before: false },
]

const claims: PlayerClaim[] = [
  { id: 'c1', game_id: 'g1', user_id: 'u9', player_name: 'Sam O', admin_override_name: null, status: 'pending', reviewed_by: null, created_at: now, updated_at: now, display_name: 'Sam Okafor', email: 'sam@example.com' },
  { id: 'c2', game_id: 'g1', user_id: 'u1', player_name: 'John E', admin_override_name: null, status: 'pending', reviewed_by: null, created_at: now, updated_at: now, display_name: 'John Easton', email: 'john@example.com' },
]

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('PendingReviewList', () => {
  it('shows join requests and member claims under one count', () => {
    render(<PendingReviewList leagueId="g1" requests={requests} claims={claims} roster={[]} />)
    expect(screen.getByText('Waiting for you')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('John Easton')).toBeInTheDocument()
    expect(screen.getByText('Sam Okafor')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<PendingReviewList leagueId="g1" requests={[]} claims={[]} roster={[]} />)
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
  })

  it('hides a card once reviewed and tells the page', async () => {
    const onChanged = jest.fn()
    render(<PendingReviewList leagueId="g1" requests={requests} claims={[]} roster={[]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.queryByText('John Easton')).not.toBeInTheDocument()
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
  })
})
