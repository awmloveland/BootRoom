# Craft Football Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the signed-out view of `/` with the Craft Football marketing landing page from the Claude Design v2 handoff, including a working waitlist (Supabase + Resend).

**Architecture:** Server-rendered landing page composed of static server components, with five client islands (header/login, stats demo, Lineup Lab demo, FAQ accordion, waitlist form). New `POST /api/waitlist` route validates via a pure function in `lib/waitlist.ts`, inserts with the service-role client, and fires a Resend notification. The global `Navbar` hides itself on `/` for signed-out visitors because the landing page ships its own header.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4 (utility classes only, arbitrary values for the landing palette), Supabase (service role), Resend, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-07-30-landing-page-design.md`
**Design source (read-only reference):** `.context/attachments/xggS4h/handoff/craft-football-landing-page/project/Craft Football Landing v2.dc.html`

**Conventions that apply to every task:** British English copy, no em dashes in copy, `cn()` from `@/lib/utils` for conditional classes, no new dependencies, no `.css` files beyond `app/globals.css`. The handoff logo is byte-identical to `public/logo.png`, so no asset copying is needed.

---

### Task 1: Fonts, keyframes, metadata

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (inside the existing `@theme` block, lines 7–53)

- [ ] **Step 1: Add Space Grotesk and IBM Plex Mono, update metadata**

Replace the font setup and metadata in `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter, Space_Grotesk } from 'next/font/google'
import { Navbar } from '@/components/ui/navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  title: 'Craft Football',
  description: 'Results, stats and fair teams for your weekly game.',
  openGraph: {
    title: 'Craft Football',
    description: 'Results, stats and fair teams for your weekly game.',
    url: 'https://craft-football.com',
    siteName: 'Craft Football',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark bg-slate-900 scroll-smooth [scroll-padding-top:118px] ${spaceGrotesk.variable} ${plexMono.variable} ${inter.variable}`}
    >
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
```

Notes: `scroll-smooth`/`scroll-padding-top` power the landing page's anchor links (`#features` etc.) accounting for the sticky header; the rest of the app uses no in-page anchors so this is inert elsewhere. `inter.className` still sets the default body font.

- [ ] **Step 2: Register font utilities and keyframes in globals.css**

Inside the existing `@theme { ... }` block in `app/globals.css` (after the `--animate-accordion-up` line and its keyframes, before the closing brace), add:

```css
  --font-grotesk: var(--font-space-grotesk), var(--font-inter), system-ui, sans-serif;
  --font-plex: var(--font-plex-mono), ui-monospace, monospace;
  --font-inter-body: var(--font-inter), system-ui, sans-serif;

  --animate-cf-tick: cf-tick 34s linear infinite;
  --animate-cf-pulse: cf-pulse 2.4s ease-in-out infinite;

  @keyframes cf-tick {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  @keyframes cf-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
```

This yields `font-grotesk`, `font-plex`, `font-inter-body`, `animate-cf-tick`, and `animate-cf-pulse` utilities. The marquee reuses the keyframes at a different speed via `animate-[cf-tick_40s_linear_infinite]`.

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "Add landing fonts, keyframes and site metadata"
```

---

### Task 2: Waitlist body validation (TDD)

**Files:**
- Create: `lib/waitlist.ts`
- Test: `__tests__/waitlist-body.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/waitlist-body.test.ts`:

```ts
import { parseWaitlistBody } from '@/lib/waitlist'

describe('parseWaitlistBody', () => {
  const valid = { name: 'Will', email: 'will@example.com', city: 'London', format: '7' }

  it('parses a valid body', () => {
    expect(parseWaitlistBody(valid)).toEqual({
      name: 'Will',
      email: 'will@example.com',
      city: 'London',
      format: '7',
    })
  })

  it('trims name and city, lowercases email', () => {
    expect(
      parseWaitlistBody({ name: '  Will ', email: ' Will@Example.COM ', city: '  London ', format: 'mixed' })
    ).toEqual({ name: 'Will', email: 'will@example.com', city: 'London', format: 'mixed' })
  })

  it('accepts a missing or empty city as null', () => {
    expect(parseWaitlistBody({ ...valid, city: undefined })).toEqual({ ...valid, city: null })
    expect(parseWaitlistBody({ ...valid, city: '   ' })).toEqual({ ...valid, city: null })
  })

  it('rejects missing or whitespace-only name', () => {
    expect(parseWaitlistBody({ ...valid, name: '' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, name: '   ' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, name: 42 })).toBeNull()
  })

  it('rejects invalid emails', () => {
    expect(parseWaitlistBody({ ...valid, email: 'not-an-email' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: 'a@b' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: '' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, email: 7 })).toBeNull()
  })

  it('rejects invalid formats', () => {
    expect(parseWaitlistBody({ ...valid, format: '11' })).toBeNull()
    expect(parseWaitlistBody({ ...valid, format: undefined })).toBeNull()
  })

  it('rejects non-object bodies', () => {
    expect(parseWaitlistBody(null)).toBeNull()
    expect(parseWaitlistBody('hello')).toBeNull()
    expect(parseWaitlistBody([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/waitlist-body.test.ts`
Expected: FAIL — cannot find module `@/lib/waitlist`.

- [ ] **Step 3: Write the implementation**

Create `lib/waitlist.ts`:

```ts
export const WAITLIST_FORMATS = ['5', '6', '7', 'mixed'] as const
export type WaitlistFormat = (typeof WAITLIST_FORMATS)[number]

export interface WaitlistBody {
  name: string
  email: string
  city: string | null
  format: WaitlistFormat
}

/** Same acceptance rule as the landing form: something@something.tld */
const EMAIL_RE = /^\S+@\S+\.\S+$/

/** Parse and validate a waitlist signup payload. Returns null when invalid. */
export function parseWaitlistBody(body: unknown): WaitlistBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || b.name.trim() === '') return null
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) return null
  if (typeof b.format !== 'string' || !(WAITLIST_FORMATS as readonly string[]).includes(b.format)) return null

  const city = typeof b.city === 'string' && b.city.trim() !== '' ? b.city.trim() : null

  return {
    name: b.name.trim(),
    email: b.email.trim().toLowerCase(),
    city,
    format: b.format as WaitlistFormat,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/waitlist-body.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/waitlist.ts __tests__/waitlist-body.test.ts
git commit -m "Add waitlist signup body validation"
```

---

### Task 3: waitlist_signups migration

**Files:**
- Create: `supabase/migrations/20260730000001_waitlist_signups.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260730000001_waitlist_signups.sql`:

```sql
-- Landing page waitlist signups. Written only by the service role via
-- POST /api/waitlist; no client access.
create table waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  city text,
  format text not null check (format in ('5', '6', '7', 'mixed')),
  created_at timestamptz not null default now()
);

create unique index waitlist_signups_email_key on waitlist_signups (lower(email));

alter table waitlist_signups enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) touches this table.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260730000001_waitlist_signups.sql
git commit -m "Add waitlist_signups table"
```

Note for the human operator: run this migration in the Supabase SQL Editor (repo convention — migrations are applied manually, in order).

---

### Task 4: Waitlist API route + Resend notification (TDD)

**Files:**
- Create: `lib/email/send-waitlist-notification.ts`
- Create: `app/api/waitlist/route.ts`
- Test: `__tests__/waitlist-route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/waitlist-route.test.ts`. It follows the mocking pattern of `lib/__tests__/email.notifications.test.ts` (mock the service client and Resend modules):

```ts
import { POST } from '@/app/api/waitlist/route'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/email/resend')

const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null })
const mockInsert = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockInsert.mockResolvedValue({ error: null })
  ;(getResendClient as jest.Mock).mockReturnValue({ emails: { send: mockEmailSend } })
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => ({ insert: mockInsert })),
  })
})

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const valid = { name: 'Will', email: 'will@example.com', city: 'London', format: '7' }

describe('POST /api/waitlist', () => {
  it('inserts the signup and sends a notification email', async () => {
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Will',
      email: 'will@example.com',
      city: 'London',
      format: '7',
    })
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    expect(mockEmailSend.mock.calls[0][0].to).toBe('awmloveland@gmail.com')
  })

  it('rejects invalid bodies with 400 and does not insert', async () => {
    const res = await POST(makeRequest({ ...valid, email: 'nope' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/waitlist', { method: 'POST', body: 'not json' })
    )
    expect(res.status).toBe(400)
  })

  it('silently accepts honeypot submissions without inserting', async () => {
    const res = await POST(makeRequest({ ...valid, website: 'spam.example' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('treats a duplicate email as success and sends no email', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('returns 500 on other insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } })
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(500)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('still succeeds when the notification email fails', async () => {
    mockEmailSend.mockRejectedValue(new Error('resend down'))
    const res = await POST(makeRequest(valid))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/waitlist-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/waitlist/route`.

- [ ] **Step 3: Write the notification sender**

Create `lib/email/send-waitlist-notification.ts`:

```ts
import { getResendClient } from '@/lib/email/resend'
import type { WaitlistBody } from '@/lib/waitlist'

const FROM_ADDRESS = 'notifications@craft-football.com'
const NOTIFY_ADDRESS = 'awmloveland@gmail.com'

const FORMAT_LABELS: Record<WaitlistBody['format'], string> = {
  '5': '5-a-side',
  '6': '6-a-side',
  '7': '7-a-side',
  mixed: 'Mixed formats',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendWaitlistNotification(signup: WaitlistBody): Promise<void> {
  const resend = getResendClient()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: NOTIFY_ADDRESS,
    subject: `Waitlist signup: ${signup.name}`,
    html: [
      '<h2>New waitlist signup</h2>',
      `<p><strong>Name:</strong> ${escapeHtml(signup.name)}</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(signup.email)}</p>`,
      `<p><strong>City:</strong> ${signup.city ? escapeHtml(signup.city) : 'Not given'}</p>`,
      `<p><strong>Format:</strong> ${FORMAT_LABELS[signup.format]}</p>`,
    ].join('\n'),
  })
}
```

- [ ] **Step 4: Write the route**

Create `app/api/waitlist/route.ts`. It uses plain `Response.json` (no `next/server` import) so the handler is directly testable in Jest's node environment:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { sendWaitlistNotification } from '@/lib/email/send-waitlist-notification'
import { parseWaitlistBody } from '@/lib/waitlist'

const PG_UNIQUE_VIOLATION = '23505'

export async function POST(request: Request): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Honeypot: real users never fill this hidden field. Pretend success.
  const website = (raw as Record<string, unknown> | null)?.website
  if (typeof website === 'string' && website.trim() !== '') {
    return Response.json({ ok: true })
  }

  const signup = parseWaitlistBody(raw)
  if (!signup) {
    return Response.json({ error: 'Invalid signup' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await db.from('waitlist_signups').insert({
    name: signup.name,
    email: signup.email,
    city: signup.city,
    format: signup.format,
  })

  if (error) {
    // Already on the list: report success, leak nothing, notify nobody twice.
    if (error.code === PG_UNIQUE_VIOLATION) return Response.json({ ok: true })
    console.error('waitlist insert failed:', error)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  try {
    await sendWaitlistNotification(signup)
  } catch (err) {
    console.error('waitlist notification email failed:', err)
  }

  return Response.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- __tests__/waitlist-route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/email/send-waitlist-notification.ts app/api/waitlist/route.ts __tests__/waitlist-route.test.ts
git commit -m "Add waitlist API route with Resend notification"
```

---

### Task 5: LoginLink client component

**Files:**
- Create: `components/landing/LoginLink.tsx`

- [ ] **Step 1: Write the component**

A small client wrapper so the landing header and footer can open the existing `AuthDialog` with their own styling:

```tsx
'use client'

import { AuthDialog } from '@/components/AuthDialog'

interface LoginLinkProps {
  className?: string
  children: React.ReactNode
}

/** Opens the shared sign-in dialog from landing-styled triggers. */
export function LoginLink({ className, children }: LoginLinkProps) {
  return (
    <AuthDialog
      redirect="/"
      signinOnly
      trigger={(openSignIn) => (
        <button type="button" onClick={openSignIn} className={className}>
          {children}
        </button>
      )}
    />
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/LoginLink.tsx
git commit -m "Add LoginLink trigger for the landing page"
```

---

### Task 6: LandingHeader (ticker + sticky nav)

**Files:**
- Create: `components/landing/LandingHeader.tsx`

- [ ] **Step 1: Write the component**

Server component (the only interactivity, Log in, lives in `LoginLink`). Ticker items are duplicated once for the seamless `-50%` loop, exactly like the prototype:

```tsx
import { LoginLink } from '@/components/landing/LoginLink'

const TICKER_ITEMS: { text: string; highlight?: boolean }[] = [
  { text: 'WK14 · TEAM A 6-4 TEAM B' },
  { text: 'S. OKAFOR CROWNED Q1 CHAMPION', highlight: true },
  { text: 'WK13 · TEAM B 5-3 TEAM A' },
  { text: 'E. KNIGHT · 3 WINS ON THE SPIN', highlight: true },
  { text: 'WK12 · DRAWN 4-4' },
  { text: 'W. LOVELAND · 42ND CAP' },
]

const NAV_LINKS = [
  { href: '#features', label: 'FEATURES' },
  { href: '#how', label: 'HOW IT WORKS' },
  { href: '#faq', label: 'FAQ' },
]

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[rgba(6,11,20,.94)] backdrop-blur-[10px] border-b border-[#101d31]">
      <div className="h-9 bg-[#0b1728] border-b border-[#17263c] flex items-center overflow-hidden">
        <span className="inline-flex items-center gap-[7px] flex-none px-[18px] h-full border-r border-[#17263c] font-plex text-[10px] font-bold tracking-[.18em] text-[#bef264]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#bef264] animate-cf-pulse" />
          LATEST
        </span>
        <div className="flex-1 overflow-hidden">
          <div className="flex w-max animate-cf-tick font-plex text-[11px] tracking-[.1em] text-[#8ba4c4]">
            {[0, 1].map((copy) => (
              <span key={copy} aria-hidden={copy === 1} className="flex">
                {TICKER_ITEMS.map((item) => (
                  <span key={item.text} className={item.highlight ? 'px-[26px] text-[#38bdf8]' : 'px-[26px]'}>
                    {item.text}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto h-[74px] px-5 sm:px-11 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Craft Football" className="w-[34px] h-[34px] block" />
          <span className="text-lg font-bold tracking-[-.02em]">Craft Football</span>
        </div>
        <nav className="flex items-center gap-4 md:gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden md:block font-plex text-[11px] font-semibold tracking-[.16em] text-[#8ba4c4] hover:text-[#eaf2ff]"
            >
              {link.label}
            </a>
          ))}
          <span className="flex items-center gap-2.5">
            <a
              href="#waitlist"
              className="inline-flex items-center h-10 px-4 sm:px-5 bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] rounded text-[13px] font-bold transition-colors"
            >
              Register interest
            </a>
            <LoginLink className="inline-flex items-center h-10 px-4 sm:px-[18px] border border-[#223a5c] hover:border-[#38bdf8] rounded text-[#cfe0f4] hover:text-white text-[13px] font-bold transition-colors cursor-pointer">
              Log in
            </LoginLink>
          </span>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/LandingHeader.tsx
git commit -m "Add landing header with results ticker"
```

---

### Task 7: Hero and Marquee

**Files:**
- Create: `components/landing/Hero.tsx`
- Create: `components/landing/Marquee.tsx`

- [ ] **Step 1: Write Hero**

Server component. Two columns on `lg`, single column below; the match-card visual and tilted player card are static markup:

```tsx
const TEAM_A = ['Will Loveland 🧤', 'Alex Miller', 'Rav Singh', 'Sam Okafor']
const TEAM_B = ['Jordan Taylor 🧤', 'Ben Carter', 'Ollie Wright', 'Priya Nair']

const HERO_STATS = [
  { value: '400+', label: 'MATCHES RECORDED' },
  { value: '60+', label: 'PLAYERS TRACKED' },
  { value: '2022', label: 'KEEPING SCORE SINCE' },
]

const FORM_BARS = ['#38bdf8', '#38bdf8', '#3d5578', '#38bdf8', '#e2686f']

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#060b14]">
      <div
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(#16283f_1.4px,transparent_1.4px)] bg-[length:24px_24px] [mask-image:linear-gradient(180deg,#000_0%,rgba(0,0,0,.45)_55%,transparent_92%)]"
      />
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-11 pt-14 lg:pt-[72px] pb-16 lg:pb-[84px] grid lg:grid-cols-[1.02fr_.98fr] gap-[52px] items-center">
        <div>
          <span className="inline-flex items-center gap-[9px] font-plex text-[10px] font-bold tracking-[.2em] text-[#bef264]">
            <span className="w-[22px] h-0.5 bg-[#bef264]" />
            PRIVATE BETA · 5, 6 &amp; 7-A-SIDE
          </span>
          <h1 className="mt-5 text-5xl sm:text-6xl lg:text-[82px] leading-[.94] font-bold tracking-[-.035em] text-[#f4f9ff]">
            Results, stats<br />and fair teams.
          </h1>
          <p className="mt-4 text-2xl lg:text-[34px] leading-none font-bold tracking-[-.03em] text-[#38bdf8]">
            For your weekly game.
          </p>
          <p className="mt-6 max-w-[470px] font-inter-body text-base leading-relaxed text-[#8ba4c4] text-pretty">
            The group chat has opinions. The table has facts. Craft Football records every match
            your group plays and turns it into results history, player records, honours boards and
            auto-picked teams.
          </p>
          <div className="flex items-center gap-3.5 mt-[30px]">
            <a
              href="#waitlist"
              className="inline-flex items-center h-[52px] px-[26px] bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] rounded text-[15px] font-bold transition-colors"
            >
              Register your interest
            </a>
          </div>
          <div className="flex items-end gap-6 sm:gap-[34px] mt-11 pt-[26px] border-t border-[#17263c]">
            {HERO_STATS.map((stat, i) => (
              <span key={stat.label} className="flex items-end gap-6 sm:gap-[34px]">
                {i > 0 && <span className="w-px h-[38px] bg-[#17263c]" />}
                <span>
                  <p className="font-plex text-[34px] font-bold tracking-[-.03em] text-[#f4f9ff] leading-none">{stat.value}</p>
                  <p className="mt-1.5 font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">{stat.label}</p>
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="relative pb-[76px]">
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-[14px] overflow-hidden shadow-[0_34px_80px_rgba(0,0,0,.6)]">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0c1728] border-b border-[#1b2c46]">
              <span className="font-plex text-[10px] font-semibold tracking-[.16em] text-[#7f97b5]">WEEK 14 · 25 MAR 2026 · 7-A-SIDE</span>
              <span className="font-plex text-[10px] font-bold tracking-[.16em] text-[#bef264]">FULL TIME</span>
            </div>
            <div className="px-6 pt-7 pb-[22px] grid grid-cols-[1fr_auto_1fr] items-center gap-5">
              <p className="text-[15px] font-bold tracking-[.02em] text-[#7dd3fc]">TEAM A</p>
              <p className="font-plex text-5xl sm:text-[66px] font-bold leading-[.9] tracking-[-.04em] text-[#f4f9ff] tabular-nums whitespace-nowrap">
                6<span className="text-[#2f4a70]">-</span>4
              </p>
              <p className="text-right text-[15px] font-bold tracking-[.02em] text-[#c4b5fd]">TEAM B</p>
            </div>
            <div className="px-6 pb-5 grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-[5px]">
                {TEAM_A.map((name) => (
                  <div key={name} className="font-inter-body text-xs font-semibold px-[11px] py-2 rounded bg-[rgba(8,47,73,.55)] border-l-2 border-[#38bdf8] text-[#dff1ff]">
                    {name}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-[5px]">
                {TEAM_B.map((name) => (
                  <div key={name} className="font-inter-body text-xs font-semibold px-[11px] py-2 rounded bg-[rgba(46,16,101,.45)] border-l-2 border-[#a78bfa] text-[#efeaff]">
                    {name}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-[13px] border-t border-[#1b2c46] bg-[#0c1728] font-plex text-[10px] font-semibold tracking-[.14em] text-[#7f97b5]">
              <span>LINEUP LAB · Δ 0.024 BALANCED</span>
              <span className="text-[#bef264]">MARGIN +2</span>
            </div>
          </div>
          <div className="absolute left-0 sm:-left-[30px] bottom-0 box-border w-[290px] -rotate-2 border border-[#1b2c46] bg-[#101d31] rounded-[10px] px-4 py-3.5 shadow-[0_22px_50px_rgba(0,0,0,.6)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-inter-body text-[13px] font-bold text-[#f4f9ff]">Will Loveland</p>
                <p className="mt-[3px] font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">42 CAPS · KEEPER</p>
              </div>
              <p className="font-plex text-2xl font-bold leading-none tracking-[-.03em] text-[#38bdf8]">
                66.7<span className="text-[13px]">%</span>
              </p>
            </div>
            <div className="flex gap-1 mt-3">
              {FORM_BARS.map((color, i) => (
                <span key={i} className="w-[26px] h-2 rounded-sm" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

Note: the five form bars use a `style` prop for `backgroundColor` driven by data — this mirrors how the repo handles data-driven colours elsewhere (e.g. `FormDots`); it is a data lookup, not layout styling, so it stays within the Tailwind-only rule. If a `FormDots`-style class lookup is trivially applicable, prefer a `Record<string, string>` of Tailwind classes: `{'#38bdf8': 'bg-[#38bdf8]', ...}` — implementer's choice, behaviour identical.

- [ ] **Step 2: Write Marquee**

```tsx
const MARQUEE_WORDS = ['STATS', 'FAIR TEAMS', 'HONOURS', 'RESULTS']

export function Marquee() {
  return (
    <div className="bg-[#38bdf8] overflow-hidden py-4">
      <div className="flex w-max animate-[cf-tick_40s_linear_infinite] text-2xl sm:text-[30px] font-bold tracking-[-.02em] text-[#05101d]">
        {[0, 1].map((copy) => (
          <span key={copy} aria-hidden={copy === 1} className="flex">
            {MARQUEE_WORDS.map((word) => (
              <span key={word} className="flex">
                <span className="px-[22px]">{word}</span>
                <span className="px-[22px] opacity-45">·</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/landing/Hero.tsx components/landing/Marquee.tsx
git commit -m "Add landing hero and marquee"
```

---

### Task 8: FeatureGrid

**Files:**
- Create: `components/landing/FeatureGrid.tsx`

- [ ] **Step 1: Write the component**

```tsx
const FEATURES = [
  {
    num: '01',
    accent: '#38bdf8',
    title: 'Player records',
    body: 'Win rate, last-five form, caps, team splits and time in goal. Sortable every way your group argues about it.',
    href: '#feature-stats',
  },
  {
    num: '02',
    accent: '#a78bfa',
    title: 'Lineup Lab',
    body: "Weighs every record and splits tonight's group into two sides so even it is spooky.",
    href: '#feature-lineup',
  },
  {
    num: '03',
    accent: '#bef264',
    title: 'Honours',
    body: 'A champion every quarter, hot streaks, milestone caps from the 10th game to the 100th.',
    href: '#feature-honours',
  },
  {
    num: '04',
    accent: '#38bdf8',
    title: 'Results',
    body: 'A match card for every week: who played, who won, by how much, and what it was like out there.',
    href: '#feature-results',
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="max-w-[620px]">
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">THE PRODUCT</p>
        <h2 className="mt-3.5 text-4xl sm:text-[54px] leading-[.98] font-bold tracking-[-.04em] text-[#f4f9ff]">
          Four things,<br />done properly.
        </h2>
        <p className="mt-4 font-inter-body text-base leading-relaxed text-[#8ba4c4]">
          Stats, fair teams, honours, results: the whole life of your weekly game.
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0.5 bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden mt-9">
        {FEATURES.map((feature) => (
          <a
            key={feature.num}
            href={feature.href}
            className="block bg-[#0a1421] hover:bg-[#0f2033] px-[22px] pt-[26px] pb-7 border-t-[3px] transition-colors"
            style={{ borderTopColor: feature.accent }}
          >
            <p className="font-plex text-[11px] font-bold tracking-[.16em]" style={{ color: feature.accent }}>
              {feature.num}
            </p>
            <p className="mt-4 text-[21px] font-bold tracking-[-.02em] text-[#f4f9ff]">{feature.title}</p>
            <p className="mt-[9px] font-inter-body text-[13px] leading-relaxed text-[#8ba4c4]">{feature.body}</p>
          </a>
        ))}
      </div>
    </section>
  )
}
```

(As in Task 7, the two `style` props carry data-driven accent colours from the array; layout stays in classes.)

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/FeatureGrid.tsx
git commit -m "Add landing feature grid"
```

---

### Task 9: StatsDemo (sortable table island)

**Files:**
- Create: `components/landing/StatsDemo.tsx`

- [ ] **Step 1: Write the component**

Client component porting the prototype's sort logic verbatim:

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface DemoPlayer {
  name: string
  played: number
  role: string
  form: string
  winRate: number
}

const PLAYERS: DemoPlayer[] = [
  { name: 'Will Loveland', played: 42, role: 'KEEPER', form: 'WWDWL', winRate: 66.7 },
  { name: 'Rav Singh', played: 36, role: 'DEFENSIVE', form: 'WWWDL', winRate: 58.3 },
  { name: 'Alex Miller', played: 38, role: 'BALANCED', form: 'WLWWW', winRate: 57.9 },
  { name: 'Ellie Knight', played: 34, role: 'ATTACKING', form: 'WDWWW', winRate: 55.9 },
]

type SortKey = 'winRate' | 'played' | 'form' | 'az'

const SORT_CHIPS: { key: SortKey; label: string }[] = [
  { key: 'winRate', label: 'WIN %' },
  { key: 'played', label: 'CAPS' },
  { key: 'form', label: 'FORM' },
  { key: 'az', label: 'A–Z' },
]

const wins = (form: string) => form.split('').filter((c) => c === 'W').length

const SORTERS: Record<SortKey, (a: DemoPlayer, b: DemoPlayer) => number> = {
  winRate: (a, b) => b.winRate - a.winRate,
  played: (a, b) => b.played - a.played,
  form: (a, b) => wins(b.form) - wins(a.form),
  az: (a, b) => a.name.localeCompare(b.name),
}

const BAR_CLASS: Record<string, string> = {
  W: 'bg-[#38bdf8]',
  D: 'bg-[#3d5578]',
  L: 'bg-[#e2686f]',
}

export function StatsDemo() {
  const [sortBy, setSortBy] = useState<SortKey>('winRate')
  const sorted = [...PLAYERS].sort(SORTERS[sortBy])

  return (
    <section id="feature-stats" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#38bdf8]">01 · TEAM &amp; PLAYER STATS</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Records that<br />settle it.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            Every appearance counted, every run of form kept. Sort it by whatever the argument is
            this week, then send the link and let the table talk.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {SORT_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setSortBy(chip.key)}
                className={cn(
                  'font-plex text-[10px] font-bold tracking-[.12em] px-[13px] py-[9px] rounded border transition-colors cursor-pointer',
                  sortBy === chip.key
                    ? 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]'
                    : 'bg-transparent border-[#223a5c] text-[#8ba4c4]'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-px bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[44px_1fr_86px_64px] sm:grid-cols-[44px_1fr_130px_96px] items-center gap-3.5 px-4 sm:px-[22px] py-3 bg-[#0c1728] font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">
            <span>#</span>
            <span>PLAYER</span>
            <span>LAST 5</span>
            <span className="text-right">WIN %</span>
          </div>
          {sorted.map((player, i) => (
            <div
              key={player.name}
              className="grid grid-cols-[44px_1fr_86px_64px] sm:grid-cols-[44px_1fr_130px_96px] items-center gap-3.5 px-4 sm:px-[22px] py-4 bg-[#0a1421]"
            >
              <span className={cn('font-plex text-[22px] font-bold', i === 0 ? 'text-[#38bdf8]' : 'text-[#3d5578]')}>
                {i + 1}
              </span>
              <span>
                <span className="block font-inter-body text-[15px] font-bold text-[#f4f9ff]">{player.name}</span>
                <span className="block mt-0.5 font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">
                  {player.played} CAPS · {player.role}
                </span>
              </span>
              <span className="flex gap-1">
                {player.form.split('').map((ch, j) => (
                  <span key={j} className={cn('w-3 sm:w-[18px] h-2 rounded-sm', BAR_CLASS[ch])} />
                ))}
              </span>
              <span
                className={cn(
                  'text-right font-plex text-lg sm:text-2xl font-bold tracking-[-.03em]',
                  i === 0 ? 'text-[#38bdf8]' : 'text-[#eaf2ff]'
                )}
              >
                {player.winRate.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/StatsDemo.tsx
git commit -m "Add sortable player records demo"
```

---

### Task 10: LineupLabDemo (shuffle island)

**Files:**
- Create: `components/landing/LineupLabDemo.tsx`

- [ ] **Step 1: Write the component**

Client component. Mount animation: chips deal in after 500 ms. Shuffle: chips retract (380 ms), then the other lineup deals in. Per-chip stagger via inline `transitionDelay` (data-driven timing, not layout):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Lineup {
  a: string[]
  b: string[]
  ra: string
  rb: string
  delta: string
}

const LINEUPS: Lineup[] = [
  {
    a: ['Will Loveland 🧤', 'Alex Miller', 'Rav Singh', 'Ellie Knight', 'Sam Okafor'],
    b: ['Jordan Taylor 🧤', 'Ben Carter', 'Ollie Wright', 'Priya Nair', 'Dan Foster'],
    ra: '4.012',
    rb: '3.988',
    delta: '0.024',
  },
  {
    a: ['Jordan Taylor 🧤', 'Ellie Knight', 'Sam Okafor', 'Harry Patel', 'Dan Foster'],
    b: ['Will Loveland 🧤', 'Alex Miller', 'Rav Singh', 'Priya Nair', 'Ben Carter'],
    ra: '3.941',
    rb: '3.966',
    delta: '0.025',
  },
]

const BULLETS = [
  'Rated on the record, not on reputation',
  'Keepers spread before anything else',
  'Reshuffle until the group stops moaning',
]

function TeamColumn({
  label,
  labelClass,
  rating,
  players,
  dealt,
  baseDelay,
  chipClass,
}: {
  label: string
  labelClass: string
  rating: string
  players: string[]
  dealt: boolean
  baseDelay: number
  chipClass: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between pb-2.5 border-b border-[#1b2c46]">
        <span className={cn('text-sm font-bold tracking-[.02em]', labelClass)}>{label}</span>
        <span
          className={cn(
            'font-plex text-base font-bold transition-opacity duration-[400ms] delay-[400ms]',
            labelClass,
            dealt ? 'opacity-100' : 'opacity-0'
          )}
        >
          {rating}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mt-3">
        {players.map((name, i) => (
          <div
            key={name}
            className={cn(
              'font-inter-body text-[13px] font-semibold px-3 py-[9px] rounded border-l-2 transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(.2,.7,.3,1)]',
              chipClass,
              dealt ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-[0.97]'
            )}
            style={{ transitionDelay: dealt ? `${(baseDelay + i * 0.06).toFixed(2)}s` : '0s' }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

export function LineupLabDemo() {
  const [dealt, setDealt] = useState(false)
  const [lineupIndex, setLineupIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineup = LINEUPS[lineupIndex]

  useEffect(() => {
    timerRef.current = setTimeout(() => setDealt(true), 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function shuffle() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDealt(false)
    timerRef.current = setTimeout(() => {
      setLineupIndex((i) => (i + 1) % LINEUPS.length)
      setDealt(true)
    }, 380)
  }

  return (
    <section
      id="feature-lineup"
      className="mt-16 lg:mt-[88px] py-16 lg:py-[88px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]"
    >
      <div className="max-w-[1112px] mx-auto grid lg:grid-cols-[1.15fr_.85fr] gap-10 lg:gap-14 items-center">
        <div className="relative border border-[#1b2c46] bg-[#060b14] rounded-[14px] px-4 sm:px-[26px] pt-[26px] pb-[22px] overflow-hidden order-2 lg:order-1">
          <svg
            viewBox="0 0 600 340"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            fill="none"
            stroke="#132339"
            strokeWidth="2"
          >
            <line x1="300" y1="0" x2="300" y2="340" />
            <circle cx="300" cy="170" r="78" />
          </svg>
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-plex text-[10px] font-semibold tracking-[.16em] text-[#7f97b5]">
                TONIGHT&apos;S DRAW · 5-A-SIDE · 10 IN
              </span>
              <span
                className={cn(
                  'font-plex text-[10px] font-bold tracking-[.14em] px-[11px] py-[5px] rounded bg-[rgba(190,242,100,.14)] border border-[rgba(190,242,100,.4)] text-[#bef264] transition-opacity duration-[400ms] delay-500',
                  dealt ? 'opacity-100' : 'opacity-0'
                )}
              >
                Δ {lineup.delta} BALANCED
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-[26px] mt-[22px]">
              <TeamColumn
                label="TEAM A"
                labelClass="text-[#7dd3fc]"
                rating={lineup.ra}
                players={lineup.a}
                dealt={dealt}
                baseDelay={0.05}
                chipClass="bg-[rgba(8,47,73,.55)] border-[#38bdf8] text-[#dff1ff]"
              />
              <TeamColumn
                label="TEAM B"
                labelClass="text-[#c4b5fd]"
                rating={lineup.rb}
                players={lineup.b}
                dealt={dealt}
                baseDelay={0.11}
                chipClass="bg-[rgba(46,16,101,.45)] border-[#a78bfa] text-[#efeaff]"
              />
            </div>
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={shuffle}
                className="inline-flex items-center gap-[9px] h-[42px] px-5 bg-transparent border border-[#223a5c] hover:border-[#38bdf8] rounded text-[13px] font-bold text-[#cfe0f4] hover:text-white cursor-pointer transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                Shuffle teams
              </button>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#a78bfa]">02 · LINEUP LAB</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Fair teams,<br />picked by the<br />numbers.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            Lineup Lab weighs every player&apos;s record, win rate, recent form and time in goal,
            then splits tonight&apos;s group into two sides so even it is spooky.
          </p>
          <div className="flex flex-col gap-2.5 mt-6">
            {BULLETS.map((line) => (
              <p key={line} className="font-inter-body text-sm text-[#cfe0f4]">{line}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/LineupLabDemo.tsx
git commit -m "Add Lineup Lab shuffle demo"
```

---

### Task 11: HonoursShowcase, ResultsShowcase, HowItWorks, BetaStats

**Files:**
- Create: `components/landing/HonoursShowcase.tsx`
- Create: `components/landing/ResultsShowcase.tsx`
- Create: `components/landing/HowItWorks.tsx`
- Create: `components/landing/BetaStats.tsx`

- [ ] **Step 1: Write HonoursShowcase**

```tsx
export function HonoursShowcase() {
  return (
    <section id="feature-honours" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#bef264]">03 · HONOURS</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Silverware for<br />the regulars.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            A champion crowned every quarter, plus the player boards: hot streaks, most appearances,
            milestone caps from the 10th game to the 100th.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2 border border-[#1b2c46] bg-[#0f2033] rounded-xl px-[26px] py-6 flex items-center justify-between">
            <div>
              <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#bef264]">Q1 2026 CHAMPION</p>
              <p className="mt-2.5 text-[32px] font-bold tracking-[-.03em] text-[#f4f9ff]">Sam Okafor</p>
              <p className="mt-1.5 font-plex text-[11px] tracking-[.12em] text-[#7f97b5]">71% WIN RATE · 24 CAPS</p>
            </div>
            <span className="inline-flex items-center justify-center w-[66px] h-[66px] rounded-full bg-[rgba(190,242,100,.12)] border border-[rgba(190,242,100,.4)] text-[#bef264] shrink-0">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
          </div>
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-xl px-[22px] py-5">
            <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#6f88a8]">MOST APPEARANCES</p>
            <p className="mt-2.5 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Will Loveland</p>
            <p className="mt-2 font-plex text-[26px] font-bold text-[#38bdf8] leading-none">
              42<span className="text-xs text-[#6f88a8] tracking-[.14em]"> GAMES</span>
            </p>
          </div>
          <div className="border border-[#1b2c46] bg-[#0a1421] rounded-xl px-[22px] py-5">
            <p className="font-plex text-[9px] font-bold tracking-[.2em] text-[#6f88a8]">IN FORM</p>
            <p className="mt-2.5 text-xl font-bold tracking-[-.02em] text-[#f4f9ff]">Ellie Knight</p>
            <p className="mt-2 font-plex text-[26px] font-bold text-[#bef264] leading-none">
              3<span className="text-xs text-[#6f88a8] tracking-[.14em]"> ON THE SPIN</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write ResultsShowcase**

```tsx
import { cn } from '@/lib/utils'

const RESULT_ROWS = [
  {
    week: 'WK14 · 25 MAR',
    score: ['6', '4'],
    badge: 'TEAM A WON',
    badgeClass: 'bg-[rgba(56,189,248,.12)] border-[rgba(56,189,248,.4)] text-[#7dd3fc]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK13 · 18 MAR',
    score: ['3', '5'],
    badge: 'TEAM B WON',
    badgeClass: 'bg-[rgba(167,139,250,.12)] border-[rgba(167,139,250,.4)] text-[#c4b5fd]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK12 · 11 MAR',
    score: ['4', '4'],
    badge: 'DRAWN',
    badgeClass: 'border-[#223a5c] text-[#8ba4c4]',
    cancelled: false,
    note: null,
  },
  {
    week: 'WK10 · 25 FEB',
    score: null,
    badge: 'CANCELLED',
    badgeClass: 'bg-[rgba(226,104,111,.12)] border-[rgba(226,104,111,.4)] text-[#e2686f]',
    cancelled: true,
    note: 'Waterlogged, called off at 6pm',
  },
]

export function ResultsShowcase() {
  return (
    <section
      id="feature-results"
      className="mt-16 lg:mt-[88px] py-16 lg:py-[88px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]"
    >
      <div className="max-w-[1112px] mx-auto grid lg:grid-cols-[1.15fr_.85fr] gap-10 lg:gap-14 items-center">
        <div className="flex flex-col gap-px bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden order-2 lg:order-1">
          {RESULT_ROWS.map((row) => (
            <div
              key={row.week}
              className={cn(
                'grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-3 sm:gap-[18px] px-4 sm:px-6 py-[18px] bg-[#060b14]',
                row.cancelled && 'opacity-60'
              )}
            >
              <span className="font-plex text-[11px] tracking-[.14em] text-[#6f88a8]">{row.week}</span>
              {row.score ? (
                <span className="font-plex text-[26px] font-bold tracking-[-.02em] text-[#f4f9ff] tabular-nums whitespace-nowrap">
                  {row.score[0]}<span className="text-[#2f4a70]">-</span>{row.score[1]}
                </span>
              ) : (
                <span className="font-inter-body text-sm italic text-[#8ba4c4]">{row.note}</span>
              )}
              <span className={cn('font-plex text-[10px] font-bold tracking-[.14em] px-[11px] py-[5px] rounded border', row.badgeClass)}>
                {row.badge}
              </span>
            </div>
          ))}
        </div>
        <div className="order-1 lg:order-2">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#38bdf8]">04 · RESULTS TRACKING</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Every week,<br />on the record.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            A match card for every week: who played, who won, by how much, and what it was like out
            there. Cancelled weeks included, because the history matters.
          </p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Write HowItWorks**

```tsx
import { cn } from '@/lib/utils'

const STEPS = [
  {
    num: '01',
    strokeClass: '[-webkit-text-stroke:1.5px_#2f4a70]',
    title: 'Record your week',
    body: 'Who played, who won and by how much, plus a note on what it was like out there.',
  },
  {
    num: '02',
    strokeClass: '[-webkit-text-stroke:1.5px_#2f4a70]',
    title: 'The stats build themselves',
    body: 'Win rates, form, caps and honours update with every result. No spreadsheet, no admin.',
  },
  {
    num: '03',
    strokeClass: '[-webkit-text-stroke:1.5px_#38bdf8]',
    title: 'Next week picks itself',
    body: 'Lineup Lab uses those records to split whoever is playing into two fair sides.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="max-w-[660px]">
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">HOW IT WORKS</p>
        <h2 className="mt-3.5 text-4xl sm:text-[50px] leading-none font-bold tracking-[-.04em] text-[#f4f9ff]">
          One minute a week.<br />The rest is automatic.
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-8 mt-11">
        {STEPS.map((step) => (
          <div key={step.num} className="border-t border-[#17263c] pt-[22px]">
            <p className={cn('font-plex text-[64px] font-bold leading-[.9] tracking-[-.05em] text-transparent', step.strokeClass)}>
              {step.num}
            </p>
            <p className="mt-[18px] text-[22px] font-bold tracking-[-.02em] text-[#f4f9ff]">{step.title}</p>
            <p className="mt-[9px] font-inter-body text-sm leading-relaxed text-[#8ba4c4]">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Write BetaStats**

```tsx
const BETA_STATS = [
  { value: '60+', label: 'PLAYERS TRACKED', accent: true },
  { value: '400+', label: 'MATCHES RECORDED', accent: false },
  { value: '14', label: 'WEEKS THIS SEASON', accent: false },
]

export function BetaStats() {
  return (
    <section className="mt-16 lg:mt-[88px] py-[52px] px-5 sm:px-11 bg-[#0a1421] border-y border-[#17263c]">
      <div className="max-w-[1112px] mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
        <div className="max-w-[420px]">
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">THE BETA SO FAR</p>
          <h2 className="mt-3 text-3xl leading-[1.05] font-bold tracking-[-.03em] text-[#f4f9ff]">
            Small on purpose,<br />already keeping score.
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-8 sm:gap-11">
          {BETA_STATS.map((stat) => (
            <div key={stat.label}>
              <p className={`font-plex text-4xl sm:text-[52px] font-bold leading-[.9] tracking-[-.04em] ${stat.accent ? 'text-[#38bdf8]' : 'text-[#f4f9ff]'}`}>
                {stat.value}
              </p>
              <p className="mt-2.5 font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/landing/HonoursShowcase.tsx components/landing/ResultsShowcase.tsx components/landing/HowItWorks.tsx components/landing/BetaStats.tsx
git commit -m "Add honours, results, how-it-works and beta stats sections"
```

---

### Task 12: FaqAccordion

**Files:**
- Create: `components/landing/FaqAccordion.tsx`

- [ ] **Step 1: Write the component**

Client component; first question open by default, one open at a time, clicking the open one closes it:

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    q: 'Will it cost anything?',
    a: 'The beta is free, and groups that register interest early will keep early pricing when we launch.',
  },
  {
    q: 'When can my group join?',
    a: 'We are in private beta while we shape the product. Register your interest and we will email you the moment we open up; one person becomes admin and invites the rest with a link.',
  },
  {
    q: 'Does the whole group need accounts?',
    a: 'No, only people who want to log in. Your admin can record everything, and a public league link works without an account.',
  },
  {
    q: 'What is public and what is private?',
    a: 'Private by default. Admins choose, feature by feature, what members and the public can see.',
  },
  {
    q: 'We rotate 5s, 6s and 7s. Is that fine?',
    a: 'Completely. The format is recorded per week, and the stats do not mind.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'It is a web app designed for phones first. Add it to your home screen and it behaves like one.',
  },
]

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section
      id="faq"
      className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px] grid lg:grid-cols-[.72fr_1.28fr] gap-8 lg:gap-14 items-start"
    >
      <div>
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">FAQ</p>
        <h2 className="mt-3.5 text-4xl sm:text-[44px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
          Before<br />you ask.
        </h2>
      </div>
      <div>
        {FAQS.map((faq, i) => {
          const open = openIndex === i
          return (
            <div key={faq.q} className="border-t border-[#17263c]">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : i)}
                className="w-full flex items-start gap-4 sm:gap-[22px] py-5 bg-transparent border-none cursor-pointer text-left"
              >
                <span className={cn('font-plex text-[10px] font-bold tracking-[.14em] pt-[5px]', open ? 'text-[#38bdf8]' : 'text-[#2f4a70]')}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-lg font-bold tracking-[-.02em] text-[#f4f9ff]">{faq.q}</span>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="#6f88a8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('shrink-0 mt-[5px] transition-transform duration-200', open && 'rotate-180')}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open && (
                <p className="pb-5 pl-8 max-w-[640px] font-inter-body text-sm leading-[1.65] text-[#8ba4c4]">{faq.a}</p>
              )}
            </div>
          )
        })}
        <div className="border-t border-[#17263c]" />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/FaqAccordion.tsx
git commit -m "Add landing FAQ accordion"
```

---

### Task 13: WaitlistForm (TDD) + WaitlistSection

**Files:**
- Create: `components/landing/WaitlistForm.tsx`
- Create: `components/landing/WaitlistSection.tsx`
- Test: `__tests__/waitlist-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/waitlist-form.test.tsx` (jsdom environment, like `quarter-celebration.test.tsx`):

```tsx
/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WaitlistForm } from '@/components/landing/WaitlistForm'

describe('WaitlistForm', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as jest.Mock
  })

  function fill(name: string, email: string) {
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: name } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  }

  it('submits a valid signup and shows the success panel', async () => {
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'London' } })
    fireEvent.click(screen.getByRole('button', { name: '5s' }))
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('You are on the list.')
    expect(global.fetch).toHaveBeenCalledWith('/api/waitlist', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body).toEqual({ name: 'Will', email: 'will@example.com', city: 'London', format: '5', website: '' })
  })

  it('does not submit an invalid email and marks the field', async () => {
    render(<WaitlistForm />)
    fill('Will', 'not-an-email')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('you@example.com')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows an error line when the request fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('Something went wrong, try again.')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Register interest' })).not.toBeDisabled()
    )
  })

  it('defaults the format to 7s', async () => {
    render(<WaitlistForm />)
    fill('Will', 'will@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Register interest' }))
    await screen.findByText('You are on the list.')
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.format).toBe('7')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/waitlist-form.test.tsx`
Expected: FAIL — cannot find module `@/components/landing/WaitlistForm`.

- [ ] **Step 3: Write WaitlistForm**

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { WAITLIST_FORMATS, type WaitlistFormat } from '@/lib/waitlist'

const EMAIL_RE = /^\S+@\S+\.\S+$/

const FORMAT_LABELS: Record<WaitlistFormat, string> = {
  '5': '5s',
  '6': '6s',
  '7': '7s',
  mixed: 'Mixed',
}

const inputClass =
  'w-full min-w-0 h-[46px] bg-[#0c1728] border border-[#1b2c46] rounded-md px-[13px] font-inter-body text-[13px] text-[#f4f9ff] placeholder:text-[#4f688a] outline-none focus:border-[#38bdf8] box-border'

export function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [format, setFormat] = useState<WaitlistFormat>('7')
  const [website, setWebsite] = useState('') // honeypot
  const [emailError, setEmailError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [requestFailed, setRequestFailed] = useState(false)

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(true)
      return
    }
    setSubmitting(true)
    setRequestFailed(false)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), city: city.trim(), format, website }),
      })
      if (!res.ok) throw new Error('request failed')
      setDone(true)
    } catch {
      setRequestFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-3.5 py-2">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[rgba(190,242,100,.12)] border border-[rgba(190,242,100,.45)] text-[#bef264] shrink-0">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <p className="text-[17px] font-bold tracking-[-.02em] text-[#f4f9ff]">You are on the list.</p>
          <p className="mt-1 font-inter-body text-[13px] text-[#8ba4c4]">
            We will email you as soon as Craft Football opens up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          aria-invalid={emailError}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError(false)
          }}
          className={cn(inputClass, emailError && 'border-[#e2686f]')}
        />
      </div>
      <input
        type="text"
        placeholder="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className={cn(inputClass, 'mt-2.5')}
      />
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <span className="font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">FORMAT</span>
        {WAITLIST_FORMATS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFormat(value)}
            className={cn(
              'h-[34px] px-[13px] rounded-md border text-xs font-bold cursor-pointer transition-colors whitespace-nowrap',
              format === value
                ? 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]'
                : 'bg-transparent border-[#1b2c46] text-[#8ba4c4]'
            )}
          >
            {FORMAT_LABELS[value]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-3.5 w-full h-[50px] bg-[#bef264] hover:bg-[#d3f78d] disabled:opacity-60 rounded-md text-[#0d1a05] text-[15px] font-bold cursor-pointer transition-colors"
      >
        Register interest
      </button>
      {requestFailed && (
        <p className="mt-2.5 font-inter-body text-[13px] text-[#e2686f]">Something went wrong, try again.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/waitlist-form.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Write WaitlistSection**

Server component wrapping the form in the cyan panel:

```tsx
import { WaitlistForm } from '@/components/landing/WaitlistForm'

const PROMISES = [
  'FREE WHILE WE BUILD · EARLY GROUPS KEEP EARLY PRICING',
  'PRIVATE BY DEFAULT · YOU CHOOSE WHAT GOES PUBLIC',
  'ONE PERSON SIGNS UP FOR THE WHOLE GROUP',
]

export function WaitlistSection() {
  return (
    <section id="waitlist" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="bg-[#38bdf8] rounded-2xl p-6 sm:p-11 grid lg:grid-cols-[1fr_.9fr] gap-8 lg:gap-12 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[rgba(5,16,29,.6)]">REGISTER YOUR INTEREST</p>
          <h2 className="mt-3.5 text-4xl sm:text-[52px] leading-[.98] font-bold tracking-[-.04em] text-[#05101d]">
            Be first in when<br />we open up.
          </h2>
          <p className="mt-4 max-w-[420px] font-inter-body text-[15px] leading-relaxed text-[rgba(5,16,29,.72)]">
            Private beta, a handful of groups. Tell us about yours and we will let you know the
            moment it is ready.
          </p>
          <div className="flex flex-col gap-2 mt-[22px]">
            {PROMISES.map((line) => (
              <p key={line} className="font-plex text-[11px] font-semibold tracking-[.1em] text-[rgba(5,16,29,.72)]">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="bg-[#05101d] rounded-xl p-5 sm:p-[26px]">
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Verify types and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/landing/WaitlistForm.tsx components/landing/WaitlistSection.tsx __tests__/waitlist-form.test.tsx
git commit -m "Add waitlist form and section"
```

---

### Task 14: LandingFooter + LandingPage composer

**Files:**
- Create: `components/landing/LandingFooter.tsx`
- Create: `components/landing/LandingPage.tsx`

- [ ] **Step 1: Write LandingFooter**

```tsx
import { LoginLink } from '@/components/landing/LoginLink'

const PRODUCT_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

const footerLinkClass = 'font-inter-body text-[13px] text-[#8ba4c4] hover:text-[#eaf2ff] text-left'

export function LandingFooter() {
  return (
    <footer className="max-w-[1200px] mx-auto mt-[72px] px-5 sm:px-11 pt-10 pb-[26px] border-t border-[#101d31]">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-10">
        <div>
          <div className="flex items-center gap-[11px]">
            <img src="/logo.png" alt="Craft Football" className="w-7 h-7 block" />
            <span className="text-base font-bold tracking-[-.02em]">Craft Football</span>
          </div>
          <p className="mt-3 font-plex text-[10px] tracking-[.14em] text-[#4f688a]">
            PRIVATE INVITE-ONLY BETA · BUILT FOR 5, 6 &amp; 7-A-SIDE
          </p>
        </div>
        <div className="flex gap-14">
          <div className="flex flex-col gap-[9px]">
            <p className="mb-[3px] font-plex text-[9px] font-semibold tracking-[.18em] text-[#4f688a]">PRODUCT</p>
            {PRODUCT_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={footerLinkClass}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-[9px]">
            <p className="mb-[3px] font-plex text-[9px] font-semibold tracking-[.18em] text-[#4f688a]">ACCOUNT</p>
            <LoginLink className={footerLinkClass}>Log in</LoginLink>
            <a href="#waitlist" className={footerLinkClass}>Register interest</a>
          </div>
        </div>
      </div>
      <p className="mt-7 font-plex text-[10px] tracking-[.14em] text-[#3f5674]">
        © 2026 CRAFT FOOTBALL · CRAFT-FOOTBALL.COM
      </p>
    </footer>
  )
}
```

- [ ] **Step 2: Write LandingPage**

```tsx
import { BetaStats } from '@/components/landing/BetaStats'
import { FaqAccordion } from '@/components/landing/FaqAccordion'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { Hero } from '@/components/landing/Hero'
import { HonoursShowcase } from '@/components/landing/HonoursShowcase'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LineupLabDemo } from '@/components/landing/LineupLabDemo'
import { Marquee } from '@/components/landing/Marquee'
import { ResultsShowcase } from '@/components/landing/ResultsShowcase'
import { StatsDemo } from '@/components/landing/StatsDemo'
import { WaitlistSection } from '@/components/landing/WaitlistSection'

/** Marketing landing page shown at / for signed-out visitors. */
export function LandingPage() {
  return (
    <div className="bg-[#060b14] font-grotesk text-[#eaf2ff]">
      <LandingHeader />
      <Hero />
      <Marquee />
      <FeatureGrid />
      <StatsDemo />
      <LineupLabDemo />
      <HonoursShowcase />
      <ResultsShowcase />
      <HowItWorks />
      <FaqAccordion />
      <BetaStats />
      <WaitlistSection />
      <LandingFooter />
    </div>
  )
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/landing/LandingFooter.tsx components/landing/LandingPage.tsx
git commit -m "Add landing footer and page composer"
```

---

### Task 15: Wire into / and hide the app navbar

**Files:**
- Modify: `app/page.tsx` (replace lines 172–226, the unauthenticated branch)
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Replace the signed-out branch of app/page.tsx**

Delete everything from the `// Unauthenticated: show public league directory` comment to the end of the function, and replace with:

```tsx
  // Unauthenticated: marketing landing page
  return <LandingPage />
```

Add the import at the top of the file:

```tsx
import { LandingPage } from '@/components/landing/LandingPage'
```

The signed-in branch above is untouched (it still uses `createServiceClient`, `Link`, and `ChevronRight` — keep those imports).

- [ ] **Step 2: Hide the global Navbar on / for signed-out visitors**

In `components/ui/navbar.tsx`:

1. Add an `authResolved` state next to the existing user state (around line 134):

```tsx
  const [authResolved, setAuthResolved] = useState(false)
```

2. In the existing fetch effect (around line 172), mark auth resolved after the first fetch completes:

```tsx
  useEffect(() => {
    if (pathname === '/sign-in') return
    let cancelled = false
    fetchUserData().then((result) => {
      if (cancelled) return
      applyUserData(result)
      setAuthResolved(true)
    })
    return () => { cancelled = true }
  }, [pathname, fetchUserData, applyUserData])
```

3. Immediately before the final `return (` (after all hooks, around line 232), add:

```tsx
  // The landing page at / ships its own header; hide the app navbar for
  // signed-out visitors (and while auth state is still resolving) there.
  if (pathname === '/' && (!authResolved || !user)) return null
```

- [ ] **Step 3: Run the full test suite and lint**

Run: `npm test`
Expected: all suites pass.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/ui/navbar.tsx
git commit -m "Serve the landing page at / for signed-out visitors"
```

---

### Task 16: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open `http://localhost:3000` in a signed-out browser session.

Check:
- Landing page renders: ticker scrolls, hero with match card + tilted player card, marquee scrolls, feature grid, all four feature sections, how-it-works, FAQ (first item open, accordion works), beta stats, waitlist panel, footer.
- No app navbar above the landing header.
- Sort chips re-order the stats table; Shuffle re-deals lineups with the stagger animation.
- Header/footer "Log in" opens the sign-in dialog.
- Anchor links (FEATURES, HOW IT WORKS, FAQ, Register interest) smooth-scroll with the sticky header cleared.
- Waitlist form: invalid email shows red border; valid submission shows "You are on the list." (requires the migration applied and `RESEND_API_KEY` set; without the table the form should show the error line, not crash).
- Mobile viewport (~390 px): sections stack per the spec, nav links hidden, no horizontal overflow.

- [ ] **Step 2: Verify signed-in behaviour is unchanged**

Sign in. Check `/` still shows "Your leagues" (or redirects to the single league) with the app navbar visible.

- [ ] **Step 3: Done**

No commit; report verification results.

---

## Self-review notes

- **Spec coverage:** placement (Task 15), waitlist table (Task 3), API + Resend (Task 4), all eleven page sections (Tasks 6–14), responsive classes baked into each component, AuthDialog login (Tasks 5, 15), metadata (Task 1), navbar hiding (Task 15), tests (Tasks 2, 4, 13), manual verification (Task 16).
- **Deliberate deviations from the prototype:** none visual. The prototype's `sc-if` props (ticker/dots/stats toggles) are design-tool preview knobs, not product features — all sections render unconditionally.
- **Type consistency:** `WaitlistFormat`/`WAITLIST_FORMATS`/`parseWaitlistBody` defined in Task 2 and consumed in Tasks 4 and 13 with matching signatures; `LoginLink` props match usage in Tasks 6 and 14.
