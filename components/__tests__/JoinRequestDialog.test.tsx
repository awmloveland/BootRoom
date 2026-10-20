/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return Promise.resolve({ ok: true, json: async () => ({ players: ['Sam O', 'John E'] }) })
    }
    return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

function renderDialog() {
  render(
    <JoinRequestDialog leagueId="g1" leagueName="The Boot Room" open onOpenChange={() => {}} onSuccess={() => {}} />,
  )
}

function sentBody() {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  return JSON.parse(call![1].body as string)
}

describe('JoinRequestDialog', () => {
  it('sends the picked name with played_before true', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sam O' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: 'Sam O', played_before: true }))
  })

  it('lets them send without a name when they cannot find it', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send without it' }))
    expect(screen.getByText(/the admin will find you or add you/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: null, played_before: true }))
  })

  it('can go back to picking a name', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send without it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick my name' }))
    expect(await screen.findByRole('button', { name: 'Sam O' })).toBeInTheDocument()
  })

  it('sends played_before false for someone new', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /No/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: null, played_before: false }))
  })
})
