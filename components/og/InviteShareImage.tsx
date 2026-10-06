// Link-preview image for an invite link. Shows only the league name: never
// the role or the invited email. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, SITE_TAGLINE } from '@/lib/utils'
import type { SharedInvite } from '@/lib/types'
import { DotField, FooterWordmark, Glow, ROOT } from '@/components/og/frame'

export function InviteImage({ invite }: { invite: SharedInvite }) {
  const nameSize = fitFontSize(invite.leagueName.length, 1000, 104, 60)

  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <DotField />
      <Glow at="50% 40%" color="rgba(56,189,248,0.16)" />
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: '#7dd3fc' }}>
        {"You're invited to join"}
      </div>
      <div style={{ marginTop: 16, maxWidth: 1000, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.035 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {invite.leagueName}
      </div>
      <div style={{ marginTop: 22, fontFamily: 'Inter', fontSize: 28, fontWeight: 700, color: '#8ba4c4' }}>{SITE_TAGLINE}</div>
      <div style={{ display: 'flex', marginTop: 32, padding: '14px 30px', borderRadius: 4, backgroundColor: '#38bdf8', color: '#05101d', fontSize: 24, fontWeight: 700 }}>
        Join the league
      </div>
      <FooterWordmark />
    </div>
  )
}
