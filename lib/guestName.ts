import type { StrengthHint } from '@/lib/types'

const GUEST_PATTERN = /^.+\s\+\d+$/

export function isGuestName(name: string): boolean {
  return GUEST_PATTERN.test(name)
}

export function strengthHintToRating(hint: StrengthHint): number {
  switch (hint) {
    case 'below': return 1
    case 'average': return 2
    case 'above': return 3
  }
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
