import { generateSlug } from '@/lib/utils'

describe('generateSlug', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(generateSlug('The Boot Room')).toBe('the-boot-room')
  })

  it('collapses multiple non-alphanumeric chars into a single hyphen', () => {
    expect(generateSlug('Boot  Room!!  FC')).toBe('boot-room-fc')
  })

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('  !!Boot Room!!  ')).toBe('boot-room')
  })

  it('handles numbers in the name', () => {
    expect(generateSlug('League 5 FC')).toBe('league-5-fc')
  })

  it('handles a name that is already a valid slug', () => {
    expect(generateSlug('the-boot-room')).toBe('the-boot-room')
  })

  it('handles special characters', () => {
    expect(generateSlug("Lads' FC — Sunday")).toBe('lads-fc-sunday')
  })
})
