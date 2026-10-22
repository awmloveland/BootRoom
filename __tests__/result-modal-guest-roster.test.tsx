/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResultModal } from '@/components/ResultModal'
import type { LineupMetadata, ScheduledWeek } from '@/lib/types'
import { recordResult } from '@/lib/leagueApi'

jest.mock('@/lib/leagueApi', () => ({
  saveLineup: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  cancelLineup: jest.fn().mockResolvedValue(undefined),
  cancelWeek: jest.fn().mockResolvedValue({ weekId: 'w-new' }),
  recordResult: jest.fn().mockResolvedValue(undefined),
}))

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
  ;(recordResult as jest.Mock).mockReset().mockResolvedValue(undefined)
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock
})

describe('ResultModal, guest added to the roster', () => {
  it('renames the guest on the match so the game counts for the new player', async () => {
    renderModal()
    await saveWithGuestAddedAs(' Tom ')

    await waitFor(() => expect(recordResult).toHaveBeenCalledWith('g1', 'w41', expect.objectContaining({
      dnf: false,
      winner: 'teamA',
      guests: [{ oldName: 'Jaff +1', newName: 'Tom', rating: 2, goalkeeper: false }],
      newPlayers: [],
    })))
    expect(recordResult).toHaveBeenCalledTimes(1)
  })

  it('shows the new name in the saved line-up', async () => {
    renderModal()
    await saveWithGuestAddedAs('Tom')

    expect(await screen.findByText('Tom, Jaff')).toBeInTheDocument()
  })

  it('renames the guest on a DNF too', async () => {
    renderModal()
    await saveWithGuestAddedAs('Tom', 'DNF')

    await waitFor(() => expect(recordResult).toHaveBeenCalledWith('g1', 'w41', expect.objectContaining({
      dnf: true,
      winner: null,
      guests: [expect.objectContaining({ oldName: 'Jaff +1', newName: 'Tom' })],
    })))
  })

  it('explains a name clash instead of showing the database error', async () => {
    ;(recordResult as jest.Mock).mockRejectedValueOnce(new Error('name_already_exists'))
    renderModal()
    await saveWithGuestAddedAs('Tom')

    expect(await screen.findByText('A player named "Tom" already exists.')).toBeInTheDocument()
  })
})
