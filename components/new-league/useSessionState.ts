// components/new-league/useSessionState.ts
'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** sessionStorage keys for league-setup answers not yet saved to the database. */
export const DRAFT_KEY = 'new-league:draft'
export const rosterKey = (slug: string) => `new-league:roster:${slug}`
export const resultsKey = (slug: string) => `new-league:results:${slug}`

/**
 * useState mirrored to the tab's sessionStorage, so a refresh or the Back
 * button keeps what was typed. The first render uses `initial` (the server
 * has no storage); an effect then swaps in the stored value and sets
 * `loaded`. Only changes made through the setter are stored, so a page that
 * is merely visited never shadows newer server data. Storage that throws is
 * ignored and this behaves as plain useState.
 */
export function useSessionState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage can only be read after hydration
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // unreadable or corrupt: carry on from `initial`
    }
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (!dirty.current) return
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // private mode or quota: the value still lives in memory
    }
  }, [key, value])

  const set: Dispatch<SetStateAction<T>> = useCallback((action) => {
    dirty.current = true
    setValue(action)
  }, [])

  const clear = useCallback(() => {
    dirty.current = false
    try {
      sessionStorage.removeItem(key)
    } catch {
      // nothing stored, nothing to remove
    }
  }, [key])

  return [value, set, { loaded, clear }] as const
}
