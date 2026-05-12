import { isGuestName, validateNameGuestInput } from '@/lib/guestName'

describe('isGuestName', () => {
  it('returns true for "Lloyd +1"', () => {
    expect(isGuestName('Lloyd +1')).toBe(true)
  })
  it('returns true for "Mary Jane +2"', () => {
    expect(isGuestName('Mary Jane +2')).toBe(true)
  })
  it('returns false for a normal name', () => {
    expect(isGuestName('Lloyd')).toBe(false)
  })
  it('returns false when "+" has no space before it', () => {
    expect(isGuestName('Lloyd+1')).toBe(false)
  })
  it('returns false for "+1" alone', () => {
    expect(isGuestName('+1')).toBe(false)
  })
})

describe('validateNameGuestInput', () => {
  const existing = ['Lloyd', 'Mary', 'Lloyd +1']

  it('returns "Name is required." for empty input', () => {
    expect(validateNameGuestInput('', existing)).toBe('Name is required.')
  })
  it('returns "Name is required." for whitespace-only input', () => {
    expect(validateNameGuestInput('   ', existing)).toBe('Name is required.')
  })
  it('returns collision error when name matches existing (case-insensitive)', () => {
    expect(validateNameGuestInput('lloyd', existing)).toBe('A player with this name already exists.')
  })
  it('returns collision error when name matches existing after trimming', () => {
    expect(validateNameGuestInput('  Lloyd  ', existing)).toBe('A player with this name already exists.')
  })
  it('returns null for a fresh name', () => {
    expect(validateNameGuestInput('Steve', existing)).toBeNull()
  })
})
