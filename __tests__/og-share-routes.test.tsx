import { ImageResponse } from 'next/og'
import { loadInvitePreview, loadSharedLeague, loadSharedQuarter, loadSharedResult } from '@/lib/shareLinksServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage } from '@/components/og/frame'
import { ResultImage } from '@/components/og/ResultShareImage'
import { QuarterImage } from '@/components/og/QuarterShareImage'
import { LeagueImage } from '@/components/og/LeagueShareImage'
import { InviteImage } from '@/components/og/InviteShareImage'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))
jest.mock('@/lib/ogFonts', () => ({ loadOgFonts: jest.fn() }))
jest.mock('@/lib/shareLinksServer', () => ({
  loadSharedResult: jest.fn(),
  loadSharedQuarter: jest.fn(),
  loadSharedLeague: jest.fn(),
  loadInvitePreview: jest.fn(),
}))

import { GET as resultGET } from '@/app/api/og/result/route'
import { GET as quarterGET } from '@/app/api/og/quarter/route'
import { GET as leagueGET } from '@/app/api/og/league/route'
import { GET as inviteGET } from '@/app/api/og/invite/route'
import { GET as defaultGET } from '@/app/api/og/default/route'

const SENTINEL = { sentinel: true }
const GENERIC_CACHE = 'public, max-age=60, s-maxage=60'

beforeEach(() => {
  jest.resetAllMocks()
  ;(loadOgFonts as jest.Mock).mockResolvedValue([])
  ;(ImageResponse as unknown as jest.Mock).mockImplementation(function () {
    return SENTINEL
  })
})

function lastRender() {
  const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
  return { element, options }
}

const CASES = [
  { name: 'result', GET: resultGET, loader: loadSharedResult, param: 't', component: ResultImage, prop: 'result', cache: 'public, max-age=300, s-maxage=3600' },
  { name: 'quarter', GET: quarterGET, loader: loadSharedQuarter, param: 't', component: QuarterImage, prop: 'quarter', cache: 'public, max-age=300, s-maxage=3600' },
  { name: 'league', GET: leagueGET, loader: loadSharedLeague, param: 't', component: LeagueImage, prop: 'league', cache: 'public, max-age=300, s-maxage=900' },
  { name: 'invite', GET: inviteGET, loader: loadInvitePreview, param: 'token', component: InviteImage, prop: 'invite', cache: 'public, max-age=300, s-maxage=900' },
]

describe.each(CASES)('GET /api/og/$name', ({ name, GET, loader, param, component, prop, cache }) => {
  it('draws the image for a token that resolves', async () => {
    const data = { leagueName: 'The Boot Room' }
    ;(loader as jest.Mock).mockResolvedValue(data)
    await expect(GET(new Request(`http://localhost/api/og/${name}?${param}=abc`))).resolves.toBe(SENTINEL)
    expect(loader).toHaveBeenCalledWith('abc')
    const { element, options } = lastRender()
    expect(element.type).toBe(component)
    expect(element.props[prop]).toBe(data)
    expect(options).toEqual(expect.objectContaining({ width: 1200, height: 630, headers: { 'Cache-Control': cache } }))
  })

  it('draws the generic card, briefly cached, when it does not', async () => {
    ;(loader as jest.Mock).mockResolvedValue(null)
    await GET(new Request(`http://localhost/api/og/${name}`))
    expect(loader).toHaveBeenCalledWith(null)
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': GENERIC_CACHE })
  })
})

describe('GET /api/og/default', () => {
  it('draws the generic card, cached for a day', async () => {
    await defaultGET()
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': 'public, max-age=3600, s-maxage=86400' })
  })
})
