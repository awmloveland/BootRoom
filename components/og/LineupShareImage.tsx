// Link-preview images for shared lineups, rendered to PNG by next/og (Satori)
// in app/api/og/lineup/route.tsx. Satori only understands inline style
// objects, so this is the one place in the app that styles with `style`.
// Every element with more than one child needs display: 'flex'.
import type { CSSProperties } from 'react'
import { formatFixtureDate, lineupImageFontSize, LINEUP_IMAGE } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 }

// The ball from app/icon.svg (viewBox 4 4 72 72).
const BALL_PATH =
  'M40.15 31.00L40.15 23.50L49.26 17.64L58.40 24.28L55.65 34.76L48.51 37.08ZM48.61 37.36L55.74 35.04L64.13 41.90L60.63 52.64L49.82 53.26L45.41 47.19ZM45.17 47.37L49.58 53.44L45.65 63.53L34.35 63.53L30.42 53.44L34.83 47.37ZM34.59 47.19L30.18 53.26L19.37 52.64L15.87 41.90L24.26 35.04L31.39 37.36ZM31.49 37.08L24.35 34.76L21.60 24.28L30.74 17.64L39.85 23.50L39.85 31.00Z'

const ROOT: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'relative',
  backgroundColor: '#060b14',
  color: '#f4f9ff',
  fontFamily: 'Space Grotesk',
}

function Wordmark({ ballSize, fontSize }: { ballSize: number; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(ballSize * 0.35) }}>
      <svg width={ballSize} height={ballSize} viewBox="4 4 72 72">
        <circle cx="40" cy="40" r="33" fill="none" stroke="#d8d8d8" strokeWidth="4" />
        <path fill="#d8d8d8" d={BALL_PATH} />
      </svg>
      <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.02 * fontSize, color: '#f4f9ff' }}>
        Craft Football
      </div>
    </div>
  )
}

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
      <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(8,47,73,0.7), rgba(8,47,73,0.25))' }} />
      <div style={{ position: 'absolute', left: 600, top: 0, width: 600, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(46,16,101,0.6), rgba(46,16,101,0.2))' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: 630, backgroundColor: '#38bdf8' }} />
      <div style={{ position: 'absolute', left: 1192, top: 0, width: 8, height: 630, backgroundColor: '#a78bfa' }} />
      <div style={{ position: 'absolute', left: 599, top: 0, width: 2, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(44,74,114,0), #2c4a72 30%, #2c4a72 70%, rgba(44,74,114,0))' }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'IBM Plex Mono',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 2.85,
            textTransform: 'uppercase',
            color: '#8ba4c4',
          }}
        >
          <div style={{ maxWidth: 680, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {`${lineup.leagueName} · Week ${lineup.week}`}
          </div>
          <div>{when}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <TeamColumn label="Team A" names={lineup.teamA} fontSize={fontSize} accent="#7dd3fc" text="#dff1ff" />
          <TeamColumn label="Team B" names={lineup.teamB} fontSize={fontSize} accent="#c4b5fd" text="#efeaff" />
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, bottom: 24, width: 1200, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
        <Wordmark ballSize={28} fontSize={21} />
      </div>
    </div>
  )
}

/** Shown for missing, malformed or stale tokens. Reveals no league data. */
export function GenericShareImage() {
  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark ballSize={88} fontSize={64} />
      <div style={{ marginTop: 28, fontFamily: 'Inter', fontWeight: 700, fontSize: 28, color: '#8ba4c4' }}>
        Results, stats and fair teams for your weekly game.
      </div>
    </div>
  )
}
