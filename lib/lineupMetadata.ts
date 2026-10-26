// lib/lineupMetadata.ts
// The `lineup_metadata` JSONB on a saved week: reading it (camelCase, legacy
// shapes accepted) and writing it (the snake_case shape `save_lineup` stores).
import type { AutoPickAudit, GuestEntry, LineupMetadata, LineupRatingEntry, Mentality, NewPlayerEntry, Strength } from './types'

/**
 * Maps `lineup_metadata` JSONB from the weeks table to `LineupMetadata`.
 * Accepts legacy shapes, and leaves `autoPick` / `ratings` out when absent
 * (lineups saved before the team builder recorded them).
 */
export function parseLineupMetadata(raw: unknown): LineupMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, any>
  const meta: LineupMetadata = {
    guests: ((m.guests as any[]) ?? []).map((g): GuestEntry => ({
      type: 'guest',
      name: g.name,
      associatedPlayer: g.associated_player,
      goalkeeper: g.goalkeeper ?? false,
      // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
      strength: (g.strength ?? g.strength_hint ?? 'average') as Strength,
    })),
    new_players: ((m.new_players as any[]) ?? []).map((p): NewPlayerEntry => ({
      type: 'new_player',
      name: p.name,
      // Legacy metadata may carry only `goalkeeper`; derive mentality from it.
      mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
      // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
      strength: (p.strength ?? p.strength_hint ?? 'average') as Strength,
    })),
  }
  const a = m.auto_pick
  if (a && typeof a === 'object') {
    meta.autoPick = {
      algorithm: a.algorithm,
      suggestionIndex: a.suggestion_index,
      suggestionCount: a.suggestion_count,
      edited: a.edited === true,
      bestDiff: a.best_diff,
      savedDiff: a.saved_diff,
      builtAt: a.built_at,
    }
  }
  if (Array.isArray(m.ratings)) {
    meta.ratings = m.ratings.map((r: any): LineupRatingEntry => ({
      name: r.name,
      team: r.team,
      wpr: r.wpr,
      strength: r.strength ?? null,
      played: r.played,
      gamesMissed: r.games_missed ?? 0,
      kind: r.kind,
    }))
  }
  return meta
}

/** The snake_case JSONB shape `save_lineup` stores in `lineup_metadata`. */
export function serializeLineupMetadata(meta: LineupMetadata): Record<string, unknown> {
  const db: Record<string, unknown> = {
    guests: meta.guests.map((g) => ({
      name: g.name,
      associated_player: g.associatedPlayer,
      goalkeeper: g.goalkeeper ?? false,
      strength: g.strength,
    })),
    new_players: meta.new_players.map((p) => ({
      name: p.name,
      mentality: p.mentality,
      // DB metadata still accepts a `goalkeeper` key for back-compat with older readers.
      goalkeeper: p.mentality === 'goalkeeper',
      strength: p.strength,
    })),
  }
  if (meta.autoPick) db.auto_pick = serializeAutoPickAudit(meta.autoPick)
  if (meta.ratings) {
    db.ratings = meta.ratings.map((r) => ({
      name: r.name,
      team: r.team,
      wpr: r.wpr,
      strength: r.strength,
      played: r.played,
      games_missed: r.gamesMissed,
      kind: r.kind,
    }))
  }
  return db
}

function serializeAutoPickAudit(a: AutoPickAudit) {
  return {
    algorithm: a.algorithm,
    suggestion_index: a.suggestionIndex,
    suggestion_count: a.suggestionCount,
    edited: a.edited,
    best_diff: a.bestDiff,
    saved_diff: a.savedDiff,
    built_at: a.builtAt,
  }
}
