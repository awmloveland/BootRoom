// Link-preview image for a shared league link (layout C): the league name and
// its next game. See components/og/frame.tsx for the Satori rules.
import { formatFixtureDate, gamesPlayedLabel, pluralise } from '@/lib/utils'
import type { SharedLeague } from '@/lib/types'
import { DotField, FooterWordmark, HeroName, MetaLine, monoCaps, OgBody, ROOT } from '@/components/og/frame'

export function LeagueImage({ league }: { league: SharedLeague }) {
  const next = league.nextGame

  return (
    <div style={ROOT}>
      <DotField />
      <OgBody meta={<MetaLine left={league.leagueName} right={gamesPlayedLabel(league.gamesPlayed)} />}>
        <HeroName text={league.leagueName} width={1080} max={92} min={56} />
        {next ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', marginTop: 44, padding: '24px 32px', backgroundColor: '#0a1421', border: '2px solid #1b2c46', borderRadius: 16 }}>
            <div style={{ ...monoCaps(18), color: '#38bdf8' }}>Next game</div>
            <div style={{ marginTop: 10, fontSize: 34, fontWeight: 700, letterSpacing: -0.7 }}>
              {[formatFixtureDate(next.date), next.kickoffTime].filter(Boolean).join(' · ')}
            </div>
            {next.location && (
              <div style={{ marginTop: 6, fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#8ba4c4' }}>{next.location}</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 44, ...monoCaps(22), color: '#8ba4c4' }}>
            {pluralise(league.playerCount, 'player')}
          </div>
        )}
      </OgBody>
      <FooterWordmark />
    </div>
  )
}
