/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { EditWeekModal } from '@/components/EditWeekModal'
import type { Player, Week } from '@/lib/types'

const WEEK: Week = {
  id: 'w40', season: '2026', week: 40, date: '05 Oct 2026', format: '7-a-side', status: 'played',
  teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA', goal_difference: 2,
}

function player(name: string): Player {
  return {
    playerId: name.toLowerCase(), name, played: 0, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0, mentality: 'balanced', strength: null, recentForm: '',
  }
}

function renderModal() {
  render(
    <EditWeekModal
      week={WEEK}
      gameId="g1"
      allPlayers={['Alice', 'Bob', 'Cara', 'Dev'].map(player)}
      onSaved={jest.fn()}
      onClose={jest.fn()}
    />
  )
}

function team(label: 'Team A' | 'Team B') {
  return within(screen.getByRole('group', { name: label }))
}

async function savedTeams() {
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
  return { teamA: body.teamA, teamB: body.teamB }
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as jest.Mock
})

describe('EditWeekModal, tap to move players', () => {
  it('adds a tapped roster player to Team A when the teams are level', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cara' }))

    expect(team('Team A').getByRole('button', { name: 'Cara' })).toBeInTheDocument()
    expect(await savedTeams()).toEqual({ teamA: ['Alice', 'Cara'], teamB: ['Bob'] })
  })

  it('adds tapped roster players to the team with fewer players', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cara' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dev' }))

    expect(await savedTeams()).toEqual({ teamA: ['Alice', 'Cara'], teamB: ['Bob', 'Dev'] })
  })

  it('swaps a tapped team player to the other team', async () => {
    renderModal()
    fireEvent.click(team('Team A').getByRole('button', { name: 'Alice' }))

    expect(await savedTeams()).toEqual({ teamA: [], teamB: ['Bob', 'Alice'] })
  })
})
