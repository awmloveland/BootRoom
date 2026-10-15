/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResultModal } from '@/components/ResultModal'
import { createClient } from '@/lib/supabase/client'
import type { LineupMetadata, ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const rpc = jest.fn()

const WEEK: ScheduledWeek = {
  id: 'w41', season: '2026', week: 41, date: '12 Oct 2026', format: '7-a-side', status: 'scheduled',
  teamA: ['Alice', 'Bob'], teamB: ['Jaff +1', 'Jaff'],
}

const METADATA: LineupMetadata = {
  guests: [{ type: 'guest', name: 'Jaff +1', associatedPlayer: 'Jaff', strength: 'average', goalkeeper: false }],
  new_players: [],
}

function renderModal() {
  render(
    <ResultModal
      scheduledWeek={WEEK}
      lineupMetadata={METADATA}
      allPlayers={[]}
      gameId="g1"
      leagueSlug="l"
      leagueName="L"
      weeks={[]}
      publicMode={false}
      onSaved={jest.fn()}
      onClose={jest.fn()}
    />
  )
}

async function saveWithGuestAddedAs(name: string, winner = 'Team A') {
  fireEvent.click(screen.getByRole('button', { name: winner }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByText('Add to the roster').closest('label')!.firstElementChild!)
  fireEvent.change(screen.getByPlaceholderText('Enter their name…'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save result' }))
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null })
  ;(createClient as jest.Mock).mockReturnValue({ rpc })
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock
})

describe('ResultModal, guest added to the roster', () => {
  it('renames the guest on the match so the game counts for the new player', async () => {
    renderModal()
    await saveWithGuestAddedAs(' Tom ')

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('name_guests', {
      p_week_id: 'w41',
      p_guests: [{ old_name: 'Jaff +1', new_name: 'Tom', rating: 2, goalkeeper: false }],
    }))
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['record_result', 'name_guests'])
  })

  it('shows the new name in the saved line-up', async () => {
    renderModal()
    await saveWithGuestAddedAs('Tom')

    expect(await screen.findByText('Tom, Jaff')).toBeInTheDocument()
  })

  it('renames the guest on a DNF too', async () => {
    renderModal()
    await saveWithGuestAddedAs('Tom', 'DNF')

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('name_guests', expect.objectContaining({ p_week_id: 'w41' })))
  })

  it('explains a name clash instead of showing the database error', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'name_guests' ? { error: new Error('name_already_exists') } : { error: null }
    )
    renderModal()
    await saveWithGuestAddedAs('Tom')

    expect(await screen.findByText('A player named "Tom" already exists.')).toBeInTheDocument()
  })
})
