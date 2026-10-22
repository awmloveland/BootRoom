import { getSessionUser } from '@/lib/supabase/session'

function clientWith(getClaims: jest.Mock) {
  return { auth: { getClaims } } as unknown as Parameters<typeof getSessionUser>[0]
}

describe('getSessionUser', () => {
  it('returns the id and email from the claims', async () => {
    const supabase = clientWith(jest.fn().mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@example.com' } }, error: null }))
    await expect(getSessionUser(supabase)).resolves.toEqual({ id: 'u1', email: 'a@example.com' })
  })

  it('returns a null email when the token has none', async () => {
    const supabase = clientWith(jest.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null }))
    await expect(getSessionUser(supabase)).resolves.toEqual({ id: 'u1', email: null })
  })

  it('returns null when there is no session', async () => {
    const supabase = clientWith(jest.fn().mockResolvedValue({ data: null, error: null }))
    await expect(getSessionUser(supabase)).resolves.toBeNull()
  })

  it('returns null when verification fails', async () => {
    const supabase = clientWith(jest.fn().mockResolvedValue({ data: null, error: { message: 'invalid signature' } }))
    await expect(getSessionUser(supabase)).resolves.toBeNull()
  })

  it('returns null when the token cannot be read', async () => {
    const supabase = clientWith(jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')))
    await expect(getSessionUser(supabase)).resolves.toBeNull()
  })
})
