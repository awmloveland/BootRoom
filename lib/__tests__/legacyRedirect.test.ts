import { legacyLeaguePath } from '@/lib/legacyRedirect'

describe('legacyLeaguePath', () => {
  it('sends the league root to the league root', () => {
    expect(legacyLeaguePath('boot-room', undefined)).toBe('/boot-room')
  })
  it('keeps players and settings sub-paths', () => {
    expect(legacyLeaguePath('boot-room', ['players'])).toBe('/boot-room/players')
    expect(legacyLeaguePath('boot-room', ['settings'])).toBe('/boot-room/settings')
  })
  it('drops anything it does not recognise', () => {
    expect(legacyLeaguePath('boot-room', ['old', 'thing'])).toBe('/boot-room')
  })
})
