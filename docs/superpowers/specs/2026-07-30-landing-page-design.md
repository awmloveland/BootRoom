# Craft Football landing page — design

**Date:** 2026-07-30
**Source design:** Claude Design handoff bundle, `Craft Football Landing v2.dc.html`
(`.context/attachments/xggS4h/handoff/craft-football-landing-page/project/`)

## Summary

Replace the signed-out view of `/` with the Craft Football marketing landing
page from the v2 design. Signed-in behaviour at `/` is unchanged. The page is
fully responsive, all content is hardcoded from the design, and the
"Register interest" form stores signups in Supabase and emails Will via Resend.

## Decisions (settled during brainstorming)

1. **Placement:** landing page replaces `/` for signed-out visitors. Signed-in
   users keep the existing "Your leagues" list (and single-league redirect).
   The public league directory previously shown at `/` is removed; public
   leagues remain reachable at their `/[slug]/results` URLs.
2. **Waitlist:** signups stored in a new `waitlist_signups` table AND a Resend
   notification email sent to `awmloveland@gmail.com` per signup.
3. **Mobile:** fully responsive; adaptation details at implementer's
   discretion (see Responsive behaviour).
4. **Content:** all numbers, ticker items, demo data and copy hardcoded
   exactly as in the design file. Update by editing code.
5. **Log in:** opens the existing `AuthDialog`; no `/sign-in` page is built.
6. **Approach:** server-rendered page with client islands (approved over
   one-big-client-component and zero-JS alternatives).
7. **Feature flags:** not applicable. The league feature-flag system is
   per-league; this is a site-level marketing page. Explicitly exempt.

## Routing & architecture

- `app/page.tsx` keeps its auth branch. Signed-in path: untouched. Signed-out
  path: delete the public-directory queries/markup, render `<LandingPage />`.
- The landing page renders its own sticky marketing header, so the global app
  `Navbar` must not render on `/` while signed out. `Navbar` is a client
  component that already tracks auth state: on pathname `/` it renders
  nothing until a session is confirmed, then renders normally for signed-in
  users. (Minor accepted trade-off: signed-in users see the navbar appear
  after hydration on `/`.)
- New API route: `POST /api/waitlist`. No other routes.

## Components — new `components/landing/` directory

Server components (static markup, no JS shipped):

| Component | Content |
|---|---|
| `LandingPage` | Composes all sections in design order |
| `Hero` | Eyebrow, headline, sub, CTA, stat strip (400+ / 60+ / 2022), match-card visual with tilted player-card overlay, dot-grid backdrop |
| `Marquee` | Cyan band, STATS · FAIR TEAMS · HONOURS · RESULTS loop |
| `FeatureGrid` | "Four things, done properly." + four numbered anchor cards |
| `HonoursShowcase` | Section 03: champion card + two stat cards |
| `ResultsShowcase` | Section 04: four-row results list incl. cancelled row |
| `HowItWorks` | Three outlined-number steps |
| `BetaStats` | "The beta so far" strip (60+ / 400+ / 14) |
| `LandingFooter` | Logo, product/account link columns, copyright |

Client components (interactive islands):

| Component | Behaviour (ported from the prototype's script block) |
|---|---|
| `LandingHeader` | Sticky header + results ticker; Register scrolls to `#waitlist`; Log in opens `AuthDialog` |
| `StatsDemo` | Section 01: 4-player table, sort chips WIN % / CAPS / FORM / A–Z, active-chip styling, rank + form bars re-derive on sort |
| `LineupLabDemo` | Section 02: two hardcoded lineups, staggered deal-in animation on mount, Shuffle button clears + re-deals the other lineup, Δ badge fades in |
| `FaqAccordion` | Six questions, one open at a time (first open by default), chevron rotation, number highlight |
| `WaitlistForm` | Name/email/city fields, format picker (5s/6s/7s/Mixed, default 7s), client email validation with red border, submits to `/api/waitlist`, success panel "You are on the list.", inline error on network failure |

The footer "Log in" link also opens `AuthDialog` via a small shared client
`LoginLink` used by header and footer.

## Styling & fonts

- Tailwind utility classes only, per repo standard. The landing palette is
  intentionally not the app's slate scale; use arbitrary values matching the
  design exactly: page `#060b14`, panels `#0a1421`/`#0c1728`/`#101d31`,
  borders `#17263c`/`#1b2c46`/`#223a5c`, text `#f4f9ff`/`#eaf2ff`/`#8ba4c4`/
  `#6f88a8`, accents cyan `#38bdf8`, violet `#a78bfa`, lime `#bef264`,
  loss-red `#e2686f`.
- Fonts: Space Grotesk (headings/UI) and IBM Plex Mono (labels/numbers) via
  `next/font/google`, exposed as CSS variables applied on the landing page
  root only. Inter remains the global body font.
- Keyframes: ticker/marquee scroll (`translateX(0 → -50%)`) and pulse-dot
  registered in `app/globals.css` under the Tailwind v4 `@theme` block
  (`--animate-*`). Only globals change.
- Logo: copy `assets/logo.png` from the handoff bundle into `public/`
  (as `public/landing-logo.png` if it differs from the existing
  `public/logo.png`); used in header and footer at 34px/28px.
- Copy rules: British English, no em dashes (design copy already complies).

## Waitlist backend

Migration `supabase/migrations/…_waitlist_signups.sql`:

```sql
create table waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  city text,
  format text not null check (format in ('5','6','7','mixed')),
  created_at timestamptz not null default now()
);
create unique index waitlist_signups_email_key on waitlist_signups (lower(email));
alter table waitlist_signups enable row level security;
-- no policies: reads/writes via service role only
```

`POST /api/waitlist`:

1. Reject if honeypot field is non-empty (return 200 success — silent drop).
2. Validate: name non-empty, email matches `/\S+@\S+\.\S+/` (same behaviour
   as the prototype), format in the allowed set. 400 on failure.
3. Insert via service client. Unique-violation on email → treated as success
   (no info leak, no duplicate rows).
4. Send Resend notification to `awmloveland@gmail.com` with name, email,
   city, format. Failure is logged, never fails the request. Not sent for
   duplicate signups.
5. Return `{ ok: true }`.

## Responsive behaviour

Tailwind default breakpoints. Desktop (`lg`+) matches the design 1:1 at the
1200px content width.

- **Header:** FEATURES / HOW IT WORKS / FAQ links hidden below `md`;
  Register + Log in buttons always visible. Ticker unchanged at all widths.
- **Hero:** two columns → single column below `lg` (copy first, match card
  below, tilted overlay card kept); headline scales ~82px → ~48px; stat strip
  wraps.
- **Feature grid:** 4 → 2 (`md`) → 1 column.
- **Feature sections (01/02/04):** two columns → stacked below `lg`, copy
  above visual. Honours cards grid 2 → 1 below `sm` (champion card full
  width throughout).
- **How it works:** 3 → 1 column below `md`.
- **FAQ:** two-column header/list → stacked below `lg`.
- **Beta stats:** row wraps; numbers scale down.
- **Waitlist panel:** two columns → stacked below `lg`, form below copy.
- **Marquee:** unchanged (scrolling loop works at any width).

## Metadata

Update root `metadata`: title "Craft Football", description "Results, stats
and fair teams for your weekly game.", OG title/description/site name to
match. `metadataBase` unchanged.

## Error handling

- Form: invalid email → red input border (design behaviour); API/network
  failure → inline "Something went wrong, try again." line; button never
  dead-ends.
- API: malformed JSON or failed validation → 400; Supabase insert error other
  than unique-violation → 500 with logged detail; Resend errors logged only.

## Testing

- Jest: `POST /api/waitlist` validation (bad email, missing name, bad format,
  honeypot drop, duplicate email → success, happy path inserts + emails).
- Jest: `WaitlistForm` render test covering field input, invalid-email state,
  success-panel swap.
- Existing suite stays green.
- Manual: dev server check of `/` signed out (landing) and signed in
  (leagues list, navbar present), plus mobile viewport pass.
