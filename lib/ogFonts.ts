import { readFile } from 'fs/promises'
import path from 'path'

export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: 700
  style: 'normal'
}

const FONT_FILES = [
  ['Space Grotesk', 'SpaceGrotesk-Bold.ttf'],
  ['Inter', 'Inter-Bold.ttf'],
  ['IBM Plex Mono', 'IBMPlexMono-Bold.ttf'],
] as const

let loaded: Promise<OgFont[]> | null = null

/**
 * The TTFs in assets/fonts, read once per server instance. next/og can't use
 * the WOFF2 files next/font serves. next.config.js traces them into the
 * /api/og/lineup bundle.
 */
export function loadOgFonts(): Promise<OgFont[]> {
  loaded ??= Promise.all(
    FONT_FILES.map(async ([name, file]) => {
      const buf = await readFile(path.join(process.cwd(), 'assets/fonts', file))
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return { name, data, weight: 700 as const, style: 'normal' as const }
    })
  ).catch((err) => {
    loaded = null // retry on the next request
    throw err
  })
  return loaded
}
