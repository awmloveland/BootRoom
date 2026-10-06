import { safeRedirectPath } from '@/lib/utils'

describe('safeRedirectPath', () => {
  it('keeps same-site paths with their query and hash', () => {
    expect(safeRedirectPath('/craft-football/settings')).toBe('/craft-football/settings')
    expect(safeRedirectPath('/craft-football/admin?range=90#games')).toBe('/craft-football/admin?range=90#games')
  })

  it('falls back to the home page when missing', () => {
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath(null, '/settings')).toBe('/settings')
  })

  it('refuses anything that would leave the site', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '@evil.example',
      'evil.example/path',
      'javascript:alert(1)',
      '/craft-football\r\nSet-Cookie: x=1',
      ' /craft-football',
    ]) {
      expect(safeRedirectPath(bad)).toBe('/')
    }
  })
})
