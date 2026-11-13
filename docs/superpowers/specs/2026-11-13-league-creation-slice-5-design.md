# League creation, slice 5: polish and entry points — design

**Date:** 2026-11-13

## Summary

The last slice of league creation (handoff screens 9 and the Entry screen).
The landing page sends visitors to `/new` instead of a waitlist, the waitlist
is removed, account settings gains a "Create a league" link, and the Live
screen gets its rise-in and one-shot confetti. Places autocomplete and the map
preview are dropped: the venue stays free text (decided 2026-11-13; a free
geocoder has weak pitch coverage and no map image, and Google needs billing).

Branch `awmloveland/league-creation-polish` stacks on slice 4 (PR #197).

## Decisions

1. **The waitlist goes entirely.** Hero and header CTAs become "Start your
   league" → `/new`; the footer's "Register interest" becomes "Start your
   league"; `WaitlistSection`, `WaitlistForm`, `POST /api/waitlist`,
   `lib/waitlist.ts`, the waitlist email notification and their tests are
   deleted. The `waitlist_signups` table stays in the database untouched.
2. **Confetti is drawn on a canvas**, not CSS pieces, so no per-piece inline
   styles are needed. It plays once on mount for about two seconds and is
   skipped under `prefers-reduced-motion`.
3. **The rise-in is a `rise` prop on `StepShell`**: the logo, eyebrow, title,
   sub, content and action blocks get a shared keyframe with staggered delays,
   wrapped in `motion-safe:`. Only Live passes it.
4. **No Places, no map.** `WhereStep` is unchanged.

## Landing page

- `Hero`: the primary button reads "Start your league" and is a `next/link`
  to `/new`. "Log in" stays.
- `LandingHeader`: the sky button reads "Start your league" → `/new`.
- `LandingFooter`: under ACCOUNT, "Log in" then "Start your league" → `/new`.
- `LandingPage`: no `WaitlistSection`. `BetaStats` stays above the footer.

## Account settings

Under Linked leagues (and also when the user has no leagues), a dashed row
"Create a league" → `/new`, styled like the Your leagues row.

## Live screen

- `globals.css` gains `--animate-cf-rise: cf-rise .6s cubic-bezier(.2,.7,.2,1) both`
  with `@keyframes cf-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }`.
- `StepShell` takes `rise?: boolean`. When set, the logo tile, eyebrow, title,
  sub, children and action wrappers get `motion-safe:animate-cf-rise` with a
  `--cf-rise-delay` of 0, .1s, .2s, .3s, .4s and .5s, read inside the shorthand.
- `Confetti` (client): a `fixed inset-0 -z-10 pointer-events-none` canvas.
  On mount, unless `matchMedia('(prefers-reduced-motion: reduce)')` matches,
  42 pieces of 5 to 11px in `#bef264 #38bdf8 #a78bfa #f4f9ff #7dd3fc` burst
  from just above the logo tile (top centre of the column), each with its own
  velocity, spin and lifetime between 1.4 and 2.3 seconds, fading out; the
  canvas is cleared when the last piece dies. Rendered once by `LiveScreen`,
  as a sibling of the shell so no animated ancestor captures the fixed canvas.

## Testing

- `__tests__/landing-cta.test.tsx` (jsdom): `Hero` renders a link to `/new`
  with the text "Start your league" and no `#waitlist` anchor.
- The three waitlist tests are deleted; `npm test` and `npm run build` prove
  nothing else referenced the removed modules.
- Rise-in and confetti are visual; checked by hand. `Confetti` must not throw
  in jsdom: `__tests__/confetti.test.tsx` renders it with `matchMedia`
  reporting reduced motion and asserts it draws nothing (no `getContext`
  call).
- Manual (Will): landing page CTAs land on `/new`; create a league and watch
  Live rise in with a confetti burst; with "Reduce motion" on, neither plays;
  the settings page shows the link.

## Out of scope

Places autocomplete, the map preview, any copy change on the landing page
beyond the three CTAs, removing the `waitlist_signups` table.
