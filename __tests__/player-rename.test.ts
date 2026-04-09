import { parseRenameName } from '@/lib/playerUtils'

describe('parseRenameName', () => {
  it('returns trimmed string for a valid name', () => {
    expect(parseRenameName('  William  ')).toBe('William')
  })

  it('returns the name unchanged when no whitespace', () => {
    expect(parseRenameName('James')).toBe('James')
  })

  it('returns null for an empty string', () => {
    expect(parseRenameName('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(parseRenameName('   ')).toBeNull()
  })

  it('returns null for a non-string value', () => {
    expect(parseRenameName(null)).toBeNull()
    expect(parseRenameName(42)).toBeNull()
    expect(parseRenameName(undefined)).toBeNull()
  })
})
