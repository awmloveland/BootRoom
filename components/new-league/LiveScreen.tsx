// components/new-league/LiveScreen.tsx
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { dayNameToIndex, nextOccurrenceAfterToday, parseWeekDate } from '@/lib/dates'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { OUTLINE_BUTTON, StepShell } from './StepShell'
import { LiveShareCard } from './LiveShareCard'

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** '30 Oct 2026' → 'Thursday 30 Oct'. */
function formatLong(date: string): string {
  const [d, m] = date.split(' ')
  return `${DAY_LONG[parseWeekDate(date).getDay()]} ${parseInt(d, 10)} ${m}`
}

/** The screen after creation. Admins only; everyone else goes to the league itself. */
export async function LiveScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const landing = leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value)
  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') redirect(landing)

  const service = createServiceClient()
  const [{ data: roster }, { data: claims }] = await Promise.all([
    service.from('player_attributes').select('name').eq('game_id', game.id).order('name'),
    service.from('player_claims').select('player_name').eq('game_id', game.id).eq('status', 'approved'),
  ])
  const claimed = new Set((claims ?? []).map((c) => c.player_name as string))
  const names = (roster ?? []).map((r) => r.name as string).filter((n) => !claimed.has(n))

  const dayIndex = dayNameToIndex(game.day)
  const nextDate = dayIndex === null ? null : nextOccurrenceAfterToday(dayIndex)

  return (
    <StepShell
      eyebrow={
        <span className="inline-flex items-center gap-2 rounded-full border border-[#bef264]/40 bg-[#bef264]/10 px-3 py-1 font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#bef264]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#bef264]" />
          League created
        </span>
      }
      title={<>{game.name}<br /><span className="text-[#bef264]">is live.</span></>}
      sub={nextDate ? `Week 1 is in the diary for ${formatLong(nextDate)}.` : 'Set a match day in Settings to put week 1 in the diary.'}
      action={<Link href={landing} className={OUTLINE_BUTTON}>Go to {game.name}</Link>}
    >
      <LiveShareCard leagueName={game.name} url={`https://craft-football.com/${slug}`} names={names} day={game.day} />
    </StepShell>
  )
}
