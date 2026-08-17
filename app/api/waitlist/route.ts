import { createServiceClient } from '@/lib/supabase/service'
import { sendWaitlistNotification } from '@/lib/email/send-waitlist-notification'
import { parseWaitlistBody } from '@/lib/waitlist'

const PG_UNIQUE_VIOLATION = '23505'

export async function POST(request: Request): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Honeypot: real users never fill this hidden field. Pretend success.
  const website = (raw as Record<string, unknown> | null)?.website
  if (typeof website === 'string' && website.trim() !== '') {
    return Response.json({ ok: true })
  }

  const signup = parseWaitlistBody(raw)
  if (!signup) {
    return Response.json({ error: 'Invalid signup' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await db.from('waitlist_signups').insert({
    name: signup.name,
    email: signup.email,
    city: signup.city,
    format: signup.format,
  })

  if (error) {
    // Already on the list: report success, leak nothing, notify nobody twice.
    if (error.code === PG_UNIQUE_VIOLATION) return Response.json({ ok: true })
    console.error('waitlist insert failed:', error)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  try {
    await sendWaitlistNotification(signup)
  } catch (err) {
    console.error('waitlist notification email failed:', err)
  }

  return Response.json({ ok: true })
}
