// lib/review.ts
// Join request and player claim review (Settings → Members).

import type { PendingJoinRequest, PendingRequestSummary, PlaysAs, PlayerAttribute, PlayerClaim, ReviewItem, ReviewProblem } from './types'

/** Up to three names, then a count: "A, B, C and 2 more". */
function listNames(names: string[]): string {
  const shown = names.slice(0, 3).join(', ')
  const rest = names.length - 3
  return rest > 0 ? `${shown} and ${rest} more` : shown
}

function playerClaimsText(n: number): string {
  return `${n} player claim${n === 1 ? '' : 's'} to review`
}

/**
 * Copy for the admin banner above the league tabs, e.g. "2 people want to
 * join" over "Callum Shaw, Priya Nair · 1 player claim to review".
 * Null when nothing is waiting.
 */
export function pendingRequestsBannerText({
  joinNames,
  claimNames,
}: PendingRequestSummary): { title: string; detail: string } | null {
  if (joinNames.length > 0) {
    const n = joinNames.length
    const claims = claimNames.length > 0 ? ` · ${playerClaimsText(claimNames.length)}` : ''
    return {
      title: `${n} ${n === 1 ? 'person wants' : 'people want'} to join`,
      detail: `${listNames(joinNames)}${claims}`,
    }
  }
  if (claimNames.length > 0) {
    return { title: playerClaimsText(claimNames.length), detail: listNames(claimNames) }
  }
  return null
}

/** "no games yet", "1 game", "23 games". */
export function gamesLabel(played: number): string {
  if (played === 0) return 'no games yet'
  return `${played} game${played === 1 ? '' : 's'}`
}

/**
 * Join requests (in the order given, oldest first from the RPC), then claims
 * from existing members, oldest first. A claim from someone who also has a
 * pending join request is left out: it predates single-step review and is
 * settled by reviewing the request.
 */
export function buildReviewItems(requests: PendingJoinRequest[], claims: PlayerClaim[]): ReviewItem[] {
  const requestUsers = new Set(requests.map((r) => r.user_id))
  const memberClaims = claims
    .filter((c) => !requestUsers.has(c.user_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return [
    ...requests.map((request): ReviewItem => ({ kind: 'join', request })),
    ...memberClaims.map((claim): ReviewItem => ({ kind: 'claim', claim })),
  ]
}

/** Where a review card starts, based on what the person chose. */
export function initialPlaysAs(item: ReviewItem): PlaysAs {
  if (item.kind === 'claim') return { mode: 'existing', name: item.claim.player_name }
  const { player_name, played_before, display_name } = item.request
  if (player_name) return { mode: 'existing', name: player_name }
  if (played_before === true) return { mode: 'list' }
  return { mode: 'new', name: display_name }
}

/** Case-insensitive roster lookup, the same rule as "+ Add player". */
export function findRosterPlayer(roster: PlayerAttribute[], name: string): PlayerAttribute | undefined {
  const target = name.trim().toLowerCase()
  return roster.find((p) => p.name.toLowerCase() === target)
}

/** What stops Approve, or null when it can go ahead. `userId` is the person being reviewed. */
export function reviewProblem(playsAs: PlaysAs, roster: PlayerAttribute[], userId: string): ReviewProblem | null {
  if (playsAs.mode === 'list') return { kind: 'choose' }
  if (playsAs.mode === 'new') {
    if (!playsAs.name.trim()) return { kind: 'empty' }
    const clash = findRosterPlayer(roster, playsAs.name)
    return clash ? { kind: 'clash', player: clash } : null
  }
  const existing = roster.find((p) => p.name === playsAs.name)
  if (existing?.linked_user_id && existing.linked_user_id !== userId) {
    return { kind: 'linked', player: existing }
  }
  return null
}
