import { Resend } from 'resend'

let _client: Resend | null = null

export function getResendClient(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('Missing RESEND_API_KEY')
    _client = new Resend(key)
  }
  return _client
}
