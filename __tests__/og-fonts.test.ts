import type { OgFont } from '@/lib/ogFonts'

const mockReadFile = jest.fn()
jest.mock('fs/promises', () => ({ readFile: (...args: unknown[]) => mockReadFile(...args) }))

function load(): Promise<OgFont[]> {
  let loadOgFonts!: () => Promise<OgFont[]>
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loadOgFonts = require('@/lib/ogFonts').loadOgFonts
  })
  return loadOgFonts()
}

beforeEach(() => {
  mockReadFile.mockReset()
  mockReadFile.mockImplementation(async () => Buffer.from([1, 2, 3]))
})

describe('loadOgFonts', () => {
  it('returns the three bold fonts as ArrayBuffers', async () => {
    const fonts = await load()
    expect(fonts.map((f) => f.name)).toEqual(['Space Grotesk', 'Inter', 'IBM Plex Mono'])
    for (const f of fonts) {
      expect(f.weight).toBe(700)
      expect(f.style).toBe('normal')
      expect(f.data).toBeInstanceOf(ArrayBuffer)
      expect(f.data.byteLength).toBe(3)
    }
    expect(mockReadFile).toHaveBeenCalledTimes(3)
  })

  it('reads the files once per instance', async () => {
    jest.resetModules()
    const { loadOgFonts } = await import('@/lib/ogFonts')
    const first = await loadOgFonts()
    const second = await loadOgFonts()
    expect(second).toBe(first)
    expect(mockReadFile).toHaveBeenCalledTimes(3)
  })

  it('retries on the next call after a failed read', async () => {
    jest.resetModules()
    const { loadOgFonts } = await import('@/lib/ogFonts')
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(loadOgFonts()).rejects.toThrow('ENOENT')
    const fonts = await loadOgFonts()
    expect(fonts).toHaveLength(3)
  })
})
