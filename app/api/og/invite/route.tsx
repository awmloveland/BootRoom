import { loadInvitePreview } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { InviteImage } from '@/components/og/InviteShareImage'

export const runtime = 'nodejs'

// A revoked invite falls back to the generic card within 15 minutes.
const INVITE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900'

/** GET ?token=<invite token> — the link-preview image for an invite link. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  return shareImageResponse(
    loadInvitePreview(token).then((invite) => (invite ? <InviteImage invite={invite} /> : null)),
    INVITE_CACHE_CONTROL
  )
}
