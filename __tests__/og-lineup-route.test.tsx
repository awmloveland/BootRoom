import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/shareLinksServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { LineupImage } from '@/components/og/LineupShareImage'
import { GenericShareImage } from '@/components/og/frame'
import type { SharedLineup } from '@/lib/types'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))
jest.mock('@/lib/shareLinksServer', () => ({ loadSharedLineup: jest.fn() }))
jest.mock('@/lib/ogFonts', () => ({ loadOgFonts: jest.fn() }))

import { GET } from '@/app/api/og/lineup/route'

const FONTS = [{ name: 'Inter', data: new ArrayBuffer(1), weight: 700, style: 'normal' }]
const LINEUP = { leagueName: 'The Boot Room', week: 13 } as SharedLineup
const SENTINEL = { sentinel: true }
const LINEUP_CACHE = 'public, max-age=300, s-maxage=3600'
const GENERIC_CACHE = 'public, max-age=60, s-maxage=60'

beforeEach(() => {
  jest.resetAllMocks()
  ;(loadOgFonts as jest.Mock).mockResolvedValue(FONTS)
  ;(ImageResponse as unknown as jest.Mock).mockImplementation(function () {
    return SENTINEL
  })
})

function lastRender() {
  const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
  return { element, options }
}

describe('GET /api/og/lineup', () => {
  it('renders the lineup for a valid token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const res = await GET(new Request('http://localhost/api/og/lineup?t=abc.def'))
    expect(res).toBe(SENTINEL)
    expect(loadSharedLineup).toHaveBeenCalledWith('abc.def')
    const { element, options } = lastRender()
    expect(element.type).toBe(LineupImage)
    expect(element.props.lineup).toBe(LINEUP)
    expect(options).toEqual(expect.objectContaining({
      width: 1200,
      height: 630,
      fonts: FONTS,
      headers: { 'Cache-Control': LINEUP_CACHE },
    }))
  })

  it('renders the generic card when the token does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/og/lineup?t=bad'))
    expect(res).toBe(SENTINEL)
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': GENERIC_CACHE })
  })

  it('renders the generic card with no token', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/og/lineup'))
    expect(loadSharedLineup).toHaveBeenCalledWith(null)
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': GENERIC_CACHE })
  })
})
