import { generateSlug, SLUG_CODE, slugCode } from '@/lib/utils'

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

describe('slugCode', () => {
  it('always returns three characters from the vowel-free alphabet', () => {
    for (let i = 0; i < 200; i++) expect(slugCode()).toMatch(SLUG_CODE)
  })

  it('rejects vowels, capitals, 0, 1 and l', () => {
    for (const bad of ['abc', 'K7X', 'k0x', 'k1x', 'klx', 'k7', 'k7xx']) expect(SLUG_CODE.test(bad)).toBe(false)
  })
})
