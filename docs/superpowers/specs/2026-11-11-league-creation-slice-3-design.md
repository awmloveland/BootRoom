# League creation, slice 3: inline Account step — design

**Date:** 2026-11-11

## Summary

Slices 1 and 2 (PRs #194, #195) let a signed-in user create a league and add
its roster. A signed-out visitor hitting `/new` is still bounced to the
generic sign-in page. This slice adds the handoff's Account screen (screen 1)
inline at `/new`: create an account or sign in with an email code, then
continue into the wizard signed in. No backend changes.

Branch `awmloveland/league-creation-account` stacks on the slice 2 branch; the
PR targets it.

## Decisions (settled during brainstorming)

1. **The proxy stops guarding the pre-creation URLs.** `/new`, `/new/name`,
   `/new/where` and `/new/when` are public; the page renders the Account step
   when there is no session. `/new/[slug]/…` (roster and Live) still requires
   a session with a profile, as before.
2. **Verification ends with a full page load of `/new/name`**, the same way
   the sign-in dialog finishes, so the server sees the new session and the
   wizard starts fresh. Decision 1 of the handoff stands: no league draft is
   held across the code round-trip.
3. **The Supabase calls are shared.** `lib/supabase/otp.ts` holds
   `sendSignUpCode`, `sendSignInCode`, `resendCode` and `verifyCode`; both
   the existing `AuthForms` and the new step call them. Markup is not
   shared: the dialog keeps its look, the step uses the wizard shell.
4. **Step numbering.** A visitor sees 7 steps (Account is 1 of 7, Name 2 of 7
   … Strength 7 of 7); a signed-in user sees 6 as today. The Account step sets
   a session cookie `new-visitor=1` scoped to `/new` before the reload; the
   server pages read it and pass `stepOffset` (0 or 1) down to the eyebrows.
   It expires with the browser session.

## Routing

| State | `/new`, `/new/name|where|when` | `/new/[slug]/players|mentality|strength|live` |
|---|---|---|
| Signed out | `AccountStep` (any of these URLs) | proxy → `/sign-in?redirect=…` |
| Signed in | wizard | roster or Live |

`proxy.ts`: `isNewLeague` becomes `/^\/new\/[^/]+\/[^/]+/.test(pathname)`.

## Account step (`components/new-league/AccountStep.tsx`, client)

Three stages in local state, all at the same URL. Eyebrow `Step 1/7`.

- **Create account** (default). H1 "First, who are you?", sub "You will be
  the admin of this league. Use the name your teammates know you by; it
  becomes your player." First name and Last name in a two-column grid (stack
  under `sm`), then Email. Helper under the inputs: "No password. We email
  you a 6-digit code." Primary "Send code", disabled until both names are
  present and the email contains `@`. Then an "or" divider and the outline
  button "I already have an account".
- **Sign in.** H1 "Welcome back", sub "Sign in and we will pick up where you
  left off." Email only. Primary "Send code", divider, outline "Create an
  account instead". A no-account error reads "No account found for this
  email. Create one instead."
- **Code.** H1 "Check your email", sub "Enter the 6-digit code we sent to
  {email}" (email in `#dff1ff`). One input, 64px tall, sky border, Plex Mono
  26px bold, `.5em` tracking, centred, digits only, max 6, `autoComplete`
  one-time-code. Primary "Continue", disabled until 6 digits. Links row
  "Resend code · Change email"; Change email returns to the stage the code
  was sent from with the fields intact.
- Each stage is a `<form>` so Enter submits. While a request is in flight the
  primary reads "Sending…" or "Checking…" and is disabled. After a successful
  verify the button stays disabled and the page navigates to `/new/name`.
- Errors show under the primary button in `#e2686f`; "Code resent" shows in
  `#38bdf8`.

## Page changes

- `app/new/[[...step]]/page.tsx`: the wizard branch reads `getUser()`; signed
  out renders `<AccountStep />`, signed in renders
  `<NewLeagueWizard stepOffset={offset} />`. `offset` is 1 when the
  `new-visitor` cookie is present. `RosterScreen` reads the same cookie and
  passes `stepOffset` to `RosterWizard`.
- `StepEyebrow` takes `offset` (default 0) and renders
  `Step {n + offset}/{STEP_COUNT + offset}`. The six step components accept
  `stepOffset` and pass it through.
- `NEW_VISITOR_COOKIE` lives in `StepShell.tsx`, shared by server and client.

## Error handling

- Send failures show the Supabase message, except the no-account case above.
- Verify failures: "Invalid or expired code. Try sending a new one." or
  "Profile setup failed: …", as the dialog shows today.
- A signed-in user with no `profiles` row no longer hits the proxy's
  `/profile-required` redirect on `/new`; `create_game` raises
  `profile_not_found` (404) and the wizard shows the generic error. Rare:
  `claim_profile` runs at every verify.

## Testing

- `__tests__/proxy-sign-in-redirect.test.ts`: signed-out `/new` and
  `/new/name` pass through; signed-out `/new/abc/players` redirects to
  sign-in with the path.
- `__tests__/account-step.test.tsx` (jsdom, `@/lib/supabase/otp` mocked):
  Send code is disabled until both names and an email with `@` are typed;
  "I already have an account" switches to "Welcome back"; a successful send
  shows the code stage with the email.
- `npm test` for the dialog's existing coverage after the helper extraction.
- Manual (Will): in a private window open `/new`, create an account with a
  fresh email, enter the code, confirm Name shows "Step 2/7" and the flow
  completes with "Step 7/7" on Strength; then sign in with an existing
  account via "I already have an account".

## Out of scope

Landing CTA and waitlist demotion (slice 5), Google sign-in (removed earlier),
holding a league draft across the code round-trip.
