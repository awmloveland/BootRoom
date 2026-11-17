/**
 * @jest-environment jsdom
 */
// components/__tests__/DeleteLeague.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeleteLeague } from '@/components/platform/DeleteLeague'
import { deletePlatformLeague } from '@/lib/leagueApi'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
jest.mock('@/lib/leagueApi', () => ({ deletePlatformLeague: jest.fn() }))

const SLUG = 'thursday-night-fives-k7x'

function open() {
  render(<DeleteLeague id="g1" name="Thursday Night Fives" slug={SLUG} members={3} players={14} results={9} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  return {
    input: screen.getByRole('textbox'),
    confirm: screen.getByRole('button', { name: 'Delete league' }),
  }
}

beforeEach(() => jest.resetAllMocks())

it('keeps the delete button disabled until the full address is typed', () => {
  const { input, confirm } = open()
  expect(screen.getByText(/3 members, 14 players and 9 results/)).toBeInTheDocument()
  expect(confirm).toBeDisabled()
  fireEvent.change(input, { target: { value: 'thursday-night-fives' } })
  expect(confirm).toBeDisabled()
  fireEvent.change(input, { target: { value: SLUG } })
  expect(confirm).toBeEnabled()
})

it('deletes, then returns to the dashboard', async () => {
  ;(deletePlatformLeague as jest.Mock).mockResolvedValue(undefined)
  const { input, confirm } = open()
  fireEvent.change(input, { target: { value: SLUG } })
  fireEvent.click(confirm)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/platform'))
  expect(deletePlatformLeague).toHaveBeenCalledWith('g1', SLUG)
  expect(refresh).toHaveBeenCalled()
})

it('shows the error and stays put when the delete fails', async () => {
  ;(deletePlatformLeague as jest.Mock).mockRejectedValue(new Error('Could not delete the league. Try again.'))
  const { input, confirm } = open()
  fireEvent.change(input, { target: { value: SLUG } })
  fireEvent.click(confirm)
  expect(await screen.findByText('Could not delete the league. Try again.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})
