/**
 * @jest-environment jsdom
 */
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const SCHEDULED: ScheduledWeek = {
  id: 'week-1', season: '2099', week: 13, date: '05 Jan 2099', format: '6-a-side',
  teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'], status: 'scheduled',
  team_a_rating: 1, team_b_rating: 1,
}

const PROPS = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  leagueName: 'The Boot Room',
  weeks: [],
  onResultSaved: jest.fn(),
  publicMode: true,
  canEdit: false,
  initialScheduledWeek: SCHEDULED,
}

function mockShareEndpoint(url: string | null) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) }) as unknown as typeof fetch
}

const SHARE_ENDPOINT = '/api/league/game-1/lineup-share'

function shareEndpointCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === SHARE_ENDPOINT)
}

/** Lets the mocked fetch and json() promises settle and their setState land. */
async function flushPromises() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

function mockNavigatorShare() {
  const share = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true })
  return share
}

afterEach(() => {
  Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
})

describe('NextMatchCard share', () => {
  it('fetches a signed link for the lineup and shares it', async () => {
    mockShareEndpoint('https://craft-football.com/the-boot-room?lineup=tok.sig')
    const share = mockNavigatorShare()
    render(<NextMatchCard {...PROPS} />)

    await waitFor(() => expect(shareEndpointCalls()).toHaveLength(1))
    const [, init] = shareEndpointCalls()[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ weekId: 'week-1' })
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0][0].text).toMatch(/🔗 https:\/\/craft-football\.com\/the-boot-room\?lineup=tok\.sig$/)
  })

  it('falls back to the plain league link when the server declines', async () => {
    mockShareEndpoint(null)
    const share = mockNavigatorShare()
    render(<NextMatchCard {...PROPS} />)
    await waitFor(() => expect(shareEndpointCalls()).toHaveLength(1))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0][0].text).toMatch(/🔗 https:\/\/craft-football\.com\/the-boot-room$/)
  })
})
