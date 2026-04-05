import type { PlayerAttribute, Mentality } from '@/lib/types'
import { parsePlayerPatch } from '@/lib/playerUtils'

// ── PlayerAttribute type ─────────────────────────────────────

describe('PlayerAttribute type', () => {
  it('accepts valid rating and mentality', () => {
    const p: PlayerAttribute = { name: 'Alice', rating: 2, mentality: 'balanced' }
    expect(p.rating).toBe(2)
    expect(p.mentality).toBe('balanced')
  })

  it('accepts optional linked member fields', () => {
    const linked: PlayerAttribute = {
      name: 'Bob',
      rating: 1,
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
      rating: 2,
      mentality: 'balanced',
      linked_user_id: null,
      linked_display_name: null,
    }
    expect(unlinked.linked_user_id).toBeNull()
    expect(unlinked.linked_display_name).toBeNull()
  })

  it('accepts missing linked member fields (undefined)', () => {
    const p: PlayerAttribute = { name: 'Dave', rating: 3, mentality: 'attacking' }
    expect(p.linked_user_id).toBeUndefined()
    expect(p.linked_display_name).toBeUndefined()
  })
})

// ── parsePlayerPatch ─────────────────────────────────────────

describe('parsePlayerPatch', () => {
  it('accepts valid rating only', () => {
    expect(parsePlayerPatch({ rating: 3 })).toEqual({ rating: 3 })
  })

  it('accepts valid mentality only', () => {
    expect(parsePlayerPatch({ mentality: 'attacking' })).toEqual({ mentality: 'attacking' })
  })

  it('accepts both fields', () => {
    expect(parsePlayerPatch({ rating: 1, mentality: 'defensive' })).toEqual({
      rating: 1,
      mentality: 'defensive',
    })
  })

  it('returns null when body is not an object', () => {
    expect(parsePlayerPatch(null)).toBeNull()
    expect(parsePlayerPatch('foo')).toBeNull()
  })

  it('returns null when rating is out of range', () => {
    expect(parsePlayerPatch({ rating: 0 })).toBeNull()
    expect(parsePlayerPatch({ rating: 4 })).toBeNull()
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
