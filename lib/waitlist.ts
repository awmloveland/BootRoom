export const WAITLIST_FORMATS = ['5', '6', '7', 'mixed'] as const
export type WaitlistFormat = (typeof WAITLIST_FORMATS)[number]

export interface WaitlistBody {
  name: string
  email: string
  city: string | null
  format: WaitlistFormat
}

/** Same acceptance rule as the landing form: something@something.tld */
const EMAIL_RE = /^\S+@\S+\.\S+$/

/** Parse and validate a waitlist signup payload. Returns null when invalid. */
export function parseWaitlistBody(body: unknown): WaitlistBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || b.name.trim() === '') return null
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) return null
  if (typeof b.format !== 'string' || !(WAITLIST_FORMATS as readonly string[]).includes(b.format)) return null

  const city = typeof b.city === 'string' && b.city.trim() !== '' ? b.city.trim() : null

  return {
    name: b.name.trim(),
    email: b.email.trim().toLowerCase(),
    city,
    format: b.format as WaitlistFormat,
  }
}
