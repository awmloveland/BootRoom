import { parseAddPlayerBody } from '@/lib/playerUtils'

describe('parseAddPlayerBody', () => {
  it('parses a valid body', () => {
    expect(
      parseAddPlayerBody({ name: 'Will', strength: 'average', mentality: 'balanced' })
    ).toEqual({ name: 'Will', strength: 'average', mentality: 'balanced' })
  })

  it('trims the name', () => {
    expect(
      parseAddPlayerBody({ name: '  Will  ', strength: 'above', mentality: 'attacking' })
    ).toEqual({ name: 'Will', strength: 'above', mentality: 'attacking' })
  })

  it('returns null for empty / whitespace-only name', () => {
    expect(parseAddPlayerBody({ name: '', strength: 'average', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: '   ', strength: 'average', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for missing or non-string name', () => {
    expect(parseAddPlayerBody({ strength: 'average', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 42, strength: 'average', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for invalid strength', () => {
    expect(parseAddPlayerBody({ name: 'Will', strength: 'great', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', strength: 2, mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for invalid mentality', () => {
    expect(parseAddPlayerBody({ name: 'Will', strength: 'average', mentality: 'sweeper' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', strength: 'average' })).toBeNull()
  })

  it('returns null for non-object body', () => {
    expect(parseAddPlayerBody(null)).toBeNull()
    expect(parseAddPlayerBody('hello')).toBeNull()
    expect(parseAddPlayerBody([])).toBeNull()
  })
})
