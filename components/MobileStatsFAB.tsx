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
        className="fixed bottom-6 right-4 lg:hidden z-30 flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full px-4 py-2.5 shadow-lg shadow-sky-500/30 text-sm font-semibold"
        aria-label="View live stats"
      >
        <Activity size={16} />
        Stats
      </button>

      {/* Only render backdrop + sheet while mounted (open or animating closed).
          This ensures no bg-slate-800 element sits at fixed bottom-0 when the drawer is fully dismissed,
          which would bleed into the iOS Safari URL bar area. */}
      {mounted && (
        <>
          {/* z-[60] intentionally higher than FAB z-30 and navbar z-50 — backdrop covers everything while sheet is open */}
          {/* Backdrop */}
          <div
            onClick={() => handleOpenChange(false)}
            className={cn(
              'fixed inset-0 bg-slate-900/80 z-[60] lg:hidden transition-opacity duration-300',
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
          />

          {/* Bottom sheet */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 z-[70] lg:hidden bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
              open ? 'translate-y-0' : 'translate-y-full'
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-4 py-3 flex-shrink-0">
              <span className="text-lg font-bold text-slate-100 tracking-tight">League Stats</span>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 rounded-lg p-1.5"
                aria-label="Close stats"
              >
                <X size={18} />
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
