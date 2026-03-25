import type { PlayerAttribute, Mentality } from '@/lib/types'
import { parsePlayerPatch } from '@/lib/playerUtils'

// ── PlayerAttribute type ─────────────────────────────────────

describe('PlayerAttribute type', () => {
  it('accepts valid rating and mentality', () => {
    const p: PlayerAttribute = { name: 'Alice', rating: 2, mentality: 'balanced' }
    expect(p.rating).toBe(2)
    expect(p.mentality).toBe('balanced')
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
