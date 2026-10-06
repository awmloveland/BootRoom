// Link-preview image for a shared result (layout C): headline and winners on
// the left, up to three highlights on the right. See components/og/frame.tsx
// for the Satori rules this file follows.
import type { CSSProperties } from 'react'
import { formatFixtureDate } from '@/lib/utils'
import type { SharedResult } from '@/lib/types'
import { FooterWordmark, Glow, MetaLine, OG_H, OgIcon, ROOT } from '@/components/og/frame'

const EDGE = 8
const SIDES = {
  teamA: { bar: '#38bdf8', light: '#7dd3fc', names: '#dff1ff', glow: 'rgba(56,189,248,0.18)' },
  teamB: { bar: '#a78bfa', light: '#c4b5fd', names: '#efeaff', glow: 'rgba(167,139,250,0.18)' },
} as const

const LABEL: CSSProperties = {
  fontFamily: 'IBM Plex Mono',
  fontSize: 19,
  fontWeight: 700,
  letterSpacing: 2.85,
  textTransform: 'uppercase',
}
// Names wrap to at most three lines, then are cut off.
const NAMES: CSSProperties = { fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 1.3, maxHeight: 94, overflow: 'hidden' }

/** The two headline lines: "Team A" / "win by 3", or "Honours" / "even". */
export function resultHeadline(result: Pick<SharedResult, 'winner' | 'goalDifference'>): [string, string] {
  if (result.winner === 'draw') return ['Honours', 'even']
  return [result.winner === 'teamA' ? 'Team A' : 'Team B', `win by ${result.goalDifference}`]
}

export function ResultImage({ result }: { result: SharedResult }) {
  const side = result.winner === 'draw' ? null : SIDES[result.winner]
  const [line1, line2] = resultHeadline(result)
  const winners = result.winner === 'teamB' ? result.teamB : result.teamA
  const losers = result.winner === 'teamB' ? result.teamA : result.teamB
  // A draw with nothing to call out gives the teams the full width.
  const showPanel = side !== null || result.highlights.length > 0

  return (
    <div style={ROOT}>
      {side && <Glow at="15% 10%" color={side.glow} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: OG_H, backgroundColor: side?.bar ?? '#223a5c' }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={`${result.leagueName} · Week ${result.week}`} right={formatFixtureDate(result.date)} />
        <div style={{ display: 'flex', marginTop: 34 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: showPanel ? 570 : 1080 }}>
            <div style={{ ...LABEL, color: side?.light ?? '#8ba4c4' }}>Full time</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10, fontSize: 80, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.02 }}>
              <div>{line1}</div>
              <div style={{ color: side?.light ?? '#8ba4c4' }}>{line2}</div>
            </div>
            {side ? (
              <div style={{ ...NAMES, marginTop: 18, color: side.names }}>{winners.join(', ')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
                <div style={{ ...NAMES, maxHeight: 62, color: SIDES.teamA.names }}>{`Team A · ${result.teamA.join(', ')}`}</div>
                <div style={{ ...NAMES, maxHeight: 62, marginTop: 6, color: SIDES.teamB.names }}>{`Team B · ${result.teamB.join(', ')}`}</div>
              </div>
            )}
          </div>
          {showPanel && <HighlightsPanel highlights={result.highlights} losers={losers} />}
        </div>
      </div>

      <FooterWordmark />
    </div>
  )
}

function HighlightsPanel({ highlights, losers }: { highlights: SharedResult['highlights']; losers: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 470, marginLeft: 40, paddingLeft: 40, borderLeft: '2px solid #17263c' }}>
      <div style={{ ...LABEL, color: '#8ba4c4' }}>{highlights.length > 0 ? 'Highlights' : 'Beat'}</div>
      {highlights.length > 0 ? (
        highlights.map((h, i) => (
          <div
            key={h.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: i === 0 ? 20 : 18,
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.25,
              color: i === 0 ? '#bef264' : '#f4f9ff',
            }}
          >
            <OgIcon name={h.icon} size={26} color={i === 0 ? '#bef264' : '#8ba4c4'} />
            <div style={{ display: 'flex', marginLeft: 14, width: 390 }}>{h.text}</div>
          </div>
        ))
      ) : (
        <div style={{ ...NAMES, marginTop: 20, color: '#8ba4c4' }}>{losers.join(', ')}</div>
      )}
    </div>
  )
}
