'use client'

import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSelectedLayoutSegment } from 'next/navigation'
import { SidebarSticky } from '@/components/SidebarSticky'

/**
 * Lets a tab replace the league layout's stats sidebar with its own widgets.
 * The sidebar lives in the tabs layout, beside the content column, so a tab
 * page cannot render there directly. Tabs listed in OWN_SIDEBAR get an empty
 * sticky slot instead of StatsSidebar, and portal their widgets into it with
 * <SidebarPortal>, which keeps them in the page's React tree (and state).
 */
const OWN_SIDEBAR = new Set(['admin'])

const SlotContext = createContext<{ slot: HTMLElement | null; setSlot: (el: HTMLElement | null) => void }>({
  slot: null,
  setSlot: () => {},
})

export function SidebarSlotProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return <SlotContext.Provider value={{ slot, setSlot }}>{children}</SlotContext.Provider>
}

/** Renders the layout's sidebar (children), or the empty slot on tabs that bring their own. */
export function LeagueSidebarSwitch({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const { setSlot } = useContext(SlotContext)
  if (!segment || !OWN_SIDEBAR.has(segment)) return <>{children}</>
  return (
    <SidebarSticky>
      <div ref={setSlot} className="flex flex-col gap-3" />
    </SidebarSticky>
  )
}

/** Renders children into the sidebar slot, on large screens only (the slot is hidden below lg). */
export function SidebarPortal({ children }: { children: React.ReactNode }) {
  const { slot } = useContext(SlotContext)
  return slot ? createPortal(children, slot) : null
}
