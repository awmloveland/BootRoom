import { POST } from '@/app/api/waitlist/route'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/email/resend')

const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null })
const mockInsert = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockInsert.mockResolvedValue({ error: null })
  ;(getResendClient as jest.Mock).mockReturnValue({ emails: { send: mockEmailSend } })
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => ({ insert: mockInsert })),
  })
})

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const valid = { name: 'Will', email: 'will@example.com', city: 'London', format: '7' }

describe('POST /api/waitlist', () => {
  it('inserts the signup and sends a notification email', async () => {
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Will',
      email: 'will@example.com',
      city: 'London',
      format: '7',
    })
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    expect(mockEmailSend.mock.calls[0][0].to).toBe('awmloveland@gmail.com')
  })

  it('rejects invalid bodies with 400 and does not insert', async () => {
    const res = await POST(makeRequest({ ...valid, email: 'nope' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/waitlist', { method: 'POST', body: 'not json' })
    )
    expect(res.status).toBe(400)
  })

  it('silently accepts honeypot submissions without inserting', async () => {
    const res = await POST(makeRequest({ ...valid, website: 'spam.example' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('treats a duplicate email as success and sends no email', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('returns 500 on other insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } })
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(500)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('still succeeds when the notification email fails', async () => {
    mockEmailSend.mockRejectedValue(new Error('resend down'))
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
