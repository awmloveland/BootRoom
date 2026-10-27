// lib/__tests__/dates.parseKickoffInput.test.ts
import { parseKickoffInput } from '@/lib/dates'

describe('parseKickoffInput', () => {
  it.each([
    ['8', '20:00'],
    ['8:15', '20:15'],
    ['8.30', '20:30'],
    ['20:15', '20:15'],
    ['8pm', '20:00'],
    ['8.30pm', '20:30'],
    ['8:30 pm', '20:30'],
    ['7am', '07:00'],
    ['12', '12:00'],
    ['5', '17:00'],
    ['6', '06:00'],
    ['18:50', '18:45'],
    ['18:53', '19:00'],
    ['23:55', '00:00'],
    [' 9 ', '21:00'],
  ])('reads %p as %p', (input, expected) => {
    expect(parseKickoffInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '25', '8:70', '13pm', '0am', '8:1x'])('rejects %p', (input) => {
    expect(parseKickoffInput(input)).toBeNull()
  })
})
