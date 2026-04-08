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
})

describe('getAvatarColor', () => {
  it('returns an object with bg, border, and text string properties', () => {
    const color = getAvatarColor('Will Loveland')
    expect(typeof color.bg).toBe('string')
    expect(typeof color.border).toBe('string')
    expect(typeof color.text).toBe('string')
  })

  it('returns the same colour for the same name', () => {
    expect(getAvatarColor('Will Loveland')).toEqual(getAvatarColor('Will Loveland'))
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
