// Link-preview image for a shared quarter (layout A): a centred champion
// hero with a podium line. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, quarterRangeLabel } from '@/lib/utils'
import type { SharedQuarter } from '@/lib/types'
import { FooterWordmark, Glow, MetaLine, OgIcon, ROOT } from '@/components/og/frame'

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
  const nameSize = fitFontSize(champion.name.length, 1000, 104, 64)

  return (
    <div style={{ ...ROOT, flexDirection: 'column' }}>
      <Glow at="18% 10%" color="rgba(190,242,100,0.16)" size="45%" />
      <Glow at="85% 0%" color="rgba(56,189,248,0.14)" size="42%" />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={quarter.leagueName} right={quarterRangeLabel(quarter.dateRange, quarter.gamesPlayed)} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 34 }}>
          <OgIcon name="trophy" size={52} color="#bef264" strokeWidth={1.8} />
          <div style={{ marginTop: 14, fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: '#bef264' }}>
            {`Q${quarter.q} ${quarter.year} · ${quarter.seasonName} champion`}
          </div>
          <div style={{ marginTop: 14, maxWidth: 1000, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.03 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {champion.name}
          </div>
          <div style={{ marginTop: 16, fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#8ba4c4' }}>
            {championRecord(champion)}
          </div>
          {rest.length > 0 && (
            <div style={{ display: 'flex', marginTop: 28, fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#8ba4c4' }}>
              {rest.map((e, i) => (
                <div key={e.name} style={{ display: 'flex', marginLeft: i === 0 ? 0 : 44 }}>
                  <div style={{ color: '#f4f9ff', marginRight: 10 }}>{String(i + 2)}</div>
                  <div>{`${e.name} · ${e.points}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FooterWordmark />
    </div>
  )
}
