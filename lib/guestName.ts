import type { GuestEntry } from '@/lib/types'

const GUEST_PATTERN = /^.+\s\+\d+$/
const GUEST_SUFFIX = /\s\+(\d+)$/

export function isGuestName(name: string): boolean {
  return GUEST_PATTERN.test(name)
}

export function validateNameGuestInput(name: string, existingPlayers: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Name is required.'
  const lower = trimmed.toLowerCase()
  if (existingPlayers.some((p) => p.toLowerCase() === lower)) {
    return 'A player with this name already exists.'
  }
  return null
}

/**
 * Name for a host's next guest: one more than the highest `+N` suffix among
 * that host's current guests, so removing `+1` and adding another guest never
 * produces a second `+2`.
 */
export function nextGuestName(host: string, existingGuests: GuestEntry[]): string {
  const highest = existingGuests
    .filter((g) => g.associatedPlayer === host)
    .reduce((max, g) => Math.max(max, Number(GUEST_SUFFIX.exec(g.name)?.[1] ?? 0)), 0)
  return `${host} +${highest + 1}`
}
