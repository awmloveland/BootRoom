# League creation, slice 5: polish and entry points — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The landing page sends visitors to `/new`, the waitlist is gone, settings links to league creation, and the Live screen rises in with a confetti burst.

**Architecture:** Three CTA edits and a set of deletions on the landing side; a `rise` prop on `StepShell` plus a canvas `Confetti` component on the Live side. No backend changes.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (`@theme` keyframes in `app/globals.css`), canvas 2D, Jest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-13-league-creation-slice-5-design.md`. **Branch:** `awmloveland/league-creation-polish`, stacked on `awmloveland/league-creation-results` (PR #197).

Tasks 1 and 2 touch disjoint files and may run in parallel.

---

### Task 1: Landing CTAs, waitlist removal, settings link

**Files:**
- Modify: `components/landing/Hero.tsx`, `components/landing/LandingHeader.tsx`, `components/landing/LandingFooter.tsx`, `components/landing/LandingPage.tsx`, `components/AccountSettings.tsx`
- Delete: `components/landing/WaitlistSection.tsx`, `components/landing/WaitlistForm.tsx`, `app/api/waitlist/route.ts`, `lib/waitlist.ts`, `lib/email/send-waitlist-notification.ts`, `__tests__/waitlist-form.test.tsx`, `__tests__/waitlist-body.test.ts`, `__tests__/waitlist-route.test.ts`
- Create: `__tests__/landing-cta.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/landing/Hero'

it('sends visitors to league creation, not a waitlist', () => {
  const { container } = render(<Hero />)
  expect(screen.getByRole('link', { name: 'Start your league' })).toHaveAttribute('href', '/new')
  expect(container.querySelector('a[href="#waitlist"]')).toBeNull()
})
```

If `Hero` needs providers or mocks to render (check `__tests__/` for an existing landing test and `Hero.tsx`'s imports; `LoginLink` may use `next/navigation`), mock the minimum the way the neighbouring tests do.

- [ ] **Step 2:** Run `npm test -- __tests__/landing-cta.test.tsx`: FAIL (no such link).

- [ ] **Step 3: CTAs**

- `Hero.tsx`: replace the `<a href="#waitlist" …>Register your interest</a>` with `<Link href="/new" className="…same classes…">Start your league</Link>` (import `Link` from `next/link`).
- `LandingHeader.tsx`: same for the `Register interest` button → `Start your league`, `href="/new"`, as a `Link`.
- `LandingFooter.tsx`: `<a href="#waitlist" className={footerLinkClass}>Register interest</a>` → `<Link href="/new" className={footerLinkClass}>Start your league</Link>`.
- `LandingPage.tsx`: remove the `WaitlistSection` import and element.

- [ ] **Step 4: Delete the waitlist**

```bash
git rm components/landing/WaitlistSection.tsx components/landing/WaitlistForm.tsx app/api/waitlist/route.ts lib/waitlist.ts lib/email/send-waitlist-notification.ts __tests__/waitlist-form.test.tsx __tests__/waitlist-body.test.ts __tests__/waitlist-route.test.ts
```

Then `grep -rn "waitlist" app components lib __tests__ --include=*.ts --include=*.tsx -i` must return nothing. If `lib/email/` has an index that re-exports the notification, remove that line too. If `send-waitlist-notification.ts` is imported by anything other than the deleted route, stop and report NEEDS_CONTEXT.

- [ ] **Step 5: Settings link**

In `components/AccountSettings.tsx`, directly after the `{leagues.length > 0 && ( … )}` block that renders "Linked Leagues", add (importing `Link` from `next/link` and `Plus` from `lucide-react` if not already imported):

```tsx
      <Link
        href="/new"
        className="mb-12 flex items-center justify-between gap-4 rounded-xl border border-dashed border-[#223a5c] px-[18px] py-4 text-[15px] font-bold text-[#8ba4c4] transition-colors hover:border-[#38bdf8] hover:text-[#f4f9ff]"
      >
        Create a league
        <Plus className="size-4 shrink-0" />
      </Link>
```

- [ ] **Step 6: Check**

`npm test -- __tests__/landing-cta.test.tsx __tests__/account` (the new test passes; any existing account settings tests still pass), then `npx tsc --noEmit` and `npx eslint components/landing components/AccountSettings.tsx`.

- [ ] **Step 7: Commit**

```bash
git add -A components/landing components/AccountSettings.tsx app/api lib __tests__
git commit -m "Send the landing page to league creation and remove the waitlist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Live rise-in and confetti

**Files:**
- Modify: `app/globals.css`, `components/new-league/StepShell.tsx`, `components/new-league/LiveScreen.tsx`
- Create: `components/new-league/Confetti.tsx`, `__tests__/confetti.test.tsx`

- [ ] **Step 1: Keyframes.** In `app/globals.css`, inside the `@theme` block next to `--animate-cf-pulse`, add

```css
  --animate-cf-rise: cf-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) var(--cf-rise-delay, 0s) both;
  @keyframes cf-rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: none; }
  }
```

- [ ] **Step 2: StepShell `rise` prop.** Add `rise?: boolean` to the props ("Elements rise in one after another; the Live screen only."). Define inside the component

```ts
  const riseAt = (step: number) => rise && cn('motion-safe:animate-cf-rise', ['[--cf-rise-delay:0s]', '[--cf-rise-delay:.1s]', '[--cf-rise-delay:.2s]', '[--cf-rise-delay:.3s]', '[--cf-rise-delay:.4s]', '[--cf-rise-delay:.5s]'][step])
```

and apply `riseAt(0)` to the logo tile `div`, `riseAt(1)` to the eyebrow wrapper, `riseAt(2)` to the `h1`, `riseAt(3)` to the sub `p`, `riseAt(4)` to the children wrapper and `riseAt(5)` to the action wrapper, via `cn(existingClasses, riseAt(n))`. Import `cn` from `@/lib/utils`.

- [ ] **Step 3: Confetti test (failing first)**

```tsx
/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import { Confetti } from '@/components/new-league/Confetti'

function mockMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia
}

it('draws nothing when the user prefers reduced motion', () => {
  mockMotion(true)
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  render(<Confetti />)
  expect(getContext).not.toHaveBeenCalled()
  getContext.mockRestore()
})

it('starts drawing otherwise', () => {
  mockMotion(false)
  const ctx = { clearRect: jest.fn(), save: jest.fn(), restore: jest.fn(), translate: jest.fn(), rotate: jest.fn(), fillRect: jest.fn(), set globalAlpha(_: number) {}, set fillStyle(_: string) {} }
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
  render(<Confetti />)
  expect(getContext).toHaveBeenCalledWith('2d')
  expect(raf).toHaveBeenCalled()
  getContext.mockRestore()
  raf.mockRestore()
})
```

Run `npm test -- __tests__/confetti.test.tsx`: FAIL (module missing).

- [ ] **Step 4: Confetti**

```tsx
// components/new-league/Confetti.tsx
'use client'

import { useEffect, useRef } from 'react'

const COLOURS = ['#bef264', '#38bdf8', '#a78bfa', '#f4f9ff', '#7dd3fc']
const PIECES = 42

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  colour: string
  angle: number
  spin: number
  life: number   // seconds
  age: number
}

/**
 * One burst of confetti from behind the logo tile when the Live screen
 * mounts. Drawn on a full-screen canvas behind the page, so no per-piece
 * styles; skipped entirely for people who prefer reduced motion.
 */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    // The logo tile sits at the top centre of the 520px column; the burst starts just above it.
    const origin = { x: canvas.width / 2, y: Math.min(120, canvas.height * 0.2) }
    const pieces: Piece[] = Array.from({ length: PIECES }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
      const speed = 220 + Math.random() * 260
      return {
        x: origin.x, y: origin.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 8,
        life: 1.4 + Math.random() * 0.9, age: 0,
      }
    })

    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = 0
      for (const p of pieces) {
        p.age += dt
        if (p.age >= p.life) continue
        alive++
        p.vy += 900 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.angle += p.spin * dt
        ctx.save()
        ctx.globalAlpha = 1 - p.age / p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.colour
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (alive > 0) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
```

- [ ] **Step 5: LiveScreen.** Import `Confetti`, pass `rise` to `StepShell`, and render `<Confetti />` as a sibling before `StepShell` (wrap both in a fragment): inside the shell, an animated ancestor's transform would become the fixed canvas's containing block.

- [ ] **Step 6: Check.** `npm test -- __tests__/confetti.test.tsx` (2 pass), `npx tsc --noEmit`, `npx eslint components/new-league`. If the lint rule `react-hooks/exhaustive-deps` or `set-state-in-effect` fires, report the message; the effect sets no React state.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/new-league __tests__/confetti.test.tsx
git commit -m "Live screen: rise-in and a one-shot confetti burst

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Verify and open the PR

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build && npm run bundle-report` (the landing route should shrink without the waitlist form; `/new` grows by the small Confetti chunk).
- [ ] Manual (Will): landing CTAs; a full run through `/new` ending on Live with the burst; the settings link; "Reduce motion" on, no burst or rise.
- [ ] Push and open the PR against `awmloveland/league-creation-results`:

```bash
git push -u origin HEAD
gh pr create --base awmloveland/league-creation-results --title "League creation 5/5: landing CTA, settings link, Live polish" --body "$(cat <<'EOF'
## Summary
Stacked on #197. The last slice of league creation.

- Landing page: hero, header and footer CTAs become "Start your league" → `/new`; the waitlist section, form, API route, email notification and tests are removed (the `waitlist_signups` table stays)
- Account settings: a "Create a league" row under Linked leagues
- Live screen: elements rise in one after another, and a one-shot canvas confetti burst plays on mount; both honour `prefers-reduced-motion`
- Places autocomplete and the map preview are dropped for now; the venue stays free text

Spec: docs/superpowers/specs/2026-11-13-league-creation-slice-5-design.md

## Test plan
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] Landing CTAs land on `/new`; a run through `/new` ends on Live with the burst; settings shows the link; with Reduce motion on, neither animation plays

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
