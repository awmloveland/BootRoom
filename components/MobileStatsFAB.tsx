// components/MobileStatsFAB.tsx
'use client'

import { useState, useEffect } from 'react'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileStatsFABProps {
  children: React.ReactNode
}

export function MobileStatsFAB({ children }: MobileStatsFABProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* Pill FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-4 lg:hidden z-30 flex items-center gap-2 bg-sky-500 text-white rounded-full px-4 py-2.5 shadow-lg shadow-sky-500/30 text-sm font-semibold"
        aria-label="View live stats"
      >
        <Activity size={16} />
        Stats
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 bg-slate-900/80 z-40 lg:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Bottom sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 lg:hidden bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-100">Live Stats</span>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-200 p-1"
            aria-label="Close stats"
          >
            <X size={18} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-6 pt-2">
          {children}
        </div>
      </div>
    </>
  )
}
