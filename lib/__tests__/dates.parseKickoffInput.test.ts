// lib/__tests__/dates.parseKickoffInput.test.ts
import { parseKickoffInput } from '@/lib/dates'

describe('parseKickoffInput', () => {
  it.each([
    ['8', '20:00'],
    ['8:15', '20:15'],
    ['8.30', '20:30'],
    ['6', '18:00'],
    ['12', '12:00'],
    ['5', '17:00'],
    ['20:15', '20:15'],
    ['13', '13:00'],
    ['8pm', '20:00'],
    ['8.30pm', '20:30'],
    ['8:30 pm', '20:30'],
    ['7am', '07:00'],
    ['12am', '00:00'],
    ['18:50', '18:45'],
    ['18:53', '19:00'],
    ['23:55', '00:00'],
    [' 9 ', '21:00'],
  ])('reads %p as %p in the evening', (input, expected) => {
    expect(parseKickoffInput(input)).toBe(expected)
  })

  it.each([
    ['8', '08:00'],
    ['10:30', '10:30'],
    ['12', '00:00'],
    ['3', '15:00'],
    ['19', '19:00'],
  ])('reads %p as %p when the stepper shows am', (input, expected) => {
    expect(parseKickoffInput(input, 'am')).toBe(expected)
  })

  it.each(['', 'abc', '0', '25', '8:70', '13pm', '0am', '8:1x', '00:00'])('rejects %p', (input) => {
    expect(parseKickoffInput(input)).toBeNull()
  })
})
