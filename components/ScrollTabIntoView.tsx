'use client'

import { useEffect, useRef } from 'react'

/**
 * Scrolls the tab row so the active tab is fully visible: on small screens the
 * later tabs sit off-screen. Sets the row's scrollLeft directly rather than
 * using scrollIntoView, which can also scroll the page vertically.
 */
export function ScrollTabIntoView({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!active) return
    const tab = ref.current?.parentElement
    const nav = tab?.parentElement
    if (!tab || !nav) return
    // The nav is `relative`, so offsetLeft is measured from its left edge.
    nav.scrollLeft = tab.offsetLeft + tab.offsetWidth - nav.clientWidth + 16
  }, [active])
  return <span ref={ref} className="sr-only" />
}
