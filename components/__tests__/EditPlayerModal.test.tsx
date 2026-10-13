/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditPlayerModal } from '@/components/EditPlayerModal'
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
  }
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const ok = () => ({ ok: true, json: async () => ({}) })
const fail = (error: string) => ({ ok: false, json: async () => ({ error }) })

type ModalProps = React.ComponentProps<typeof EditPlayerModal>

function renderModal(overrides: Partial<ModalProps> = {}) {
  const props: ModalProps = {
    leagueId: 'league-1',
    playerName: 'Sam',
    roster: [
      makePlayer('Sam', { played: 6, strength: 'average', mentality: 'attacking' }),
      makePlayer('Alex'),
    ],
    rosterError: false,
    onRetry: jest.fn(),
    onUpdated: jest.fn(),
    onDeleted: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  }
  const { rerender } = render(<EditPlayerModal {...props} />)
  return { ...props, rerender }
}

describe('EditPlayerModal', () => {
  it('shows a loading state until the roster arrives', () => {
    renderModal({ roster: null })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('offers a retry when the roster fails to load', () => {
    const props = renderModal({ roster: null, rosterError: true })
    expect(screen.getByText("Couldn't load player details.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('fills the form from the roster', () => {
    renderModal()
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    expect(screen.getByRole('button', { name: 'ATT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows strength with a countdown under 10 games', () => {
    renderModal()
    expect(screen.getByRole('radiogroup', { name: 'Strength' })).toBeInTheDocument()
    expect(screen.getByText(/no longer used after 4 more games/)).toBeInTheDocument()
  })

  it('hides strength at 10 or more games', () => {
    renderModal({ roster: [makePlayer('Sam', { played: 10 })] })
    expect(screen.queryByRole('radiogroup', { name: 'Strength' })).not.toBeInTheDocument()
  })

  it('disables Save until something changes', () => {
    renderModal()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    expect(save).toBeEnabled()
  })

  it('blocks a blank name and a name another player already has', () => {
    renderModal()
    const input = screen.getByLabelText('Name')

    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'alex' } })
    expect(screen.getByText('Another player already has that name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves attributes before renaming and sends only what changed', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [patchUrl, patchInit] = fetchMock.mock.calls[0]
    expect(patchUrl).toBe('/api/league/league-1/players/Sam')
    expect(patchInit.method).toBe('PATCH')
    expect(JSON.parse(patchInit.body)).toEqual({ mentality: 'defensive' })

    const [renameUrl, renameInit] = fetchMock.mock.calls[1]
    expect(renameUrl).toBe('/api/league/league-1/players/Sam/rename')
    expect(renameInit.method).toBe('PATCH')
    expect(JSON.parse(renameInit.body)).toEqual({ new_name: 'Sammy' })

    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ name: 'Sammy', mentality: 'defensive' }),
    )
  })

  it('keeps the modal open on a failed save and reports what did save', async () => {
    fetchMock
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail('Name already exists in this league'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Name already exists in this league')).toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ name: 'Sam', mentality: 'defensive' }),
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Sammy')
  })

  it('does not report an update when the first request fails', async () => {
    fetchMock.mockResolvedValueOnce(fail('Player not found'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Player not found')).toBeInTheDocument()
    expect(props.onUpdated).not.toHaveBeenCalled()
  })

  it('stages a member link and only sends it on Save', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/members')
        ? {
            ok: true,
            json: async () => [
              { user_id: 'u2', email: 'jo@example.com', display_name: 'Jo', role: 'member', joined_at: '', linked_player_name: null },
            ],
          }
        : ok(),
    )
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: '+ Link member' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Jo' }))

    expect(screen.getByText('Jo')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // just the members list

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/league/league-1/player-claims/assign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_id: 'u2', player_name: 'Sam' }),
      }),
    )
    expect(props.onUpdated).toHaveBeenCalledWith(
      'Sam',
      expect.objectContaining({ linked_user_id: 'u2', linked_display_name: 'Jo' }),
    )
  })

  it('asks before deleting, and Cancel returns to the form with edits kept', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Delete Sam?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Sammy')
  })

  it('deletes the player', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('Sam'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/league/league-1/players/Sam',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('shows the error and stays on the confirmation when a delete fails', async () => {
    fetchMock.mockResolvedValue(fail('Player not found'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }))

    expect(await screen.findByText('Player not found')).toBeInTheDocument()
    expect(screen.getByText('Delete Sam?')).toBeInTheDocument()
    expect(props.onDeleted).not.toHaveBeenCalled()
  })

  it('warns that a linked member will be unlinked', () => {
    renderModal({ roster: [makePlayer('Sam', { linked_user_id: 'u1', linked_display_name: 'Sam O.' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/will be unlinked/)).toHaveTextContent('Sam O. will be unlinked')
  })

  it('blocks closing while a save is in flight', async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()

    resolve(ok())
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
  })

  it('resends only the step that failed on a second Save', async () => {
    fetchMock
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail('Name already exists in this league'))
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name already exists in this league')).toBeInTheDocument()

    // What the parent does after onUpdated: the roster entry now holds the saved mentality
    props.rerender(
      <EditPlayerModal
        {...props}
        roster={[
          makePlayer('Sam', { played: 6, strength: 'average', mentality: 'defensive' }),
          makePlayer('Alex'),
        ]}
      />,
    )
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(ok())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/league/league-1/players/Sam/rename')
    expect(JSON.parse(init.body)).toEqual({ new_name: 'Sammy' })
  })

  it('lets an unrated player pick a strength', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal({ roster: [makePlayer('Sam', { played: 2, strength: null }), makePlayer('Alex')] })
    fireEvent.click(screen.getByRole('radio', { name: 'Above average' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/league/league-1/players/Sam')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ strength: 'above' })
  })

  it('URL-encodes player names', async () => {
    fetchMock.mockResolvedValue(ok())
    const props = renderModal({
      playerName: 'Jo Bloggs/2',
      roster: [makePlayer('Jo Bloggs/2', { played: 12 }), makePlayer('Alex')],
    })
    fireEvent.click(screen.getByRole('button', { name: 'DEF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/league-1/players/Jo%20Bloggs%2F2')
  })

  it('allows a case-only rename', () => {
    renderModal({ playerName: 'sam', roster: [makePlayer('sam', { played: 12 }), makePlayer('Alex')] })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } })

    expect(screen.queryByText('Another player already has that name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
