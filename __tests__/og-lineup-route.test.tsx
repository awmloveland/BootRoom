import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/lineupShareServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, LineupImage } from '@/components/og/LineupShareImage'
import type { SharedLineup } from '@/lib/types'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))
jest.mock('@/lib/lineupShareServer', () => ({ loadSharedLineup: jest.fn() }))
jest.mock('@/lib/ogFonts', () => ({ loadOgFonts: jest.fn() }))

import { GET } from '@/app/api/og/lineup/route'

const FONTS = [{ name: 'Inter', data: new ArrayBuffer(1), weight: 700, style: 'normal' }]
const LINEUP = { leagueName: 'The Boot Room', week: 13 } as SharedLineup

beforeEach(() => {
  jest.resetAllMocks()
  ;(loadOgFonts as jest.Mock).mockResolvedValue(FONTS)
})

function lastRender() {
  const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
  return { element, options }
}

describe('GET /api/og/lineup', () => {
  it('renders the lineup for a valid token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    await GET(new Request('http://localhost/api/og/lineup?t=abc.def'))
    expect(loadSharedLineup).toHaveBeenCalledWith('abc.def')
    const { element, options } = lastRender()
    expect(element.type).toBe(LineupImage)
    expect(element.props.lineup).toBe(LINEUP)
    expect(options).toEqual(expect.objectContaining({
      width: 1200,
      height: 630,
      fonts: FONTS,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
    }))
  })

  it('renders the generic card when the token does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/og/lineup?t=bad'))
    expect(lastRender().element.type).toBe(GenericShareImage)
  })

  it('renders the generic card with no token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/og/lineup'))
    expect(loadSharedLineup).toHaveBeenCalledWith(null)
    expect(lastRender().element.type).toBe(GenericShareImage)
  })
})
