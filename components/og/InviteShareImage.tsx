// Link-preview image for an invite link. Shows only the league name: never
// the role or the invited email. See components/og/frame.tsx for the Satori rules.
import { SITE_TAGLINE } from '@/lib/utils'
import type { SharedInvite } from '@/lib/types'
import { DotField, FooterWordmark, Glow, HeroName, monoCaps, ROOT } from '@/components/og/frame'

export function InviteImage({ invite }: { invite: SharedInvite }) {
  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <DotField />
      <Glow at="50% 40%" color="rgba(56,189,248,0.16)" />
      <div style={{ ...monoCaps(20, 0.2), color: '#7dd3fc' }}>
        {"You're invited to join"}
      </div>
      <div style={{ display: 'flex', marginTop: 16 }}>
        <HeroName text={invite.leagueName} width={1000} max={104} min={60} />
      </div>
      <div style={{ marginTop: 22, fontFamily: 'Inter', fontSize: 28, fontWeight: 700, color: '#8ba4c4' }}>{SITE_TAGLINE}</div>
      <div style={{ display: 'flex', marginTop: 32, padding: '14px 30px', borderRadius: 4, backgroundColor: '#38bdf8', color: '#05101d', fontSize: 24, fontWeight: 700 }}>
        Join the league
      </div>
      <FooterWordmark />
    </div>
  )
}
