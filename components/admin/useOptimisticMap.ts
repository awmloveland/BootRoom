'use client'

import { useCallback, useMemo, useState } from 'react'

/** Pending local changes over server rows. `null` means the row is removed. */
export type Overlay<V> = Record<string, V | null>

/** Server rows with the pending changes applied. */
export function applyOverlay<V>(server: Record<string, V>, overlay: Overlay<V>): Record<string, V> {
  const merged = { ...server }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  return merged
}

/** Drops the changes the server now agrees with: they have been saved. */
export function pruneOverlay<V>(overlay: Overlay<V>, server: Record<string, V>): Overlay<V> {
  const pending: Overlay<V> = {}
  for (const [key, value] of Object.entries(overlay)) {
    if ((server[key] ?? null) !== value) pending[key] = value
  }
  return pending
}

/**
 * Optimistic edits to a keyed map of server rows. Changes show immediately and
 * stay until a refreshed `server` map contains them, so a refresh that lands
 * between two quick edits never flickers the second one back. On a failed
 * save, `revert` drops a change unless it has since been overwritten.
 */
export function useOptimisticMap<V>(server: Record<string, V>) {
  const [overlay, setOverlay] = useState<Overlay<V>>({})
  const [seen, setSeen] = useState(server)
  if (seen !== server) {
    setSeen(server)
    setOverlay((o) => pruneOverlay(o, server))
  }

  const value = useMemo(() => applyOverlay(server, overlay), [server, overlay])

  const set = useCallback((patch: Overlay<V>) => setOverlay((o) => ({ ...o, ...patch })), [])

  const revert = useCallback(
    (patch: Overlay<V>) =>
      setOverlay((o) => {
        const next = { ...o }
        for (const [key, value] of Object.entries(patch)) {
          if (key in next && next[key] === value) delete next[key]
        }
        return next
      }),
    [],
  )

  return { value, set, revert }
}
