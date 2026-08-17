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

const MAX_NAME_LENGTH = 100
const MAX_EMAIL_LENGTH = 254 // RFC 5321 practical limit
const MAX_CITY_LENGTH = 100

/** Parse and validate a waitlist signup payload. Returns null when invalid. */
export function parseWaitlistBody(body: unknown): WaitlistBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string') return null
  const name = b.name.trim()
  if (name === '' || name.length > MAX_NAME_LENGTH) return null

  if (typeof b.email !== 'string') return null
  const email = b.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) return null

  if (typeof b.format !== 'string' || !(WAITLIST_FORMATS as readonly string[]).includes(b.format)) return null

  const city = typeof b.city === 'string' && b.city.trim() !== '' ? b.city.trim() : null
  if (city !== null && city.length > MAX_CITY_LENGTH) return null

  return {
    name,
    email,
    city,
    format: b.format as WaitlistFormat,
  }
}
