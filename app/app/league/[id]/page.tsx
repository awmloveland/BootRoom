export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getGame } from '@/lib/fetchers'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyLeaguePage({ params }: Props) {
  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()
  redirect(`/${game.slug}/results`)
}
