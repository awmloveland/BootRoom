import { parseLineupMetadata, serializeLineupMetadata } from '@/lib/utils'
import { buildLineupAudit, TEAM_BUILDER_VERSION } from '@/lib/autoPick'
import type { LineupMetadata } from '@/lib/types'
import { makePlayer, ratedPlayer } from './helpers/players'

const GUESTS_ONLY = {
  guests: [{ name: 'Alice +1', associated_player: 'Alice', goalkeeper: true, strength: 'above' }],
  new_players: [{ name: 'Zed', mentality: 'attacking', goalkeeper: false, strength: 'below' }],
}

const AUTO_PICK = {
  algorithm: 2, suggestion_index: 1, suggestion_count: 5, edited: true,
  best_diff: 0.012, saved_diff: 1.234, built_at: '2026-10-05T17:02:11.000Z',
}

const RATINGS = [
  { name: 'Alice', team: 'A', wpr: 41.351, strength: 'above', played: 25, games_missed: 0, kind: 'roster' },
  { name: 'Alice +1', team: 'B', wpr: 36.125, strength: 'average', played: 0, games_missed: 0, kind: 'guest' },
]

describe('parseLineupMetadata', () => {
  it('returns null for absent metadata', () => {
    expect(parseLineupMetadata(null)).toBeNull()
    expect(parseLineupMetadata(undefined)).toBeNull()
  })

  it('maps guests and new players and leaves the audit keys out when absent', () => {
    const parsed = parseLineupMetadata(GUESTS_ONLY)
    expect(parsed).toEqual({
      guests: [{ type: 'guest', name: 'Alice +1', associatedPlayer: 'Alice', goalkeeper: true, strength: 'above' }],
      new_players: [{ type: 'new_player', name: 'Zed', mentality: 'attacking', strength: 'below' }],
    })
    expect(parsed).not.toHaveProperty('autoPick')
    expect(parsed).not.toHaveProperty('ratings')
  })

  it('maps the audit block and ratings when present', () => {
    const parsed = parseLineupMetadata({ ...GUESTS_ONLY, auto_pick: AUTO_PICK, ratings: RATINGS })
    expect(parsed?.autoPick).toEqual({
      algorithm: 2, suggestionIndex: 1, suggestionCount: 5, edited: true,
      bestDiff: 0.012, savedDiff: 1.234, builtAt: '2026-10-05T17:02:11.000Z',
    })
    expect(parsed?.ratings).toEqual([
      { name: 'Alice', team: 'A', wpr: 41.351, strength: 'above', played: 25, gamesMissed: 0, kind: 'roster' },
      { name: 'Alice +1', team: 'B', wpr: 36.125, strength: 'average', played: 0, gamesMissed: 0, kind: 'guest' },
    ])
  })

  it('maps a partial record with only one of the two audit keys', () => {
    const onlyAudit = parseLineupMetadata({ auto_pick: AUTO_PICK })
    expect(onlyAudit?.guests).toEqual([])
    expect(onlyAudit?.new_players).toEqual([])
    expect(onlyAudit?.autoPick?.edited).toBe(true)
    expect(onlyAudit).not.toHaveProperty('ratings')

    const onlyRatings = parseLineupMetadata({ guests: [], ratings: RATINGS })
    expect(onlyRatings).not.toHaveProperty('autoPick')
    expect(onlyRatings?.ratings).toHaveLength(2)
  })

  it('accepts legacy strength_hint and goalkeeper-only new players', () => {
    const parsed = parseLineupMetadata({
      guests: [{ name: 'Bob +1', associated_player: 'Bob', strength_hint: 'below' }],
      new_players: [{ name: 'Yan', goalkeeper: true }],
    })
    expect(parsed?.guests[0]).toEqual({ type: 'guest', name: 'Bob +1', associatedPlayer: 'Bob', goalkeeper: false, strength: 'below' })
    expect(parsed?.new_players[0]).toEqual({ type: 'new_player', name: 'Yan', mentality: 'goalkeeper', strength: 'average' })
  })
})

describe('serializeLineupMetadata', () => {
  it('writes snake_case keys that parse back to the same metadata', () => {
    const meta: LineupMetadata = {
      guests: [{ type: 'guest', name: 'Alice +1', associatedPlayer: 'Alice', goalkeeper: false, strength: 'average' }],
      new_players: [{ type: 'new_player', name: 'Zed', mentality: 'goalkeeper', strength: 'above' }],
      autoPick: { algorithm: 2, suggestionIndex: 0, suggestionCount: 5, edited: false, bestDiff: 0.1, savedDiff: 0.2, builtAt: '2026-10-05T17:02:11.000Z' },
      ratings: [{ name: 'Zed', team: 'A', wpr: 42.5, strength: 'above', played: 0, gamesMissed: 0, kind: 'new' }],
    }
    const db = serializeLineupMetadata(meta)
    expect(db).toEqual({
      guests: [{ name: 'Alice +1', associated_player: 'Alice', goalkeeper: false, strength: 'average' }],
      new_players: [{ name: 'Zed', mentality: 'goalkeeper', goalkeeper: true, strength: 'above' }],
      auto_pick: { algorithm: 2, suggestion_index: 0, suggestion_count: 5, edited: false, best_diff: 0.1, saved_diff: 0.2, built_at: '2026-10-05T17:02:11.000Z' },
      ratings: [{ name: 'Zed', team: 'A', wpr: 42.5, strength: 'above', played: 0, games_missed: 0, kind: 'new' }],
    })
    expect(parseLineupMetadata(db)).toEqual(meta)
  })

  it('omits the audit keys when the metadata has none', () => {
    const db = serializeLineupMetadata({ guests: [], new_players: [] })
    expect(db).toEqual({ guests: [], new_players: [] })
  })
})

describe('buildLineupAudit', () => {
  it('records the pick and the ratings the picker saw', () => {
    const teamA = [ratedPlayer('Alice', 41.3514, { playerId: 'roster|Alice', strength: 'above', gamesMissed: 2 })]
    const teamB = [
      makePlayer('Alice +1', { playerId: 'guest|Alice +1' }),
      makePlayer('Zed', { playerId: 'new|Zed', strength: 'below' }),
    ]
    const { autoPick, ratings } = buildLineupAudit({
      teamA, teamB,
      teamARating: 41.3514, teamBRating: 33.0001,
      bestDiff: 0.01234,
      suggestionIndex: 2, suggestionCount: 5, edited: true,
      builtAt: new Date('2026-10-05T17:02:11.000Z'),
    })
    expect(autoPick).toEqual({
      algorithm: TEAM_BUILDER_VERSION, suggestionIndex: 2, suggestionCount: 5, edited: true,
      bestDiff: 0.012, savedDiff: 8.351, builtAt: '2026-10-05T17:02:11.000Z',
    })
    expect(TEAM_BUILDER_VERSION).toBe(2)
    expect(ratings).toEqual([
      { name: 'Alice', team: 'A', wpr: 41.351, strength: 'above', played: 40, gamesMissed: 2, kind: 'roster' },
      { name: 'Alice +1', team: 'B', wpr: 36.125, strength: 'average', played: 0, gamesMissed: 0, kind: 'guest' },
      { name: 'Zed', team: 'B', wpr: 29.75, strength: 'below', played: 0, gamesMissed: 0, kind: 'new' },
    ])
  })
})
