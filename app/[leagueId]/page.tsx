import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueIndexPage({ params }: Props) {
  const { leagueId } = await params
  redirect(`/${leagueId}/results`)
}
