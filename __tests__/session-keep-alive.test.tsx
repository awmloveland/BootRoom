/**
 * @jest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { SessionKeepAlive } from '@/components/SessionKeepAlive'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

beforeEach(() => {
  clearCookies()
  ;(createClient as jest.Mock).mockClear()
})

describe('SessionKeepAlive', () => {
  it('starts the browser auth client for a signed-in visitor', async () => {
    document.cookie = 'sb-ref-auth-token.0=base64-abc; path=/'
    render(<SessionKeepAlive />)
    await waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
  })

  it('does nothing for a signed-out visitor', async () => {
    document.cookie = 'viewport=wide; path=/'
    render(<SessionKeepAlive />)
    await new Promise((r) => setTimeout(r, 0))
    expect(createClient).not.toHaveBeenCalled()
  })
})
