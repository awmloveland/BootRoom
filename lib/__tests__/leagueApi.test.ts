import { saveLineup, cancelLineup, cancelWeek, recordResult } from '@/lib/leagueApi'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function ok(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

describe('leagueApi', () => {
  it('saveLineup posts the input and returns the week id', async () => {
    fetchMock.mockReturnValue(ok({ weekId: 'w1' }))
    const input = { season: '2026', week: 3, date: '22 Oct 2026', format: null, teamA: ['A'], teamB: ['B'], lineupMetadata: null, teamARating: null, teamBRating: null }
    await expect(saveLineup('g1', input)).resolves.toEqual({ weekId: 'w1' })
    expect(fetchMock).toHaveBeenCalledWith('/api/league/g1/lineup', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }))
  })

  it('cancelLineup deletes the week', async () => {
    fetchMock.mockReturnValue(ok({ ok: true }))
    await cancelLineup('g1', 'w1')
    expect(fetchMock).toHaveBeenCalledWith('/api/league/g1/lineup/w1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('cancelWeek returns the week id', async () => {
    fetchMock.mockReturnValue(ok({ weekId: 'w2' }))
    await expect(cancelWeek('g1', { season: '2026', week: 4, date: '29 Oct 2026' })).resolves.toEqual({ weekId: 'w2' })
  })

  it('recordResult throws the server error message', async () => {
    fetchMock.mockReturnValue(ok({ error: 'name_already_exists' }, 409))
    await expect(recordResult('g1', 'w1', { dnf: false, winner: 'teamA', notes: null, goalDifference: 1, teamARating: 50, teamBRating: 48, guests: [], newPlayers: [] }))
      .rejects.toThrow('name_already_exists')
  })

  it('falls back to a status message when the body has no error field', async () => {
    fetchMock.mockReturnValue(ok({}, 500))
    await expect(cancelLineup('g1', 'w1')).rejects.toThrow('Request failed (500)')
  })
})
