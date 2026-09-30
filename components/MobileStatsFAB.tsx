// components/MobileStatsFAB.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileStatsFABProps {
  children: React.ReactNode
}

export function MobileStatsFAB({ children }: MobileStatsFABProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mount immediately on open; unmount after the close animation finishes (300ms matches CSS duration)
  const handleOpenChange = useCallback((next: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (next) {
      setMounted(true)
      setOpen(true)
    } else {
      setOpen(false)
      timerRef.current = setTimeout(() => setMounted(false), 300)
    }
  }, []) // timerRef is a ref (stable), setMounted/setOpen are stable setters

  // Clear any pending close timer on unmount to avoid state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // iOS-safe scroll lock: position:fixed preserves visual viewport dimensions on iOS Safari
  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      const top = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (top && !isNaN(-parseInt(top, 10))) {
        window.scrollTo(0, -parseInt(top, 10))
      }
    }
  }, [open])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleOpenChange])

  return (
    <>
      {/* Pill FAB */}
      <button
        type="button"
        onClick={() => handleOpenChange(!open)}
        className="fixed bottom-[22px] right-4 lg:hidden z-30 flex items-center gap-2 h-[42px] px-4 rounded-full bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold shadow-[0_12px_30px_rgba(56,189,248,.3)] transition-colors"
        aria-label="View live stats"
      >
        <Activity size={15} strokeWidth={2.4} />
        Stats
      </button>

      {/* Only render backdrop + sheet while mounted (open or animating closed).
          This ensures no opaque sheet element sits at fixed bottom-0 when the drawer is fully dismissed,
          which would bleed into the iOS Safari URL bar area. */}
      {mounted && (
        <>
          {/* z-[60] intentionally higher than FAB z-30 and navbar z-50 — backdrop covers everything while sheet is open */}
          {/* Backdrop */}
          <div
            onClick={() => handleOpenChange(false)}
            className={cn(
              'fixed inset-0 bg-[#030710]/80 z-[60] lg:hidden transition-opacity duration-300',
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
          />

          {/* Bottom sheet */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 z-[70] lg:hidden bg-[#060b14] border-t border-[#1b2c46] rounded-t-[14px] max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
              open ? 'translate-y-0' : 'translate-y-full'
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-[#223a5c] rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-4 py-3 flex-shrink-0">
              <span className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">League Stats</span>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="text-[#8ba4c4] hover:text-white rounded p-1.5 transition-colors"
                aria-label="Close stats"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
            {/* Scrollable content — flex-1 fills remaining height; min-h-0 allows shrinking so overflow-y-auto creates a true scroll region */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-2">
              {children}
            </div>
          </div>
        </>
      )}
    </>
  )
}
