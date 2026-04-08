import { getInitials, getAvatarColor } from '../utils'

describe('getInitials', () => {
  it('returns double initials for a two-word name', () => {
    expect(getInitials('Will Loveland')).toBe('WL')
  })

  it('returns double initials for a three-word name (uses first two words)', () => {
    expect(getInitials('Mary Jo Smith')).toBe('MJ')
  })

  it('returns single initial for a one-word name', () => {
    expect(getInitials('Madonna')).toBe('M')
  })

  it('returns empty string for an empty string', () => {
    expect(getInitials('')).toBe('')
  })

  it('uppercases initials regardless of input case', () => {
    expect(getInitials('will loveland')).toBe('WL')
  })

  it('trims leading/trailing whitespace', () => {
    expect(getInitials('  Will Loveland  ')).toBe('WL')
  })

  it('returns empty string for a whitespace-only string', () => {
    expect(getInitials('   ')).toBe('')
  })
})

describe('getAvatarColor', () => {
  it('returns the exact palette entry for a known name', () => {
    // 'Will Loveland' char codes sum to 1261, 1261 % 6 = 1 → blue
    expect(getAvatarColor('Will Loveland')).toEqual({
      bg: '#1e3a5f',
      border: '#2563eb',
      text: '#93c5fd',
    })
  })

  it('returns the same palette entry on repeated calls (deterministic)', () => {
    // 'Alice' char codes sum to 478, 478 % 6 = 4 → rose
    expect(getAvatarColor('Alice')).toEqual({
      bg: '#2d0a16',
      border: '#e11d48',
      text: '#fda4af',
    })
    // calling again returns identical result
    expect(getAvatarColor('Alice')).toEqual(getAvatarColor('Alice'))
  })

  it('returns a valid palette entry (bg starts with #)', () => {
    const color = getAvatarColor('Alice')
    expect(color.bg).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color.border).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color.text).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('returns a colour for an empty string without throwing', () => {
    expect(() => getAvatarColor('')).not.toThrow()
  })
})
