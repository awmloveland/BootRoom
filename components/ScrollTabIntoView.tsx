'use client'

import { useEffect, useRef } from 'react'

export function ScrollTabIntoView({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (active) {
      ref.current?.parentElement?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
    }
  }, [active])
  return <span ref={ref} className="sr-only" />
}
