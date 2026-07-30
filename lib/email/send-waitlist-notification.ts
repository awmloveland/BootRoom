import { getResendClient } from '@/lib/email/resend'
import type { WaitlistBody } from '@/lib/waitlist'

const FROM_ADDRESS = 'notifications@craft-football.com'
const NOTIFY_ADDRESS = 'awmloveland@gmail.com'

const FORMAT_LABELS: Record<WaitlistBody['format'], string> = {
  '5': '5-a-side',
  '6': '6-a-side',
  '7': '7-a-side',
  mixed: 'Mixed formats',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendWaitlistNotification(signup: WaitlistBody): Promise<void> {
  const resend = getResendClient()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: NOTIFY_ADDRESS,
    subject: `Waitlist signup: ${signup.name}`,
    html: [
      '<h2>New waitlist signup</h2>',
      `<p><strong>Name:</strong> ${escapeHtml(signup.name)}</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(signup.email)}</p>`,
      `<p><strong>City:</strong> ${signup.city ? escapeHtml(signup.city) : 'Not given'}</p>`,
      `<p><strong>Format:</strong> ${FORMAT_LABELS[signup.format]}</p>`,
    ].join('\n'),
  })
}
