// Link-preview image for a shared lineup (layout C): shaded team halves, big
// names, wordmark along the bottom. See components/og/frame.tsx for the
// Satori rules this file follows.
import { formatFixtureDate, lineupImageFontSize, LINEUP_IMAGE } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'
import { FooterWordmark, MetaLine, OG_H as H, OG_W as W, ROOT } from '@/components/og/frame'

const HALF = W / 2
const EDGE = 8

function TeamColumn({ label, names, fontSize, accent, text }: {
  label: string
  names: string[]
  fontSize: number
  accent: string
  text: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: LINEUP_IMAGE.columnWidth }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: accent }}>
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 6,
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize,
          lineHeight: LINEUP_IMAGE.lineHeight,
          color: text,
        }}
      >
        {names.map((name, i) => (
          <div key={`${i}-${name}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Layout C: shaded team halves, big names, wordmark along the bottom. */
export function LineupImage({ lineup }: { lineup: SharedLineup }) {
  const rows = Math.max(lineup.teamA.length, lineup.teamB.length)
  const longest = Math.max(1, ...lineup.teamA.map((n) => n.length), ...lineup.teamB.map((n) => n.length))
  const fontSize = lineupImageFontSize(rows, longest)
  const when = [formatFixtureDate(lineup.date), lineup.kickoffTime].filter(Boolean).join(' · ')

  return (
    <div style={ROOT}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: HALF, height: H, backgroundImage: 'linear-gradient(180deg, rgba(8,47,73,0.7), rgba(8,47,73,0.25))' }} />
      <div style={{ position: 'absolute', left: HALF, top: 0, width: HALF, height: H, backgroundImage: 'linear-gradient(180deg, rgba(46,16,101,0.6), rgba(46,16,101,0.2))' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: H, backgroundColor: '#38bdf8' }} />
      <div style={{ position: 'absolute', left: W - EDGE, top: 0, width: EDGE, height: H, backgroundColor: '#a78bfa' }} />
      <div style={{ position: 'absolute', left: HALF - 1, top: 0, width: 2, height: H, backgroundImage: 'linear-gradient(180deg, rgba(44,74,114,0), #2c4a72 30%, #2c4a72 70%, rgba(44,74,114,0))' }} />

      {/* LINEUP_IMAGE.namesHeight and columnWidth in lib/utils.ts assume this padding and spacing. */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={`${lineup.leagueName} · Week ${lineup.week}`} right={when} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <TeamColumn label="Team A" names={lineup.teamA} fontSize={fontSize} accent="#7dd3fc" text="#dff1ff" />
          <TeamColumn label="Team B" names={lineup.teamB} fontSize={fontSize} accent="#c4b5fd" text="#efeaff" />
        </div>
      </div>

      <FooterWordmark />
    </div>
  )
}
