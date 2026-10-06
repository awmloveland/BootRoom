// Link-preview image for a shared league link (layout C): the league name and
// its next game. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, formatFixtureDate, gamesPlayedLabel } from '@/lib/utils'
import type { SharedLeague } from '@/lib/types'
import { DotField, FooterWordmark, MetaLine, ROOT } from '@/components/og/frame'

export function LeagueImage({ league }: { league: SharedLeague }) {
  const nameSize = fitFontSize(league.leagueName.length, 1080, 92, 56)
  const next = league.nextGame

  return (
    <div style={{ ...ROOT, flexDirection: 'column' }}>
      <DotField />
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={league.leagueName} right={gamesPlayedLabel(league.gamesPlayed)} />
        <div style={{ marginTop: 60, maxWidth: 1080, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.035 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {league.leagueName}
        </div>
        {next ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', marginTop: 44, padding: '24px 32px', backgroundColor: '#0a1421', border: '2px solid #1b2c46', borderRadius: 16 }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 18, fontWeight: 700, letterSpacing: 2.7, textTransform: 'uppercase', color: '#38bdf8' }}>
              Next game
            </div>
            <div style={{ marginTop: 10, fontSize: 34, fontWeight: 700, letterSpacing: -0.7 }}>
              {[formatFixtureDate(next.date), next.kickoffTime].filter(Boolean).join(' · ')}
            </div>
            {next.location && (
              <div style={{ marginTop: 6, fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#8ba4c4' }}>{next.location}</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 44, fontFamily: 'IBM Plex Mono', fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#8ba4c4' }}>
            {`${league.gamesPlayed} ${league.gamesPlayed === 1 ? 'game' : 'games'} · ${league.playerCount} ${league.playerCount === 1 ? 'player' : 'players'}`}
          </div>
        )}
      </div>
      <FooterWordmark />
    </div>
  )
}
