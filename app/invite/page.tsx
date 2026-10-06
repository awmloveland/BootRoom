import type { Metadata } from 'next'
import { InviteAccept } from '@/components/InviteAccept'
import { buildInviteShareMetadata } from '@/lib/shareLinks'
import { loadInvitePreview } from '@/lib/shareLinksServer'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** A live invite link unfurls with the "You're invited" image; anything else keeps the site default. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { token } = await searchParams
  if (typeof token !== 'string') return {}
  const invite = await loadInvitePreview(token)
  return invite ? buildInviteShareMetadata(invite, token.trim()) : {}
}

export default function InvitePage() {
  return <InviteAccept />
}
