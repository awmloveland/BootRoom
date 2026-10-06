// Link-preview image for a shared quarter (layout A): a centred champion
// hero with a podium line. See components/og/frame.tsx for the Satori rules.
import { quarterRangeLabel } from '@/lib/utils'
import type { SharedQuarter } from '@/lib/types'
import { FooterWordmark, Glow, HeroName, MetaLine, monoCaps, OgBody, OgIcon, ROOT } from '@/components/og/frame'

/** "24 pts · 8 wins · 1 draw", worded like QuarterCelebration (draws left out at zero). */
export function championRecord(e: SharedQuarter['podium'][number]): string {
  return [
    `${e.points} pts`,
    `${e.won} ${e.won === 1 ? 'win' : 'wins'}`,
    e.drew > 0 ? `${e.drew} ${e.drew === 1 ? 'draw' : 'draws'}` : null,
  ].filter(Boolean).join(' · ')
}

export function QuarterImage({ quarter }: { quarter: SharedQuarter }) {
  const [champion, ...rest] = quarter.podium

  return (
    <div style={ROOT}>
      <Glow at="18% 10%" color="rgba(190,242,100,0.16)" size="45%" />
      <Glow at="85% 0%" color="rgba(56,189,248,0.14)" size="42%" />

      <OgBody meta={<MetaLine left={quarter.leagueName} right={quarterRangeLabel(quarter.dateRange, quarter.gamesPlayed)} />} align="center">
        <OgIcon name="trophy" size={52} color="#bef264" strokeWidth={1.8} />
        <div style={{ marginTop: 14, ...monoCaps(20, 0.2), color: '#bef264' }}>
          {`Q${quarter.q} ${quarter.year} · ${quarter.seasonName} champion`}
        </div>
        <div style={{ display: 'flex', marginTop: 14 }}>
          <HeroName text={champion.name} width={1000} max={104} min={64} />
        </div>
        <div style={{ marginTop: 16, ...monoCaps(20), color: '#8ba4c4' }}>
          {championRecord(champion)}
        </div>
        {rest.length > 0 && (
          <div style={{ display: 'flex', marginTop: 28, fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#8ba4c4' }}>
            {rest.map((e, i) => (
              <div key={e.name} style={{ display: 'flex', marginLeft: i === 0 ? 0 : 44 }}>
                <div style={{ color: '#f4f9ff', marginRight: 10 }}>{String(i + 2)}</div>
                <div style={{ maxWidth: 480, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${e.name} · ${e.points}`}</div>
              </div>
            ))}
          </div>
        )}
      </OgBody>

      <FooterWordmark />
    </div>
  )
}
