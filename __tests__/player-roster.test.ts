import type { PlayerAttribute, Mentality } from '@/lib/types'
import { parsePlayerPatch } from '@/lib/playerUtils'

// ── PlayerAttribute type ─────────────────────────────────────

describe('PlayerAttribute type', () => {
  it('accepts valid strength and mentality', () => {
    const p: PlayerAttribute = { name: 'Alice', strength: 'average', mentality: 'balanced' }
    expect(p.strength).toBe('average')
    expect(p.mentality).toBe('balanced')
  })

  it('accepts optional linked member fields', () => {
    const linked: PlayerAttribute = {
      name: 'Bob',
      strength: 'below',
      mentality: 'defensive',
      linked_user_id: 'uuid-123',
      linked_display_name: 'Bob Smith',
    }
    expect(linked.linked_user_id).toBe('uuid-123')
    expect(linked.linked_display_name).toBe('Bob Smith')
  })

  it('accepts null linked member fields', () => {
    const unlinked: PlayerAttribute = {
      name: 'Carol',
      strength: 'average',
      mentality: 'balanced',
      linked_user_id: null,
      linked_display_name: null,
    }
    expect(unlinked.linked_user_id).toBeNull()
    expect(unlinked.linked_display_name).toBeNull()
  })

  it('accepts missing linked member fields (undefined)', () => {
    const p: PlayerAttribute = { name: 'Dave', strength: 'above', mentality: 'attacking' }
    expect(p.linked_user_id).toBeUndefined()
    expect(p.linked_display_name).toBeUndefined()
  })

  it('accepts null strength (unrated player)', () => {
    const p: PlayerAttribute = { name: 'Eve', strength: null, mentality: 'balanced' }
    expect(p.strength).toBeNull()
  })
})

// ── parsePlayerPatch ─────────────────────────────────────────

describe('parsePlayerPatch', () => {
  it('accepts the canonical strength key', () => {
    expect(parsePlayerPatch({ strength: 'above' })).toEqual({ strength: 'above' })
  })

  it('falls back to legacy rating key (deprecated)', () => {
    expect(parsePlayerPatch({ rating: 3 })).toEqual({ strength: 'above' })
    expect(parsePlayerPatch({ rating: 2 })).toEqual({ strength: 'average' })
    expect(parsePlayerPatch({ rating: 1 })).toEqual({ strength: 'below' })
  })

  it('rejects out-of-range rating', () => {
    expect(parsePlayerPatch({ rating: 4 })).toBeNull()
    expect(parsePlayerPatch({ rating: 0 })).toBeNull()
  })

  it('rejects invalid strength', () => {
    expect(parsePlayerPatch({ strength: 'huge' })).toBeNull()
  })

  it('accepts valid mentality only', () => {
    expect(parsePlayerPatch({ mentality: 'attacking' })).toEqual({ mentality: 'attacking' })
  })

  it('accepts strength and mentality together', () => {
    expect(parsePlayerPatch({ strength: 'below', mentality: 'defensive' })).toEqual({
      strength: 'below',
      mentality: 'defensive',
    })
  })

  it('returns null when body is not an object', () => {
    expect(parsePlayerPatch(null)).toBeNull()
    expect(parsePlayerPatch('foo')).toBeNull()
  })

  it('returns null when rating is not an integer', () => {
    expect(parsePlayerPatch({ rating: 1.5 })).toBeNull()
  })

  it('returns null when mentality is not a valid value', () => {
    expect(parsePlayerPatch({ mentality: 'striker' })).toBeNull()
  })

  it('returns null when neither field is provided', () => {
    expect(parsePlayerPatch({})).toBeNull()
  })
})
