// components/new-league/StepShell.tsx
// The frame every league-setup screen shares (handoff: "Shared page shell").
// The root layout already paints the dot grid behind the top of the page.
import type { ReactNode } from 'react'

interface StepShellProps {
  /** Centred line between the logo and the title: the step eyebrow or the Live pill. */
  eyebrow?: ReactNode
  title: ReactNode
  sub: ReactNode
  children: ReactNode
  /** The primary action, full width. */
  action?: ReactNode
  /** Centred text link under the action. */
  secondary?: ReactNode
}

export function StepShell({ eyebrow, title, sub, children, action, secondary }: StepShellProps) {
  return (
    <main className="mx-auto w-full max-w-[520px] px-4 py-9 sm:px-6 sm:py-[72px]">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[#223a5c] bg-[linear-gradient(160deg,#0e2a44_0%,#0a1628_55%,#081020_100%)] shadow-[0_14px_36px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.08)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- same static asset as the landing header */}
        <img src="/logo.png" alt="" className="size-9 brightness-150 drop-shadow-[0_4px_10px_rgba(0,0,0,.5)]" />
      </div>
      {eyebrow && <div className="mt-7 flex justify-center">{eyebrow}</div>}
      <h1 className="mt-7 text-center text-2xl font-bold leading-[1.15] tracking-[-.03em] text-[#f4f9ff] text-pretty sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-2.5 text-center font-inter-body text-[14.5px] leading-[1.5] text-[#8ba4c4]">{sub}</p>
      <div className="mt-8">{children}</div>
      {action && <div className="mt-7">{action}</div>}
      {secondary && <div className="mt-[18px] text-center">{secondary}</div>}
    </main>
  )
}

/** Steps shown in the eyebrow. Grows as later slices add roster and results steps. */
export const STEP_COUNT = 6

/** `STEP 2/3` in lime. */
export function StepEyebrow({ n }: { n: number }) {
  return (
    <p className="inline-flex items-center gap-2 font-plex text-[9.5px] font-bold uppercase tracking-[.18em] text-[#bef264]">
      <span className="h-0.5 w-[18px] bg-[#bef264]" />
      Step {n}/{STEP_COUNT}
    </p>
  )
}

// Shared class strings: the handoff's primary button, outline button, text
// link and input. Compose with cn() where a screen needs a variation.
export const PRIMARY_BUTTON =
  'flex h-[50px] w-full items-center justify-center rounded-lg bg-[#38bdf8] text-[15px] font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc] disabled:opacity-40 disabled:hover:bg-[#38bdf8]'
export const OUTLINE_BUTTON =
  'flex h-[50px] w-full items-center justify-center rounded-lg border border-[#223a5c] text-[15px] font-bold text-[#cfe0f4] transition-colors hover:border-[#38bdf8]'
export const SECONDARY_LINK =
  'font-inter-body text-[13.5px] font-semibold text-[#8ba4c4] transition-colors hover:text-[#f4f9ff]'
export const FIELD =
  'h-[50px] w-full rounded-lg border border-[#1b2c46] bg-[#0a1421] px-4 font-inter-body text-[15px] text-[#f4f9ff] placeholder:text-[#4f688a] focus:border-[#38bdf8] focus:outline-none'
