export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'
import { legacyLeaguePath } from '@/lib/legacyRedirect'

interface Props {
  params: Promise<{ id: string; rest?: string[] }>
}

/** /app/league/<uuid>[/players|/settings] → /<slug>[/players|/settings]; shares legacyLeaguePath so both legacy prefixes behave the same */
export default async function LegacyLeaguePage({ params }: Props) {
  const { id, rest } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(legacyLeaguePath(game.slug, rest))
}
