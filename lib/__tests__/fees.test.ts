import {
  computeFees,
  buildShareText,
  formatMoney,
  parseFeeRange,
  presetSummaries,
  settlePayers,
  weekPayers,
} from '@/lib/fees'
import type { GuestEntry, Week } from '@/lib/types'

const TODAY = new Date(2026, 9, 6) // Tue 6 Oct 2026

function week(
  id: string,
  date: string,
  teamA: string[],
  teamB: string[] = [],
  opts: { status?: Week['status']; guests?: Pick<GuestEntry, 'name' | 'associatedPlayer'>[]; week?: number } = {},
): Week {
  return {
    id,
    season: date.slice(-4),
    week: opts.week ?? 40,
    date,
    status: opts.status ?? 'played',
    teamA,
    teamB,
    winner: null,
    lineupMetadata: opts.guests
      ? {
          guests: opts.guests.map((g) => ({ type: 'guest' as const, strength: 'average' as const, ...g })),
          new_players: [],
        }
      : null,
  }
}

const RANGE_30 = { preset: '30' as const }
const ALL = { preset: 'all' as const }

describe('weekPayers', () => {
  it('owes a guest in the line-up through the player who brought them', () => {
    const w = week('w1', '01 Oct 2026', ['Alice', 'Alice +1'], ['Bob'], {
      guests: [{ name: 'Alice +1', associatedPlayer: 'Alice' }],
    })
    expect(weekPayers(w)).toEqual([
      { payer: 'Alice', owedBy: 'Alice', guest: false },
      { payer: 'Alice +1', owedBy: 'Alice', guest: true },
      { payer: 'Bob', owedBy: 'Bob', guest: false },
    ])
  })

  it('falls back to the guest name when line-up metadata is missing', () => {
    const w = week('w1', '01 Oct 2026', ['Matt', 'Matt +1'])
    expect(weekPayers(w)).toContainEqual({ payer: 'Matt +1', owedBy: 'Matt', guest: true })
  })

  it('ignores guests in the metadata who are not in either team', () => {
    const w = week('w1', '01 Oct 2026', ['Alice'], [], {
      guests: [{ name: 'Alice +1', associatedPlayer: 'Alice' }],
    })
    expect(weekPayers(w)).toEqual([{ payer: 'Alice', owedBy: 'Alice', guest: false }])
  })

  it('includes a DNF week', () => {
    const w = week('w1', '01 Oct 2026', ['Alice'], ['Bob'], { status: 'dnf' })
    expect(weekPayers(w).map((p) => p.payer)).toEqual(['Alice', 'Bob'])
  })

  it('returns nothing for a cancelled week', () => {
    expect(weekPayers(week('w1', '01 Oct 2026', [], [], { status: 'cancelled' }))).toEqual([])
  })
})

describe('computeFees', () => {
  it('produces no entries for cancelled weeks but still lists them in games', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['Alice'], ['Bob']),
      week('w2', '24 Sep 2026', [], [], { status: 'cancelled', week: 39 }),
    ]
    const data = computeFees(weeks, {}, {}, 6, RANGE_30, TODAY)
    expect(data.debtors.flatMap((p) => p.entries).map((e) => e.weekId)).toEqual(['w1', 'w1'])
    expect(data.games.map((g) => [g.weekId, g.status, g.payers])).toEqual([
      ['w1', 'played', 2],
      ['w2', 'cancelled', 0],
    ])
    expect(data.totals.playedGames).toBe(1)
  })

  it('charges DNF weeks like played ones, and ignores scheduled and unrecorded weeks', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['Alice']),
      week('w2', '24 Sep 2026', ['Alice'], ['Bob'], { status: 'dnf' }),
      week('w3', '17 Sep 2026', [], [], { status: 'unrecorded' }),
      week('w4', '08 Oct 2026', ['Alice'], [], { status: 'scheduled' }),
    ]
    const data = computeFees(weeks, { w2: 5 }, {}, 6, ALL, TODAY)
    expect(data.games.map((g) => [g.weekId, g.status, g.payers, g.cost, g.overridden])).toEqual([
      ['w1', 'played', 1, 6, false],
      ['w2', 'dnf', 2, 5, true],
    ])
    expect(data.totals).toEqual({ owed: 16, collected: 0, expected: 16, playedGames: 2 })
    expect(data.debtors.find((p) => p.name === 'Alice')).toMatchObject({ games: 2, owed: 11 })
  })

  it('attaches guests to their associated player', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['Alice', 'Alice +1'], ['Bob'], {
        guests: [{ name: 'Alice +1', associatedPlayer: 'Alice' }],
      }),
    ]
    const data = computeFees(weeks, {}, {}, 6, RANGE_30, TODAY)
    const alice = data.debtors.find((p) => p.name === 'Alice')!
    expect(alice).toMatchObject({ games: 1, guests: 1, owed: 12 })
    expect(alice.entries.map((e) => [e.payer, e.guest])).toEqual([
      ['Alice', false],
      ['Alice +1', true],
    ])
    expect(data.debtors.map((p) => p.name)).not.toContain('Alice +1')
    expect(data.games[0]).toMatchObject({ players: 2, guests: 1, payers: 3 })
  })

  it('uses a week override over the league default', () => {
    const weeks = [week('w1', '01 Oct 2026', ['Alice']), week('w2', '24 Sep 2026', ['Alice'])]
    const data = computeFees(weeks, { w2: 4.5 }, {}, 6, RANGE_30, TODAY)
    expect(data.games.map((g) => [g.cost, g.overridden])).toEqual([
      [6, false],
      [4.5, true],
    ])
    expect(data.debtors[0].owed).toBe(10.5)
  })

  it('treats a zero override as an override, not the default', () => {
    const data = computeFees([week('w1', '01 Oct 2026', ['Alice'])], { w1: 0 }, {}, 6, RANGE_30, TODAY)
    expect(data.games[0]).toMatchObject({ cost: 0, overridden: true })
  })

  it('includes both ends of a preset range', () => {
    const weeks = [
      week('in-today', '06 Oct 2026', ['A']),
      week('in-edge', '06 Sep 2026', ['A']),
      week('out', '05 Sep 2026', ['A']),
    ]
    const data = computeFees(weeks, {}, {}, 6, RANGE_30, TODAY)
    expect(data.games.map((g) => g.weekId)).toEqual(['in-today', 'in-edge'])
  })

  it('includes both ends of a custom range', () => {
    const weeks = [
      week('after', '25 Sep 2026', ['A']),
      week('to', '24 Sep 2026', ['A']),
      week('from', '10 Sep 2026', ['A']),
      week('before', '09 Sep 2026', ['A']),
    ]
    const data = computeFees(weeks, {}, {}, 6, { preset: 'custom', from: '2026-09-10', to: '2026-09-24' }, TODAY)
    expect(data.games.map((g) => g.weekId)).toEqual(['to', 'from'])
    expect(data.range).toMatchObject({ preset: 'custom', label: 'Custom range', from: '2026-09-10', to: '2026-09-24' })
  })

  it('reconciles totals: owed + collected === expected', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['A', 'B', 'C']),
      week('w2', '24 Sep 2026', ['A', 'B', 'C']),
      week('w3', '17 Sep 2026', ['A', 'B', 'C']),
    ]
    const payments = { 'w1|A': true, 'w2|B': true, 'w3|C': true, 'w3|A': false }
    const data = computeFees(weeks, { w2: 0.1, w3: 0.2 }, payments, 6.5, RANGE_30, TODAY)
    expect(data.totals.expected).toBeCloseTo(3 * 6.5 + 3 * 0.1 + 3 * 0.2, 10)
    expect(data.totals.owed + data.totals.collected).toBe(data.totals.expected)
    expect(data.totals.collected).toBe(6.8)
  })

  it('sorts debtors by owed then name, settled by name', () => {
    const weeks = [week('w1', '01 Oct 2026', ['Zed', 'Amy', 'Bea', 'Cat']), week('w2', '24 Sep 2026', ['Zed'])]
    const payments = { 'w1|Cat': true, 'w1|Bea': true }
    const data = computeFees(weeks, {}, payments, 6, RANGE_30, TODAY)
    expect(data.debtors.map((p) => p.name)).toEqual(['Zed', 'Amy'])
    expect(data.settled.map((p) => p.name)).toEqual(['Bea', 'Cat'])
  })

  it('lists unpaid entries first, then newest first', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['A']),
      week('w2', '24 Sep 2026', ['A']),
      week('w3', '17 Sep 2026', ['A']),
    ]
    const data = computeFees(weeks, {}, { 'w1|A': true }, 6, RANGE_30, TODAY)
    expect(data.debtors[0].entries.map((e) => e.weekId)).toEqual(['w2', 'w3', 'w1'])
  })

  it('spans the games in range, or says there are none', () => {
    const weeks = [week('w1', '01 Oct 2026', ['A']), week('w2', '06 Sep 2026', [], [], { status: 'cancelled' })]
    expect(computeFees(weeks, {}, {}, 6, RANGE_30, TODAY).span).toBe('6 Sep – 1 Oct 2026')
    expect(computeFees([], {}, {}, 6, RANGE_30, TODAY).span).toBe('No games')
    expect(computeFees([weeks[0]], {}, {}, 6, RANGE_30, TODAY).span).toBe('1 Oct 2026')
    const acrossYears = [week('a', '07 Jan 2026', ['A']), week('b', '31 Dec 2025', ['A'])]
    expect(computeFees(acrossYears, {}, {}, 6, ALL, TODAY).span).toBe('31 Dec 2025 – 7 Jan 2026')
  })
})

describe('settlePayers', () => {
  const weeks = [
    week('w1', '01 Oct 2026', ['Alice', 'Alice +1', 'Bob']),
    week('w2', '24 Sep 2026', ['Alice', 'Bob', 'Bob +1']),
    week('w3', '17 Sep 2026', ['Alice', 'Alice +1']),
  ]

  it("marks the player's own and guest entries only within the given weeks", () => {
    expect(settlePayers(weeks, 'Alice', ['w1', 'w2'])).toEqual([
      { weekId: 'w1', payer: 'Alice' },
      { weekId: 'w1', payer: 'Alice +1' },
      { weekId: 'w2', payer: 'Alice' },
    ])
  })

  it('moves a player with nothing left unpaid to Settled', () => {
    const before = computeFees(weeks, {}, {}, 6, ALL, TODAY)
    const ids = before.games.map((g) => g.weekId)
    const payments = Object.fromEntries(
      settlePayers(weeks, 'Alice', ids).map(({ weekId, payer }) => [`${weekId}|${payer}`, true]),
    )
    const after = computeFees(weeks, {}, payments, 6, ALL, TODAY)
    expect(after.debtors.map((p) => p.name)).toEqual(['Bob'])
    expect(after.settled.map((p) => p.name)).toEqual(['Alice'])
    expect(after.debtors[0].owed).toBe(18)
  })
})

describe('buildShareText', () => {
  const weeks = [
    week('w1', '01 Oct 2026', ['Matt', 'Alice'], [], { week: 40 }),
    week('w2', '24 Sep 2026', ['Matt'], [], { week: 39 }),
    week('w3', '17 Sep 2026', ['Alice', 'Alice +1', 'Tom'], [], {
      week: 38,
      guests: [{ name: 'Alice +1', associatedPlayer: 'Alice' }],
    }),
    week('w4', '10 Sep 2026', ['Matt', 'Tom'], [], { week: 37 }),
  ]
  const payments = { 'w3|Alice': true, 'w3|Tom': true, 'w4|Tom': true }

  it('lists debtors only, by owed, with dates oldest first and a (+1) marker', () => {
    const data = computeFees(weeks, {}, payments, 6, RANGE_30, TODAY)
    expect(buildShareText(data, 'Hackney Thursdays')).toBe(
      [
        'Hackney Thursdays · Money owed',
        'Last 30 days · 10 Sep – 1 Oct 2026',
        '',
        'Matt · £18',
        '  10 Sep, 24 Sep, 1 Oct',
        'Alice · £12',
        '  17 Sep (+1), 1 Oct',
        '',
        'Total outstanding · £30',
        '£6 per player per game',
      ].join('\n'),
    )
  })

  it('omits the preset name for a custom range', () => {
    const data = computeFees(weeks, {}, payments, 6, { preset: 'custom', from: '2026-09-01', to: '2026-10-06' }, TODAY)
    expect(buildShareText(data, 'Hackney Thursdays').split('\n')[1]).toBe('10 Sep – 1 Oct 2026')
  })

  it('says everyone is square when nobody owes', () => {
    const data = computeFees([week('w1', '01 Oct 2026', ['Matt'])], {}, { 'w1|Matt': true }, 6, RANGE_30, TODAY)
    const text = buildShareText(data, 'Hackney Thursdays')
    expect(text).toContain('All square, nobody owes anything.')
    expect(text).not.toContain('Matt')
  })

  it('formats pence and flags games that cost something else', () => {
    const data = computeFees(weeks, { w1: 7 }, payments, 6.5, RANGE_30, TODAY)
    const text = buildShareText(data, 'Hackney Thursdays')
    expect(text).toContain('Matt · £20')
    expect(text).toContain('£6.50 per player per game, some games differ')
  })

  it('never uses an em dash', () => {
    const data = computeFees(weeks, {}, payments, 6, RANGE_30, TODAY)
    expect(buildShareText(data, 'Hackney Thursdays')).not.toMatch(/—/)
  })
})

describe('formatMoney', () => {
  it('drops pence on whole pounds', () => {
    expect(formatMoney(6)).toBe('£6')
    expect(formatMoney(6.5)).toBe('£6.50')
    expect(formatMoney(0.1 + 0.2)).toBe('£0.30')
  })
})

describe('parseFeeRange', () => {
  it('defaults to the last 30 days', () => {
    expect(parseFeeRange({})).toEqual({ preset: '30' })
    expect(parseFeeRange({ range: 'nonsense' })).toEqual({ preset: '30' })
  })

  it('reads presets and custom dates', () => {
    expect(parseFeeRange({ range: '90' })).toEqual({ preset: '90' })
    expect(parseFeeRange({ range: 'custom', from: '2026-09-01', to: '2026-10-01' })).toEqual({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-10-01',
    })
  })

  it('drops malformed custom dates', () => {
    expect(parseFeeRange({ range: 'custom', from: '1 Sep', to: '2026-10-01' })).toEqual({
      preset: 'custom',
      to: '2026-10-01',
    })
  })
})

describe('presetSummaries', () => {
  it('counts played games and spans each preset without the year', () => {
    const weeks = [
      week('w1', '01 Oct 2026', ['A']),
      week('w2', '24 Sep 2026', [], [], { status: 'cancelled' }),
      week('w3', '01 Aug 2026', ['A']),
      week('w4', '01 Jan 2026', ['A']),
    ]
    expect(presetSummaries(weeks, TODAY)).toEqual([
      { preset: '30', label: 'Last 30 days', span: '24 Sep – 1 Oct', games: 1 },
      { preset: '90', label: 'Last 3 months', span: '1 Aug – 1 Oct', games: 2 },
      { preset: '180', label: 'Last 6 months', span: '1 Aug – 1 Oct', games: 2 },
      { preset: 'all', label: 'All time', span: '1 Jan – 1 Oct', games: 3 },
    ])
  })
})
