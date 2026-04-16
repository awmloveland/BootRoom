import { render } from '@react-email/render'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'
import { JoinRequestAdminEmail } from '@/lib/email/templates/JoinRequestAdminEmail'
import { JoinRequestStatusEmail } from '@/lib/email/templates/JoinRequestStatusEmail'

const FROM_ADDRESS = 'notifications@craft-football.com'

export async function notifyAdminsOfJoinRequest(
  gameId: string,
  requester: { userId: string; email: string; message: string | null },
  origin: string
): Promise<void> {
  const db = createServiceClient()

  const { data: league, error: leagueError } = await db
    .from('games')
    .select('name, slug')
    .eq('id', gameId)
    .single()

  if (leagueError || !league) throw new Error(`League not found: ${gameId}`)

  const { data: adminMembers, error: membersError } = await db
    .from('game_members')
    .select('user_id')
    .eq('game_id', gameId)
    .in('role', ['admin', 'creator'])

  if (membersError) throw membersError
  if (!adminMembers?.length) return

  const userResults = await Promise.all(
    (adminMembers as { user_id: string }[]).map(m =>
      db.auth.admin.getUserById(m.user_id)
    )
  )
  const adminEmails = userResults
    .filter(r => !r.error && r.data.user?.email)
    .map(r => r.data.user!.email as string)

  if (!adminEmails.length) return

  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', requester.userId)
    .single()

  const { name: leagueName, slug } = league as { name: string; slug: string }
  if (!slug) throw new Error(`League ${gameId} has no slug`)

  const requesterName =
    (profile as { display_name: string | null } | null)?.display_name ?? requester.email

  const html = await render(
    JoinRequestAdminEmail({
      leagueName,
      requesterName,
      requesterEmail: requester.email,
      message: requester.message,
      membersPageUrl: `${origin}/app/league/${slug}/settings`,
    })
  )

  const resend = getResendClient()
  await Promise.all(
    adminEmails.map(adminEmail =>
      resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        subject: `New join request for ${leagueName}`,
        html,
      })
    )
  )
}

export async function notifyRequesterOfReview(
  requestId: string,
  action: 'approved' | 'declined',
  origin: string
): Promise<void> {
  const db = createServiceClient()

  const { data: joinRequest, error } = await db
    .from('game_join_requests')
    .select('email, display_name, games(name, slug)')
    .eq('id', requestId)
    .single()

  if (error || !joinRequest) throw new Error(`Join request not found: ${requestId}`)

  const req = joinRequest as {
    email: string
    display_name: string
    games: { name: string; slug: string } | null
  }

  if (!req.games) throw new Error(`League not found for request: ${requestId}`)
  if (!req.games.slug) throw new Error(`League for request ${requestId} has no slug`)

  const html = await render(
    JoinRequestStatusEmail({
      leagueName: req.games.name,
      requesterName: req.display_name,
      action,
      leagueUrl: action === 'approved' ? `${origin}/app/league/${req.games.slug}` : null,
    })
  )

  const resend = getResendClient()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: req.email,
    subject:
      action === 'approved'
        ? `You've been approved to join ${req.games.name}`
        : `Update on your request to join ${req.games.name}`,
    html,
  })
}
