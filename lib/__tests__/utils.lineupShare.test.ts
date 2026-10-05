import { buildShareText, fetchLineupShareUrl, lineupImageFontSize } from '../utils'

describe('buildShareText shareUrl', () => {
  const base = {
    leagueName: 'The Boot Room',
    leagueSlug: 'the-boot-room',
    week: 13,
    date: '06 Oct 2026',
    format: '6-a-side',
    teamA: ['Marcus Reid'],
    teamB: ['Callum Shaw'],
    teamARating: 1,
    teamBRating: 1,
  }

  it('ends with the plain league link by default', () => {
    expect(buildShareText(base)).toMatch(/\n🔗 https:\/\/craft-football\.com\/the-boot-room$/)
  })

  it('ends with the signed link when given, leaving every other line alone', () => {
    const plain = buildShareText(base).split('\n')
    const signed = buildShareText({ ...base, shareUrl: 'https://craft-football.com/the-boot-room?lineup=a.b' }).split('\n')
    expect(signed.at(-1)).toBe('🔗 https://craft-football.com/the-boot-room?lineup=a.b')
    expect(signed.slice(0, -1)).toEqual(plain.slice(0, -1))
  })
})

describe('lineupImageFontSize', () => {
  it.each([
    [7, 14, 40], // 7-a-side, normal names: full size
    [0, 0, 40],  // degenerate input stays at full size
    [9, 12, 38], // more rows shrink to fit the height
    [11, 12, 31],
    [6, 30, 27], // a long name shrinks to fit the column
    [20, 10, 24], // never below the floor
    [6, 60, 24],
  ])('%i rows, longest name %i chars → %ipx', (rows, longest, expected) => {
    expect(lineupImageFontSize(rows, longest)).toBe(expected)
  })
})

describe('fetchLineupShareUrl', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('POSTs the week and returns the url', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x/y?lineup=a.b' }) }) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBe('https://x/y?lineup=a.b')
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/league/game-1/lineup-share')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ weekId: 'week-1' })
  })

  it.each([
    ['url is null', { ok: true, json: async () => ({ url: null }) }],
    ['the response fails', { ok: false, json: async () => ({}) }],
  ])('returns null when %s', async (_label, response) => {
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBeNull()
  })

  it('returns null when the request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(fetchLineupShareUrl('game-1', 'week-1')).resolves.toBeNull()
  })
})
