'use client'

import { useRef, useEffect, useState } from 'react'

const NAV_HEIGHT = 72

/**
 * Sticky sidebar wrapper that pins to the top when the sidebar fits within
 * the viewport, and pins to the bottom when it doesn't — so the most
 * recently-scrolled-to content stays visible either way.
 */
export function SidebarSticky({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(NAV_HEIGHT)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const available = window.innerHeight - NAV_HEIGHT
      setTop(el.offsetHeight > available ? window.innerHeight - el.offsetHeight : NAV_HEIGHT)
    }

    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    window.addEventListener('resize', update)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="hidden lg:block w-72 shrink-0 sticky pb-6"
      style={{ top }}
    >
      {children}
    </div>
  )
}
